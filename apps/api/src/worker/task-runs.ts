import { getDb } from "../db/connection"
import { workerTaskRuns } from "../db/schema/worker-task-runs"
import { Sentry } from "../lib/sentry"

export async function markWorkerTaskStarted(taskName: string): Promise<void> {
  try {
    const db = getDb()
    const now = new Date()
    await db
      .insert(workerTaskRuns)
      .values({ taskName, lastStartedAt: now, lastStatus: "running", updatedAt: now })
      .onDuplicateKeyUpdate({
        set: { lastStartedAt: now, lastStatus: "running", updatedAt: now },
      })
  } catch (err) {
    Sentry.captureException(err)
    console.error(`[worker] Failed to mark task started: ${taskName}`, err)
  }
}

export async function markWorkerTaskFinished(
  taskName: string,
  status: "success" | "failure",
  error?: string,
): Promise<void> {
  try {
    const db = getDb()
    const now = new Date()
    const isSuccess = status === "success"
    await db
      .insert(workerTaskRuns)
      .values({
        taskName,
        lastFinishedAt: now,
        lastSuccessAt: isSuccess ? now : undefined,
        lastFailureAt: isSuccess ? undefined : now,
        lastStatus: status,
        lastError: error ? error.slice(0, 255) : undefined,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          lastFinishedAt: now,
          ...(isSuccess ? { lastSuccessAt: now } : { lastFailureAt: now }),
          lastStatus: status,
          lastError: error ? error.slice(0, 255) : null,
          updatedAt: now,
        },
      })
  } catch (err) {
    Sentry.captureException(err)
    console.error(`[worker] Failed to mark task finished: ${taskName}`, err)
  }
}
