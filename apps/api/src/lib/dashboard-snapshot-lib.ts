/**
 * Dashboard snapshot computation, persistence, and retrieval helpers.
 *
 * Pure DB layer — no Redis. Injectable `db` parameter makes every function
 * testable in isolation without a live connection (same pattern as
 * savings-goals-lib.ts and debt-calculator.ts).
 *
 * All monetary values are accumulated via Decimal.js and returned as
 * 3-decimal-place strings ("1234.567"), not floats. Flask's equivalent
 * (_rounded_number) returned floats; this is an intentional API departure
 * that aligns with every other KD field in the TS codebase.
 *
 * Deliberate deviations from Flask:
 * - persistDashboardSnapshot uses onDuplicateKeyUpdate (atomic upsert) instead
 *   of Flask's SELECT-then-INSERT, eliminating the race window between the two.
 * - computeDashboardMetricsPayload filters by date range (>= start AND < end)
 *   instead of WHERE DATE_FORMAT(date,'%Y-%m') IN (...) — the range form is
 *   sargable and hits the (user_id, date, id) index; the computed-expression
 *   form requires a full user scan.
 * - DATE_FORMAT(date,'%Y-%m') replaces Flask's to_char(date,'YYYY-MM') —
 *   to_char is PostgreSQL-only; DATE_FORMAT is the MySQL equivalent.
 */

import Decimal from "decimal.js"
import { and, desc, eq, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { categories } from "../db/schema/categories"
import { dashboardSnapshots } from "../db/schema/dashboard-snapshots"
import { transactions } from "../db/schema/transactions"
import { formatKd } from "./transaction-lib"
import { ymExpr, buildMonthWindow } from "./analytics-helpers"
import { incomeCategoryFilter } from "./payday-lib"

// Re-export buildMonthWindow for existing callers (including tests importing from this file).
export { buildMonthWindow }

// ── Types ─────────────────────────────────────────────────────────────────────

export type DashboardMonthlyEntry = {
  month: string
  income_kd: string
  expense_kd: string
}

export type DashboardMetricsPayload = {
  months: string[]
  monthly: DashboardMonthlyEntry[]
  expense_by_category: Record<string, Record<string, string>>
  cycle_enabled: boolean
  cycle_start: string | null
  cycle_end: string | null
  updated_at?: string
}

export type ComputeOpts = {
  months: number
  endYear: number
  endMonth: number
  cycleEnabled: boolean
  cycleStart?: string | null // YYYY-MM-DD
  cycleEnd?: string | null // YYYY-MM-DD
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toD(v: string | null | undefined): Decimal {
  try {
    return new Decimal(String(v ?? "0"))
  } catch {
    return new Decimal(0)
  }
}

// Produces YYYY-MM keys for every calendar month from startDate to endDate inclusive.
// Used only for cycle-enabled payloads where the date range spans partial months.
function buildMonthsFromRange(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.split("-").map(Number)
  const [ey, em] = endDate.split("-").map(Number)
  const keys: string[] = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
    if (keys.length > 120) break // safety guard against pathological inputs
  }
  return keys
}

// ── Snapshot eligibility ──────────────────────────────────────────────────────

// Snapshot tier is only used for standard (non-cycle) requests that match the
// configured window size AND the current calendar month. Cycle-enabled payloads
// are never snapshotted because they are user-specific and change daily.
export function isSnapshotEligible(
  months: number,
  endYear: number,
  endMonth: number,
  cycleEnabled: boolean,
  currentMonthKey: string,
  snapshotMonthsCount: number,
): boolean {
  if (cycleEnabled) return false
  if (months !== snapshotMonthsCount) return false
  return `${endYear}-${String(endMonth).padStart(2, "0")}` === currentMonthKey
}

// ── Shape validation ──────────────────────────────────────────────────────────

// Validates structure and monetary field types. Returns null for any row that
// fails — including rows with float income_kd/expense_kd values. Float monetary
// fields indicate a legacy snapshot or manual DB edit; rejecting them forces
// recomputation so the response always has string-typed KD values.
function validateSnapshotPayload(raw: unknown): DashboardMetricsPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const p = raw as Record<string, unknown>

  if (!Array.isArray(p.months)) return null
  if (!Array.isArray(p.monthly)) return null
  if (
    !p.expense_by_category ||
    typeof p.expense_by_category !== "object" ||
    Array.isArray(p.expense_by_category)
  )
    return null

  for (const entry of p.monthly as unknown[]) {
    if (!entry || typeof entry !== "object") return null
    const e = entry as Record<string, unknown>
    // Reject float monetary values — any non-string type is treated as invalid.
    if (typeof e.income_kd !== "string") return null
    if (typeof e.expense_kd !== "string") return null
  }

  return p as unknown as DashboardMetricsPayload
}

