// Deliberate deviations from Flask (lib/payday.py):
// - currentPayPeriod takes a Date object (refDate) instead of datetime.date. Caller
//   constructs the Date; function uses UTC day components since payday logic is date-only
//   and Kuwait dates in DB are always YYYY-MM-DD strings.
// - incomeCategoryFilter / expenseCategoryFilter are exported as functions (not
//   module-level constants) so callers construct the SQL expression in a query-building
//   context without importing the Drizzle column objects themselves.

import { sql } from "drizzle-orm"
import { categories } from "../db/schema/categories"
import { calendarMonthBounds } from "./analytics-helpers"

// Mirrors Flask's income_category_filter_expr:
//   OR(is_income IS TRUE, LOWER(COALESCE(name,'')) LIKE 'income%')
// The LIKE fallback handles legacy rows where is_income was not explicitly set.
export function incomeCategoryFilter() {
  return sql<number>`(${categories.isIncome} IS TRUE OR LOWER(COALESCE(${categories.name}, '')) LIKE 'income%')`
}

// NOT of incomeCategoryFilter — identifies expense-category transactions.
export function expenseCategoryFilter() {
  return sql<number>`NOT (${categories.isIncome} IS TRUE OR LOWER(COALESCE(${categories.name}, '')) LIKE 'income%')`
}

// ── currentPayPeriod ──────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) = day 0 of the following month = last day of (year, month).
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function clampDay(day: number, year: number, month: number): number {
  return Math.min(day, daysInMonth(year, month))
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + (month - 1) + delta
  return [Math.floor(total / 12), (total % 12) + 1]
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// Ports Flask's payday.current_pay_period (payday.py:42–87).
// Returns the inclusive [start, end] date range of the current pay period.
// If paydayDay is null, falls back to calendar month bounds for refDate's month.
// Otherwise, clamps paydayDay to the last valid day of each relevant month, then
// determines whether refDate falls before or on/after this month's clamped payday.
export function currentPayPeriod(
  paydayDay: number | null,
  refDate: Date,
): { start: string; end: string } {
  const refYear = refDate.getUTCFullYear()
  const refMonth = refDate.getUTCMonth() + 1
  const refDay = refDate.getUTCDate()

  if (paydayDay == null) {
    return calendarMonthBounds(refYear, refMonth)
  }

  const thisPayday = clampDay(paydayDay, refYear, refMonth)

  if (refDay >= thisPayday) {
    // ref is on or after this month's payday: period runs to the day before next payday
    const [nextYear, nextMonth] = addMonths(refYear, refMonth, 1)
    const nextPayday = clampDay(paydayDay, nextYear, nextMonth)
    const endDate = new Date(Date.UTC(nextYear, nextMonth - 1, nextPayday) - 86_400_000)
    return {
      start: toDateStr(refYear, refMonth, thisPayday),
      end: endDate.toISOString().slice(0, 10),
    }
  } else {
    // ref is before this month's payday: period started at previous month's payday
    const [prevYear, prevMonth] = addMonths(refYear, refMonth, -1)
    const prevPayday = clampDay(paydayDay, prevYear, prevMonth)
    const endDate = new Date(Date.UTC(refYear, refMonth - 1, thisPayday) - 86_400_000)
    return {
      start: toDateStr(prevYear, prevMonth, prevPayday),
      end: endDate.toISOString().slice(0, 10),
    }
  }
}
