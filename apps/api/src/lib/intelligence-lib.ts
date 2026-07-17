/**
 * Intelligence/detection analytics payload builders for Module 5c.
 *
 * Deliberate deviations from Flask (routes/analytics/income.py, overview.py, shared.py):
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
 * - R13 buildSnapshotPayload: Flask's _build_snapshot_payload (overview.py) returns
 *   all KWD amount fields as floats via to_display_float/_rounded_number. Flask R4
 *   (_build_account_overview_payload, same file) returns strings via format_kd. Hono
 *   normalizes R13 to strings via formatKd — matching the project-wide KWD-as-string
 *   convention used by R3/R4/R9/R10/R11/R12. Module 9 frontend types must treat
 *   R13 money fields as string, not number.
 * - R13 generated_at: Hono uses new Date().toISOString().replace('Z', '+00:00') which
 *   preserves milliseconds (3 decimal places). Flask uses datetime.now().isoformat()
 *   which includes microseconds (6 decimal places). Deviation: ms precision only.
 *   Rationale: Node's Date does not expose sub-millisecond precision; the suffix
 *   change (+00:00) matches Flask's UTC offset shape for consumers parsing for ordering.
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

// ── Recurring patterns payload ───────────────────────────────────────────────

export type RecurringPattern = {
  name: string
  frequency: string
  avg_amount_kd: string
  last_seen: string
  confidence: string
  occurrences: number
  group: string
}

export type RecurringPatternsPayload = {
  patterns: RecurringPattern[]
}

export type BuildRecurringPatternsOpts = {
  todayDate?: string // YYYY-MM-DD; defaults to Kuwait-local today
}

export async function buildRecurringPatternsPayload(
  userId: number,
  db: Db,
  days: number,
  opts?: BuildRecurringPatternsOpts,
): Promise<RecurringPatternsPayload> {
  const todayStr = opts?.todayDate ?? currentLocalDate().toISOString().slice(0, 10)
  const cutoff = cutoffDateStr(todayStr, days)

  const rows = await db
    .select({
      txDate: transactions.date,
      displayName: sql<string>`COALESCE(NULLIF(TRIM(${transactions.name}), ''), 'Unnamed')`,
      amountKd: transactions.amountKd,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(
      eq(transactions.userId, userId),
      sql`${transactions.date} >= ${cutoff}`,
      expenseCategoryFilter(),
    ))
    .orderBy(asc(transactions.date), asc(transactions.id))

  type Entry = {
    txDate: string
    displayName: string
    amount: Decimal
    categoryName: string | null
    merchantName: string | null
  }

  const grouped = new Map<string, Entry[]>()
  for (const row of rows) {
    const amount = new Decimal(row.amountKd ?? "0")
    if (amount.lte(0)) continue
    const normalized =
      (row.displayName ?? "").split(/\s+/).filter(Boolean).join(" ") || "Unnamed"
    const key = normalized.toLowerCase()
    const entry: Entry = {
      txDate: normDateStr(row.txDate),
      displayName: normalized,
      amount,
      categoryName: row.categoryName ?? null,
      merchantName: row.merchantName ?? null,
    }
    const group = grouped.get(key) ?? []
    group.push(entry)
    grouped.set(key, group)
  }

  type PatternWithSort = RecurringPattern & { _sortAvgAmount: Decimal }
  const patterns: PatternWithSort[] = []

  for (const entries of grouped.values()) {
    if (entries.length < 2) continue

    const sortedDates = entries.map((e) => e.txDate).sort()
    const intervals: number[] = []
    for (let i = 1; i < sortedDates.length; i++) {
      const gap = daysBetween(sortedDates[i - 1], sortedDates[i])
      if (gap > 0) intervals.push(gap)
    }
    if (intervals.length === 0) continue

    const sortedIntervals = [...intervals].sort((a, b) => a - b)
    // Flask: ordered[len(ordered) // 2] — floor-division upper-median (income.py:215).
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    const frequency = classifyRecurringFrequency(medianInterval)
    const variance = intervalVarianceRatio(intervals)
    let confidence = confidenceFromIntervalVariance(variance)
    // Flask: if frequency == "irregular" and confidence == "high": confidence = "medium" (income.py:219-220).
    if (frequency === "irregular" && confidence === "high") confidence = "medium"

    const amounts = entries.map((e) => e.amount)
    const total = amounts.reduce((a, b) => a.plus(b), new Decimal(0))
    const avgAmount = total.div(amounts.length)

    // Canonical name: most frequent display_name; alphabetical tiebreaker (income.py:236).
    const nameCounts = new Map<string, number>()
    for (const e of entries) {
      nameCounts.set(e.displayName, (nameCounts.get(e.displayName) ?? 0) + 1)
    }
    const canonicalName = [...nameCounts.entries()].sort((a, b) =>
      b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    )[0][0]

    // Dominant category: most frequent; alphabetical tiebreaker (income.py:237-240).
    const catCounts = new Map<string, number>()
    for (const e of entries) {
      if (e.categoryName) catCounts.set(e.categoryName, (catCounts.get(e.categoryName) ?? 0) + 1)
    }
    const dominantCategory =
      catCounts.size > 0
        ? [...catCounts.entries()].sort((a, b) =>
            b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
          )[0][0]
        : null

    // Dominant merchant: most frequent; alphabetical tiebreaker (income.py:241-245).
    const merchantCounts = new Map<string, number>()
    for (const e of entries) {
      if (e.merchantName)
        merchantCounts.set(e.merchantName, (merchantCounts.get(e.merchantName) ?? 0) + 1)
    }
    const dominantMerchant =
      merchantCounts.size > 0
        ? [...merchantCounts.entries()].sort((a, b) =>
            b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
          )[0][0]
        : null

    const lastSeen = sortedDates[sortedDates.length - 1]

    patterns.push({
      name: canonicalName,
      frequency,
      avg_amount_kd: formatKd(avgAmount),
      last_seen: lastSeen,
      confidence,
      occurrences: entries.length,
      group: classifyRecurringGroup(dominantCategory, dominantMerchant, canonicalName),
      _sortAvgAmount: avgAmount,
    })
  }

  // Flask: sort by (-avg_amount, -occurrences, name) — income.py:266-272.
  // Sort uses raw Decimal (_sortAvgAmount), not the formatted string.
  patterns.sort((a, b) => {
    const cmpAmount = b._sortAvgAmount.comparedTo(a._sortAvgAmount)
    if (cmpAmount !== 0) return cmpAmount
    if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  const result: RecurringPattern[] = patterns.map(({ _sortAvgAmount: _sa, ...rest }) => rest)
  return { patterns: result }
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

// ── Snapshot payload (R13) ────────────────────────────────────────────────────

export type WindowResult = {
  income_kd: string
  expense_kd: string
  net_kd: string
}

export type SnapshotPayload = {
  net_position: {
    income_total_kd: string
    expense_total_kd: string
    net_kd: string
  }
  cash_flow: {
    "30d": WindowResult
    "60d": WindowResult
    "90d": WindowResult
  }
  accounts: never[]
  generated_at: string
}

export type BuildSnapshotOpts = {
  todayDate?: string // YYYY-MM-DD; defaults to Kuwait-local today
}

export async function buildSnapshotPayload(
  userId: number,
  db: Db,
  opts?: BuildSnapshotOpts,
): Promise<SnapshotPayload> {
  const todayStr = opts?.todayDate ?? currentLocalDate().toISOString().slice(0, 10)

  // D11: generated_at captured at call time.
  // Per-field deviation: uses .replace('Z', '+00:00') to preserve milliseconds.
  // See deviation block at file head for rationale.
  const generatedAt = new Date().toISOString().replace("Z", "+00:00")

  // D2/D3: All-time income and expense totals — CASE expressions, no COALESCE.
  // SUM over zero rows returns null (SQL standard); D4 fallback handles it below.
  const [totalsRow] = await db
    .select({
      income: sql<string | null>`SUM(CASE WHEN ${incomeCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END)`,
      expense: sql<string | null>`SUM(CASE WHEN ${expenseCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, userId))

  // D4: null fallback — SUM returns null when no rows match.
  const incomeTotal = new Decimal(totalsRow?.income ?? "0")
  const expenseTotal = new Decimal(totalsRow?.expense ?? "0")

  // D5/D6 removed (phase4 SC-1/2): total_debt_kd / total_savings_kd fields dropped from the
  // snapshot payload along with the debt-accounts / savings-goals features.

  // D7/D8: Three window queries matching Flask's _window() structure.
  // Sequential (not Promise.all) to keep mock ordering deterministic.
  async function window(days: number): Promise<WindowResult> {
    const cutoff = cutoffDateStr(todayStr, days)
    const [row] = await db
      .select({
        income: sql<string | null>`SUM(CASE WHEN ${incomeCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END)`,
        expense: sql<string | null>`SUM(CASE WHEN ${expenseCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(eq(transactions.userId, userId), sql`${transactions.date} >= ${cutoff}`))
    const inc = new Decimal(row?.income ?? "0")
    const exp = new Decimal(row?.expense ?? "0")
    return {
      income_kd: formatKd(inc),
      expense_kd: formatKd(exp),
      net_kd: formatKd(inc.minus(exp)),
    }
  }

  const w30 = await window(30)
  const w60 = await window(60)
  const w90 = await window(90)

  return {
    net_position: {
      income_total_kd: formatKd(incomeTotal),
      expense_total_kd: formatKd(expenseTotal),
      net_kd: formatKd(incomeTotal.minus(expenseTotal)),
    },
    cash_flow: {
      "30d": w30,
      "60d": w60,
      "90d": w90,
    },
    accounts: [],
    generated_at: generatedAt,
  }
}
