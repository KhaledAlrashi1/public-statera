import type { Job } from "bullmq"
import { handlePing } from "./ping"

type JobHandler = (job: Job) => Promise<unknown>

export const jobHandlers: Record<string, JobHandler> = {
  ping: handlePing,
}
