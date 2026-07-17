/*
 * 8f-2 restore-drill re-purge library (Module 10d).
 *
 * Pure timestamp-gated tombstone matching + scratch-DB helpers used by the drill CLI
 * (deploy/restore-repurge.ts). This file holds ALL logic and DB wiring so the thin CLI
 * imports only from here (keeps third-party resolution inside apps/api/node_modules).
 *
 * DRILL-ONLY. Never import from production request paths. `runRepurgeFromTombstones` and
 * `runFixtureScenario` connect to an ISOLATED scratch database via an explicit URL — never
 * `getDb()`, never production. Session revocation (revokeSessionVersion) is intentionally
 * NOT called here: the scratch DB has no live sessions and no Redis. The INCIDENT variant
 * (restore-into-prod) adds the revokeSessionVersion step in the runbook, mirroring the
 * production purge callers (routes/account.ts + worker/jobs/delete-account-job.ts).
 */

import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { hashEmail, purgeUserAccountRows } from "./account-deletion"

// User-owned tables the purge empties (mirrors purgeUserAccountRows, minus security_events
// whose tombstone rows must survive). Used only for count assertions in the drill.
export const OWNED_TABLES = [
  "transactions",
  "budgets",
  "dashboard_snapshots",
  "product_events",
  "memorized_transactions",
  "template_suggestion_feedback",
  "account_action_tokens",
  "user_profiles",
  "merchants",
  "categories",
] as const

export interface RepurgeUserRow {
  id: number
  email: string
}

export interface TombstoneRow {
  emailHash: string
  createdAt: Date
}

export interface RepurgeMatch {
  userId: number
  emailHash: string
}

/**
 * Timestamp-gated match (Privacy §7). A restored user must be re-purged iff a deletion
 * tombstone exists for their email whose created_at is at OR after the backup snapshot.
 *
 *  - tombstone.createdAt <  tBackup → the deletion is already reflected in the backup
 *    (user rows absent); re-purge would be a no-op, and matching it would wrongly purge a
 *    user who deleted-then-reactivated before the backup (10d-0b makes this real).
 *  - tombstone.createdAt >= tBackup → the restore may have resurrected the deleted user's
 *    data; re-purge to keep the deletion applied.
 *
 * Boundary is `>=` (2026-07-07 review, supersedes the Phase-A strict `>`): at exact equality
 * the restored rows can only be the user's PRE-deletion data — a reactivation occurring at or
 * after a tombstone stamped T_backup cannot appear in a snapshot taken at T_backup — so
 * equality must re-purge. Using the object-name timestamp as tBackup is conservative (slightly
 * earlier than the true mysqldump snapshot); at worst it re-purges already-absent data, which
 * is idempotent and safe.
 */
export function matchTombstonesForRepurge(
  users: RepurgeUserRow[],
  tombstones: TombstoneRow[],
  tBackup: Date,
): RepurgeMatch[] {
  const eligible = new Set(
    tombstones
      .filter((t) => t.createdAt.getTime() >= tBackup.getTime())
      .map((t) => t.emailHash),
  )
  const matches: RepurgeMatch[] = []
  for (const u of users) {
    const h = hashEmail(u.email)
    if (eligible.has(h)) matches.push({ userId: u.id, emailHash: h })
  }
  return matches
}

// ── Scratch-DB helpers (drill execution only) ─────────────────────────────────

export interface ScratchDb {
  db: ReturnType<typeof drizzle>
  conn: mysql.Connection
  close: () => Promise<void>
}

/** Open a drizzle client against an ISOLATED scratch DB. Guard-rails the URL. */
export async function openScratchDb(url: string): Promise<ScratchDb> {
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `[restore-repurge] refusing a non-local scratch URL (drill must not touch remote/prod DBs): ${url.replace(/:[^:@/]+@/, ":***@")}`,
    )
  }
  const conn = await mysql.createConnection(url)
  const db = drizzle(conn)
  return { db, conn, close: async () => { await conn.end() } }
}

