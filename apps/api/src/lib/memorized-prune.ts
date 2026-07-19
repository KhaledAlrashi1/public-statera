// Unified memorized_transactions retention policy (count-tiered).
//
// Single source of truth for both prune call sites — the inline per-user prune
// (routes/memorized.ts, called on every memorized upsert) and the batch job
// (worker/jobs/maintenance-jobs.ts cleanup-memorized-transactions). Before this
// lib the two sites hand-rolled DIFFERENT rules (a port splice: the inline copy
// came from personal_statera's count-tiered rule, the batch copy from
// personal-finance's age-OR-lowcount rule). Unified onto the count-tiered rule
// per operator ruling (Option A, 2026-07-18); see
// docs/modules/phase4-memorized-prune-unification.md.
//
// Rule (personal_statera lib/suggestions.py lineage):
//   non-pinned AND ( (count==1 AND last_seen < now-90d)
//                 OR (count==2 AND last_seen < now-180d) )
//   count>=3 → never auto-pruned; pinned → never auto-pruned.

import { and, eq, lt, or } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { memorizedTransactions } from "../db/schema/memorized-transactions"

const DAY_MS = 86_400_000

export const MEMORIZED_PRUNE_DAYS_COUNT_1 = 90 // count==1 rows older than this are pruned
export const MEMORIZED_PRUNE_DAYS_COUNT_2 = 180 // count==2 rows older than this are pruned

// Deletes stale memorized rows and returns the affected-row count.
// `userId` omitted → all-users (batch job); present → scoped to one user (inline).
// `now` is injectable for deterministic tests (MP-C1); defaults to wall clock.
export async function deleteStaleMemorizedRows(
  db: Pick<ReturnType<typeof getDb>, "delete">,
  opts: { userId?: number; now?: Date } = {},
): Promise<number> {
  const now = opts.now ?? new Date()
  const cutoff1 = new Date(now.getTime() - MEMORIZED_PRUNE_DAYS_COUNT_1 * DAY_MS)
  const cutoff2 = new Date(now.getTime() - MEMORIZED_PRUNE_DAYS_COUNT_2 * DAY_MS)

  const retention = or(
    and(eq(memorizedTransactions.count, 1), lt(memorizedTransactions.lastSeen, cutoff1)),
    and(eq(memorizedTransactions.count, 2), lt(memorizedTransactions.lastSeen, cutoff2)),
  )

  const where =
    opts.userId !== undefined
      ? and(eq(memorizedTransactions.userId, opts.userId), eq(memorizedTransactions.isPinned, false), retention)
      : and(eq(memorizedTransactions.isPinned, false), retention)

  const [result] = await db.delete(memorizedTransactions).where(where)
  return result?.affectedRows ?? 0
}
