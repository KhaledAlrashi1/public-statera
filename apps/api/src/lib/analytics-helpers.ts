// Deliberate deviations from Flask:
// - roundedKd returns a JS number (0) for zero values. Python json.dumps(0.0) → "0.0";
//   JS JSON.stringify(0) → "0". This JSON shape difference is documented here and verified
//   in Module 9. Do not "fix" — there is no Number(0.0) ≠ 0 distinction in JS.
// - currentLocalDate() and currentMonthKey() use a fixed UTC+3 offset (Kuwait, no DST)
//   instead of Flask's per-user timezone from the profile. All users fixed to Kuwait time
//   until a timezone selection UI is added.
// TODO(module-analytics-tz-per-user): switch to per-user timezone when timezone UI is added.

import Decimal from "decimal.js"
import { sql } from "drizzle-orm"
import { transactions } from "../db/schema/transactions"

const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000 // UTC+3, no DST

// Returns the current wall-clock date in Kuwait time (UTC+3).
export function currentLocalDate(): Date {
  return new Date(Date.now() + KUWAIT_OFFSET_MS)
}

// Returns the current YYYY-MM month key in Kuwait time.
export function currentMonthKey(): string {
  const d = currentLocalDate()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

// Returns inclusive calendar month bounds for a given year/month as YYYY-MM-DD strings.
export function calendarMonthBounds(year: number, month: number): { start: string; end: string } {
  const monthStr = String(month).padStart(2, "0")
  const start = `${year}-${monthStr}-01`
  // Date.UTC(year, month, 0) = day 0 of next month = last day of current month
  const lastDay = new Date(Date.UTC(year, month, 0))
  const end = lastDay.toISOString().slice(0, 10)
  return { start, end }
}

// Ordered list of YYYY-MM strings ending at endYear/endMonth, going back `months`
// calendar months (inclusive of the end month).
export function buildMonthWindow(endYear: number, endMonth: number, months: number): string[] {
  const keys: string[] = []
  const endIdx = endYear * 12 + (endMonth - 1)
  for (let i = months - 1; i >= 0; i--) {
    const idx = endIdx - i
    const y = Math.floor(idx / 12)
    const m = (idx % 12) + 1
    keys.push(`${y}-${String(m).padStart(2, "0")}`)
  }
  return keys
}

// DATE_FORMAT equivalent of Flask's month_bucket helper (PostgreSQL: to_char(date,'YYYY-MM')).
// MySQL equivalent: DATE_FORMAT(date, '%Y-%m').
export const ymExpr = sql<string>`DATE_FORMAT(${transactions.date}, '%Y-%m')`

// Returns a JS number rounded to 3 decimal places. Returns 0 for null/undefined/"".
// Python json.dumps(0.0) → "0.0"; JS JSON.stringify(0) → "0". Module 9 verifies.
export function roundedKd(raw: string | null | undefined): number {
  try {
    return Number(new Decimal(raw || "0").toDecimalPlaces(3))
  } catch {
    return 0
  }
}