/** Count all owned rows for a user across OWNED_TABLES (drill assertions). */
export async function ownedRowCounts(
  conn: mysql.Connection,
  userId: number,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const table of OWNED_TABLES) {
    // Table names are from the fixed OWNED_TABLES allow-list — never user input.
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE user_id = ?`,
      [userId],
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out[table] = Number((rows as any[])[0]?.n ?? 0)
  }
  return out
}

async function isActive(conn: mysql.Connection, userId: number): Promise<boolean> {
  const [rows] = await conn.query(`SELECT is_active FROM users WHERE id = ?`, [userId])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Boolean((rows as any[])[0]?.is_active)
}

export interface RepurgeReport {
  matches: RepurgeMatch[]
  purged: { userId: number; emailHash: string; before: Record<string, number>; after: Record<string, number> }[]
  ok: boolean
  failures: string[]
}

/**
 * Stage 3 — real-data re-purge. Loads scratch users, matches them against the supplied
 * production tombstones (created_at > tBackup), and re-purges each match, asserting every
 * owned count → 0 afterwards. `expectedMatches` enforces the known-answer test (A1).
 */
export async function runRepurgeFromTombstones(
  scratch: ScratchDb,
  tombstones: TombstoneRow[],
  tBackup: Date,
  expectedMatches?: number,
): Promise<RepurgeReport> {
  const failures: string[] = []
  const [userRows] = await scratch.conn.query(`SELECT id, email FROM users`)
  const users = (userRows as { id: number; email: string }[]).map((r) => ({ id: r.id, email: r.email }))

  const matches = matchTombstonesForRepurge(users, tombstones, tBackup)

  if (expectedMatches !== undefined && matches.length !== expectedMatches) {
    failures.push(`expected exactly ${expectedMatches} tombstone match(es), got ${matches.length}`)
  }

  const purged: RepurgeReport["purged"] = []
  for (const m of matches) {
    const before = await ownedRowCounts(scratch.conn, m.userId)
    await scratch.db.transaction(async (tx) =>
      purgeUserAccountRows(m.userId, m.emailHash, "", "", tx),
    )
    const after = await ownedRowCounts(scratch.conn, m.userId)
    const leftover = Object.entries(after).filter(([, n]) => n !== 0)
    if (leftover.length) failures.push(`user ${m.userId}: owned rows not zero after purge: ${JSON.stringify(after)}`)
    if (await isActive(scratch.conn, m.userId)) failures.push(`user ${m.userId}: still active after purge`)
    purged.push({ userId: m.userId, emailHash: m.emailHash, before, after })
  }

  return { matches, purged, ok: failures.length === 0, failures }
}

/**
 * Stage 2 — deterministic mechanism validation with a synthetic controlled fixture.
 * Inserts user A (tombstone at tBackup+1s → must purge) and user B (tombstone at
 * tBackup-1s → must survive), runs the gate + purge, and asserts exact outcomes.
 * Fixture emails use the `.invalid` TLD so they can never collide with a real prod tombstone.
 */
export async function runFixtureScenario(
  scratch: ScratchDb,
  tBackup: Date,
): Promise<{ ok: boolean; failures: string[]; details: Record<string, unknown> }> {
  const failures: string[] = []
  const emailA = `drill-fixture-a-${Date.now()}@restore-drill.invalid`
  const emailB = `drill-fixture-b-${Date.now()}@restore-drill.invalid`

  // Insert two users + one owned row each (a category) so counts are non-zero pre-purge.
  const [ra] = await scratch.conn.query(
    `INSERT INTO users (email, auth_provider, external_id) VALUES (?, 'drill', ?)`,
    [emailA, `drill-a-${Date.now()}`],
  )
  const [rb] = await scratch.conn.query(
    `INSERT INTO users (email, auth_provider, external_id) VALUES (?, 'drill', ?)`,
    [emailB, `drill-b-${Date.now()}`],
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idA = Number((ra as any).insertId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idB = Number((rb as any).insertId)
  for (const [id, name] of [[idA, "Drill A"], [idB, "Drill B"]] as [number, string][]) {
    // categories NOT-NULL-without-default columns are (user_id, name) only — no name_key.
    await scratch.conn.query(
      `INSERT INTO categories (user_id, name) VALUES (?, ?)`,
      [id, name],
    )
  }

  const tombstones: TombstoneRow[] = [
    { emailHash: hashEmail(emailA), createdAt: new Date(tBackup.getTime() + 1000) }, // post-backup → purge
    { emailHash: hashEmail(emailB), createdAt: new Date(tBackup.getTime() - 1000) }, // pre-backup → survive
  ]

  const matches = matchTombstonesForRepurge(
    [{ id: idA, email: emailA }, { id: idB, email: emailB }],
    tombstones,
    tBackup,
  )
  if (matches.length !== 1 || matches[0]?.userId !== idA) {
    failures.push(`gate mismatch: expected exactly [A=${idA}], got ${JSON.stringify(matches)}`)
  }

  const beforeA = await ownedRowCounts(scratch.conn, idA)
  const beforeB = await ownedRowCounts(scratch.conn, idB)

  if (matches[0]) {
    await scratch.db.transaction(async (tx) =>
      purgeUserAccountRows(matches[0]!.userId, matches[0]!.emailHash, "", "", tx),
    )
  }

  const afterA = await ownedRowCounts(scratch.conn, idA)
  const afterB = await ownedRowCounts(scratch.conn, idB)

  if (Object.values(afterA).some((n) => n !== 0)) failures.push(`A owned rows not zero after purge: ${JSON.stringify(afterA)}`)
  if (await isActive(scratch.conn, idA)) failures.push(`A still active after purge`)
  if (JSON.stringify(afterB) !== JSON.stringify(beforeB)) failures.push(`B counts changed (should be untouched): before=${JSON.stringify(beforeB)} after=${JSON.stringify(afterB)}`)
  if (!(await isActive(scratch.conn, idB))) failures.push(`B was deactivated (should be untouched)`)

  // Best-effort cleanup so the scratch DB returns to the restored state for Stage 3.
  try {
    for (const table of OWNED_TABLES) {
      await scratch.conn.query(`DELETE FROM \`${table}\` WHERE user_id IN (?, ?)`, [idA, idB])
    }
    await scratch.conn.query(`DELETE FROM security_events WHERE JSON_EXTRACT(details_json, '$.deleted_user_id') IN (?, ?)`, [idA, idB])
    await scratch.conn.query(`DELETE FROM users WHERE id IN (?, ?)`, [idA, idB])
  } catch { /* cleanup is best-effort on a scratch DB */ }

  return {
    ok: failures.length === 0,
    failures,
    details: { idA, idB, beforeA, afterA, beforeB, afterB },
  }
}
