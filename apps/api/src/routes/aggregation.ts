/*
 * Deliberate deviations from Flask (routes/analytics/__init__.py, spending.py):
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
} from "../lib/analytics-cache"
import { searchRateLimit } from "../lib/rate-limit"
import { env } from "../lib/env"

export const aggregationRouter = new Hono()

const UNCAT = "Uncategorized"
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function parseIntParam(v: string | undefined, defaultVal: number): number {
  if (!v) return defaultVal
  const n = parseInt(v, 10)
  return isNaN(n) ? defaultVal : n
}

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
//
// TODO(module-6-product-events): record "app_opened" daily event on each
// dashboard_metrics hit (all 3 cache paths). Requires porting record_event_daily
// (once-per-day dedup logic). Only out-of-scope analytics pipelines read app_opened
// rows; no functional behavior in the migration depends on it.

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

// ── R4: GET /api/analytics/account-overview ──────────────────────────────────
// Deviation from Flask: connected_accounts always [] — bank sync deferred
// (BankConnection/RawBankTransaction queries not ported; see Module 8 for bank sync scope).
// Monetary serialization: KWD amounts use formatKd() (string, 3dp), matching Flask's
// format_kd() contract. pct is a JS number (float), delta matches Python float behavior.
// The 0 vs 0.0 float serialization difference (JSON.stringify(0) vs json.dumps(0.0))
// is documented in the 5b-1 deviation block and verified in Module 9.

aggregationRouter.get("/account-overview", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")

  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format", code: "validation_error" }, 400)
  }

  const db = getDb()
  const year = parseInt(month.slice(0, 4), 10)
  const monthNumber = parseInt(month.slice(5, 7), 10)
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, monthNumber)
  const monthKeys = buildMonthWindow(year, monthNumber, 6)

  // Q1: total expense spend MTD
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

  // Q2: total income MTD
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

  // Q3: manual transaction count MTD (all transactions, not expense-filtered)
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

  // Q4: manual expense spend MTD
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

  // Q5: top 5 expense categories MTD
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
    return {
      category: r.category,
      amount_kd: formatKd(amount),
      pct,
    }
  })

  // Q6: 6-month income/expense trend — single CASE WHEN dual-column query
  // Flask overview.py:171-189: func.sum(case((income_filter, amount), else_=0))
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
  // Zero-fill all 6 months (sparse months get 0.000)
  const monthTrend = monthKeys.map((mk) => ({
    month: mk,
    spend: trendMap[mk]?.spend ?? formatKd(new Decimal(0)),
    income: trendMap[mk]?.income ?? formatKd(new Decimal(0)),
  }))

  return c.json({
    ok: true,
    data: {
      month,
      total_spend_mtd: formatKd(totalSpendMtd),
      total_income_mtd: formatKd(totalIncomeMtd),
      connected_accounts: [], // bank sync deferred — always empty
      manual_entry_summary: {
        transactions_mtd: manualTransactionsMtd,
        spend_mtd: formatKd(manualSpendMtd),
      },
      top_categories: topCategories,
      month_trend: monthTrend,
    },
    error: null,
    meta: { connected_accounts_count: 0 },
  })
})
