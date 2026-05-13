/*
 * Deliberate deviations from Flask (routes/analytics/__init__.py, spending.py, digest.py):
 * - Routes mounted at /api/analytics/* instead of Flask's /api/* root paths.
 *   Module 9 verifies frontend URL parity.
 * - currentLocalDate() / currentMonthKey() use fixed UTC+3 (Kuwait, no DST)
 *   instead of Flask's per-user IANA timezone from profile.
 *   TODO(module-analytics-tz-per-user): switch when timezone UI is added.
 * - ?cycle param: accepts "1"|"true"|"yes"|"on" (case-insensitive), matching
 *   Flask's _parse_bool_query. Absent/empty/falsy values resolve to false.
 * - R5 source IS NULL arm preserved despite transactions.source being NOT NULL
 *   in the Hono schema. See inline comment at the OR clause site.
 * - R6 sparse-month zero-fill done in JS (buildMonthWindow merge) rather than
 *   via SQL recursive CTE — matches Flask's Python-level merge approach.
 * - R7 avg12_by_category divides by Decimal("12") in JS; zero values serialize
 *   as 0 not 0.0 (JS JSON.stringify vs Python json.dumps). Module 9 verifies.
 * - R7 range_spent_by_category groups by categories.name (not COALESCE) to
 *   match Flask exactly, with JS-side null → "Uncategorized" coalescing.
 * - Monetary serialization differs by route: R1–R7 return numbers (roundedKd);
 *   R4/R9/R10 return strings (formatKd), matching Flask's format_kd() contract.
 *   R3 (dashboard-metrics) delegates to computeDashboardMetricsPayload which uses
 *   formatKd() strings, where Flask used floats (_rounded_number) — pre-existing
 *   5a-1 deviation, Module 9 verifies frontend compatibility.
 * - R9 _goalMonthlyCommitment: lazy pace computation — monthlyPaceFromDeposits is
 *   called only when required_monthly is null or lte(0). Flask's
 *   _goal_projection_snapshot always computes pace unconditionally. Output is
 *   functionally identical because pace is only used in the current_pace branch.
 * - R10 _weekBounds uses Date.UTC() arithmetic and getUTCDay() shift
 *   (dow===0?6:dow-1) instead of Python's date.weekday() — same Mon=0…Sun=6 result.
 * - R10 _daysUntilPayday month-end clamp via new Date(Date.UTC(y,m,0)).getUTCDate()
 *   instead of Python's calendar.monthrange().
 * - R10 _deltaPercent rounds to 1dp with Decimal.ROUND_HALF_UP, matching Flask's
 *   _rounded_percent / to_display_float(…, places=Decimal("0.1"), ROUND_HALF_UP).
 * - R10 wrapped in withAnalyticsTimeout(hardFail:true); Flask R10 has no timeout
 *   guard. Added for MySQL DoS prevention consistency with R8/R9.
 * - R8 sequential-then-parallel: _getSafeToSpendPayloadCached awaited first
 *   (fail-fast on CacheBackendUnavailableError before spawning 4 concurrent DB
 *   connections), then the other 4 sub-builders in Promise.all. Flask executes all
 *   sub-builders sequentially. Trade-off: ~4 concurrent short queries vs 4 sequential
 *   against MySQL pool (default 10 connections, waitForConnections queueing) — safe
 *   for typical loads.
 * - R8 cache_warning absent: no partial-failure path in Hono (Redis degradation → 503).
 */

import { Hono } from "hono"
import { z } from "zod"
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../db/connection"
import { transactions } from "../db/schema/transactions"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { userProfiles } from "../db/schema/users"
import { budgets } from "../db/schema/budgets"
import { debtAccounts } from "../db/schema/debt-accounts"
import { savingsGoals } from "../db/schema/savings-goals"
import { requireAuth } from "../middleware/auth"
import {
  currentLocalDate,
  currentMonthKey,
  calendarMonthBounds,
  buildMonthWindow,
  ymExpr,
  roundedKd,
} from "../lib/analytics-helpers"
import { expenseCategoryFilter, incomeCategoryFilter, currentPayPeriod } from "../lib/payday-lib"
import { formatKd } from "../lib/transaction-lib"
import {
  CacheBackendUnavailableError,
  AnalyticsComputationTimeoutError,
  withAnalyticsTimeout,
  getDashboardMetricsWithCache,
  safeToSpendCacheKey,
  cacheGet,
  cacheSet,
} from "../lib/analytics-cache"
import { resolveIncomeForPeriod } from "../lib/income-lib"
import { monthlyPaceFromDeposits } from "../lib/savings-goals-lib"
import { dashboardSnapshots } from "../db/schema/dashboard-snapshots"
import { buildDebtSummaryPayload } from "./debt"
import { buildBudgetPayload } from "./budgets"
import { Sentry } from "../lib/sentry"
import { searchRateLimit } from "../lib/rate-limit"
import { env } from "../lib/env"
import { recordEventDaily } from "../lib/product-events-lib"
import { listActiveBudgetAlerts } from "../lib/budget-alerts-lib"

export const aggregationRouter = new Hono()

const UNCAT = "Uncategorized"
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

import { parseIntParam } from "./route-helpers"

function parseBoolParam(v: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase())
}

// ── R1: GET /api/analytics/spend-by-category ─────────────────────────────────
// All-time expense totals by category, descending by spend. No params.

