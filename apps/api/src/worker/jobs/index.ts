import type { Job } from "bullmq"
import { handlePing } from "./ping"
import { handleRebuildDashboardSnapshots } from "./rebuild-dashboard-snapshots"

type JobHandler = (job: Job) => Promise<unknown>

export const jobHandlers: Record<string, JobHandler> = {
  ping: handlePing,
  "rebuild-dashboard-snapshots": handleRebuildDashboardSnapshots,
}
