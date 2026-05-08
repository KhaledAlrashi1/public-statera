import { Queue } from "bullmq"
import { getRedisConnection } from "./connection"

export type JobName = "ping" | "rebuild-dashboard-snapshots"

let _queue: Queue | null = null

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue("statera", { connection: getRedisConnection() })
  }
  return _queue
}

export async function enqueueJob(name: JobName, data: Record<string, unknown> = {}): Promise<void> {
  await getQueue().add(name, data)
}
