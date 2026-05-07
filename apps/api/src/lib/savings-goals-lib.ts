/**
 * Savings-goal projection helpers — port of backend/lib/savings_goals.py.
 *
 * goalProjection() and monthlyPaceFromDeposits() accept an injected db so they
 * are testable in isolation without a live connection.
 */

import Decimal from "decimal.js"
import { and, eq, gte } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { productEvents } from "../db/schema/product-events"
import { Sentry } from "./sentry"
import { addMonths } from "./debt-calculator"
import { formatKd } from "./transaction-lib"

// ── Types ─────────────────────────────────────────────────────────────────────

export type GoalRow = {
  id: number
  userId: number
  targetKd: string
  currentKd: string
  targetDate: string | null // YYYY-MM-DD or null
}

export type GoalProjection = {
  projected_date: string | null
  months_remaining: number | null
  required_monthly: string | null
  current_pace_monthly: string
  on_track: boolean
  shortfall_per_month: string | null
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function q3(d: Decimal): Decimal {
  return d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

function toD(v: string | null | undefined): Decimal {
  try {
    return new Decimal(String(v ?? "0"))
  } catch {
    return new Decimal(0)
  }
}

function monthStart(yyyyMmDd: string): string {
  return yyyyMmDd.slice(0, 7) + "-01"
}

// Handles positive and negative month offsets. The addMonths() from debt-calculator
// only handles positive offsets; this version is used internally for the lookback window.
function shiftMonths(yyyyMmDd: string, months: number): string {
  const year = parseInt(yyyyMmDd.slice(0, 4), 10)
  const mon = parseInt(yyyyMmDd.slice(5, 7), 10)
  const total = year * 12 + (mon - 1) + months
  const newYear = Math.floor(total / 12)
  const newMon = (((total % 12) + 12) % 12) + 1 // handle JS negative modulo
  return `${newYear}-${String(newMon).padStart(2, "0")}-01`
}

// Python: max(1, (days + 29) // 30) where days = (target_date - today).days
function monthsToTargetDate(today: string, targetDate: string | null): number | null {
  if (!targetDate) return null
  if (targetDate <= today) return 0
  const [ty, tm, td] = today.split("-").map(Number)
  const [dy, dm, dd] = targetDate.split("-").map(Number)
  const daysDiff = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000,
  )
  return Math.max(1, Math.floor((daysDiff + 29) / 30))
}

// ── Deposit pace query ────────────────────────────────────────────────────────

export async function monthlyPaceFromDeposits(
  goalId: number,
  userId: number,
  db: ReturnType<typeof getDb>,
  today: string, // YYYY-MM-DD
  lookbackMonths = 3,
): Promise<Decimal> {
  const months = Math.max(1, Math.floor(lookbackMonths))
  const thisMonth = monthStart(today)
  const windowStart = shiftMonths(thisMonth, -(months - 1))
  const windowStartDate = new Date(windowStart + "T00:00:00Z")

  const rows = await db
    .select({ eventTs: productEvents.eventTs, propertiesJson: productEvents.propertiesJson })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.userId, userId),
        eq(productEvents.eventName, "savings_goal.deposit"),
        gte(productEvents.eventTs, windowStartDate),
      ),
    )

  const totalsByMonth: Record<string, Decimal> = {}
  for (const row of rows) {
    if (!row.eventTs) continue
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(row.propertiesJson ?? "{}") as Record<string, unknown>
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "monthlyPaceFromDeposits", userId } })
      continue
    }
    if (!payload || typeof payload !== "object") continue
    const rawGoalId = Number(payload["goal_id"])
    if (!Number.isFinite(rawGoalId) || rawGoalId !== goalId) continue
    let amount: Decimal
    try {
      amount = new Decimal(String(payload["amount_kd"] ?? "0"))
    } catch {
      amount = new Decimal(0)
    }
    if (amount.lte(0)) continue
    const ts = row.eventTs instanceof Date ? row.eventTs : new Date(row.eventTs as string)
    const monthKey = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}`
    totalsByMonth[monthKey] = (totalsByMonth[monthKey] ?? new Decimal(0)).plus(amount)
  }

  let monthTotal = new Decimal(0)
  for (let offset = 0; offset < months; offset++) {
    const cursor = shiftMonths(thisMonth, -offset)
    const key = cursor.slice(0, 7)
    monthTotal = monthTotal.plus(totalsByMonth[key] ?? new Decimal(0))
  }

  const avg = q3(monthTotal.div(new Decimal(months)))
  return Decimal.max(avg, new Decimal(0))
}

// ── Projection ────────────────────────────────────────────────────────────────

export async function goalProjection(
  goal: GoalRow,
  db: ReturnType<typeof getDb>,
  today?: string,
): Promise<GoalProjection> {
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const target = Decimal.max(toD(goal.targetKd), new Decimal(0))
  const current = Decimal.max(toD(goal.currentKd), new Decimal(0))
  const remaining = Decimal.max(target.minus(current), new Decimal(0))
  const currentPace = await monthlyPaceFromDeposits(goal.id, goal.userId, db, todayStr)
  const monthsToTarget = monthsToTargetDate(todayStr, goal.targetDate)

  let projectedDate: string | null
  let monthsRemaining: number | null
  if (remaining.lte(0)) {
    projectedDate = todayStr
    monthsRemaining = 0
  } else if (currentPace.gt(0)) {
    // Python: ROUND_CEILING via to_integral_value — JS Math.ceil() is equivalent for positive values.
    monthsRemaining = Math.max(1, Math.ceil(remaining.div(currentPace).toNumber()))
    projectedDate = addMonths(monthStart(todayStr), monthsRemaining)
  } else {
    projectedDate = null
    monthsRemaining = null
  }

  let requiredMonthly: Decimal | null = null
  if (remaining.lte(0)) {
    requiredMonthly = new Decimal(0)
  } else if (monthsToTarget !== null && monthsToTarget > 0) {
    requiredMonthly = q3(remaining.div(new Decimal(monthsToTarget)))
  } else if (monthsToTarget === 0) {
    requiredMonthly = q3(remaining)
  }

  let onTrack: boolean
  let shortfall: Decimal | null
  if (requiredMonthly === null) {
    onTrack = currentPace.gt(0) || remaining.lte(0)
    shortfall = null
  } else {
    onTrack = currentPace.gte(requiredMonthly)
    shortfall = onTrack ? new Decimal(0) : q3(requiredMonthly.minus(currentPace))
  }

  return {
    projected_date: projectedDate,
    months_remaining: monthsRemaining,
    required_monthly: requiredMonthly !== null ? formatKd(requiredMonthly) : null,
    current_pace_monthly: formatKd(currentPace),
    on_track: onTrack,
    shortfall_per_month: shortfall !== null ? formatKd(shortfall) : null,
  }
}