aggregationRouter.get("/spend-by-category", requireAuth, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  const rows = await db
    .select({
      category: sql<string>`COALESCE(${categories.name}, ${UNCAT})`,
      total: sql<string>`SUM(${transactions.amountKd})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), expenseCategoryFilter()))
    .groupBy(sql`COALESCE(${categories.name}, ${UNCAT})`)
    .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(sql`COALESCE(${categories.name}, ${UNCAT})`))

  const items: Record<string, number> = {}
  for (const row of rows) {
    items[row.category] = roundedKd(row.total)
  }

  return c.json({ ok: true, data: { items }, error: null, meta: { count: Object.keys(items).length } })
})

// ── R2: GET /api/analytics/spend-by-month ────────────────────────────────────
// Total transaction volume (not expense-only) grouped by month, ascending. No params.

aggregationRouter.get("/spend-by-month", requireAuth, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  const rows = await db
    .select({
      month: ymExpr,
      total: sql<string>`SUM(${transactions.amountKd})`,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(ymExpr)
    .orderBy(asc(ymExpr))

  const items = rows.map((r) => ({ month: r.month, total_kd: roundedKd(r.total) }))

  return c.json({ ok: true, data: { items }, error: null, meta: { count: items.length } })
})

// ── R5: GET /api/analytics/expense-breakdown ─────────────────────────────────
// Expense breakdown by dimension (category|merchant|transaction) with optional
// range and source filters. Matches Flask's _build_expense_breakdown_payload.

const r5Schema = z.object({
  dimension: z.preprocess(
    (v) => (!v ? "category" : String(v).trim().toLowerCase()),
    z.enum(["category", "merchant", "transaction"], {
      errorMap: () => ({ message: "dimension must be one of: category, merchant, transaction" }),
    }),
  ),
  range: z.preprocess(
    (v) => (!v ? "month" : String(v).trim().toLowerCase()),
    z.enum(["month", "12m", "all"], {
      errorMap: () => ({ message: "range must be one of: month, 12m, all" }),
    }),
  ),
  limit: z.preprocess(
    (v) => parseIntParam(v as string | undefined, 500),
    z.number().int().min(1, { message: "limit must be between 1 and 1000" }).max(1000, { message: "limit must be between 1 and 1000" }),
  ),
  // C3: empty string treated as absent (no filter); lowercased before enum validation.
  source: z.preprocess(
    (v) => (!v || String(v).trim() === "" ? undefined : String(v).trim().toLowerCase()),
    z.enum(["manual", "bank_import", "csv_import"], {
      errorMap: () => ({ message: "source must be one of: manual, bank_import, csv_import" }),
    }).optional(),
  ),
})

aggregationRouter.get("/expense-breakdown", requireAuth, async (c) => {
  const { userId } = c.get("session")

  const parsed = r5Schema.safeParse({
    dimension: c.req.query("dimension"),
    range: c.req.query("range"),
    limit: c.req.query("limit"),
    source: c.req.query("source"),
  })
  if (!parsed.success) {
    return c.json({ ok: false, data: null, error: parsed.error.issues[0]?.message ?? "Validation error.", code: "validation_error" }, 400)
  }
  const { dimension, range: rangeKey, limit, source } = parsed.data

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const db = getDb()
  const endYear = parseInt(month.slice(0, 4), 10)
  const endMonth = parseInt(month.slice(5, 7), 10)
  const monthKeys = buildMonthWindow(endYear, endMonth, 12)

  const sourceCondition =
    source === "manual"
      ? // Flask parity: source='manual' includes legacy NULL rows. Hono's transactions.source
        // is NOT NULL with default 'manual', so the IS NULL arm never fires in current data,
        // but the OR is preserved to match Flask's contract exactly. Do not remove without
        // migrating any future NULL-allowing schema changes (e.g., raw bank import staging).
        or(eq(transactions.source, "manual"), isNull(transactions.source))
      : source
        ? eq(transactions.source, source)
        : undefined

  const rangeCondition =
    rangeKey === "month"
      ? sql`${ymExpr} = ${month}`
      : rangeKey === "12m"
        ? inArray(ymExpr, monthKeys)
        : undefined // "all" — no date filter

  const baseWhere = and(eq(transactions.userId, userId), expenseCategoryFilter(), rangeCondition, sourceCondition)

  const [totalRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(baseWhere)
  const scopeTotal = roundedKd(totalRow?.total ?? "0")

  let items: Array<{ name: string; amount_kd: number }>

  if (dimension === "category") {
    const catExpr = sql<string>`COALESCE(${categories.name}, ${UNCAT})`
    const rows = await db
      .select({ name: catExpr, total: sql<string>`SUM(${transactions.amountKd})` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(baseWhere)
      .groupBy(catExpr)
      .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(catExpr))
      .limit(limit)
    items = rows.map((r) => ({ name: r.name, amount_kd: roundedKd(r.total) }))
  } else if (dimension === "merchant") {
    const merExpr = sql<string>`COALESCE(${merchants.name}, 'Unknown Merchant')`
    const rows = await db
      .select({ name: merExpr, total: sql<string>`SUM(${transactions.amountKd})` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(baseWhere)
      .groupBy(merExpr)
      .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(merExpr))
      .limit(limit)
    items = rows.map((r) => ({ name: r.name, amount_kd: roundedKd(r.total) }))
  } else {
    // dimension === "transaction" — group by LOWER(TRIM(name)), display MIN(name)
    const nameKeyExpr = sql<string>`LOWER(TRIM(${transactions.name}))`
    const rows = await db
      .select({
        name: sql<string>`MIN(${transactions.name})`,
        total: sql<string>`SUM(${transactions.amountKd})`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(baseWhere, sql`LENGTH(TRIM(${transactions.name})) > 0`))
      .groupBy(nameKeyExpr)
      .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(sql`MIN(${transactions.name})`))
      .limit(limit)
    items = rows.map((r) => ({ name: r.name || "Unnamed", amount_kd: roundedKd(r.total) }))
  }

  const windowMonths = rangeKey === "month" ? 1 : rangeKey === "12m" ? 12 : null

  return c.json({
    ok: true,
    data: { dimension, range: rangeKey, month, source: source ?? null, window_months: windowMonths, total_kd: scopeTotal, items },
    error: null,
    meta: { count: items.length },
  })
})

// ── R6: GET /api/analytics/expense-merchant-trend ────────────────────────────
// Sliding month window of expense for a specific merchant. Sparse months zero-filled.

const r6Schema = z.object({
  merchant: z.preprocess(
    (v) => (!v ? "" : String(v).trim()),
    z.string().min(1, { message: "merchant is required" }),
  ),
  months: z.preprocess(
    (v) => parseIntParam(v as string | undefined, 12),
    z.number().int().min(1, { message: "months must be between 1 and 24" }).max(24, { message: "months must be between 1 and 24" }),
  ),
})

aggregationRouter.get("/expense-merchant-trend", requireAuth, async (c) => {
  const { userId } = c.get("session")

  const parsed = r6Schema.safeParse({ merchant: c.req.query("merchant"), months: c.req.query("months") })
  if (!parsed.success) {
    return c.json({ ok: false, data: null, error: parsed.error.issues[0]?.message ?? "Validation error.", code: "validation_error" }, 400)
  }
  const { merchant, months } = parsed.data

  const until = (c.req.query("until") ?? "").trim()
  if (until && !MONTH_RE.test(until)) {
    return c.json({ ok: false, data: null, error: "until must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const db = getDb()
  const refMonth = until || currentMonthKey()
  const endYear = parseInt(refMonth.slice(0, 4), 10)
  const endMonth = parseInt(refMonth.slice(5, 7), 10)
  const monthKeys = buildMonthWindow(endYear, endMonth, months)

  const merchantLower = merchant.toLowerCase()
  const merchantFilter =
    merchantLower === "unknown merchant"
      ? isNull(merchants.name)
      : sql`LOWER(${merchants.name}) = ${merchantLower}`

  const rows = await db
    .select({ ym: ymExpr, total: sql<string>`SUM(${transactions.amountKd})` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(eq(transactions.userId, userId), expenseCategoryFilter(), inArray(ymExpr, monthKeys), merchantFilter))
    .groupBy(ymExpr)

  // D2: Sparse-month zero-fill — merge DB result with full month window in JS
  const byMonth: Record<string, number> = {}
  for (const row of rows) {
    byMonth[row.ym] = roundedKd(row.total)
  }
  const series = monthKeys.map((mk) => ({ month: mk, total_kd: byMonth[mk] ?? 0 }))

  return c.json({
    ok: true,
    data: { merchant, months: monthKeys, series },
    error: null,
    meta: { count: series.length },
  })
})

// ── R7: GET /api/analytics/budget-metrics ────────────────────────────────────
// Expense vs budget per category with cycle-aware period and configurable range.
// ?range: month|30|90|365|all — distinct from R5's month|12m|all schemas.
// ?cycle: true/false — when true, uses currentPayPeriod(paydayDay, firstOfMonth).

const r7Schema = z.object({
  range: z.preprocess(
    (v) => (!v ? "month" : String(v).trim().toLowerCase()),
    z.enum(["month", "30", "90", "365", "all"], {
      errorMap: () => ({ message: "range must be one of: month, 30, 90, 365, all" }),
    }),
  ),
})

aggregationRouter.get("/budget-metrics", requireAuth, async (c) => {
  const { userId } = c.get("session")

  const parsed = r7Schema.safeParse({ range: c.req.query("range") })
  if (!parsed.success) {
    return c.json({ ok: false, data: null, error: parsed.error.issues[0]?.message ?? "Validation error.", code: "validation_error" }, 400)
  }
  const { range: rangeKey } = parsed.data

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const cycleEnabled = parseBoolParam(c.req.query("cycle"))
  const db = getDb()
  const year = parseInt(month.slice(0, 4), 10)
  const monthNumber = parseInt(month.slice(5, 7), 10)

  // Resolve cycle period from profile's paydayDay when cycle=true
  let cycleStart: string | null = null
  let cycleEnd: string | null = null
  if (cycleEnabled) {
    const [profile] = await db
      .select({ paydayDay: userProfiles.paydayDay })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)
    // refDate = first day of the given month — matches Flask's date(year, month_number, 1)
    const refDate = new Date(Date.UTC(year, monthNumber - 1, 1))
    const period = currentPayPeriod(profile?.paydayDay ?? null, refDate)
    cycleStart = period.start
    cycleEnd = period.end
  }

  const expFilter = expenseCategoryFilter()

  // Monthly spend by category: date range when cycle enabled, ym= filter otherwise
  const monthlyWhere =
    cycleEnabled && cycleStart && cycleEnd
      ? and(eq(transactions.userId, userId), expFilter, sql`${transactions.date} >= ${cycleStart}`, sql`${transactions.date} <= ${cycleEnd}`)
      : and(eq(transactions.userId, userId), expFilter, sql`${ymExpr} = ${month}`)

  const monthlyRows = await db
    .select({ catName: categories.name, total: sql<string>`SUM(${transactions.amountKd})` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(monthlyWhere)
    .groupBy(categories.name)

  const spentByCategory: Record<string, number> = {}
  for (const row of monthlyRows) {
    spentByCategory[row.catName ?? UNCAT] = roundedKd(row.total)
  }

  // Range spend by category: never cycle-filtered; always date-range or all-time
  let rangeSpentByCategory: Record<string, number>
  if (rangeKey === "month") {
    rangeSpentByCategory = { ...spentByCategory }
  } else {
    let rangeWhere
    if (rangeKey === "30" || rangeKey === "90" || rangeKey === "365") {
      const today = currentLocalDate()
      const cutoffDate = new Date(today.getTime() - parseInt(rangeKey, 10) * 86_400_000)
      const cutoffStr = cutoffDate.toISOString().slice(0, 10)
      rangeWhere = and(eq(transactions.userId, userId), expFilter, sql`${transactions.date} >= ${cutoffStr}`)
    } else {
      // rangeKey === "all": no date filter
      rangeWhere = and(eq(transactions.userId, userId), expFilter)
    }

    const rangeRows = await db
      .select({ catName: categories.name, total: sql<string>`SUM(${transactions.amountKd})` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(rangeWhere)
      .groupBy(categories.name)

    rangeSpentByCategory = {}
    for (const row of rangeRows) {
      rangeSpentByCategory[row.catName ?? UNCAT] = roundedKd(row.total)
    }
  }

  // Previous 12 months avg by category (12 months before the given month)
  let prevYear = year
  let prevMonth = monthNumber - 1
  if (prevMonth < 1) {
    prevMonth = 12
    prevYear -= 1
  }
  const prevMonthKeys = buildMonthWindow(prevYear, prevMonth, 12)

  const prev12Rows = await db
    .select({ catName: categories.name, ym: ymExpr, total: sql<string>`SUM(${transactions.amountKd})` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), inArray(ymExpr, prevMonthKeys), expFilter))
    .groupBy(categories.name, ymExpr)

  const avg12SumByCategory: Record<string, Decimal> = {}
  for (const row of prev12Rows) {
    const cat = row.catName ?? UNCAT
    avg12SumByCategory[cat] = (avg12SumByCategory[cat] ?? new Decimal("0")).plus(
      new Decimal(row.total || "0"),
    )
  }
  const avg12ByCategory: Record<string, number> = {}
  for (const [cat, sum] of Object.entries(avg12SumByCategory)) {
    avg12ByCategory[cat] = roundedKd(sum.dividedBy(new Decimal("12")).toString())
  }

  return c.json({
    ok: true,
    data: {
      month,
      range: rangeKey,
      spent_by_category: spentByCategory,
      range_spent_by_category: rangeSpentByCategory,
      avg12_by_category: avg12ByCategory,
      cycle_enabled: cycleEnabled,
      cycle_start: cycleEnabled ? cycleStart : null,
      cycle_end: cycleEnabled ? cycleEnd : null,
    },
    error: null,
    meta: {},
  })
})

// ── R3: GET /api/analytics/dashboard-metrics ─────────────────────────────────
// 3-tier cached dashboard metrics: Redis → snapshot table → on-demand recompute.
// Sets X-Cache-Status: hit|snapshot|miss response header.
// updated_at injected into miss-path payload before Redis write (analytics-cache.ts).
// cache_warning always null — Hono's circuit breaker converts Redis degradation to
// 503 with no partial-failure path. Module 9 verifies frontend handles both fields.

aggregationRouter.get("/dashboard-metrics", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")

  // Validate months (1-60, default 24)
  const monthsRaw = c.req.query("months")
  const months = parseIntParam(monthsRaw, 24)
  if (months < 1 || months > 60) {
    return c.json({ ok: false, data: null, error: "months must be between 1 and 60", code: "validation_error" }, 400)
  }

  // Validate until (optional YYYY-MM)
  const until = (c.req.query("until") ?? "").trim()
  if (until && !MONTH_RE.test(until)) {
    return c.json({ ok: false, data: null, error: "until must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const cycleEnabled = parseBoolParam(c.req.query("cycle"))
  const db = getDb()

  // Resolve current month key and end year/month
  const currentMonth = currentMonthKey()
  let endYear: number
  let endMonth: number
  if (until) {
    endYear = parseInt(until.slice(0, 4), 10)
    endMonth = parseInt(until.slice(5, 7), 10)
  } else {
    endYear = parseInt(currentMonth.slice(0, 4), 10)
    endMonth = parseInt(currentMonth.slice(5, 7), 10)
  }

  // Resolve cycle bounds if enabled
  let cycleStart: string | null = null
  let cycleEnd: string | null = null
  if (cycleEnabled) {
    const [profile] = await db
      .select({ paydayDay: userProfiles.paydayDay })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)
    const refDate = new Date(Date.UTC(endYear, endMonth - 1, 1))
    const period = currentPayPeriod(profile?.paydayDay ?? null, refDate)
    cycleStart = period.start
    cycleEnd = period.end
  }

  // Build cache_until key suffix matching Flask's cache_until logic
  // (routes/analytics/__init__.py:260: f"{cache_until}|cycle=1|{start}|{end}" when cycle)
  let cacheUntil = until || currentMonth
  if (cycleEnabled && cycleStart && cycleEnd) {
    cacheUntil = `${cacheUntil}|cycle=1|${cycleStart}|${cycleEnd}`
  }

  try {
    const { payload, cacheStatus } = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      () => getDashboardMetricsWithCache(userId, db, {
        months, endYear, endMonth, cycleEnabled, cycleStart, cycleEnd,
        until: cacheUntil, hardFail: true,
      }),
    )

    // cache_warning always null — no partial-failure path in Hono; Redis degradation → 503.
    // Flask line 348 sets this after the cache write, so it is NOT stored in Redis.
    // We match by adding it at the route level (not in getDashboardMetricsWithCache).
    const data = { ...payload, cache_warning: null }

    // Fire-and-forget: record once-per-UTC-day app_opened event across all 3 cache paths.
    // recordEventDaily absorbs its own errors; must not block or fail the dashboard response.
    void recordEventDaily(userId, "app_opened", null, db)

    // X-Cache-Status header matches Flask's response.headers["X-Cache-Status"].
    // Must be set before c.json() to be included in the response headers.
    c.header("X-Cache-Status", cacheStatus)
    return c.json({
      ok: true,
      data,
      error: null,
      meta: { months_count: payload.months?.length ?? 0 },
    })
  } catch (err) {
    if (err instanceof CacheBackendUnavailableError) {
      return c.json({ ok: false, data: null, error: "Dashboard analytics are temporarily unavailable while Redis recovers. Please try again shortly.", code: "analytics_cache_unavailable" }, 503)
    }
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json({ ok: false, data: null, error: "Analytics are taking longer than expected. Please try again shortly.", code: "analytics_timeout" }, 503)
    }
    throw err
  }
})

// ── R9: safe-to-spend private helpers ────────────────────────────────────────

function _q3(d: Decimal): Decimal {
  return d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

async function _sumExpenseBetween(
  userId: number,
  start: string,
  end: string,
  db: ReturnType<typeof getDb>,
): Promise<Decimal> {
  if (end < start) return new Decimal("0")
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      sql`${transactions.date} >= ${start}`,
      sql`${transactions.date} <= ${end}`,
      expenseCategoryFilter(),
    ))
  return new Decimal(row?.total ?? "0")
}

async function _budgetAmountsForMonth(
  userId: number,
  month: string,
  db: ReturnType<typeof getDb>,
): Promise<[Decimal, Record<string, Decimal>]> {
  const rows = await db
    .select({ amount: budgets.amountKd, catName: categories.name })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.userId, userId), eq(budgets.month, month)))
  let totalBudget = new Decimal("0")
  const amountsByCategory: Record<string, Decimal> = {}
  for (const row of rows) {
    const amount = new Decimal(row.amount || "0")
    totalBudget = totalBudget.plus(amount)
    const key = (row.catName ?? "").trim().toLowerCase()
    if (key) {
      amountsByCategory[key] = (amountsByCategory[key] ?? new Decimal("0")).plus(amount)
    }
  }
  return [totalBudget, amountsByCategory]
}

// Inlined from savings-goals-lib (not exported) to keep _goalMonthlyCommitment self-contained.
// Python: max(1, (days + 29) // 30) where days = (target_date - today).days
function _monthsToTargetDate(today: string, targetDate: Date | string | null): number | null {
  if (!targetDate) return null
  const targetStr = targetDate instanceof Date ? targetDate.toISOString().slice(0, 10) : targetDate
  if (targetStr <= today) return 0
  const [ty, tm, td] = today.split("-").map(Number)
  const [dy, dm, dd] = targetStr.split("-").map(Number)
  const daysDiff = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000,
  )
  return Math.max(1, Math.floor((daysDiff + 29) / 30))
}

type GoalCommitment = {
  monthlyCommitmentKd: Decimal
  source: "completed" | "required_monthly" | "current_pace" | "unscheduled"
  remainingKd: Decimal
}

// Ports Flask's goal_monthly_commitment (lib/savings_goals.py:163).
// Strict comparators per spec Item 8: lte(0) for completed, gt(0) for required_monthly and current_pace.
async function _goalMonthlyCommitment(
  goal: { id: number; userId: number; targetKd: string; currentKd: string; targetDate: Date | string | null },
  db: ReturnType<typeof getDb>,
  today: string, // YYYY-MM-DD (Kuwait date via UTC accessors on currentLocalDate())
): Promise<GoalCommitment> {
  const target = Decimal.max(new Decimal(goal.targetKd || "0"), new Decimal(0))
  const current = Decimal.max(new Decimal(goal.currentKd || "0"), new Decimal(0))
  const remaining = Decimal.max(target.minus(current), new Decimal(0))

  if (remaining.lte(0)) {
    return { monthlyCommitmentKd: new Decimal("0"), source: "completed", remainingKd: new Decimal("0") }
  }

  const monthsToTarget = _monthsToTargetDate(today, goal.targetDate)
  let requiredMonthly: Decimal | null = null
  if (monthsToTarget !== null && monthsToTarget > 0) {
    requiredMonthly = _q3(remaining.div(new Decimal(monthsToTarget)))
  } else if (monthsToTarget === 0) {
    requiredMonthly = _q3(remaining)
  }

  if (requiredMonthly !== null && requiredMonthly.gt(0)) {
    return { monthlyCommitmentKd: requiredMonthly, source: "required_monthly", remainingKd: _q3(remaining) }
  }

  const currentPace = await monthlyPaceFromDeposits(goal.id, goal.userId, db, today)
  if (currentPace.gt(0)) {
    return { monthlyCommitmentKd: currentPace, source: "current_pace", remainingKd: _q3(remaining) }
  }

  return { monthlyCommitmentKd: new Decimal("0"), source: "unscheduled", remainingKd: _q3(remaining) }
}

type SavingsGoalSummary = {
  count: number
  unscheduledCount: number
  monthlyTotalKd: Decimal
  budgetCoveredKd: Decimal
  reserveKd: Decimal
}

async function _savingsGoalReserveForSafeToSpend(
  userId: number,
  today: string, // YYYY-MM-DD
  budgetAmountsByCategory: Record<string, Decimal>,
  db: ReturnType<typeof getDb>,
): Promise<SavingsGoalSummary> {
  const goalRows = await db
    .select({
      id: savingsGoals.id,
      userId: savingsGoals.userId,
      targetKd: savingsGoals.targetKd,
      currentKd: savingsGoals.currentKd,
      targetDate: savingsGoals.targetDate,
      catName: categories.name,
    })
    .from(savingsGoals)
    .leftJoin(categories, eq(savingsGoals.linkedCategoryId, categories.id))
    .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.isActive, true)))

  const goalMonthlyByCategory: Record<string, Decimal> = {}
  let savingsGoalMonthlyTotal = new Decimal("0")
  let savingsGoalUnlinkedTotal = new Decimal("0")
  let savingsGoalUnscheduledCount = 0

  for (const goal of goalRows) {
    const commitment = await _goalMonthlyCommitment(goal, db, today)
    const monthlyCommitment = commitment.monthlyCommitmentKd
    savingsGoalMonthlyTotal = savingsGoalMonthlyTotal.plus(monthlyCommitment)
    if (commitment.source === "unscheduled") savingsGoalUnscheduledCount++
    if (monthlyCommitment.lte(0)) continue
    const linkedCatKey = (goal.catName ?? "").trim().toLowerCase()
    if (linkedCatKey) {
      goalMonthlyByCategory[linkedCatKey] =
        (goalMonthlyByCategory[linkedCatKey] ?? new Decimal("0")).plus(monthlyCommitment)
    } else {
      savingsGoalUnlinkedTotal = savingsGoalUnlinkedTotal.plus(monthlyCommitment)
    }
  }

  let savingsGoalBudgetCovered = new Decimal("0")
  let savingsGoalReserve = savingsGoalUnlinkedTotal
  for (const [catKey, monthlyCommitment] of Object.entries(goalMonthlyByCategory)) {
    const covered = Decimal.min(monthlyCommitment, budgetAmountsByCategory[catKey] ?? new Decimal("0"))
    savingsGoalBudgetCovered = savingsGoalBudgetCovered.plus(covered)
    savingsGoalReserve = savingsGoalReserve.plus(monthlyCommitment.minus(covered))
  }

  return {
    count: goalRows.length,
    unscheduledCount: savingsGoalUnscheduledCount,
    monthlyTotalKd: savingsGoalMonthlyTotal,
    budgetCoveredKd: savingsGoalBudgetCovered,
    reserveKd: savingsGoalReserve,
  }
}

async function _buildSafeToSpendPayload(
  userId: number,
  month: string,
  today: Date, // from currentLocalDate() — use UTC accessors only
  db: ReturnType<typeof getDb>,
): Promise<Record<string, unknown>> {
  const year = parseInt(month.slice(0, 4), 10)
  const monthNumber = parseInt(month.slice(5, 7), 10)
  const { start: cycleStart, end: cycleEnd } = calendarMonthBounds(year, monthNumber)

  // UTC accessors on today (currentLocalDate() contract: value is UTC + Kuwait offset)
  const todayStr = today.toISOString().slice(0, 10)

  const cycleStartMs = new Date(cycleStart + "T00:00:00Z").getTime()
  const cycleEndMs = new Date(cycleEnd + "T00:00:00Z").getTime()
  const cycleDays = Math.round((cycleEndMs - cycleStartMs) / 86400000) + 1

  let daysElapsed: number
  let daysRemaining: number
  let spendWindowEnd: string | null

  if (todayStr < cycleStart) {
    daysElapsed = 0
    daysRemaining = cycleDays
    spendWindowEnd = null
  } else if (todayStr > cycleEnd) {
    daysElapsed = cycleDays
    daysRemaining = 0
    spendWindowEnd = cycleEnd
  } else {
    const todayMs = new Date(todayStr + "T00:00:00Z").getTime()
    daysElapsed = Math.round((todayMs - cycleStartMs) / 86400000) + 1
    daysRemaining = Math.round((cycleEndMs - todayMs) / 86400000)
    spendWindowEnd = todayStr
  }

  const incomeResolution = await resolveIncomeForPeriod(userId, month, db)
  const monthlyIncome = incomeResolution.amountKd
  const incomeSource = incomeResolution.source

  const [totalBudget, budgetAmountsByCategory] = await _budgetAmountsForMonth(userId, month, db)

  const goalSummary = await _savingsGoalReserveForSafeToSpend(
    userId, todayStr, budgetAmountsByCategory, db,
  )

  const [debtRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${debtAccounts.minimumPaymentKd}), '0')`,
      count: sql<string>`COUNT(${debtAccounts.id})`,
    })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.isActive, true)))
  const debtMinimumTotal = new Decimal(debtRow?.total ?? "0")
  const debtAccountCount = parseInt(debtRow?.count ?? "0", 10)

  let actualSpend = new Decimal("0")
  if (spendWindowEnd !== null) {
    actualSpend = await _sumExpenseBetween(userId, cycleStart, spendWindowEnd, db)
  }

  const incomeForCalc = monthlyIncome ?? new Decimal("0")
  const committed = totalBudget.plus(debtMinimumTotal).plus(goalSummary.reserveKd)
  const commitmentsOverCap =
    incomeForCalc.gt(0) && committed.gt(incomeForCalc.mul(new Decimal("0.40")))

  const remainingRaw = incomeForCalc.minus(committed).minus(actualSpend)
  const remainingBudget = remainingRaw.gt(0) ? remainingRaw : new Decimal("0")
  const dailyRate = remainingBudget.div(new Decimal(Math.max(daysRemaining, 1)))

  const warnings: string[] = []
  if (monthlyIncome === null) warnings.push("income_not_set")
  if (totalBudget.lte(0)) warnings.push("budgets_not_set")
  if (debtAccountCount === 0) warnings.push("debts_not_set_optional")
  if (goalSummary.unscheduledCount > 0) warnings.push("savings_goals_unscheduled_optional")
  if (commitmentsOverCap) warnings.push("commitments_over_40pct_cap")

  return {
    month,
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    monthly_income_kd: monthlyIncome !== null ? formatKd(monthlyIncome) : null,
    income_auto_detected: incomeSource === "detected_from_transactions",
    income_source: incomeSource,
    total_budget_kd: formatKd(totalBudget),
    debt_minimum_total_kd: formatKd(debtMinimumTotal),
    savings_goal_count: goalSummary.count,
    savings_goal_unscheduled_count: goalSummary.unscheduledCount,
    savings_goal_monthly_total_kd: formatKd(goalSummary.monthlyTotalKd),
    savings_goal_budget_covered_kd: formatKd(goalSummary.budgetCoveredKd),
    savings_goal_reserve_kd: formatKd(goalSummary.reserveKd),
    committed_kd: formatKd(committed),
    committed_breakdown_kd: {
      budget_allocations: formatKd(totalBudget),
      debt_minimums: formatKd(debtMinimumTotal),
      savings_goal_reserve: formatKd(goalSummary.reserveKd),
      savings_goal_budget_covered: formatKd(goalSummary.budgetCoveredKd),
    },
    actual_spend_kd: formatKd(actualSpend),
    remaining_budget_kd: formatKd(remainingBudget),
    daily_rate_kd: formatKd(dailyRate),
    data_complete: monthlyIncome !== null && totalBudget.gt(0),
    warnings,
  }
}

