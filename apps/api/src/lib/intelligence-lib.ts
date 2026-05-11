/**
 * Intelligence/detection analytics payload builders for Module 5c.
 *
 * Deliberate deviations from Flask (routes/analytics/income.py, shared.py):
 * - currentLocalDate() uses fixed UTC+3 (Kuwait, no DST) instead of Flask's
 *   per-user IANA timezone from profile. All users fixed to Kuwait time.
 *   TODO(module-analytics-tz-per-user): switch when timezone UI is added.
 * - income_source: Flask returns null (JSON null) when income is not set;
 *   Hono maps to "not_set" via resolveIncomeForPeriod in income-lib.ts.
 *   Module 9 verifies frontend compatibility (apps/web/src/types/api.ts
 *   currently types this as `| null`; must be updated to `| "not_set"`).
 * - confidenceFromVariance: boundaries are <= 0.02 / <= 0.05 (inclusive),
 *   matching Flask's _confidence_from_variance (shared.py:199,201).
 * - confidenceFromIntervalVariance: boundaries are <= 0.10 / <= 0.20
 *   (inclusive), matching Flask's _confidence_from_interval_variance
 *   (shared.py:257,259).
 * - suggestedPaydayDay tiebreaker: sorted by (-count, day_number) ascending —
 *   lowest day number wins on equal count (income.py:108, explicit sort).
 * - Hint lists ported verbatim from Flask (shared.py:25–68); no Shahid/Anghami
 *   added — they are absent from Flask. Kuwaiti operators covered by the
 *   ooredoo/stc/viva/zain entries in UTILITY_HINTS.
 */

import Decimal from "decimal.js"
import { and, asc, eq, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { formatKd } from "./transaction-lib"
import { currentLocalDate } from "./analytics-helpers"
import { incomeCategoryFilter, expenseCategoryFilter } from "./payday-lib"
import { resolveIncomeForPeriod, type IncomeSource } from "./income-lib"

type Db = ReturnType<typeof getDb>

// ── Hint lists (verbatim from Flask shared.py:25–68) ─────────────────────────

const SUBSCRIPTION_HINTS = [
  "subscription", "subscriptions", "netflix", "spotify", "apple", "prime",
  "youtube", "adobe", "membership", "streaming", "software", "icloud",
]
const UTILITY_HINTS = [
  "utility", "utilities", "water", "electric", "electricity", "internet",
  "wifi", "phone", "mobile", "telecom", "broadband", "mew", "ooredoo",
  "stc", "viva", "zain", "kptc", "knpc",
]
const LOAN_HINTS = [
  "loan", "loans", "installment", "installments", "mortgage", "finance",
  "credit card", "minimum payment", "debt",
]

// ── Internal date helpers ─────────────────────────────────────────────────────

function normDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d ?? "").slice(0, 10)
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function dateDayNum(dateStr: string): number {
  return parseInt(dateStr.slice(8, 10), 10)
}

function dateToUtcMs(dateStr: string): number {
  return Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
  )
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((dateToUtcMs(later) - dateToUtcMs(earlier)) / 86_400_000)
}

function cutoffDateStr(todayStr: string, days: number): string {
  return new Date(dateToUtcMs(todayStr) - days * 86_400_000).toISOString().slice(0, 10)
}

// ── Exported helper functions ─────────────────────────────────────────────────

function hintMatch(haystacks: string[], hints: string[]): boolean {
  for (const text of haystacks) {
    if (!text) continue
    if (hints.some((h) => text.includes(h))) return true
  }
  return false
}

// Boundaries are inclusive (<=) — see shared.py:199,201.
export function confidenceFromVariance(maxDeviation: Decimal, evidenceMonths: number): string {
  if (maxDeviation.lte("0.02") && evidenceMonths >= 3) return "high"
  if (maxDeviation.lte("0.05")) return "medium"
  return "low"
}

// Boundaries are inclusive (<=) — see shared.py:257,259.
export function confidenceFromIntervalVariance(maxDeviation: Decimal): string {
  if (maxDeviation.lte("0.10")) return "high"
  if (maxDeviation.lte("0.20")) return "medium"
  return "low"
}

