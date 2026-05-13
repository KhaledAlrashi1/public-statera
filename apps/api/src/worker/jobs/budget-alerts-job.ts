import type { Job } from "bullmq"
import { and, eq, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../../db/connection"
import { budgets } from "../../db/schema/budgets"
import { categories } from "../../db/schema/categories"
import { transactions } from "../../db/schema/transactions"
import { users } from "../../db/schema/users"
import { userProfiles } from "../../db/schema/users"
import { env } from "../../lib/env"
import { Sentry } from "../../lib/sentry"
import { formatKd } from "../../lib/kd"
import { calendarMonthBounds } from "../../lib/analytics-helpers"
import { expenseCategoryFilter } from "../../lib/payday-lib"
import { currentMonthKeyUtc } from "../../lib/dashboard-snapshot-lib"
import {
  BUDGET_ALERT_EVENT_NAME,
  BUDGET_ALERT_DISMISSED_EVENT_NAME,
  buildBudgetAlertKey,
  collectMonthAlertKeySets,
  formatMonthLabel,
  roundRatio,
} from "../../lib/budget-alerts-lib"
import { recordEvent } from "../../lib/product-events-lib"
import { sendTemplatedEmail } from "../../lib/email-templates"
import { getQueue } from "../queue"
import { markWorkerTaskFinished, markWorkerTaskStarted } from "../task-runs"

export const TASK_CHECK_BUDGET_ALERTS = "check-budget-alerts"

export async function handleCheckBudgetAlerts(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CHECK_BUDGET_ALERTS)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const monthKey = currentMonthKeyUtc()
    const [endYear, endMonth] = monthKey.split("-").map(Number) as [number, number]
    const { start: monthStart, end: monthEnd } = calendarMonthBounds(endYear, endMonth)
    const threshold = env.budgetAlertThresholdRatio

    const { existing, dismissed } = await collectMonthAlertKeySets(monthKey, db)

    // One query: all budgets for this month with per-category spending (expense categories only).
    const rows = await db
      .select({
        userId: budgets.userId,
        categoryId: budgets.categoryId,
        amountKd: budgets.amountKd,
        categoryName: categories.name,
        spentKd: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')`,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .leftJoin(
        transactions,
        and(
          eq(transactions.userId, budgets.userId),
          eq(transactions.categoryId, budgets.categoryId),
          sql`${transactions.date} >= ${monthStart}`,
          sql`${transactions.date} <= ${monthEnd}`,
        ),
      )
      .where(
        and(
          eq(budgets.month, monthKey),
          expenseCategoryFilter(),
        ),
      )
      .groupBy(budgets.userId, budgets.categoryId, budgets.amountKd, categories.name)

    let alertsCreated = 0
    for (const row of rows) {
      const budgetDec = new Decimal(row.amountKd)
      if (budgetDec.lte(0)) continue

      const alertKey = buildBudgetAlertKey(monthKey, row.categoryId)
      const compositeKey = `${row.userId}||${alertKey}`
      if (existing.has(compositeKey) || dismissed.has(compositeKey)) continue

      const spentDec = new Decimal(row.spentKd)
      const ratio = roundRatio(spentDec, budgetDec)
      if (ratio < threshold) continue

      const category = row.categoryName ?? "Uncategorized"
      const props = {
        alert_key: alertKey,
        month: monthKey,
        category,
        category_id: row.categoryId,
        budget_kd: formatKd(budgetDec),
        spent_kd: formatKd(spentDec),
        ratio,
        threshold,
      }

      await recordEvent(row.userId, BUDGET_ALERT_EVENT_NAME, props, db)

      await getQueue().add("send-budget-alert-email", {
        userId: row.userId,
        alertKey,
        category,
        monthKey,
        budgetKd: formatKd(budgetDec),
        spentKd: formatKd(spentDec),
        ratio,
        threshold,
      })

      alertsCreated++
    }

    console.log(
      `[${TASK_CHECK_BUDGET_ALERTS}] month=${monthKey} budgets_checked=${rows.length} alerts_created=${alertsCreated}`,
    )
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CHECK_BUDGET_ALERTS } })
    console.error(`[${TASK_CHECK_BUDGET_ALERTS}] Failed:`, err)
  }
  await markWorkerTaskFinished(
    TASK_CHECK_BUDGET_ALERTS,
    errorMessage ? "failure" : "success",
    errorMessage,
  )
}

export async function handleSendBudgetAlertEmail(
  job: Job,
): Promise<{ status: "sent" | "failed" | "skipped" }> {
  const data = job.data as {
    userId: number
    alertKey: string
    category: string
    monthKey: string
    budgetKd: string
    spentKd: string
    ratio: number
    threshold: number
  }
  const { userId, alertKey, category, monthKey, budgetKd, spentKd, ratio } = data

  try {
    const db = getDb()
    const [profile] = await db
      .select({
        email: users.email,
        emailNotificationsEnabled: userProfiles.emailNotificationsEnabled,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1)

    if (!profile || !profile.emailNotificationsEnabled) return { status: "skipped" }

    const ratioPct = Math.round(ratio * 100)
    const monthLabel = formatMonthLabel(monthKey)
    const subject = `Budget Alert: ${category} (${ratioPct}% used)`

    const ok = await sendTemplatedEmail(profile.email, subject, "budget_alert", {
      ratio_pct: ratioPct,
      category,
      month_label: monthLabel,
      spent_kd: spentKd,
      budget_kd: budgetKd,
    })

    if (!ok) {
      Sentry.captureException(
        new Error(`sendTemplatedEmail returned false for userId=${userId} alertKey=${alertKey}`),
        { tags: { handler: "send-budget-alert-email", userId } },
      )
    }

    return { status: ok ? "sent" : "failed" }
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: "send-budget-alert-email", userId } })
    return { status: "failed" }
  }
}