async function _getSafeToSpendPayloadCached(
  userId: number,
  month: string,
  today: Date,
  db: ReturnType<typeof getDb>,
): Promise<Record<string, unknown>> {
  const cacheKey = safeToSpendCacheKey(userId, month)
  const cached = await cacheGet(cacheKey, { hardFail: true })
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Record<string, unknown>
      if (parsed && typeof parsed === "object") return parsed
    } catch {
      // corrupt cache entry — recompute
    }
  }
  const payload = await _buildSafeToSpendPayload(userId, month, today, db)
  try {
    await cacheSet(cacheKey, JSON.stringify(payload), 300, { hardFail: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: "_getSafeToSpendPayloadCached", userId } })
  }
  return payload
}

// ── R4: account-overview payload builder ─────────────────────────────────────
// Extracted so R8 (dashboard-bundle) can reuse all 6 DB queries without
// re-implementing them. Deviation: connected_accounts always [] — bank sync
// deferred. See file header deviation block for full R4 notes.

async function _buildAccountOverviewPayload(
  userId: number,
  month: string,
  db: ReturnType<typeof getDb>,
): Promise<Record<string, unknown>> {
  const year = parseInt(month.slice(0, 4), 10)
  const monthNumber = parseInt(month.slice(5, 7), 10)
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, monthNumber)
  const monthKeys = buildMonthWindow(year, monthNumber, 6)

  const [spendRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      expenseCategoryFilter(),
      sql`${transactions.date} >= ${monthStart}`,
      sql`${transactions.date} <= ${monthEnd}`,
    ))
  const totalSpendMtd = new Decimal(spendRow?.total ?? "0")

  const [incomeRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      incomeCategoryFilter(),
      sql`${transactions.date} >= ${monthStart}`,
      sql`${transactions.date} <= ${monthEnd}`,
    ))
  const totalIncomeMtd = new Decimal(incomeRow?.total ?? "0")

  const [manualCountRow] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.source, "manual"),
      sql`${transactions.date} >= ${monthStart}`,
      sql`${transactions.date} <= ${monthEnd}`,
    ))
  const manualTransactionsMtd = parseInt(manualCountRow?.count ?? "0", 10)

  const [manualSpendRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.source, "manual"),
      expenseCategoryFilter(),
      sql`${transactions.date} >= ${monthStart}`,
      sql`${transactions.date} <= ${monthEnd}`,
    ))
  const manualSpendMtd = new Decimal(manualSpendRow?.total ?? "0")

  const topCatExpr = sql<string>`COALESCE(${categories.name}, ${UNCAT})`
  const topRows = await db
    .select({
      category: topCatExpr,
      total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      eq(transactions.userId, userId),
      expenseCategoryFilter(),
      sql`${transactions.date} >= ${monthStart}`,
      sql`${transactions.date} <= ${monthEnd}`,
    ))
    .groupBy(topCatExpr)
    .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(topCatExpr))
    .limit(5)

  const totalSpendForPct = totalSpendMtd.gt(0) ? totalSpendMtd : new Decimal(0)
  const topCategories = topRows.map((r) => {
    const amount = new Decimal(r.total || "0")
    const pct = totalSpendForPct.gt(0)
      ? Number(amount.div(totalSpendForPct).mul(100).toDecimalPlaces(1))
      : 0
    return { category: r.category, amount_kd: formatKd(amount), pct }
  })

  // Single CASE WHEN dual-column query — Flask overview.py:171-189.
  const trendRows = await db
    .select({
      ym: ymExpr,
      incomeTotal: sql<string>`COALESCE(SUM(CASE WHEN ${incomeCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END), '0')`,
      spendTotal: sql<string>`COALESCE(SUM(CASE WHEN ${expenseCategoryFilter()} THEN ${transactions.amountKd} ELSE 0 END), '0')`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), inArray(ymExpr, monthKeys)))
    .groupBy(ymExpr)

  const trendMap: Record<string, { income: string; spend: string }> = {}
  for (const row of trendRows) {
    trendMap[row.ym] = {
      income: formatKd(new Decimal(row.incomeTotal || "0")),
      spend: formatKd(new Decimal(row.spendTotal || "0")),
    }
  }
  const monthTrend = monthKeys.map((mk) => ({
    month: mk,
    spend: trendMap[mk]?.spend ?? formatKd(new Decimal(0)),
    income: trendMap[mk]?.income ?? formatKd(new Decimal(0)),
  }))

  return {
    month,
    total_spend_mtd: formatKd(totalSpendMtd),
    total_income_mtd: formatKd(totalIncomeMtd),
    connected_accounts: [],
    manual_entry_summary: {
      transactions_mtd: manualTransactionsMtd,
      spend_mtd: formatKd(manualSpendMtd),
    },
    top_categories: topCategories,
    month_trend: monthTrend,
  }
}