export function classifyRecurringFrequency(medianIntervalDays: number): string {
  if (medianIntervalDays >= 28 && medianIntervalDays <= 32) return "monthly"
  if (medianIntervalDays >= 13 && medianIntervalDays <= 15) return "bi-weekly"
  if (medianIntervalDays >= 6 && medianIntervalDays <= 8) return "weekly"
  return "irregular"
}

// Flask: returns Decimal("1") for empty, Decimal("0") for single-element list.
export function intervalVarianceRatio(intervals: number[]): Decimal {
  if (intervals.length === 0) return new Decimal("1")
  if (intervals.length === 1) return new Decimal("0")
  const avg = new Decimal(intervals.reduce((a, b) => a + b, 0)).div(intervals.length)
  if (avg.lte(0)) return new Decimal("1")
  let maxDev = new Decimal(0)
  for (const d of intervals) {
    const dev = new Decimal(d).minus(avg).abs().div(avg)
    if (dev.gt(maxDev)) maxDev = dev
  }
  return maxDev
}

// display_name is always a non-null string at call site (canonical_name from Counter).
// Loan checked first (highest priority), then Utility, then Subscription.
export function classifyRecurringGroup(
  categoryName: string | null,
  merchantName: string | null,
  displayName: string,
): string {
  const haystacks = [
    (categoryName ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" "),
    (merchantName ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" "),
    displayName.toLowerCase().split(/\s+/).filter(Boolean).join(" "),
  ]
  if (hintMatch(haystacks, LOAN_HINTS)) return "Loan Payments"
  if (hintMatch(haystacks, UTILITY_HINTS)) return "Utilities"
  if (hintMatch(haystacks, SUBSCRIPTION_HINTS)) return "Subscriptions"
  return "Other"
}

// ── Income pattern payload ────────────────────────────────────────────────────

export type IncomePatternPayload = {
  detected: boolean
  monthly_income_kd: string | null
  income_source: IncomeSource
  income_auto_detected: boolean
  suggested_monthly_income_kd: string | null
  suggested_payday_day: number | null
  confidence: string
  evidence_months: number
  largest_income_name: string | null
}

export type BuildIncomePatternOpts = {
  currentMonth?: string // YYYY-MM; defaults to todayDate's month
  todayDate?: string   // YYYY-MM-DD; defaults to Kuwait-local today
}

