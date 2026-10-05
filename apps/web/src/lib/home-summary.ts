// MOB-R68 D1-D3 — Home's eyebrow, heading, sub line and KPI footers, as pure functions.
//
// Strings are CHANNEL-DRAFTED and provisional (MOB-R68 D2). Money is exact: percentages come from
// integer fils (lib/log-amount toFils) and round half up; no float touches a ledger figure.
// Remaining is K1's figure (income - expenses - savings, clamped at 0); nothing new is computed.
import { formatKD } from "./utils"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

function parseMonthKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { year: Number(match[1]), month }
}

/** "2026-10" -> "October". */
export function monthName(key: string): string {
  const parsed = parseMonthKey(key)
  return parsed ? MONTH_NAMES[parsed.month - 1] : key
}

/** "2026-10" -> "October 2026" (D6, the month control). */
export function formatMonthYear(key: string): string {
  const parsed = parseMonthKey(key)
  return parsed ? `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}` : key
}

/** D1 — "October 2026 · day 5 of 31"; a past month: "September 2026 · closed". */
export function homeEyebrow(monthKey: string, currentMonthKey: string, today: Date): string {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return monthKey
  if (monthKey < currentMonthKey) return `${formatMonthYear(monthKey)} · closed`
  if (monthKey > currentMonthKey) return formatMonthYear(monthKey)
  const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate()
  return `${formatMonthYear(monthKey)} · day ${today.getDate()} of ${daysInMonth}`
}

/** D2 — the two-line heading, or null when income is not set (the income prompt stays). */
export function homeHeading(
  monthKey: string,
  currentMonthKey: string,
  incomeSet: boolean,
  remainingFils: bigint,
): { line1: string; line2: string } | null {
  if (!incomeSet) return null
  const ahead = remainingFils > 0n
  if (monthKey < currentMonthKey) {
    return { line1: monthName(monthKey), line2: ahead ? "ended ahead" : "ended over" }
  }
  return { line1: `${monthName(monthKey)} is`, line2: ahead ? "on track" : "over income" }
}

/** D2 — the sub line under the heading; null when income is not set. */
export function homeSubLine(incomeSet: boolean, remainingFils: bigint, remainingKd: string): string | null {
  if (!incomeSet) return null
  if (remainingFils > 0n) return `${formatKD(remainingKd)} left after spending and saving.`
  return "Spending and saving have reached your income."
}

/** Whole percent of income, from integer fils, rounded half up. Income must be > 0. */
export function percentOfIncome(partFils: bigint, incomeFils: bigint): number {
  if (incomeFils <= 0n) throw new Error("percentOfIncome: income must be greater than 0")
  return Number((partFils * 200n + incomeFils) / (incomeFils * 2n))
}

/**
 * D3 — the Remaining tile's segmented bar (expenses, savings, then track) and its "% left" label.
 * Segment edges are cumulative percents of income, so the three widths always sum to 100; the
 * total is capped at 100. `leftPct` is Remaining's own percent of income.
 */
export function remainingBar(
  expensesFils: bigint,
  savingsFils: bigint,
  remainingFils: bigint,
  incomeFils: bigint,
): { expensesPct: number; savingsPct: number; trackPct: number; leftPct: number } {
  const edge1 = Math.min(100, percentOfIncome(expensesFils, incomeFils))
  const edge2 = Math.min(100, percentOfIncome(expensesFils + savingsFils, incomeFils))
  return {
    expensesPct: edge1,
    savingsPct: Math.max(0, edge2 - edge1),
    trackPct: 100 - edge2,
    leftPct: percentOfIncome(remainingFils, incomeFils),
  }
}