// ── Computation ───────────────────────────────────────────────────────────────

export async function computeDashboardMetricsPayload(
  userId: number,
  db: ReturnType<typeof getDb>,
  opts: ComputeOpts,
): Promise<DashboardMetricsPayload> {
  const { months, endYear, endMonth, cycleEnabled, cycleStart, cycleEnd } = opts

  const monthKeys =
    cycleEnabled && cycleStart && cycleEnd
      ? buildMonthsFromRange(cycleStart, cycleEnd)
      : buildMonthWindow(endYear, endMonth, months)

  // ymExpr and isIncomeExpr are imported from analytics-helpers and payday-lib.
  // Capture incomeCategoryFilter() once so the same object is used in both
  // select() and groupBy() — consistent with the original local-variable pattern.
  const isIncomeExpr = incomeCategoryFilter()

  let whereClause
  if (cycleEnabled && cycleStart && cycleEnd) {
    whereClause = and(
      eq(transactions.userId, userId),
      sql`${transactions.date} >= ${cycleStart}`,
      sql`${transactions.date} <= ${cycleEnd}`,
    )
  } else {
    // Date range filter instead of IN(DATE_FORMAT(date,'%Y-%m'), [...]) — the
    // range form is sargable and hits ix_transactions_user_date_id; the computed-
    // expression form would require a full user scan.
    const rangeStart = `${monthKeys[0]}-01`
    const ny = endMonth === 12 ? endYear + 1 : endYear
    const nm = endMonth === 12 ? 1 : endMonth + 1
    const rangeEnd = `${ny}-${String(nm).padStart(2, "0")}-01`
    whereClause = and(
      eq(transactions.userId, userId),
      sql`${transactions.date} >= ${rangeStart}`,
      sql`${transactions.date} < ${rangeEnd}`,
    )
  }

  const queryRows = await db
    .select({
      ym: ymExpr,
      catName: categories.name,
      total: sql<string>`SUM(${transactions.amountKd})`,
      isIncome: isIncomeExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .groupBy(ymExpr, categories.name, isIncomeExpr)

  const incomeByMonth: Record<string, Decimal> = {}
  const expenseByMonth: Record<string, Decimal> = {}
  const expenseByCategory: Record<string, Record<string, Decimal>> = {}

  for (const key of monthKeys) {
    incomeByMonth[key] = new Decimal(0)
    expenseByMonth[key] = new Decimal(0)
    expenseByCategory[key] = {}
  }

  for (const { ym, catName, total, isIncome } of queryRows) {
    const monthKey = ym ?? ""
    if (!(monthKey in incomeByMonth)) continue
    const amount = toD(total)
    const category = catName ?? "Uncategorized"
    if (isIncome) {
      incomeByMonth[monthKey] = incomeByMonth[monthKey].plus(amount)
    } else {
      expenseByMonth[monthKey] = expenseByMonth[monthKey].plus(amount)
      expenseByCategory[monthKey][category] = (
        expenseByCategory[monthKey][category] ?? new Decimal(0)
      ).plus(amount)
    }
  }

  const monthly: DashboardMonthlyEntry[] = monthKeys.map((key) => ({
    month: key,
    income_kd: formatKd(incomeByMonth[key] ?? new Decimal(0)),
    expense_kd: formatKd(expenseByMonth[key] ?? new Decimal(0)),
  }))

  const expenseByCategoryStr: Record<string, Record<string, string>> = {}
  for (const [key, catMap] of Object.entries(expenseByCategory)) {
    expenseByCategoryStr[key] = {}
    for (const [cat, dec] of Object.entries(catMap)) {
      expenseByCategoryStr[key][cat] = formatKd(dec)
    }
  }

  return {
    months: monthKeys,
    monthly,
    expense_by_category: expenseByCategoryStr,
    cycle_enabled: cycleEnabled,
    cycle_start: cycleEnabled ? (cycleStart ?? null) : null,
    cycle_end: cycleEnabled ? (cycleEnd ?? null) : null,
  }
}

// ── Persist ───────────────────────────────────────────────────────────────────

// Upserts a snapshot row. The unique constraint on (user_id, months_count,
// window_end_month) guarantees at most one canonical snapshot per window.
// onDuplicateKeyUpdate is atomic — no SELECT-then-INSERT race.
export async function persistDashboardSnapshot(
  userId: number,
  db: ReturnType<typeof getDb>,
  monthsCount: number,
  windowEndMonth: string,
  payload: DashboardMetricsPayload,
): Promise<void> {
  const now = new Date()
  const monthsJson = JSON.stringify(payload.months)
  const monthlyJson = JSON.stringify(payload.monthly)
  const expenseByCategoryJson = JSON.stringify(payload.expense_by_category)
  await db
    .insert(dashboardSnapshots)
    .values({ userId, monthsCount, windowEndMonth, monthsJson, monthlyJson, expenseByCategoryJson, computedAt: now })
    .onDuplicateKeyUpdate({ set: { monthsJson, monthlyJson, expenseByCategoryJson, computedAt: now } })
}

// ── Load ──────────────────────────────────────────────────────────────────────

// Returns null if no snapshot exists, JSON parsing fails, or shape validation
// fails (including float monetary fields — see validateSnapshotPayload).
export async function loadDashboardSnapshot(
  userId: number,
  db: ReturnType<typeof getDb>,
  monthsCount: number,
  windowEndMonth: string,
): Promise<DashboardMetricsPayload | null> {
  const rows = await db
    .select()
    .from(dashboardSnapshots)
    .where(
      and(
        eq(dashboardSnapshots.userId, userId),
        eq(dashboardSnapshots.monthsCount, monthsCount),
        eq(dashboardSnapshots.windowEndMonth, windowEndMonth),
      ),
    )
    .orderBy(desc(dashboardSnapshots.computedAt))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  let months: unknown
  let monthly: unknown
  let expense_by_category: unknown
  try {
    months = JSON.parse(row.monthsJson ?? "[]")
    monthly = JSON.parse(row.monthlyJson ?? "[]")
    expense_by_category = JSON.parse(row.expenseByCategoryJson ?? "{}")
  } catch {
    return null
  }

  return validateSnapshotPayload({
    months,
    monthly,
    expense_by_category,
    cycle_enabled: false,
    cycle_start: null,
    cycle_end: null,
  })
}

// ── Rebuild ───────────────────────────────────────────────────────────────────

export function currentMonthKeyUtc(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

// Recomputes and persists a snapshot for a single user. Used by both the
// BullMQ rebuild job (batch) and the on-demand fallback in the dashboard route
// (when no snapshot exists for a dormant user).
export async function rebuildDashboardSnapshot(
  userId: number,
  db: ReturnType<typeof getDb>,
  opts?: { monthsCount?: number; windowEndMonth?: string },
): Promise<void> {
  const monthsCount = Math.max(1, Math.min(opts?.monthsCount ?? 24, 60))
  const windowEndMonth = opts?.windowEndMonth ?? currentMonthKeyUtc()
  const [endYear, endMonth] = windowEndMonth.split("-").map(Number)
  const payload = await computeDashboardMetricsPayload(userId, db, {
    months: monthsCount,
    endYear,
    endMonth,
    cycleEnabled: false,
  })
  await persistDashboardSnapshot(userId, db, monthsCount, windowEndMonth, payload)
}