// ── R4: GET /api/analytics/account-overview ──────────────────────────────────

aggregationRouter.get("/account-overview", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const db = getDb()
  const data = await _buildAccountOverviewPayload(userId, month, db)
  return c.json({ ok: true, data, error: null, meta: { connected_accounts_count: 0 } })
})

// ── R9: GET /api/analytics/safe-to-spend ─────────────────────────────────────
// Cached safe-to-spend computation: income − committed − actual_spend.
// Cache key: safeToSpendCacheKey(userId, month), TTL 300s.
// hardFail: true → CacheBackendUnavailableError → 503 analytics_cache_unavailable.
//                   AnalyticsComputationTimeoutError → 503 analytics_timeout.

aggregationRouter.get("/safe-to-spend", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const today = currentLocalDate()
  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      () => _getSafeToSpendPayloadCached(userId, month, today, db),
    )
    return c.json({ ok: true, data: payload, error: null, meta: {} })
  } catch (err) {
    if (err instanceof CacheBackendUnavailableError) {
      return c.json({ ok: false, data: null, error: "Dashboard analytics are temporarily unavailable while Redis recovers. Please try again shortly.", code: "analytics_cache_unavailable" }, 503)
    }
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json({ ok: false, data: null, error: "Analytics are taking longer than expected. Please try again shortly.", code: "analytics_timeout" }, 503)
    }
    throw err
  }
})

