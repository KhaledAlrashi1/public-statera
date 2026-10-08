// Deliberate deviations from Flask (lib/payday.py):
// - currentPayPeriod takes a Date object (refDate) instead of datetime.date. Caller
//   constructs the Date; function uses UTC day components since payday logic is date-only
//   and Kuwait dates in DB are always YYYY-MM-DD strings.
// - incomeCategoryFilter / expenseCategoryFilter are exported as functions (not
//   module-level constants) so callers construct the SQL expression in a query-building
//   context without importing the Drizzle column objects themselves.

import { eq, sql, type SQL } from "drizzle-orm"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { userProfiles } from "../db/schema/users"
import type { getDb } from "../db/connection"
import { calendarMonthBounds, currentLocalDate, currentMonthKey, ymExpr } from "./analytics-helpers"

// Mirrors Flask's income_category_filter_expr:
//   OR(is_income IS TRUE, LOWER(COALESCE(name,'')) LIKE 'income%')
// The LIKE fallback handles legacy rows where is_income was not explicitly set.
export function incomeCategoryFilter() {
  return sql<number>`(${categories.isIncome} IS TRUE OR LOWER(COALESCE(${categories.name}, '')) LIKE 'income%')`
}

// MOB-R77 C2 — the same rule for a transactions select that does not join categories (data-export):
// EXISTS over the row's own category, so a row with no category is FALSE, as in a LEFT JOIN.
export function transactionCategoryCountsAsIncome() {
  return sql<number>`EXISTS (SELECT 1 FROM ${categories} WHERE ${categories.id} = ${transactions.categoryId} AND ${incomeCategoryFilter()})`
}

// MOB-R77 C2 — the rule column as the API emits it. MySQL returns 0/1; a driver may hand back a
// string, and Boolean("0") would read true, so read the number.
export function readIncomeFlag(value: unknown): boolean {
  return Number(value ?? 0) !== 0
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

// ── MOB-R91 C2 — payday months (rule (c), MOB-R90 B9 / MOB-R91 A2) ───────────────────────────────────────
// A payday that is null or 1 is the calendar month: every helper below returns exactly what the calendar code
// returned before (the same ymExpr object, calendarMonthBounds, currentMonthKey), so a user without a payday gets
// byte-equal answers. A payday of 2–31 cuts months on that day (fixed day, no weekend shift; a day past a short
// month's end is that month's last day) and names each month by a key that is never shown:
//   payday 2–15  → the month the period starts in;
//   payday 16–31 → the month after the one it starts in.
// So at payday 25 the period 25 Sep – 24 Oct is 2026-10, and at payday 3 the period 3 Oct – 2 Nov is 2026-10.
// Consecutive periods always get consecutive keys (no gap, no repeat), at every payday.

/** True for a payday that cuts months on its own day (2–31); null, 1 or anything else is the calendar month. */
export function paydayActive(payday: number | null | undefined): payday is number {
  return typeof payday === "number" && Number.isInteger(payday) && payday >= 2 && payday <= 31
}

function parseKey(key: string): [number, number] {
  return [parseInt(key.slice(0, 4), 10), parseInt(key.slice(5, 7), 10)]
}

function keyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

/** The inclusive [start, end] dates of the month with this key. */
export function periodBoundsForKey(payday: number | null | undefined, key: string): { start: string; end: string } {
  const [y, m] = parseKey(key)
  if (!paydayActive(payday)) return calendarMonthBounds(y, m)
  const [sy, sm] = payday <= 15 ? [y, m] : addMonths(y, m, -1)
  const [ny, nm] = addMonths(sy, sm, 1)
  const end = new Date(Date.UTC(ny, nm - 1, clampDay(payday, ny, nm)) - 86_400_000)
  return { start: toDateStr(sy, sm, clampDay(payday, sy, sm)), end: end.toISOString().slice(0, 10) }
}

/** The key of the month holding this date (YYYY-MM-DD). */
export function periodKeyForDate(payday: number | null | undefined, isoDate: string): string {
  const [y, m] = parseKey(isoDate)
  if (!paydayActive(payday)) return keyOf(y, m)
  const d = parseInt(isoDate.slice(8, 10), 10)
  const shift = (d >= clampDay(payday, y, m) ? 1 : 0) + (payday <= 15 ? -1 : 0)
  return keyOf(...addMonths(y, m, shift))
}

/** Today's month key on Kuwait's clock (RM-28). With no payday it is currentMonthKey() itself. */
export function currentPeriodKey(payday: number | null | undefined, today: Date = currentLocalDate()): string {
  if (!paydayActive(payday)) return currentMonthKey()
  return periodKeyForDate(payday, today.toISOString().slice(0, 10))
}

/**
 * The SQL that names a transaction's month: ymExpr itself with no payday, else the same DATE_FORMAT of the date
 * moved by the rule's month shift. The day and the shifts are validated integers written into the SQL (never
 * bound parameters), so the expression in SELECT and GROUP BY is the same text, as ONLY_FULL_GROUP_BY requires.
 */
export function periodKeyExpr(payday: number | null | undefined): SQL<string> {
  if (!paydayActive(payday)) return ymExpr
  const day = sql.raw(String(payday))
  const base = payday <= 15 ? -1 : 0
  const onOrAfter = sql.raw(String(base + 1))
  const before = sql.raw(String(base))
  return sql<string>`DATE_FORMAT(DATE_ADD(${transactions.date}, INTERVAL (CASE WHEN DAY(${transactions.date}) >= LEAST(${day}, DAY(LAST_DAY(${transactions.date}))) THEN ${onOrAfter} ELSE ${before} END) MONTH), '%Y-%m')`
}

/** The user's payday (1–31), or null when none is set or she has no profile row. */
export async function readPaydayDay(db: ReturnType<typeof getDb>, userId: number): Promise<number | null> {
  const [row] = await db
    .select({ paydayDay: userProfiles.paydayDay })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  return row?.paydayDay ?? null
}
