// Phase 4 / Task B — B1 (F-1(b)): INTEGRATION-only rate-limit residue flush.
//
// WHY: under `INTEGRATION=true` the module-wide ioredis mock is skipped
// (vitest.config.ts sets setupFiles: [] in that mode), so rate-limit tests hit
// the real dev Redis. Rate-limit counters live at `rl:*` (double-prefixed
// `rl:rl:{userId}:{path}` per RL-C1) with a 60s TTL, so a second INTEGRATION run
// started within the window inherits the first run's counters and re-fails ~11
// rate-limit tests (proven 2026-07-27: Run-2 exited 1). The 2026-07-19 ticket
// (docs/modules/phase4-rate-limit-test-isolation.md) fixed four named tests but
// NOT this suite-level residue; this globalSetup retires the manual pre-flush.
//
// GRANULARITY: a Vitest globalSetup runs exactly ONCE per run in the Node (not
// test) context, before any test file — the correct granularity for cross-run
// residue. setupFiles (per-file) would flush mid-suite; globalTeardown would be
// skipped on a crash. A setup-time flush is self-healing (it cleans whatever the
// previous run left behind, however that run ended).
//
// HERMETIC SAFETY (TB-R1(a)): the first line returns before ANY import or
// connection when INTEGRATION !== "true". Hermetic CI never sets INTEGRATION and
// has no reachable Redis (ioredis is mocked per test file, not here), so the gate
// makes this a provable no-op there. ioredis is imported lazily INSIDE the guarded
// branch — there is deliberately NO top-level `import ... from "ioredis"`, so a
// hermetic run never loads the real client (grep-provable).
//
// SCOPE (TB-R1(a)): SCAN+DEL on `rl:*` only, on the app's Redis db (default db 1).
// Never FLUSHDB/FLUSHALL. `rl:*` is exclusive to rate-limit — no other namespace
// (sv_revoked:, pending_2fa_failures:, dashboard_metrics:, dashboard_snapshots,
// snapshot, safe_to_spend:, bull:) starts with `rl:`. lib/rate-limit.ts is NOT
// touched (RL-A1 / D1): this is test infrastructure only.

// Stable, greppable prefix for the positive-control log line (TB-R1(a)).
const FLUSH_LOG_PREFIX = "[rl-flush]"

export default async function setup(): Promise<void> {
  if (process.env.INTEGRATION !== "true") return

  const { Redis } = await import("ioredis")
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/1"
  const redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false })

  try {
    let deleted = 0
    let cursor = "0"
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "rl:*", "COUNT", 500)
      cursor = next
      if (keys.length > 0) deleted += await redis.del(...keys)
    } while (cursor !== "0")

    // POSITIVE CONTROL (TB-R1(a)): emit the deleted count so an INTEGRATION run
    // proves the flush ran and had something to flush; the line is ABSENT on a
    // hermetic run (the early return above never reaches here), which proves the
    // gate held.
    const db = new URL(url).pathname.replace(/^\//, "") || "0"
    console.log(`${FLUSH_LOG_PREFIX} flushed ${deleted} rl:* key(s) on redis db ${db}`)
  } finally {
    await redis.quit().catch(() => redis.disconnect())
  }
}
