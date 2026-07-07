/*
 * deploy/restore-repurge.ts — 8f-2 restore-drill re-purge CLI (Module 10d). DRILL-ONLY.
 *
 * Thin wrapper over apps/api/src/lib/restore-repurge-lib.ts (all logic + DB wiring live
 * there, so this file imports no third-party packages and resolution stays inside apps/api).
 *
 * Runs against an ISOLATED scratch database only (URL must be 127.0.0.1/localhost; the lib
 * enforces this). NEVER point --url at production. No Redis / session revocation here — the
 * scratch DB has no sessions; the incident variant adds revokeSessionVersion (see runbook).
 *
 * Invoke (as the deploy user, after restore-drill.sh has set up the scratch container):
 *   REPO=$(git rev-parse --show-toplevel)
 *   # Stage 2 — deterministic mechanism check:
 *   pnpm --filter statera-api exec tsx "$REPO/deploy/restore-repurge.ts" \
 *     --mode fixture --url 'mysql://root:PW@127.0.0.1:3307/statera' --t-backup 2026-07-05T02:30:00Z
 *   # Stage 3 — real-data known-answer re-purge (exactly 1 match = operator):
 *   pnpm --filter statera-api exec tsx "$REPO/deploy/restore-repurge.ts" \
 *     --mode repurge --url 'mysql://root:PW@127.0.0.1:3307/statera' --t-backup 2026-07-05T02:30:00Z \
 *     --tombstones /dev/shm/prod-tombstones.json --expect 1
 *
 * --tombstones file: JSON array exported READ-ONLY from prod, e.g.
 *   [{"email_hash":"<sha256>","created_at":"2026-07-06T12:00:00.000Z"}, ...]
 * produced by (operator, read-only):
 *   SELECT JSON_EXTRACT(details_json,'$.email_hash') AS email_hash, created_at
 *   FROM security_events WHERE is_tombstone=1 AND created_at > '<T_BACKUP>';
 */

import { readFileSync } from "node:fs"
import {
  openScratchDb,
  runFixtureScenario,
  runRepurgeFromTombstones,
  type TombstoneRow,
} from "../apps/api/src/lib/restore-repurge-lib"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function die(msg: string): never {
  console.error(`[restore-repurge] ${msg}`)
  process.exit(1)
}

function loadTombstones(path: string): TombstoneRow[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { email_hash: string; created_at: string }[]
  if (!Array.isArray(raw)) die(`--tombstones file is not a JSON array: ${path}`)
  return raw.map((r) => {
    const emailHash = String(r.email_hash).replace(/^"|"$/g, "") // tolerate JSON_EXTRACT quoting
    const createdAt = new Date(r.created_at)
    if (!emailHash || Number.isNaN(createdAt.getTime())) die(`bad tombstone row: ${JSON.stringify(r)}`)
    return { emailHash, createdAt }
  })
}

async function main(): Promise<void> {
  const mode = arg("mode")
  const url = arg("url")
  const tBackupRaw = arg("t-backup")
  if (!mode || !url || !tBackupRaw) die("required: --mode <fixture|repurge> --url <scratch-url> --t-backup <ISO8601>")

  const tBackup = new Date(tBackupRaw!)
  if (Number.isNaN(tBackup.getTime())) die(`--t-backup is not a valid ISO timestamp: ${tBackupRaw}`)

  const scratch = await openScratchDb(url!)
  try {
    if (mode === "fixture") {
      const res = await runFixtureScenario(scratch, tBackup)
      console.log("[restore-repurge] Stage 2 (fixture) details:", JSON.stringify(res.details, null, 2))
      if (!res.ok) die(`Stage 2 FAILED:\n  - ${res.failures.join("\n  - ")}`)
      console.log("[restore-repurge] Stage 2 PASS — post-backup fixture purged, pre-backup fixture untouched.")
    } else if (mode === "repurge") {
      const tombstonesPath = arg("tombstones")
      if (!tombstonesPath) die("--mode repurge requires --tombstones <file>")
      const expectRaw = arg("expect")
      const expect = expectRaw !== undefined ? Number(expectRaw) : undefined
      if (expectRaw !== undefined && !Number.isInteger(expect)) die(`--expect must be an integer: ${expectRaw}`)

      const tombstones = loadTombstones(tombstonesPath!)
      const report = await runRepurgeFromTombstones(scratch, tombstones, tBackup, expect)
      console.log(`[restore-repurge] Stage 3 matched ${report.matches.length} user(s):`)
      for (const p of report.purged) {
        console.log(`  - userId=${p.userId} email_hash=${p.emailHash}  owned before=${JSON.stringify(p.before)} after=${JSON.stringify(p.after)}`)
      }
      if (!report.ok) die(`Stage 3 FAILED:\n  - ${report.failures.join("\n  - ")}`)
      console.log("[restore-repurge] Stage 3 PASS — expected match(es) re-purged, all owned counts zero.")
    } else {
      die(`unknown --mode: ${mode} (expected fixture|repurge)`)
    }
  } finally {
    await scratch.close()
  }
}

main().catch((err) => die(err instanceof Error ? err.stack ?? err.message : String(err)))
