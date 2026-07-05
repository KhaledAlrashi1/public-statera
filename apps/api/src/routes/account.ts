/*
 * Deliberate deviations from Flask (routers/auth.py delete_account):
 * - Flask uses a two-step password re-verification flow with a session-stored
 *   confirmation token. Hono uses a statera_delete_intent cookie issued by the
 *   OIDC re-auth flow (GET /api/auth/delete-reauth), which is a signed JWT verified
 *   on DELETE /api/account. The cookie is scoped to Path=/api/account so it cannot
 *   be sent to unrelated endpoints.
 * - TOTP re-verification: if the user has TOTP enabled, the delete-reauth OIDC callback
 *   issues a statera_pending_2fa cookie (deleteIntent=true) and redirects to /2fa/verify.
 *   Only after successful 2FA verification is the delete-intent cookie issued. This
 *   means 2FA users must pass a second factor even during re-authentication — matching
 *   the spirit of Flask's totp_code check on the delete endpoint.
 * - BullMQ async job with sync transaction fallback (Celery + sync fallback in Flask).
 *   Sync fallback is explicitly transaction-wrapped and Sentry-tracked.
 * - status token: encrypt(JSON.stringify({ type, task_id })) using lib/crypto.ts.
 * - Rate limit: 10 per 60 s (RATE_LIMIT_AUTH), matching Flask.
 * - Idempotency: the job is enqueued with jobId = "delete-account-{userId}" so BullMQ
 *   deduplicates concurrent dispatch attempts.
 */

import { Hono } from "hono"
import { getCookie, deleteCookie } from "hono/cookie"
import { eq } from "drizzle-orm"
import { Job } from "bullmq"
import { getDb } from "../db/connection"
import { users } from "../db/schema"
import { requireAuth } from "../middleware/auth"
import { Sentry } from "../lib/sentry"
import { createRateLimiter } from "../lib/rate-limit"
import { encrypt, decrypt } from "../lib/crypto"
import { hashEmail, purgeUserAccountRows } from "../lib/account-deletion"
import { buildUserDataExport, DATA_EXPORT_EXCLUSIONS } from "../lib/data-export-lib"
import { getQueue } from "../worker/queue"
import { TASK_DELETE_ACCOUNT } from "../worker/jobs/delete-account-job"
import { verifyDeleteIntentToken, DELETE_INTENT_COOKIE } from "./auth"

const router = new Hono()

const DELETE_STATUS_TOKEN_TYPE = "account_delete_status"

function packStatusToken(taskId: string): string {
  return encrypt(JSON.stringify({ type: DELETE_STATUS_TOKEN_TYPE, task_id: taskId }))
}

function unpackStatusToken(token: string): { taskId: string } | null {
  try {
    const raw = decrypt(token)
    const parsed = JSON.parse(raw) as { type?: string; task_id?: string }
    if (parsed.type !== DELETE_STATUS_TOKEN_TYPE || !parsed.task_id) return null
    return { taskId: parsed.task_id }
  } catch {
    return null
  }
}