export async function buildIncomePatternPayload(
  userId: number,
  db: Db,
  opts?: BuildIncomePatternOpts,
): Promise<IncomePatternPayload> {
  const todayStr = opts?.todayDate ?? currentLocalDate().toISOString().slice(0, 10)
  const currentMonth = opts?.currentMonth ?? todayStr.slice(0, 7)

  const incomeResolution = await resolveIncomeForPeriod(userId, currentMonth, db)
  const monthlyIncomeKd =
    incomeResolution.amountKd !== null ? formatKd(incomeResolution.amountKd) : null
  const incomeSource = incomeResolution.source
  const incomeAutoDetected = incomeSource === "detected_from_transactions"

  const cutoff = cutoffDateStr(todayStr, 90)

  const rows = await db
    .select({
      txDate: transactions.date,
      incomeName: sql<string>`COALESCE(NULLIF(TRIM(${transactions.name}), ''), 'Income')`,
      amountKd: transactions.amountKd,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), sql`${transactions.date} >= ${cutoff}`, incomeCategoryFilter()))
    .orderBy(asc(transactions.date), asc(transactions.id))

  type Row = { txDate: string; displayName: string; nameKey: string; amount: Decimal }
  const parsedRows: Row[] = []
  for (const row of rows) {
    const amount = new Decimal(row.amountKd ?? "0")
    if (amount.lte(0)) continue
    const normalized =
      (row.incomeName ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .join(" ") || "Income"
    parsedRows.push({
      txDate: normDateStr(row.txDate),
      displayName: normalized,
      nameKey: normalized.toLowerCase(),
      amount,
    })
  }

  const overallMonths = new Set(parsedRows.map((r) => monthKey(r.txDate))).size
  if (overallMonths < 2) {
    return {
      detected: false,
      monthly_income_kd: monthlyIncomeKd,
      income_source: incomeSource,
      income_auto_detected: incomeAutoDetected,
      suggested_monthly_income_kd: null,
      suggested_payday_day: null,
      confidence: "low",
      evidence_months: overallMonths,
      largest_income_name: null,
    }
  }

  const grouped = new Map<string, Row[]>()
  for (const row of parsedRows) {
    const group = grouped.get(row.nameKey) ?? []
    group.push(row)
    grouped.set(row.nameKey, group)
  }

  type Candidate = {
    largestIncomeName: string
    suggestedMonthlyIncome: Decimal
    suggestedPaydayDay: number
    confidence: string
    evidenceMonths: number
    // Score components for lexicographic max (matching Python tuple comparison).
    scoreEvidenceMonths: number
    scoreEntryCount: number
    scoreTotal: Decimal
    scoreNegMaxDeviation: Decimal
  }

  const candidates: Candidate[] = []

  for (const entries of grouped.values()) {
    if (entries.length < 2) continue

    const sortedDates = entries.map((e) => e.txDate).sort()
    const entryMonths = new Set(sortedDates.map(monthKey)).size
    if (entryMonths < 2) continue

    const amounts = entries.map((e) => e.amount)
    const total = amounts.reduce((a, b) => a.plus(b), new Decimal(0))
    const avg = total.div(amounts.length)
    if (avg.lte(0)) continue

    const maxDev = amounts.reduce((m, a) => {
      const d = a.minus(avg).abs().div(avg)
      return d.gt(m) ? d : m
    }, new Decimal(0))

    // Day tiebreaker: sorted by (-count, day_number) — lowest day wins (income.py:108).
    const dayCounts = new Map<number, number>()
    for (const d of sortedDates) {
      const day = dateDayNum(d)
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    }
    const bestDay = [...dayCounts.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] - b[0],
    )[0][0]

    // Name tiebreaker: same pattern — lowest (alphabetical) name wins on equal count.
    const nameCounts = new Map<string, number>()
    for (const e of entries) {
      nameCounts.set(e.displayName, (nameCounts.get(e.displayName) ?? 0) + 1)
    }
    const bestName = [...nameCounts.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    )[0][0]

    // Gaps: sorted ascending; median at floor(len/2) (Python floor-division index).
    const gaps = sortedDates
      .slice(1)
      .map((d, i) => daysBetween(sortedDates[i], d))
      .sort((a, b) => a - b)
    const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : null
    const multiplier = medianGap !== null && medianGap <= 18 ? new Decimal(2) : new Decimal(1)

    candidates.push({
      largestIncomeName: bestName,
      suggestedMonthlyIncome: avg.mul(multiplier),
      suggestedPaydayDay: bestDay,
      confidence: confidenceFromVariance(maxDev, entryMonths),
      evidenceMonths: entryMonths,
      scoreEvidenceMonths: entryMonths,
      scoreEntryCount: entries.length,
      scoreTotal: total,
      scoreNegMaxDeviation: maxDev.neg(),
    })
  }

  if (candidates.length === 0) {
    return {
      detected: false,
      monthly_income_kd: monthlyIncomeKd,
      income_source: incomeSource,
      income_auto_detected: incomeAutoDetected,
      suggested_monthly_income_kd: null,
      suggested_payday_day: null,
      confidence: "low",
      evidence_months: overallMonths,
      largest_income_name: null,
    }
  }

  // Lexicographic max across (evidenceMonths, entryCount, total, negMaxDeviation).
  const best = candidates.reduce((b, c) => {
    if (c.scoreEvidenceMonths !== b.scoreEvidenceMonths)
      return c.scoreEvidenceMonths > b.scoreEvidenceMonths ? c : b
    if (c.scoreEntryCount !== b.scoreEntryCount)
      return c.scoreEntryCount > b.scoreEntryCount ? c : b
    if (!c.scoreTotal.eq(b.scoreTotal)) return c.scoreTotal.gt(b.scoreTotal) ? c : b
    if (!c.scoreNegMaxDeviation.eq(b.scoreNegMaxDeviation))
      return c.scoreNegMaxDeviation.gt(b.scoreNegMaxDeviation) ? c : b
    return b
  })

  return {
    detected: true,
    monthly_income_kd: monthlyIncomeKd,
    income_source: incomeSource,
    income_auto_detected: incomeAutoDetected,
    suggested_monthly_income_kd: formatKd(best.suggestedMonthlyIncome),
    suggested_payday_day: best.suggestedPaydayDay,
    confidence: best.confidence,
    evidence_months: best.evidenceMonths,
    largest_income_name: best.largestIncomeName,
  }
}
