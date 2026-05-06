import { initSentry } from "../lib/sentry"
initSentry()

import { Worker } from "bullmq"
import { Sentry } from "../lib/sentry"
import { getRedisConnection } from "./connection"
import { jobHandlers } from "./jobs/index"
import { getQueue } from "./queue"
import { registerScheduledJobs } from "./scheduler"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "./task-runs"

async function main(): Promise<void> {
  const queue = getQueue()
  await registerScheduledJobs(queue)

  const worker = new Worker(
    "statera",
    async (job) => {
      const handler = jobHandlers[job.name]
      if (!handler) {
        console.warn(`[worker] No handler registered for job: ${job.name}`)
        return
      }
      await markWorkerTaskStarted(job.name)
      try {
        await handler(job)
        await markWorkerTaskFinished(job.name, "success")
      } catch (err) {
        await markWorkerTaskFinished(job.name, "failure", String(err))
        throw err
      }
    },
    { connection: getRedisConnection() },
  )

  worker.on("completed", (job) => {
    console.log(`[worker] ${job.name}#${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    Sentry.captureException(err, { tags: { jobName: job?.name } })
    console.error(`[worker] ${job?.name}#${job?.id} failed:`, err)
  })

  worker.on("error", (err) => {
    Sentry.captureException(err)
    console.error("[worker] Worker connection error:", err)
  })

  const shutdown = async (): Promise<void> => {
    console.log("[worker] Shutting down gracefully...")
    await worker.close()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown())
  process.on("SIGINT", () => void shutdown())

  console.log("[worker] Started — listening on queue 'statera'")
}

main().catch((err) => {
  Sentry.captureException(err)
  console.error("[worker] Fatal startup error:", err)
  process.exit(1)
})