// DELETE /api/account
// Verifies the delete-intent cookie issued by /api/auth/delete-reauth, then dispatches
// an async BullMQ job (with sync transaction fallback if Redis enqueue fails).
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH).
router.delete(
  "/",
  requireAuth,
  createRateLimiter(10, 60),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()
    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
    const userAgent = c.req.header("user-agent") ?? ""

    // 1. Verify delete-intent cookie.
    const intentCookie = getCookie(c, DELETE_INTENT_COOKIE)
    if (!intentCookie) {
      return c.json({ ok: false, data: null, error: "No delete intent found. Please re-authenticate first.", code: "DELETE_INTENT_GONE" }, 410)
    }

    let intentUserId: number
    try {
      ;({ userId: intentUserId } = await verifyDeleteIntentToken(intentCookie))
    } catch {
      deleteCookie(c, DELETE_INTENT_COOKIE, { path: "/api/account" })
      return c.json({ ok: false, data: null, error: "Delete intent expired or invalid. Please re-authenticate.", code: "DELETE_INTENT_GONE" }, 410)
    }

    if (intentUserId !== userId) {
      deleteCookie(c, DELETE_INTENT_COOKIE, { path: "/api/account" })
      return c.json({ ok: false, data: null, error: "Delete intent does not match authenticated user.", code: "DELETE_INTENT_GONE" }, 410)
    }

    // 2. Verify account is still active (guard against double-submission or already-deleted).
    const [user] = await db
      .select({ isActive: users.isActive, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user || user.isActive === false) {
      return c.json({ ok: false, data: null, error: "Account not found or already deactivated.", code: "ACCOUNT_INACTIVE" }, 403)
    }

    // Consume the intent cookie immediately — single-use.
    deleteCookie(c, DELETE_INTENT_COOKIE, { path: "/api/account" })

    const emailHash = hashEmail(user.email)

    // 3. Attempt async BullMQ job. Fall back to sync transaction if enqueue fails.
    let taskStatusToken: string
    let asyncOk = false

    try {
      const job = await getQueue().add(
        TASK_DELETE_ACCOUNT,
        { userId, emailHash, ipAddress, userAgent },
        {
          // Deduplicate concurrent dispatch for the same user.
          jobId: `delete-account-${userId}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      )
      taskStatusToken = packStatusToken(job.id ?? `delete-account-${userId}`)
      asyncOk = true
    } catch (enqueueErr) {
      Sentry.captureException(enqueueErr, {
        tags: { handler: "account.delete.enqueue_fallback", userId },
        extra: { note: "BullMQ enqueue failed; running synchronous purge as fallback" },
      })
    }

    if (!asyncOk) {
      // Sync fallback: transaction-wrapped for clean rollback on timeout or partial failure.
      try {
        await db.transaction(async (tx) => {
          await purgeUserAccountRows(userId, emailHash, ipAddress, userAgent, tx)
        })
        taskStatusToken = packStatusToken("sync")
      } catch (syncErr) {
        Sentry.captureException(syncErr, { tags: { handler: "account.delete.sync_fallback", userId } })
        return c.json({ ok: false, data: null, error: "Account deletion failed. Please try again.", code: "deletion_failed" }, 500)
      }
    }

    // Clear the session cookie — the account is being deleted.
    deleteCookie(c, "statera_session", { path: "/" })

    return c.json({ ok: true, data: { deleted: true, task_id: taskStatusToken! }, error: null, meta: {} })
  },
)

// GET /api/account/deletion-status/:taskToken
// Resolves the encrypted task status token and returns the job state.
// Does not require auth — the encrypted token itself proves authorization.
// Rate: 10 per 60 s (path-keyed, anonymous).
router.get(
  "/deletion-status/:taskToken",
  createRateLimiter(10, 60),
  async (c) => {
    const rawToken = c.req.param("taskToken")

    const unpacked = unpackStatusToken(rawToken)
    if (!unpacked) {
      return c.json({ ok: false, data: null, error: "Invalid account deletion task token.", code: "invalid_task_id" }, 400)
    }

    const { taskId } = unpacked

    if (taskId === "sync") {
      return c.json({ ok: true, data: { status: "complete", task_id: rawToken }, error: null, meta: {} })
    }

    try {
      const job = await Job.fromId(getQueue(), taskId)
      if (!job) {
        return c.json({ ok: true, data: { status: "pending", task_id: rawToken }, error: null, meta: {} })
      }
      const state = await job.getState()
      const taskStatus =
        state === "completed" ? "complete" :
        state === "failed" ? "failed" :
        "pending"
      return c.json({ ok: true, data: { status: taskStatus, task_id: rawToken }, error: null, meta: {} })
    } catch {
      return c.json({ ok: true, data: { status: "pending", task_id: rawToken }, error: null, meta: {} })
    }
  },
)

// GET /api/account/data-export
// GDPR right-to-access (Module 10c-1): returns a synchronous JSON snapshot of all
// user-owned data whose scope mirrors the account-deletion purge, minus the deliberate
// exclusions documented in lib/data-export-lib.ts. requireAuth-gated; no token needed.
// Rate: 5 per hour (low-frequency, whole-account read; heavier than a normal CRUD call).
router.get(
  "/data-export",
  requireAuth,
  createRateLimiter(5, 3600),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()

    const result = await buildUserDataExport(db, userId)
    if (!result) {
      return c.json({ ok: false, data: null, error: "User not found.", code: "user_not_found" }, 401)
    }

    return c.json({
      ok: true,
      data: result.export,
      error: null,
      meta: { counts: result.counts, excluded: DATA_EXPORT_EXCLUSIONS },
    })
  },
)

export { router as accountRouter }
