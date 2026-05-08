import type { Job } from "bullmq"
import pLimit from "p-limit"
import { gte, or, and, isNull, sql } from "drizzle-orm"
import { getDb } from "../../db/connection"
import { users } from "../../db/schema"
import { env } from "../../lib/env"
import { Sentry } from "../../lib/sentry"
import {
  currentMonthKeyUtc,
  rebuildDashboardSnapshot,
} from "../../lib/dashboard-snapshot-lib"
import { cacheBustDashboardMetrics } from "../../lib/analytics-cache"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "../task-runs"

const TASK_NAME = "rebuild-dashboard-snapshots"

export async function handleRebuildDashboardSnapshots(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_NAME)

  const db = getDb()
  const monthsCount = env.dashboardSnapshotMonths
  const windowEndMonth = currentMonthKeyUtc()
  const windowDays = env.snapshotRebuildWindowDays
  const concurrency = Math.max(1, env.snapshotRebuildConcurrency)
  const perUserBudgetMs = (env.analyticsComputeTimeoutSeconds + 2) * 1000

  let errorMessage: string | undefined

  try {
    // Eligible: logged in within the window, OR never logged in but registered
    // within the window (covers first-run users where last_login_at is still NULL).
    // Bare `last_login_at IS NULL` is intentionally excluded — it would rebuild
    // every dormant user who ever registered, defeating the recency filter.
    const cutoff = sql`NOW() - INTERVAL ${windowDays} DAY`
    const eligibleUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          gte(users.lastLoginAt, sql`NOW() - INTERVAL ${windowDays} DAY`),
          and(isNull(users.lastLoginAt), gte(users.createdAt, cutoff)),
        ),
      )

    const limit = pLimit(concurrency)

    await Promise.all(
      eligibleUsers.map(({ id: userId }) =>
        limit(async () => {
          try {
            await Promise.race([
              rebuildDashboardSnapshot(userId, db, { monthsCount, windowEndMonth }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Per-user budget exceeded (${perUserBudgetMs}ms)`)),
                  perUserBudgetMs,
                ),
              ),
            ])
            // Bust the Redis key but preserve the snapshot we just wrote.
            await cacheBustDashboardMetrics(userId, db, { includeSnapshots: false })
          } catch (err) {
            Sentry.captureException(err, { tags: { handler: TASK_NAME, userId } })
            console.error(`[${TASK_NAME}] Failed for userId=${userId}:`, err)
            // Continue — per-user failures do not abort the batch.
          }
        }),
      ),
    )
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_NAME } })
    console.error(`[${TASK_NAME}] Batch-level failure:`, err)
  }

  await markWorkerTaskFinished(
    TASK_NAME,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}
