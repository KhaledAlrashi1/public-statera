import type { Job } from "bullmq"
import { and, eq, isNotNull, lt, lte, or } from "drizzle-orm"
import { getDb } from "../../db/connection"
import {
  accountActionTokens,
  memorizedTransactions,
  productEvents,
  securityEvents,
} from "../../db/schema"
import { env } from "../../lib/env"
import { Sentry } from "../../lib/sentry"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "../task-runs"

export const TASK_CLEANUP_ACCOUNT_TOKENS = "cleanup-account-tokens"
export const TASK_CLEANUP_SECURITY_DATA = "cleanup-security-data"
export const TASK_CLEANUP_PRODUCT_EVENTS = "cleanup-product-events"
export const TASK_CLEANUP_MEMORIZED = "cleanup-memorized-transactions"

const DAY_MS = 24 * 60 * 60 * 1000

export async function handleCleanupAccountTokens(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CLEANUP_ACCOUNT_TOKENS)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const now = Date.now()
    // Keep expired tokens for 24 h after expiry before purging (clock-skew grace).
    const expiredCutoff = new Date(now - 24 * DAY_MS)
    // Keep consumed tokens for 7 days for audit trail before purging.
    const usedCutoff = new Date(now - 7 * DAY_MS)

    const [expired] = await db
      .delete(accountActionTokens)
      .where(lt(accountActionTokens.expiresAt, expiredCutoff))
    const [used] = await db
      .delete(accountActionTokens)
      .where(
        and(
          isNotNull(accountActionTokens.usedAt),
          lt(accountActionTokens.usedAt, usedCutoff),
        ),
      )
    console.log(
      `[${TASK_CLEANUP_ACCOUNT_TOKENS}] expired_deleted=${expired.affectedRows} used_deleted=${used.affectedRows}`,
    )
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CLEANUP_ACCOUNT_TOKENS } })
    console.error(`[${TASK_CLEANUP_ACCOUNT_TOKENS}] Failed:`, err)
  }
  await markWorkerTaskFinished(
    TASK_CLEANUP_ACCOUNT_TOKENS,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}

export async function handleCleanupSecurityData(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CLEANUP_SECURITY_DATA)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - env.securityEventsRetentionDays * DAY_MS)
    const [result] = await db
      .delete(securityEvents)
      .where(lt(securityEvents.createdAt, cutoff))
    console.log(`[${TASK_CLEANUP_SECURITY_DATA}] security_events_deleted=${result.affectedRows}`)
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CLEANUP_SECURITY_DATA } })
    console.error(`[${TASK_CLEANUP_SECURITY_DATA}] Failed:`, err)
  }
  await markWorkerTaskFinished(
    TASK_CLEANUP_SECURITY_DATA,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}

export async function handleCleanupProductEvents(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CLEANUP_PRODUCT_EVENTS)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - env.productEventsRetentionDays * DAY_MS)
    const [result] = await db
      .delete(productEvents)
      .where(lt(productEvents.eventTs, cutoff))
    console.log(`[${TASK_CLEANUP_PRODUCT_EVENTS}] product_events_deleted=${result.affectedRows}`)
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CLEANUP_PRODUCT_EVENTS } })
    console.error(`[${TASK_CLEANUP_PRODUCT_EVENTS}] Failed:`, err)
  }
  await markWorkerTaskFinished(
    TASK_CLEANUP_PRODUCT_EVENTS,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}

export async function handleCleanupMemorizedTransactions(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CLEANUP_MEMORIZED)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const now = Date.now()
    // Flask prune constants: MEMORIZED_PRUNE_ALL_DAYS=180, MEMORIZED_PRUNE_SINGLE_DAYS=90.
    // Deviation from Flask: Flask has no is_pinned column; Hono adds AND is_pinned = FALSE
    // so user-pinned entries are never auto-pruned regardless of age.
    const cutoffAll = new Date(now - 180 * DAY_MS)
    const cutoffSingle = new Date(now - 90 * DAY_MS)
    const [result] = await db
      .delete(memorizedTransactions)
      .where(
        and(
          eq(memorizedTransactions.isPinned, false),
          or(
            lt(memorizedTransactions.lastSeen, cutoffAll),
            and(
              lte(memorizedTransactions.count, 1),
              lt(memorizedTransactions.lastSeen, cutoffSingle),
            ),
          ),
        ),
      )
    console.log(`[${TASK_CLEANUP_MEMORIZED}] memorized_deleted=${result.affectedRows}`)
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CLEANUP_MEMORIZED } })
    console.error(`[${TASK_CLEANUP_MEMORIZED}] Failed:`, err)
  }
  await markWorkerTaskFinished(
    TASK_CLEANUP_MEMORIZED,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}
