import type { Job } from "bullmq"
import { eq } from "drizzle-orm"
import { getDb } from "../../db/connection"
import { users } from "../../db/schema"
import { purgeUserAccountRows } from "../../lib/account-deletion"

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

  await db.transaction(async (tx) => {
    await purgeUserAccountRows(userId, emailHash, ipAddress, userAgent, tx)
  })
}
