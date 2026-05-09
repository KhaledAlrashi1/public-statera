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
  buildMonthWindow,
  ymExpr,
  roundedKd,
} from "../lib/analytics-helpers"
import { expenseCategoryFilter, currentPayPeriod } from "../lib/payday-lib"

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
