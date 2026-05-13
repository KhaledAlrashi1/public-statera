import type { Queue } from "bullmq"
import { env } from "../lib/env"
import {
  TASK_CLEANUP_ACCOUNT_TOKENS,
  TASK_CLEANUP_MEMORIZED,
  TASK_CLEANUP_PRODUCT_EVENTS,
  TASK_CLEANUP_SECURITY_DATA,
} from "./jobs/maintenance-jobs"
import { TASK_CHECK_BUDGET_ALERTS } from "./jobs/budget-alerts-job"
import { TASK_GENERATE_ACTIVATION_REPORT } from "./jobs/activation-report-job"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export async function registerScheduledJobs(queue: Queue): Promise<void> {
  await queue.add("ping", {}, {
    jobId: "scheduled:ping",
    repeat: { every: MINUTE_MS },
  })

  // Overlap guard: fixed jobId prevents BullMQ from enqueueing a second run
  // while a previous run is still queued or active.
  await queue.add("rebuild-dashboard-snapshots", {}, {
    jobId: "rebuild-dashboard-snapshots-singleton",
    repeat: { every: 15 * MINUTE_MS },
  })

  await queue.add(TASK_CLEANUP_ACCOUNT_TOKENS, {}, {
    jobId: `scheduled:${TASK_CLEANUP_ACCOUNT_TOKENS}`,
    repeat: { every: env.maintAccountTokensIntervalMinutes * MINUTE_MS },
  })

  await queue.add(TASK_CLEANUP_SECURITY_DATA, {}, {
    jobId: `scheduled:${TASK_CLEANUP_SECURITY_DATA}`,
    repeat: { every: env.maintSecurityDataIntervalHours * HOUR_MS },
  })

  await queue.add(TASK_CLEANUP_PRODUCT_EVENTS, {}, {
    jobId: `scheduled:${TASK_CLEANUP_PRODUCT_EVENTS}`,
    repeat: { every: env.maintProductEventsIntervalHours * HOUR_MS },
  })

  await queue.add(TASK_CLEANUP_MEMORIZED, {}, {
    jobId: `scheduled:${TASK_CLEANUP_MEMORIZED}`,
    repeat: { every: env.maintMemorizedIntervalHours * HOUR_MS },
  })

  // 09:00 UTC = 12:00 noon Kuwait (UTC+3). Matches Flask's celery beat schedule.
  await queue.add(TASK_CHECK_BUDGET_ALERTS, {}, {
    jobId: `scheduled:${TASK_CHECK_BUDGET_ALERTS}`,
    repeat: { pattern: "0 9 * * *" },
  })

  await queue.add(TASK_GENERATE_ACTIVATION_REPORT, {}, {
    jobId: `scheduled:${TASK_GENERATE_ACTIVATION_REPORT}`,
    repeat: { every: env.activationReportIntervalHours * HOUR_MS },
  })
}