// ── R10/R8: shared helpers ────────────────────────────────────────────────────
//
// Captured from Flask's shared.py (_week_bounds, _days_until_payday) and
// digest.py route (_delta_pct logic) via /tmp/capture_r10_fixtures.py on 2026-05-10.
// Exported with @internal tag for fixture-based unit tests.

/** @internal For test use only. */
export function _weekBounds(today: Date): { start: string; end: string } {
  const dow = today.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const startMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysSinceMonday)
  return {
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(startMs + 6 * 86400_000).toISOString().slice(0, 10),
  }
}

/** @internal For test use only. */
export function _daysUntilPayday(today: Date, paydayDay: number | null): number | null {
  if (paydayDay === null || paydayDay === undefined) return null
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1 // 1-12
  const clamp = (year: number, month: number): number =>
    Math.max(1, Math.min(paydayDay, new Date(Date.UTC(year, month, 0)).getUTCDate()))
  const todayMs = Date.UTC(y, m - 1, today.getUTCDate())
  const thisPaydayMs = Date.UTC(y, m - 1, clamp(y, m))
  if (todayMs <= thisPaydayMs) return (thisPaydayMs - todayMs) / 86400_000
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return (Date.UTC(nextY, nextM - 1, clamp(nextY, nextM)) - todayMs) / 86400_000
}

