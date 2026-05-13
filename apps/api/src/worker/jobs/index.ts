import type { Job } from "bullmq"
import { handlePing } from "./ping"
import { handleRebuildDashboardSnapshots } from "./rebuild-dashboard-snapshots"
import {
  TASK_CLEANUP_ACCOUNT_TOKENS,
  TASK_CLEANUP_MEMORIZED,
  TASK_CLEANUP_PRODUCT_EVENTS,
  TASK_CLEANUP_SECURITY_DATA,
  handleCleanupAccountTokens,
  handleCleanupMemorizedTransactions,
  handleCleanupProductEvents,
  handleCleanupSecurityData,
} from "./maintenance-jobs"
import {
  TASK_CHECK_BUDGET_ALERTS,
  handleCheckBudgetAlerts,
  handleSendBudgetAlertEmail,
} from "./budget-alerts-job"
import { handleSendGoalMilestoneEmail } from "./goal-milestone-email-job"
import {
  TASK_GENERATE_ACTIVATION_REPORT,
  handleGenerateActivationReport,
} from "./activation-report-job"

type JobHandler = (job: Job) => Promise<unknown>

export const jobHandlers: Record<string, JobHandler> = {
  ping: handlePing,
  "rebuild-dashboard-snapshots": handleRebuildDashboardSnapshots,
  [TASK_CLEANUP_ACCOUNT_TOKENS]: handleCleanupAccountTokens,
  [TASK_CLEANUP_SECURITY_DATA]: handleCleanupSecurityData,
  [TASK_CLEANUP_PRODUCT_EVENTS]: handleCleanupProductEvents,
  [TASK_CLEANUP_MEMORIZED]: handleCleanupMemorizedTransactions,
  [TASK_CHECK_BUDGET_ALERTS]: handleCheckBudgetAlerts,
  "send-budget-alert-email": handleSendBudgetAlertEmail,
  "send-goal-milestone-email": handleSendGoalMilestoneEmail,
  [TASK_GENERATE_ACTIVATION_REPORT]: handleGenerateActivationReport,
}
