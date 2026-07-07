import type { Job } from "bullmq"
import { eq } from "drizzle-orm"
import { getDb } from "../../db/connection"
import { users } from "../../db/schema"
import { purgeUserAccountRows } from "../../lib/account-deletion"
import { revokeSessionVersion } from "../../middleware/auth"
import { Sentry } from "../../lib/sentry"

export const TASK_DELETE_ACCOUNT = "delete-account-data"

// Idempotency: check is_active before purging — if already false, the purge already ran.
// Redis NX lock is not used here (unlike Flask's Celery task) because BullMQ's job
// deduplication (jobId = "delete-account-{userId}") already prevents duplicate dispatches.
// BullMQ retries up to 2 times on failure, consistent with Flask's max_retries=2.
export async function handleDeleteAccountData(job: Job): Promise<void> {
  const userId = Number(job.data.userId)
  const emailHash = String(job.data.emailHash ?? "")
  const ipAddress = String(job.data.ipAddress ?? "")
  const userAgent = String(job.data.userAgent ?? "")

  if (!userId || isNaN(userId)) {
    throw new Error(`[delete-account] Invalid userId: ${job.data.userId}`)
  }

  const db = getDb()

  const [user] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  // Idempotency: job may fire twice (retry). If the account is already soft-deleted, skip.
  if (!user || user.isActive === false) {
    return
  }

  const { revokedSv } = await db.transaction(async (tx) => {
    return purgeUserAccountRows(userId, emailHash, ipAddress, userAgent, tx)
  })

  // Defense-in-depth: revoke all sessions post-commit. Must not fail the job (data is
  // already purged) — Sentry-capture on failure per the swallowed-error rule.
  try {
    await revokeSessionVersion(userId, revokedSv)
  } catch (revokeErr) {
    Sentry.captureException(revokeErr, { tags: { handler: "delete-account-job.revoke", userId } })
  }
}
