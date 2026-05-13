/*
 * Deliberate deviations from Flask (backend/activation_reporting.py):
 * - date_trunc("day", ...) → DATE(...): PostgreSQL date_trunc not available in
 *   MySQL 8; DATE() is the semantic equivalent for day-level grouping.
 * - JSON key order: Flask json.dumps uses sort_keys=True (alphabetical). Hono
 *   preserves alphabetical order by constructing objects with keys in sorted order.
 * - Timestamp format in window.start / window.end_exclusive / window.as_of:
 *   Flask may emit naive ISO strings (no timezone suffix); Hono always emits
 *   +00:00 suffix, consistent with the project-wide convention. Module 9 verifies.
 * - signup_completed event: not fired by Flask's auth route directly — fired by
 *   a separate registration flow. Hono wires recordEventOnce on new-user creation
 *   in routes/auth.ts (added in 6d). Until users run through the auth callback,
 *   signup_completed = 0 and derived percentages are null.
 */

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { productEvents } from "../db/schema/product-events"
import { users } from "../db/schema/users"

type Db = ReturnType<typeof getDb>

// ── Event sets (mirrors Flask's ACTIVATION_EVENTS / REPORT_EVENTS) ────────────

const ACTIVATION_EVENTS = ["demo_data_loaded", "import_completed"] as const
const REPORT_EVENTS = [
  "app_opened",
  "demo_data_loaded",
  "demo_data_replaced_with_import",
  "first_budget_set",
  "import_completed",
  "signup_completed",
] as const

// ── Output type ───────────────────────────────────────────────────────────────

export interface ActivationReport {
  activation_paths: {
    demo_data_loaded: number
    demo_replaced_with_import: number
    import_completed: number
  }
  daily: Array<{
    activated_any: number
    app_opened: number
    date: string
    demo_data_loaded: number
    demo_replaced_with_import: number
    first_budget_set: number
    import_completed: number
    signup_completed: number
    users_created: number
  }>
  summary: {
    activated_any: number
    activation_rate_from_signup_pct: number | null
    app_opened: number
    budget_rate_from_signup_pct: number | null
    demo_to_import_users: number
    first_budget_set: number
    median_hours_signup_to_activation: number | null
    signup_completed: number
    users_created: number
  }
  window: {
    as_of: string
    days: number
    end_exclusive: string
    start: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIsoTz(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00")
}

// Matches Flask's round((numerator / denominator) * 100.0, 1) with null guard.
function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

// JS-side median: pull raw deltas from DB, compute in Node (same as Flask's
// statistics.median call in Python). Avoids MySQL percentile gymnastics.
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw =
    sorted.length % 2 !== 0
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2
  return Math.round(raw * 100) / 100
}

function windowBounds(
  days: number,
  nowUtc: Date,
): { start: Date; endExclusive: Date; asOf: Date } {
  const resolvedDays = Math.max(1, Math.floor(days))
  const todayMidnight = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate()),
  )
  const start = new Date(todayMidnight.getTime() - (resolvedDays - 1) * 86_400_000)
  const endExclusive = new Date(todayMidnight.getTime() + 86_400_000)
  return { start, endExclusive, asOf: nowUtc }
}

// ── Core builder ──────────────────────────────────────────────────────────────