/** @internal For test use only. */
export function _deltaPercent(thisWeek: Decimal, lastWeek: Decimal): number {
  if (lastWeek.gt(0)) {
    return Number(
      thisWeek.minus(lastWeek).div(lastWeek).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP),
    )
  }
  if (thisWeek.gt(0)) return 100.0
  return 0.0
}

// ── R10: GET /api/analytics/weekly-digest ────────────────────────────────────
// Weekly expense summary: this-week vs last-week spend, top 3 categories, days
// until payday, and safe-to-spend daily rate for today's month.
// Deviation: wrapped in withAnalyticsTimeout(hardFail:true) — Flask R10 has no
// timeout guard; added for MySQL DoS prevention consistency with R8/R9.

aggregationRouter.get("/weekly-digest", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const today = currentLocalDate()
  const { start: weekStart, end: weekEnd } = _weekBounds(today)
  const todayStr = today.toISOString().slice(0, 10)
  const effectiveEnd = todayStr < weekEnd ? todayStr : weekEnd
  const weekStartMs = new Date(weekStart + "T00:00:00Z").getTime()
  const lastWeekStart = new Date(weekStartMs - 7 * 86400_000).toISOString().slice(0, 10)
  const lastWeekEnd = new Date(weekStartMs - 86400_000).toISOString().slice(0, 10)
  const daysObserved =
    Math.round((new Date(effectiveEnd + "T00:00:00Z").getTime() - weekStartMs) / 86400_000) + 1
  const month = currentMonthKey()
  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      async () => {
        const thisWeekExpense = await _sumExpenseBetween(userId, weekStart, effectiveEnd, db)
        const lastWeekExpense = await _sumExpenseBetween(userId, lastWeekStart, lastWeekEnd, db)
        const delta = _deltaPercent(thisWeekExpense, lastWeekExpense)

        const catExpr = sql<string>`COALESCE(${categories.name}, ${UNCAT})`
        const topRows = await db
          .select({
            name: catExpr,
            total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')`,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .where(and(
            eq(transactions.userId, userId),
            sql`${transactions.date} >= ${weekStart}`,
            sql`${transactions.date} <= ${effectiveEnd}`,
            expenseCategoryFilter(),
          ))
          .groupBy(catExpr)
          .orderBy(desc(sql`SUM(${transactions.amountKd})`), asc(catExpr))
          .limit(3)

        const topCategories = topRows.map((r: { name: string; total: string }) => ({
          name: r.name,
          amount_kd: formatKd(new Decimal(r.total || "0")),
        }))

        const [profile] = await db
          .select({ paydayDay: userProfiles.paydayDay })
          .from(userProfiles)
          .where(eq(userProfiles.userId, userId))
          .limit(1)

        const safeToSpendPayload = await _getSafeToSpendPayloadCached(userId, month, today, db)

        return {
          week_start: weekStart,
          week_end: weekEnd,
          this_week_expense_kd: formatKd(thisWeekExpense),
          last_week_expense_kd: formatKd(lastWeekExpense),
          delta_pct: delta,
          top_categories: topCategories,
          days_until_payday: _daysUntilPayday(today, profile?.paydayDay ?? null),
          safe_to_spend_today_kd: String(safeToSpendPayload.daily_rate_kd ?? "0.000"),
          days_observed: daysObserved,
        }
      },
    )
    return c.json({
      ok: true,
      data: payload,
      error: null,
      meta: { count: payload.top_categories.length },
    })
  } catch (err) {
    if (err instanceof CacheBackendUnavailableError) {
      return c.json({ ok: false, data: null, error: "Dashboard analytics are temporarily unavailable while Redis recovers. Please try again shortly.", code: "analytics_cache_unavailable" }, 503)
    }
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json({ ok: false, data: null, error: "Analytics are taking longer than expected. Please try again shortly.", code: "analytics_timeout" }, 503)
    }
    throw err
  }
})

