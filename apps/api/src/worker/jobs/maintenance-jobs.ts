import type { Job } from "bullmq"
import { and, eq, isNotNull, lt } from "drizzle-orm"
import { getDb } from "../../db/connection"
import {
  accountActionTokens,
  magicLinkTokens,
  productEvents,
  securityEvents,
} from "../../db/schema"
import { env } from "../../lib/env"
import { deleteStaleMemorizedRows } from "../../lib/memorized-prune"
import { Sentry } from "../../lib/sentry"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "../task-runs"

export const TASK_CLEANUP_ACCOUNT_TOKENS = "cleanup-account-tokens"
export const TASK_CLEANUP_SECURITY_DATA = "cleanup-security-data"
export const TASK_CLEANUP_PRODUCT_EVENTS = "cleanup-product-events"
export const TASK_CLEANUP_MEMORIZED = "cleanup-memorized-transactions"

const DAY_MS = 24 * 60 * 60 * 1000

/*
 * Cleans BOTH auth-token tables: account_action_tokens and (since 10e-1) magic_link_tokens.
 * The task NAME is deliberately not changed — renaming would break worker_task_runs history
 * continuity for a cosmetic gain — so the log line carries the two new fields instead, and
 * those fields are the on-box activation discriminator at 10e-close (a pre-10e worker prints
 * the old two-field line; a stopped worker prints nothing; the three outcomes are distinguishable).
 *
 * NOT housekeeping — a data-minimisation control. magic_link_tokens rows created by the
 * SIGN-UP path have user_id = NULL and are unreachable by purgeUserAccountRows, so this job is
 * the ONLY bound on how long Statera holds the email address of someone who never became a
 * user. If it stops running, those addresses accumulate indefinitely. See the orphan-class
 * block in db/schema/magic-link-tokens.ts.
 *
 * Pre-existing single-try caveat, inherited deliberately (10e-1): the four deletes share one
 * try/catch, so the first failure aborts the rest and a magic-link cleanup failure is
 * indistinguishable from an account-token one in worker_task_runs. The Sentry exception carries
 * the actual SQL error, so triage is not blind. Unchanged from the two-delete original.
 */
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
    // Same two cutoffs, reused verbatim (10e-1): 24 h past expiry for clock-skew grace,
    // 7 days past consumption for the audit trail. consumed_at is magic-link's usedAt.
    const [magicExpired] = await db
      .delete(magicLinkTokens)
      .where(lt(magicLinkTokens.expiresAt, expiredCutoff))
    const [magicConsumed] = await db
      .delete(magicLinkTokens)
      .where(
        and(
          isNotNull(magicLinkTokens.consumedAt),
          lt(magicLinkTokens.consumedAt, usedCutoff),
        ),
      )
    console.log(
      `[${TASK_CLEANUP_ACCOUNT_TOKENS}] expired_deleted=${expired.affectedRows} used_deleted=${used.affectedRows}` +
        ` magic_expired_deleted=${magicExpired.affectedRows} magic_consumed_deleted=${magicConsumed.affectedRows}`,
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
    // Unified count-tiered retention (operator ruling Option A, 2026-07-18): the
    // rule + constants live in lib/memorized-prune.ts, shared with the inline
    // per-user prune (routes/memorized.ts). count>=3 and pinned rows are never
    // auto-pruned. See docs/modules/phase4-memorized-prune-unification.md.
    const deleted = await deleteStaleMemorizedRows(db)
    console.log(`[${TASK_CLEANUP_MEMORIZED}] memorized_deleted=${deleted}`)
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