export async function buildActivationReport(
  days: number,
  db: Db,
  opts?: { nowUtc?: Date },
): Promise<ActivationReport> {
  const nowUtc = opts?.nowUtc ?? new Date()
  const { start, endExclusive, asOf } = windowBounds(days, nowUtc)

  // ── 1. Distinct event user counts (summary totals) ──────────────────────────
  const eventCountRows = await db
    .select({
      eventName: productEvents.eventName,
      count: sql<string>`COUNT(DISTINCT ${productEvents.userId})`,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [...REPORT_EVENTS]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(productEvents.eventName)

  const eventCounts = new Map(
    eventCountRows.map((r) => [r.eventName, Number(r.count ?? 0)]),
  )

  // ── 2. Users created in window ──────────────────────────────────────────────
  const [createdRow] = await db
    .select({ count: sql<string>`COUNT(${users.id})` })
    .from(users)
    .where(and(gte(users.createdAt, start), lt(users.createdAt, endExclusive)))

  const usersCreated = Number(createdRow?.count ?? 0)

  // ── 3. activated_any: DISTINCT users with any ACTIVATION_EVENT ──────────────
  // Single query with IN(...) — not two summed queries — so users who hit both
  // demo_data_loaded and import_completed are counted exactly once.
  const [activatedRow] = await db
    .select({
      count: sql<string>`COUNT(DISTINCT ${productEvents.userId})`,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [...ACTIVATION_EVENTS]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )

  const activatedAny = Number(activatedRow?.count ?? 0)

  // ── 4. Demo/import user sets (for activation_paths + demo_to_import_users) ──
  const demoImportRows = await db
    .select({ userId: productEvents.userId, eventName: productEvents.eventName })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [
          "demo_data_loaded",
          "import_completed",
          "demo_data_replaced_with_import",
        ]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(productEvents.userId, productEvents.eventName)

  const demoUsers = new Set<number>()
  const importUsers = new Set<number>()
  const demoReplaceImportUsers = new Set<number>()
  for (const { userId, eventName } of demoImportRows) {
    if (!userId) continue
    if (eventName === "demo_data_loaded") demoUsers.add(userId)
    if (eventName === "import_completed") importUsers.add(userId)
    if (eventName === "demo_data_replaced_with_import") demoReplaceImportUsers.add(userId)
  }

  // Flask: prefer demo_replaced_with_import count; fall back to intersection.
  const demoToImportUsers =
    demoReplaceImportUsers.size > 0
      ? demoReplaceImportUsers.size
      : [...demoUsers].filter((uid) => importUsers.has(uid)).length

  // ── 5. Median signup→activation hours (JS-side, matching Flask's Python median) ─
  const signupRows = await db
    .select({
      userId: productEvents.userId,
      signupTs: sql<Date>`MIN(${productEvents.eventTs})`,
    })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.eventName, "signup_completed"),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(productEvents.userId)

  const firstActivationRows = await db
    .select({
      userId: productEvents.userId,
      activationTs: sql<Date>`MIN(${productEvents.eventTs})`,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [...ACTIVATION_EVENTS]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(productEvents.userId)

  const activationByUser = new Map(
    firstActivationRows.map((r) => [r.userId, r.activationTs]),
  )
  const deltaHours: number[] = []
  for (const { userId, signupTs } of signupRows) {
    const activationTs = activationByUser.get(userId)
    if (!signupTs || !activationTs || activationTs < signupTs) continue
    const hours = (activationTs.getTime() - signupTs.getTime()) / 3_600_000
    deltaHours.push(Math.round(hours * 100) / 100)
  }

  // ── 6. Daily user signups ───────────────────────────────────────────────────
  const dailySignupRows = await db
    .select({
      dayBucket: sql<string>`DATE(${users.createdAt})`,
      count: sql<string>`COUNT(${users.id})`,
    })
    .from(users)
    .where(and(gte(users.createdAt, start), lt(users.createdAt, endExclusive)))
    .groupBy(sql`DATE(${users.createdAt})`)
    .orderBy(sql`DATE(${users.createdAt})`)

  const dailySignups = new Map(
    dailySignupRows.map((r) => [r.dayBucket, Number(r.count ?? 0)]),
  )

  // ── 7. Daily event users by (day, eventName) ────────────────────────────────
  const dailyEventRows = await db
    .select({
      dayBucket: sql<string>`DATE(${productEvents.eventTs})`,
      eventName: productEvents.eventName,
      count: sql<string>`COUNT(DISTINCT ${productEvents.userId})`,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [...REPORT_EVENTS]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(sql`DATE(${productEvents.eventTs})`, productEvents.eventName)
    .orderBy(sql`DATE(${productEvents.eventTs})`, productEvents.eventName)

  // Map<dateStr, Map<eventName, count>>
  const dailyEvents = new Map<string, Map<string, number>>()
  for (const { dayBucket, eventName, count } of dailyEventRows) {
    if (!dayBucket || !eventName) continue
    if (!dailyEvents.has(dayBucket)) dailyEvents.set(dayBucket, new Map())
    dailyEvents.get(dayBucket)!.set(eventName, Number(count ?? 0))
  }

  // ── 8. Daily activated users ────────────────────────────────────────────────
  const dailyActivatedRows = await db
    .select({
      dayBucket: sql<string>`DATE(${productEvents.eventTs})`,
      count: sql<string>`COUNT(DISTINCT ${productEvents.userId})`,
    })
    .from(productEvents)
    .where(
      and(
        inArray(productEvents.eventName, [...ACTIVATION_EVENTS]),
        gte(productEvents.eventTs, start),
        lt(productEvents.eventTs, endExclusive),
      ),
    )
    .groupBy(sql`DATE(${productEvents.eventTs})`)
    .orderBy(sql`DATE(${productEvents.eventTs})`)

  const dailyActivated = new Map(
    dailyActivatedRows.map((r) => [r.dayBucket, Number(r.count ?? 0)]),
  )

  // ── Build daily array (one entry per calendar day in window) ─────────────────
  const daily: ActivationReport["daily"] = []
  const cursorMs = start.getTime()
  const endMs = endExclusive.getTime()
  for (let ms = cursorMs; ms < endMs; ms += 86_400_000) {
    const d = new Date(ms)
    const dateStr = d.toISOString().slice(0, 10)
    const evts = dailyEvents.get(dateStr)
    daily.push({
      activated_any: dailyActivated.get(dateStr) ?? 0,
      app_opened: evts?.get("app_opened") ?? 0,
      date: dateStr,
      demo_data_loaded: evts?.get("demo_data_loaded") ?? 0,
      demo_replaced_with_import: evts?.get("demo_data_replaced_with_import") ?? 0,
      first_budget_set: evts?.get("first_budget_set") ?? 0,
      import_completed: evts?.get("import_completed") ?? 0,
      signup_completed: evts?.get("signup_completed") ?? 0,
      users_created: dailySignups.get(dateStr) ?? 0,
    })
  }

  // ── Assemble report (keys in alphabetical order to match Flask sort_keys=True) ─
  const signupCompleted = eventCounts.get("signup_completed") ?? 0
  const firstBudgetSet = eventCounts.get("first_budget_set") ?? 0

  return {
    activation_paths: {
      demo_data_loaded: demoUsers.size,
      demo_replaced_with_import: demoReplaceImportUsers.size,
      import_completed: importUsers.size,
    },
    daily,
    summary: {
      activated_any: activatedAny,
      activation_rate_from_signup_pct: pct(activatedAny, signupCompleted),
      app_opened: eventCounts.get("app_opened") ?? 0,
      budget_rate_from_signup_pct: pct(firstBudgetSet, signupCompleted),
      demo_to_import_users: demoToImportUsers,
      first_budget_set: firstBudgetSet,
      median_hours_signup_to_activation: medianOf(deltaHours),
      signup_completed: signupCompleted,
      users_created: usersCreated,
    },
    window: {
      as_of: toIsoTz(asOf),
      days: Math.max(1, Math.floor(days)),
      end_exclusive: toIsoTz(endExclusive),
      start: toIsoTz(start),
    },
  }
}