// ── R8: GET /api/analytics/dashboard-bundle ──────────────────────────────────
// Bundles safe_to_spend, debt_summary, budget, account_overview, and
// snapshot_computed_at into one response to reduce round trips.
// Sequential-then-parallel: _getSafeToSpendPayloadCached awaited before Promise.all
// for the other 4 sub-builders. See file header deviation block for trade-offs.

async function _snapshotComputedAt(
  userId: number,
  db: ReturnType<typeof getDb>,
  windowEndMonth: string,
): Promise<string | null> {
  const [row] = await db
    .select({ computedAt: dashboardSnapshots.computedAt })
    .from(dashboardSnapshots)
    .where(and(
      eq(dashboardSnapshots.userId, userId),
      eq(dashboardSnapshots.monthsCount, env.dashboardSnapshotMonths),
      eq(dashboardSnapshots.windowEndMonth, windowEndMonth),
    ))
    .orderBy(desc(dashboardSnapshots.computedAt), desc(dashboardSnapshots.id))
    .limit(1)
  if (!row?.computedAt) return null
  return (row.computedAt as Date).toISOString().replace(/\.\d{3}Z$/, "+00:00")
}

aggregationRouter.get("/dashboard-bundle", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const today = currentLocalDate()
  const currentMonth = currentMonthKey()

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonth
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      async () => {
        const safeToSpend = await _getSafeToSpendPayloadCached(userId, month, today, db)
        const [debtSummary, budget, accountOverview, snapshotComputedAt] = await Promise.all([
          buildDebtSummaryPayload(userId, db),
          buildBudgetPayload(userId, month, db),
          _buildAccountOverviewPayload(userId, month, db),
          _snapshotComputedAt(userId, db, currentMonth),
        ])
        return {
          month,
          snapshot_computed_at: snapshotComputedAt,
          safe_to_spend: safeToSpend,
          debt_summary: debtSummary,
          budget,
          budget_alerts: {
            month,
            items: await listActiveBudgetAlerts(userId, month, db),
          },
          account_overview: accountOverview,
        }
      },
    )
    return c.json({
      ok: true,
      data: payload,
      error: null,
      meta: { budget_count: payload.budget.items.length, alert_count: payload.budget_alerts.items.length },
    })
  } catch (err) {
    if (err instanceof CacheBackendUnavailableError) {
      return c.json({ ok: false, data: null, error: "Dashboard analytics are temporarily unavailable while Redis recovers. Please try again shortly.", code: "analytics_cache_unavailable" }, 503)
    }
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json({ ok: false, data: null, error: "Analytics are taking longer than expected. Please try again shortly.", code: "analytics_timeout" }, 503)
    }
    throw err
  }
})
