import type { Queue } from "bullmq"

const MINUTE_MS = 60_000

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

  // TODO (module 4a — budget alerts): budget-alert-check, daily
  // TODO (module 4b — debt accounts): debt-payment-reminder, daily
  // TODO (module 4c — savings goals): savings-goal-snapshot, daily
  // TODO (module 5b — template suggestions): suggestion-model-refresh, daily
  // TODO (module 5c — recurring patterns): recurring-pattern-scan, daily
  // TODO (module 6a — bank sync): bank-sync-fetch, every 4 hours
  // TODO (module 6b — bank sync): bank-sync-consent-check, every 30 minutes
  // TODO (module 7a — TOTP): expired-backup-code-cleanup, weekly
  // TODO (module 7b — sessions): stale-session-cleanup, daily
  // TODO (module 8a — audit): audit-log-archive, weekly
  // TODO (module 8b — metrics): metrics-rollup, daily
}
