import { describe, it, expect, afterAll } from "vitest"
import { Queue, Worker } from "bullmq"
import { getRedisConnection } from "./connection"

// Run with:  INTEGRATION=true pnpm test
const RUN = process.env["INTEGRATION"] === "true"

describe.runIf(RUN)("worker integration (requires Redis)", () => {
  const queueName = `statera_test_${process.pid}`
  const connection = getRedisConnection()

  afterAll(async () => {
    const q = new Queue(queueName, { connection })
    await q.obliterate({ force: true })
    await q.close()
  })

  it("worker picks up a job and calls the handler", async () => {
    const processed: string[] = []
    const queue = new Queue(queueName, { connection })
    const worker = new Worker(
      queueName,
      async (job) => {
        processed.push(job.name)
      },
      { connection },
    )

    await queue.add("ping", {})

    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve())
    })

    await worker.close()
    await queue.close()

    expect(processed).toEqual(["ping"])
  })
})
