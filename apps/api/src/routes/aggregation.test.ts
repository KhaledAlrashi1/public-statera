/**
 * Tests for aggregation routes: R1–R7 (5b-2), R3+R4 (5b-3a), R9 (5b-3b),
 * R10+R8 (5b-3c).
 *
 * Uses the flat self-referential proxy pattern (CLAUDE.md: "Drizzle proxy-mock
 * pattern") for single-query routes, and makeSequentialDb for routes that make
 * multiple sequential DB calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import Decimal from "decimal.js"
import { Hono } from "hono"
import { aggregationRouter, _weekBounds, _daysUntilPayday, _deltaPercent } from "./aggregation"
import { createSessionToken } from "../middleware/auth"

// ── DB mock helpers ───────────────────────────────────────────────────────────

// Flat self-referential proxy: every method call returns the same proxy. The
// `then` property resolves with `rows` so any chain depth awaits correctly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject)
        }
        return (..._args: unknown[]) => makeDbReturning(rows)
      },
    },
  )
}

// Sequential proxy: each successive `await` resolves the next entry in sequences[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSequentialDb(sequences: unknown[][]): any {
  let callIndex = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeProxy(): any {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = sequences[callIndex] ?? []
            callIndex++
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (..._args: unknown[]) => makeProxy()
        },
      },
    )
  }
  return makeProxy()
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// ── analytics-cache mock ──────────────────────────────────────────────────────
// vi.mock is hoisted by vitest — must be at module level. The error classes are
// defined here so that the same class references are used in the mock factory
// and in instanceof checks within the route handler.
vi.mock("../lib/analytics-cache", () => {
  class CacheBackendUnavailableError extends Error {
    constructor(msg = "") {
      super(msg)
      this.name = "CacheBackendUnavailableError"
    }
  }
  class AnalyticsComputationTimeoutError extends Error {
    constructor(msg = "") {
      super(msg)
      this.name = "AnalyticsComputationTimeoutError"
    }
  }
  return {
    getDashboardMetricsWithCache: vi.fn(),
    withAnalyticsTimeout: vi.fn((_db: unknown, _seconds: unknown, fn: () => Promise<unknown>) => fn()),
    CacheBackendUnavailableError,
    AnalyticsComputationTimeoutError,
    safeToSpendCacheKey: vi.fn((_userId: unknown, month: unknown) => `safe_to_spend:1:${month}`),
    cacheGet: vi.fn(async () => null),  // always miss — forces recompute in R9 fixture tests
    cacheSet: vi.fn(async () => true),
  }
})
import {
  getDashboardMetricsWithCache,
  withAnalyticsTimeout,
  CacheBackendUnavailableError,
  AnalyticsComputationTimeoutError,
  cacheGet,
  cacheSet,
} from "../lib/analytics-cache"

vi.mock("../lib/income-lib", () => ({
  resolveIncomeForPeriod: vi.fn(),
}))
import { resolveIncomeForPeriod } from "../lib/income-lib"

// ── R8 sub-builder mocks ──────────────────────────────────────────────────────
// buildBudgetPayload is imported by aggregation.ts for the dashboard-bundle route.
// Mocked here so R8 tests control its output without triggering internal DB queries.
// (buildDebtSummaryPayload / debt_summary removed from R8 in phase4 SC-1/2.)
vi.mock("./budgets", () => ({
  buildBudgetPayload: vi.fn(),
  budgetsRouter: new Hono(),
}))
import { buildBudgetPayload } from "./budgets"

// Namespace import so vi.spyOn can patch currentLocalDate per-fixture-test.
import * as analyticsHelpers from "../lib/analytics-helpers"

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/analytics", aggregationRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

// ── R1: spend-by-category ─────────────────────────────────────────────────────

describe("GET /api/analytics/spend-by-category", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/spend-by-category")
    expect(res.status).toBe(401)
  })

  it("returns category dict with rounded KD amounts", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeDbReturning([
        { category: "Restaurants", total: "45.750" },
        { category: "Groceries", total: "120.500" },
        { category: "Uncategorized", total: "0.000" },
      ]),
    )
    const res = await app.request("/api/analytics/spend-by-category", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.items).toEqual({ Restaurants: 45.75, Groceries: 120.5, Uncategorized: 0 })
    expect((body.meta as Record<string, unknown>).count).toBe(3)
  })

  it("returns empty dict when no expense transactions", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/spend-by-category", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).items).toEqual({})
    expect((body.meta as Record<string, unknown>).count).toBe(0)
  })
})

// ── R2: spend-by-month ────────────────────────────────────────────────────────

describe("GET /api/analytics/spend-by-month", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/spend-by-month")
    expect(res.status).toBe(401)
  })

  it("returns ordered list of month/total_kd items", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeDbReturning([
        { month: "2024-04", total: "100.000" },
        { month: "2024-05", total: "250.750" },
        { month: "2024-06", total: "0.000" },
      ]),
    )
    const res = await app.request("/api/analytics/spend-by-month", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.items).toEqual([
      { month: "2024-04", total_kd: 100 },
      { month: "2024-05", total_kd: 250.75 },
      { month: "2024-06", total_kd: 0 },
    ])
    expect((body.meta as Record<string, unknown>).count).toBe(3)
  })
})

// ── R5: expense-breakdown ─────────────────────────────────────────────────────

describe("GET /api/analytics/expense-breakdown", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/expense-breakdown")
    expect(res.status).toBe(401)
  })

  // B2-1 (10d zod month conversion). Malformed-month → 400 identity is covered by
  // "invalid month format returns 400" below. r5 runs its existing r5Schema parse
  // BEFORE the month check, so the month zod is a separate post-schema safeParse
  // (ordering preserved — see the multi-invalid case for schema-field precedence).
  it("B2-1: absent month uses hand-rolled default → 200 (D2 split)", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/expense-breakdown?dimension=category", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
  })

  // B2-1-COND-1 (D-CO-a cure): bad schema field + bad month → the r5Schema
  // envelope wins, byte-identical (month zod is a separate post-schema safeParse).
  it("B2-1: bad dimension + bad month → r5Schema first-fail wins (order preserved)", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/expense-breakdown?dimension=bogus&month=2024-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("dimension must be one of: category, merchant, transaction")
    expect(body.code).toBe("validation_error")
  })

  it("dimension=category returns items with name/amount_kd", async () => {
    // Sequential: [scopeTotal], [category rows]
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "200.000" }],
        [
          { name: "Food", total: "150.000" },
          { name: "Transport", total: "50.000" },
        ],
      ]),
    )
    const res = await app.request(
      "/api/analytics/expense-breakdown?dimension=category&range=month&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.dimension).toBe("category")
    expect(data.range).toBe("month")
    expect(data.window_months).toBe(1)
    expect(data.total_kd).toBe(200)
    expect(data.source).toBeNull()
    expect(data.items).toEqual([
      { name: "Food", amount_kd: 150 },
      { name: "Transport", amount_kd: 50 },
    ])
  })

  it("dimension=merchant returns merchant-grouped items", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "80.000" }],
        [
          { name: "McDonald's", total: "60.000" },
          { name: "Unknown Merchant", total: "20.000" },
        ],
      ]),
    )
    const res = await app.request(
      "/api/analytics/expense-breakdown?dimension=merchant&range=all&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.dimension).toBe("merchant")
    expect(data.window_months).toBeNull()
    expect((data.items as unknown[]).length).toBe(2)
  })

  it("dimension=transaction returns name-grouped items, filters empty names", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "30.000" }],
        [{ name: "Starbucks Coffee", total: "30.000" }],
      ]),
    )
    const res = await app.request(
      "/api/analytics/expense-breakdown?dimension=transaction&range=month&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.dimension).toBe("transaction")
    expect(data.items).toEqual([{ name: "Starbucks Coffee", amount_kd: 30 }])
  })

  it("range=12m sets window_months=12", async () => {
    vi.mocked(getDb).mockReturnValue(makeSequentialDb([[{ total: "0" }], []]))
    const res = await app.request(
      "/api/analytics/expense-breakdown?range=12m&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.window_months).toBe(12)
  })

  it("source=manual echoed in response", async () => {
    vi.mocked(getDb).mockReturnValue(makeSequentialDb([[{ total: "0" }], []]))
    const res = await app.request(
      "/api/analytics/expense-breakdown?source=manual&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.source).toBe("manual")
  })

  it("source= (empty string) treated as no filter — source null in response", async () => {
    vi.mocked(getDb).mockReturnValue(makeSequentialDb([[{ total: "0" }], []]))
    const res = await app.request(
      "/api/analytics/expense-breakdown?source=&month=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.source).toBeNull()
  })

  it("invalid dimension returns 400 with Flask-matching message", async () => {
    const res = await app.request(
      "/api/analytics/expense-breakdown?dimension=garbage",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.error).toBe("dimension must be one of: category, merchant, transaction")
    expect(body.code).toBe("validation_error")
  })

  it("invalid source returns 400 with Flask-matching message", async () => {
    const res = await app.request(
      "/api/analytics/expense-breakdown?source=garbage",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("source must be one of: manual, bank_import, csv_import")
  })

  // zod-adoption B0: locks issues[0] first-fail ordering when every field is
  // invalid (dimension precedes range/limit/source in the schema). Expected
  // message captured from the pre-conversion code (2026-07-11).
  it("returns the first field's message when all fields are invalid", async () => {
    const res = await app.request(
      "/api/analytics/expense-breakdown?dimension=bogus&range=bogus&limit=999999&source=bogus",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
    expect(body.error).toBe("dimension must be one of: category, merchant, transaction")
  })

  it("invalid month format returns 400", async () => {
    const res = await app.request(
      "/api/analytics/expense-breakdown?month=2024-13",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("month must be in YYYY-MM format")
  })
})

// ── R6: expense-merchant-trend ────────────────────────────────────────────────

describe("GET /api/analytics/expense-merchant-trend", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/expense-merchant-trend?merchant=Test")
    expect(res.status).toBe(401)
  })

  it("missing merchant returns 400", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/expense-merchant-trend", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("merchant is required")
    expect(body.code).toBe("validation_error")
  })

  it("returns 12-month series with correct shape", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeDbReturning([
        { ym: "2024-03", total: "22.500" },
        { ym: "2024-05", total: "18.000" },
      ]),
    )
    const res = await app.request(
      "/api/analytics/expense-merchant-trend?merchant=Starbucks&months=6&until=2024-06",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.merchant).toBe("Starbucks")
    expect((data.months as string[]).length).toBe(6)
  })

  // D2: Sparse-month fixture — DB returns 2 of 6 months; response has 6 months
  // in chronological order with zeros in the 4 missing slots.
  it("D2: sparse months zero-filled in correct chronological order", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeDbReturning([
        { ym: "2024-01", total: "12.500" },
        { ym: "2024-04", total: "8.750" },
      ]),
    )
    const res = await app.request(
      "/api/analytics/expense-merchant-trend?merchant=Starbucks&months=6&until=2024-05",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>

    // month window: buildMonthWindow(2024, 5, 6) = ["2023-12","2024-01","2024-02","2024-03","2024-04","2024-05"]
    const series = data.series as Array<{ month: string; total_kd: number }>
    expect(series).toHaveLength(6)
    expect(series[0]).toEqual({ month: "2023-12", total_kd: 0 })   // missing → 0
    expect(series[1]).toEqual({ month: "2024-01", total_kd: 12.5 }) // DB row
    expect(series[2]).toEqual({ month: "2024-02", total_kd: 0 })   // missing → 0
    expect(series[3]).toEqual({ month: "2024-03", total_kd: 0 })   // missing → 0
    expect(series[4]).toEqual({ month: "2024-04", total_kd: 8.75 }) // DB row
    expect(series[5]).toEqual({ month: "2024-05", total_kd: 0 })   // missing → 0
  })

  it("invalid months range returns 400", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request(
      "/api/analytics/expense-merchant-trend?merchant=Test&months=25",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("months must be between 1 and 24")
  })
})

// ── R7: budget-metrics ────────────────────────────────────────────────────────

describe("GET /api/analytics/budget-metrics", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/budget-metrics")
    expect(res.status).toBe(401)
  })

  // B2-1 (10d zod month conversion). r7 runs r7Schema (range) BEFORE the month
  // check; the month zod is a separate post-schema safeParse (ordering preserved).
  it("B2-1: absent month uses hand-rolled default → 200 (D2 split)", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/budget-metrics", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
  })

  // B2-1-COND-1 (D-CO-a cure): bad schema field + bad month → the r7Schema
  // envelope wins, byte-identical (month zod is a separate post-schema safeParse).
  it("B2-1: bad range + bad month → r7Schema first-fail wins (order preserved)", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/budget-metrics?range=bogus&month=2024-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("range must be one of: month, 30, 90, 365, all")
    expect(body.code).toBe("validation_error")
  })

  it("B2-1: malformed month → 400 byte-identical no-period string", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/budget-metrics?month=2024-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("month must be in YYYY-MM format")
    expect(body.code).toBe("validation_error")
  })

  it("cycle=false, range=month — uses ym filter, no profile query", async () => {
    // 2 sequential DB calls: monthly, prev12
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ catName: "Food", total: "120.000" }], // monthly spend
        [],                                       // prev12
      ]),
    )
    const res = await app.request(
      "/api/analytics/budget-metrics?month=2024-06&range=month",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.cycle_enabled).toBe(false)
    expect(data.cycle_start).toBeNull()
    expect(data.cycle_end).toBeNull()
    expect(data.month).toBe("2024-06")
    expect(data.range).toBe("month")
    expect(data.spent_by_category).toEqual({ Food: 120 })
    expect(data.range_spent_by_category).toEqual({ Food: 120 }) // same as spent for range=month
  })

  // R7 cycle fixture 1: paydayDay=null → calendarMonthBounds (pay period = full calendar month)
  it("cycle=true, paydayDay=null — period equals calendar month bounds", async () => {
    // 3 sequential: profile, monthly, prev12
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([[{ paydayDay: null }], [], []]),
    )
    const res = await app.request(
      "/api/analytics/budget-metrics?month=2024-06&cycle=true",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.cycle_enabled).toBe(true)
    // calendarMonthBounds(2024, 6) = {start:"2024-06-01", end:"2024-06-30"}
    expect(data.cycle_start).toBe("2024-06-01")
    expect(data.cycle_end).toBe("2024-06-30")
  })

  // R7 cycle fixture 2: paydayDay=25, month=2024-06
  // refDate = 2024-06-01; refDay=1 < clamp(25,2024,6)=25 → look back
  // prevPayday=clamp(25,2024,5)=25; endDate=2024-06-24
  it("cycle=true, paydayDay=25, month=2024-06 — period 2024-05-25 to 2024-06-24", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([[{ paydayDay: 25 }], [], []]),
    )
    const res = await app.request(
      "/api/analytics/budget-metrics?month=2024-06&cycle=true",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.cycle_start).toBe("2024-05-25")
    expect(data.cycle_end).toBe("2024-06-24")
  })

  // R7 cycle fixture 3: paydayDay=31, month=2024-02 (leap year — Feb has 29 days)
  // refDate = 2024-02-01; thisPayday=clamp(31,2024,2)=29; refDay=1 < 29 → look back
  // prevPayday=clamp(31,2024,1)=31; endDate = day before 2024-02-29 = 2024-02-28
  it("cycle=true, paydayDay=31, month=2024-02 — month-end clamp: period 2024-01-31 to 2024-02-28", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([[{ paydayDay: 31 }], [], []]),
    )
    const res = await app.request(
      "/api/analytics/budget-metrics?month=2024-02&cycle=true",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.cycle_start).toBe("2024-01-31")
    expect(data.cycle_end).toBe("2024-02-28")
  })

  it("avg12_by_category sums 12 months and divides by 12", async () => {
    // prev12 has 2 months of "Food": 120+60=180 → avg = 180/12 = 15
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [],                                                               // monthly
        [{ catName: "Food", ym: "2024-04", total: "120.000" }, { catName: "Food", ym: "2024-05", total: "60.000" }], // prev12
      ]),
    )
    const res = await app.request(
      "/api/analytics/budget-metrics?month=2024-06&range=month",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.avg12_by_category).toEqual({ Food: 15 })
  })

  it("invalid range returns 400", async () => {
    const res = await app.request(
      "/api/analytics/budget-metrics?range=garbage",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("range must be one of: month, 30, 90, 365, all")
    expect(body.code).toBe("validation_error")
  })
})

// ── R3: dashboard-metrics ─────────────────────────────────────────────────────

describe("GET /api/analytics/dashboard-metrics", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Restore withAnalyticsTimeout passthrough after resetAllMocks clears its impl.
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(getDashboardMetricsWithCache).mockResolvedValue({
      payload: {
        months: ["2024-06"],
        monthly: [],
        expense_by_category: {},
        cycle_enabled: false,
        cycle_start: null,
        cycle_end: null,
        updated_at: "2024-06-01T00:00:00+00:00",
      },
      cacheStatus: "miss",
    })
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/dashboard-metrics")
    expect(res.status).toBe(401)
  })

  it("miss path: returns 200 with X-Cache-Status: miss and data.updated_at", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-metrics", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache-Status")).toBe("miss")
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.cache_warning).toBeNull()
    expect(data.updated_at).toBe("2024-06-01T00:00:00+00:00")
    expect((body.meta as Record<string, unknown>).months_count).toBe(1)
  })

  it("hit path: returns X-Cache-Status: hit", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(getDashboardMetricsWithCache).mockResolvedValue({
      payload: {
        months: ["2024-06"],
        monthly: [],
        expense_by_category: {},
        cycle_enabled: false,
        cycle_start: null,
        cycle_end: null,
        updated_at: "2024-06-01T00:00:00+00:00",
      },
      cacheStatus: "hit",
    })
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-metrics", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache-Status")).toBe("hit")
  })

  it("CacheBackendUnavailableError returns 503 with analytics_cache_unavailable code", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(getDashboardMetricsWithCache).mockRejectedValue(new CacheBackendUnavailableError())
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-metrics", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.code).toBe("analytics_cache_unavailable")
  })

  it("invalid months=0 returns 400 with validation_error", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-metrics?months=0", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
  })
})

// ── R4: account-overview ──────────────────────────────────────────────────────

describe("GET /api/analytics/account-overview", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/account-overview?month=2024-06")
    expect(res.status).toBe(401)
  })

  // B2-1 (10d zod month conversion). Absent-month → default → 200 is covered by
  // "default month (no param): data.month equals currentMonthKey()" below.
  it("B2-1: malformed month → 400 byte-identical no-period string", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/account-overview?month=2024-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("month must be in YYYY-MM format")
    expect(body.code).toBe("validation_error")
  })

  it("happy path: correct shape, pct calculation, zero-filled month_trend", async () => {
    // 6 sequential DB calls: Q1 spend, Q2 income, Q3 manual count, Q4 manual spend, Q5 top cats, Q6 trend
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "500.000" }],          // Q1: total expense spend MTD
        [{ total: "2000.000" }],         // Q2: total income MTD
        [{ count: "5" }],                // Q3: manual transaction count MTD
        [{ total: "300.000" }],          // Q4: manual expense spend MTD
        [{ category: "Food", total: "200.000" }], // Q5: top categories (1 of 5)
        [{ ym: "2024-06", incomeTotal: "2000.000", spendTotal: "500.000" }], // Q6: trend (1 of 6)
      ]),
    )
    const res = await app.request("/api/analytics/account-overview?month=2024-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>

    expect(data.total_spend_mtd).toBe("500.000")
    expect(data.total_income_mtd).toBe("2000.000")
    expect(data.connected_accounts).toEqual([])
    expect((body.meta as Record<string, unknown>).connected_accounts_count).toBe(0)

    const manual = data.manual_entry_summary as Record<string, unknown>
    expect(manual.transactions_mtd).toBe(5)
    expect(manual.spend_mtd).toBe("300.000")

    const topCats = data.top_categories as Array<{ category: string; amount_kd: string; pct: number }>
    expect(topCats).toHaveLength(1)
    // 200/500 * 100 = 40.0
    expect(topCats[0].pct).toBe(40)
    expect(topCats[0].amount_kd).toBe("200.000")
    expect(topCats[0].category).toBe("Food")

    const trend = data.month_trend as Array<{ month: string; spend: string; income: string }>
    // buildMonthWindow(2024, 6, 6) = ["2024-01","2024-02","2024-03","2024-04","2024-05","2024-06"]
    expect(trend).toHaveLength(6)
    // The 5 zero-filled months
    const zeroMonths = trend.filter((t) => t.month !== "2024-06")
    for (const m of zeroMonths) {
      expect(m.spend).toBe("0.000")
      expect(m.income).toBe("0.000")
    }
    // The real data month
    const realMonth = trend.find((t) => t.month === "2024-06")
    expect(realMonth?.spend).toBe("500.000")
    expect(realMonth?.income).toBe("2000.000")
  })

  it("default month (no param): data.month equals currentMonthKey()", async () => {
    // Import currentMonthKey to compute expected value at test time
    const { currentMonthKey } = await import("../lib/analytics-helpers")
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "0" }],   // Q1
        [{ total: "0" }],   // Q2
        [{ count: "0" }],   // Q3
        [{ total: "0" }],   // Q4
        [],                  // Q5
        [],                  // Q6
      ]),
    )
    const res = await app.request("/api/analytics/account-overview", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect(data.month).toBe(currentMonthKey())
  })
})

// ── R9: safe-to-spend ─────────────────────────────────────────────────────────
//
// Fixtures F1–F5: captured from Flask's _build_safe_to_spend_payload via a
// seeded PostgreSQL test transaction (rolled back) on 2026-05-10.
// Each fixture targets a distinct today-vs-cycle code path:
//   F1 today WITHIN cycle  → days_elapsed=10, days_remaining=20
//   F2 today BEFORE cycle  → days_elapsed=0,  days_remaining=31, actual_spend=0
//   F3 today AFTER cycle   → days_elapsed=30, days_remaining=0, daily_rate denominator=1
//   F4 commitments_over_40pct_cap warning trigger
//   F5 4-warning scenario (income_not_set + budgets_not_set + 2 optional)
// currentLocalDate() is mocked per-test via vi.spyOn(analyticsHelpers,...);
// vi.restoreAllMocks() in afterEach returns it to real. WC1–WC4 (below) test
// warning-state combinations using a stable past month without mocking.

// phase4 SC-1/2: debt/savings removed from safe-to-spend. committed = budget allocations
// only; the debt_minimum_total_kd / savings_goal_* fields and the debts_not_set_optional /
// savings_goals_unscheduled_optional warnings no longer exist. F4/WC3 (the cap scenarios)
// re-source their former debt contribution into the budget so committed still clears the
// 40% cap. WC4 (which tested the two now-removed optional warnings) is deleted.

// F1: today WITHIN cycle. Seed: month=2025-11, today=2025-11-10.
// Nov cycle: Nov 1–30 (30 days). days_elapsed=10, days_remaining=20.
// Income 1500 detected; budget 500; expense 120 (Nov 1–10). committed=500.
const FIXTURE_F1 = {
  month: "2025-11",
  cycle_start: "2025-11-01",
  cycle_end: "2025-11-30",
  days_elapsed: 10,
  days_remaining: 20,
  monthly_income_kd: "1500.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "500.000",
  committed_kd: "500.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
  },
  actual_spend_kd: "120.000",
  remaining_budget_kd: "880.000",   // 1500 − 500 − 120
  daily_rate_kd: "44.000",          // 880 / 20
  data_complete: true,
  warnings: [],
} as const

// F2: today BEFORE cycle start. Seed: month=2025-12, today=2025-11-30.
// Dec cycle: Dec 1–31 (31 days). days_elapsed=0, days_remaining=31.
// _sumExpenseBetween NOT called (spend_window_end=null); actual_spend=0.
// Income 1500 declared_in_profile; budget 500 for Dec. committed=500.
const FIXTURE_F2 = {
  month: "2025-12",
  cycle_start: "2025-12-01",
  cycle_end: "2025-12-31",
  days_elapsed: 0,
  days_remaining: 31,
  monthly_income_kd: "1500.000",
  income_auto_detected: false,
  income_source: "declared_in_profile",
  total_budget_kd: "500.000",
  committed_kd: "500.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "1000.000",  // 1500 − 500
  daily_rate_kd: "32.258",          // 1000 / 31 (ROUND_HALF_UP)
  data_complete: true,
  warnings: [],
} as const

// F3: today AFTER cycle end. Seed: month=2025-11, today=2025-12-01.
// Nov cycle: Nov 1–30 (30 days). days_elapsed=30, days_remaining=0.
// daily_rate denominator = max(0, 1) = 1; same seed as F1 but today past end.
const FIXTURE_F3 = {
  month: "2025-11",
  cycle_start: "2025-11-01",
  cycle_end: "2025-11-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1500.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "500.000",
  committed_kd: "500.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
  },
  actual_spend_kd: "120.000",
  remaining_budget_kd: "880.000",   // 1500 − 500 − 120
  daily_rate_kd: "880.000",         // 880 / max(0, 1) = 880
  data_complete: true,
  warnings: [],
} as const

// F4: commitments_over_40pct_cap. Seed: month=2025-11, today=2025-11-10.
// Income 1000 detected; budget 450 (former 350 budget + 100 ex-debt, re-sourced post-SC-1/2).
// committed=450 > 40%*1000=400 → cap triggered.
// remaining=1000−450−50=500; daily_rate=500/20=25.000.
const FIXTURE_F4 = {
  month: "2025-11",
  cycle_start: "2025-11-01",
  cycle_end: "2025-11-30",
  days_elapsed: 10,
  days_remaining: 20,
  monthly_income_kd: "1000.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "450.000",
  committed_kd: "450.000",
  committed_breakdown_kd: {
    budget_allocations: "450.000",
  },
  actual_spend_kd: "50.000",
  remaining_budget_kd: "500.000",
  daily_rate_kd: "25.000",     // 500 / 20
  data_complete: true,
  warnings: ["commitments_over_40pct_cap"],
} as const

// F5: 2-warning scenario — income_not_set + budgets_not_set. Seed: month=2025-11,
// today=2025-11-10. No income, no budget. committed=0; income_for_calc=0 →
// commitments_over_cap=false (requires income.gt(0)); remaining=0; daily_rate=0.
// Flask income_source=null (income not set); Hono maps null→"not_set" via income-lib.ts.
// (Was a 4-warning scenario pre-SC-1/2; the two optional debt/savings warnings are gone.)
const FIXTURE_F5 = {
  month: "2025-11",
  cycle_start: "2025-11-01",
  cycle_end: "2025-11-30",
  days_elapsed: 10,
  days_remaining: 20,
  monthly_income_kd: null,
  income_auto_detected: false,
  income_source: "not_set",    // Flask: null; Hono maps None→"not_set" (income-lib.ts)
  total_budget_kd: "0.000",
  committed_kd: "0.000",
  committed_breakdown_kd: {
    budget_allocations: "0.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "0.000",
  daily_rate_kd: "0.000",      // 0 / max(20, 1) = 0
  data_complete: false,
  warnings: ["income_not_set", "budgets_not_set"],
} as const

// WC1–WC4: warning-state combinations. Use stable past month 2025-06 so real
// currentLocalDate() (today > 2025-06-30) always puts days_elapsed=30, days_remaining=0.
// These exercise warning combinations not directly covered by F1–F5.

// WC1: income_not_set standalone — budget set, income absent.
const FIXTURE_WC1 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: null,
  income_auto_detected: false,
  income_source: "not_set",
  total_budget_kd: "500.000",
  committed_kd: "500.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "0.000",
  daily_rate_kd: "0.000",
  data_complete: false,
  warnings: ["income_not_set"],
} as const

// WC2: budgets_not_set — income declared in profile, no budgets for month.
const FIXTURE_WC2 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1200.000",
  income_auto_detected: false,
  income_source: "declared_in_profile",
  total_budget_kd: "0.000",
  committed_kd: "0.000",
  committed_breakdown_kd: {
    budget_allocations: "0.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "1200.000",  // 1200 − 0
  daily_rate_kd: "1200.000",        // 1200 / max(0,1) = 1200
  data_complete: false,
  warnings: ["budgets_not_set"],
} as const

// WC3: commitments_over_40pct_cap — stable-month path (days_remaining=0 → daily_rate=500/1=500).
// budget 450 = former 350 budget + 100 ex-debt (re-sourced post-SC-1/2). committed=450 > 400.
const FIXTURE_WC3 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1000.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "450.000",
  committed_kd: "450.000",
  committed_breakdown_kd: {
    budget_allocations: "450.000",
  },
  actual_spend_kd: "50.000",
  remaining_budget_kd: "500.000",
  daily_rate_kd: "500.000",    // 500 / max(0,1) = 500
  data_complete: true,
  warnings: ["commitments_over_40pct_cap"],
} as const

// Helper: sequential DB mock for R9 — covers the budgets and expense queries.
// (Post-SC-1/2 the savings-goal and debt queries are gone; safe-to-spend makes only
// the budgets query then the expense query.) resolveIncomeForPeriod is separately mocked.
// For F2 (today < cycle_start), the expense query is NOT called — pass an empty expense set.
function makeR9Db(budgetRows: unknown[], expenseRows: unknown[]) {
  return makeSequentialDb([budgetRows, expenseRows])
}

describe("GET /api/analytics/safe-to-spend", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(cacheSet).mockResolvedValue(true)
  })
  // Restore any vi.spyOn on currentLocalDate after each test.
  afterEach(() => vi.restoreAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11")
    expect(res.status).toBe(401)
  })

  // B2-1 (10d zod month conversion). Malformed-month → 400 identity is covered by
  // "invalid month format returns 400" below. Absent month → hand-rolled
  // currentMonthKey() default (D2 split); mirrors the F1 recompute setup minus
  // the ?month= param (currentLocalDate pinned so the default resolves to 2025-11).
  it("B2-1: absent month uses hand-rolled default → 200 (D2 split)", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 10, 10)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "500.000", catName: "Food" }],
        [{ total: "120.000" }],
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
  })

  it("invalid month format returns 400", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-6", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
    expect(body.error).toBe("month must be in YYYY-MM format")
  })

  it("CacheBackendUnavailableError returns 503 analytics_cache_unavailable", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(cacheGet).mockRejectedValue(new CacheBackendUnavailableError())
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_cache_unavailable")
  })

  it("AnalyticsComputationTimeoutError returns 503 analytics_timeout", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation(() => {
      throw new AnalyticsComputationTimeoutError()
    })
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_timeout")
  })

  // ── F1: today WITHIN cycle ────────────────────────────────────────────────
  // today=2025-11-10: days_elapsed=10, days_remaining=20, spend_window_end=today
  it("F1: today within cycle — full Hono response matches Flask-captured fixture", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 10, 10)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "500.000", catName: "Food" }],    // budgets (Nov 2025)
        [{ total: "120.000" }],                       // expense Nov 1–10
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F1)
  })

  // ── F2: today BEFORE cycle start ─────────────────────────────────────────
  // today=2025-11-30 < Dec 1: days_elapsed=0, days_remaining=31, actual_spend=0 (no expense query)
  it("F2: today before cycle start — full Hono response matches Flask-captured fixture", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 10, 30)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "declared_in_profile",
    })
    // Only the budgets sequence: expense query is NOT called when spend_window_end=null.
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ amount: "500.000", catName: "Food" }],    // budgets (Dec 2025)
      ]),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-12", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F2)
  })

  // ── F3: today AFTER cycle end ─────────────────────────────────────────────
  // today=2025-12-01 > Nov 30: days_elapsed=30, days_remaining=0, daily_rate=805/1=805
  it("F3: today after cycle end — full Hono response matches Flask-captured fixture", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 11, 1)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "500.000", catName: "Food" }],    // budgets (Nov 2025)
        [{ total: "120.000" }],                       // expense Nov 1–30
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F3)
  })

  // ── F4: commitments_over_40pct_cap ────────────────────────────────────────
  // today=2025-11-10; income=1000, budget=450 → committed=450>40%*1000=400
  it("F4: commitments_over_40pct_cap — full Hono response matches fixture", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 10, 10)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1000.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "450.000", catName: "Food" }],
        [{ total: "50.000" }],
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F4)
  })

  // ── F5: 2-warning scenario ────────────────────────────────────────────────
  // today=2025-11-10; no income, no budget.
  // Flask income_source=null → Hono "not_set" (income-lib.ts deliberate deviation).
  it("F5: income_not_set + budgets_not_set — full Hono response matches fixture", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(new Date(Date.UTC(2025, 10, 10)))
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({ amountKd: null, source: "not_set" })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [],                                           // no budgets → budgets_not_set
        [{ total: "0.000" }],                         // expense (today within cycle → query called)
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-11", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F5)
  })

  // ── Warning-state combinations (stable past month 2025-06) ────────────────
  // real currentLocalDate() — today 2026-05-10 > 2025-06-30 always
  // → days_elapsed=30, days_remaining=0, spendWindowEnd=cycleEnd, daily_rate=X/max(0,1)

  describe("warning-state combinations (stable past month 2025-06)", () => {
    // WC1: income_not_set standalone — budget set, income absent.
    it("WC1: income_not_set — remaining and daily_rate both zero", async () => {
      vi.mocked(resolveIncomeForPeriod).mockResolvedValue({ amountKd: null, source: "not_set" })
      vi.mocked(getDb).mockReturnValue(
        makeR9Db(
          [{ amount: "500.000", catName: "Groceries" }],
          [{ total: "0.000" }],
        ),
      )
      const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
        headers: { Authorization: await authHeader() },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.data).toEqual(FIXTURE_WC1)
    })

    // WC2: budgets_not_set — income declared, no budgets.
    it("WC2: budgets_not_set — remaining=1200, daily_rate=1200", async () => {
      vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
        amountKd: new Decimal("1200.000"),
        source: "declared_in_profile",
      })
      vi.mocked(getDb).mockReturnValue(
        makeR9Db(
          [],                                         // no budgets
          [{ total: "0.000" }],
        ),
      )
      const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
        headers: { Authorization: await authHeader() },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.data).toEqual(FIXTURE_WC2)
    })

    // WC3: commitments_over_40pct_cap — stable-month path; daily_rate=500/1=500.
    it("WC3: commitments_over_40pct_cap (stable-month) — daily_rate=500", async () => {
      vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
        amountKd: new Decimal("1000.000"),
        source: "detected_from_transactions",
      })
      vi.mocked(getDb).mockReturnValue(
        makeR9Db(
          [{ amount: "450.000", catName: "Food" }],
          [{ total: "50.000" }],
        ),
      )
      const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
        headers: { Authorization: await authHeader() },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.data).toEqual(FIXTURE_WC3)
    })
  })
})

// ── R10/R8: _deltaPercent unit tests ─────────────────────────────────────────
// Boundary cases captured from Flask's _rounded_percent via
// /tmp/capture_r10_fixtures.py on 2026-05-10. All 5 cases cover each distinct
// code path: both-zero, last=0/this>0, positive delta, negative delta, rounding.

describe("_deltaPercent (R10 helper) — Flask-captured boundary fixtures", () => {
  it("D1: both zero → 0.0", () => {
    expect(_deltaPercent(new Decimal("0.000"), new Decimal("0.000"))).toBe(0.0)
  })

  it("D2: last=0, this>0 → 100.0", () => {
    expect(_deltaPercent(new Decimal("10.000"), new Decimal("0.000"))).toBe(100.0)
  })

  it("D3: positive delta (this=15, last=10) → 50.0", () => {
    expect(_deltaPercent(new Decimal("15.000"), new Decimal("10.000"))).toBe(50.0)
  })

  it("D4: negative delta (this=5, last=10) → -50.0", () => {
    expect(_deltaPercent(new Decimal("5.000"), new Decimal("10.000"))).toBe(-50.0)
  })

  it("D5: ROUND_HALF_UP (this=11.555, last=10) → 15.6", () => {
    expect(_deltaPercent(new Decimal("11.555"), new Decimal("10.000"))).toBe(15.6)
  })
})

// ── R10: _weekBounds unit tests ───────────────────────────────────────────────
// Captured from Flask's _week_bounds via /tmp/capture_r10_fixtures.py 2026-05-10.
// Verifies the getUTCDay() Monday-shift: (dow===0?6:dow-1).

describe("_weekBounds (R10 helper) — Flask-captured fixtures", () => {
  it("WB1: Monday 2025-11-10 → start=2025-11-10, end=2025-11-16", () => {
    const result = _weekBounds(new Date(Date.UTC(2025, 10, 10)))
    expect(result.start).toBe("2025-11-10")
    expect(result.end).toBe("2025-11-16")
  })

  it("WB2: Sunday 2025-11-09 → start=2025-11-03 (previous Monday)", () => {
    const result = _weekBounds(new Date(Date.UTC(2025, 10, 9)))
    expect(result.start).toBe("2025-11-03")
    expect(result.end).toBe("2025-11-09")
  })
})

// ── R10: _daysUntilPayday unit tests ─────────────────────────────────────────
// Captured from Flask's _days_until_payday via /tmp/capture_r10_fixtures.py 2026-05-10.
// Includes normal case and Feb clamp (paydayDay=31 → clamped to Feb 28).

describe("_daysUntilPayday (R10 helper) — Flask-captured fixtures", () => {
  it("PD1: today=2025-11-10, paydayDay=25 → 15", () => {
    expect(_daysUntilPayday(new Date(Date.UTC(2025, 10, 10)), 25)).toBe(15)
  })

  it("PD2: today=2025-02-15, paydayDay=31 (Feb clamp → Feb 28) → 13", () => {
    expect(_daysUntilPayday(new Date(Date.UTC(2025, 1, 15)), 31)).toBe(13)
  })
})

// ── R10: weekly-digest route integration test ─────────────────────────────────
// today=2025-11-12 (Wednesday): weekStart=2025-11-10, weekEnd=2025-11-16,
// effectiveEnd=2025-11-12, daysObserved=3. cacheGet returns cached safe-to-spend
// (cache hit) so no _buildSafeToSpendPayload DB calls needed.
// DB sequences: thisWeekExpense, lastWeekExpense, topCategories (3), profile (1).

describe("GET /api/analytics/weekly-digest", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(cacheSet).mockResolvedValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/weekly-digest")
    expect(res.status).toBe(401)
  })

  it("R10: full weekly-digest — Flask-helper-verified arithmetic", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(
      new Date(Date.UTC(2025, 10, 12)), // 2025-11-12 Wednesday
    )
    // cache hit for safe-to-spend → daily_rate_kd="40.250"
    vi.mocked(cacheGet).mockResolvedValue(JSON.stringify({ daily_rate_kd: "40.250" }))
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "150.000" }],  // thisWeekExpense: Nov 10–12
        [{ total: "100.000" }],  // lastWeekExpense: Nov 03–09
        [                        // top 3 categories this week
          { name: "Food", total: "80.000" },
          { name: "Transport", total: "70.000" },
        ],
        [{ paydayDay: 25 }],     // profile: paydayDay=25 → days_until_payday=13
      ]),
    )
    const res = await app.request("/api/analytics/weekly-digest", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.week_start).toBe("2025-11-10")
    expect(data.week_end).toBe("2025-11-16")
    expect(data.this_week_expense_kd).toBe("150.000")
    expect(data.last_week_expense_kd).toBe("100.000")
    expect(data.delta_pct).toBe(50.0)           // (150-100)/100*100 = 50.0 — Flask-captured
    expect(data.top_categories).toEqual([
      { name: "Food", amount_kd: "80.000" },
      { name: "Transport", amount_kd: "70.000" },
    ])
    expect(data.days_until_payday).toBe(13)     // 25-12=13 — Flask-captured
    expect(data.safe_to_spend_today_kd).toBe("40.250")
    expect(data.days_observed).toBe(3)          // Nov 10–12 inclusive
    expect((body.meta as Record<string, unknown>).count).toBe(2)
  })

  it("CacheBackendUnavailableError → 503 analytics_cache_unavailable", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation(() => {
      throw new CacheBackendUnavailableError()
    })
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/weekly-digest", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_cache_unavailable")
  })
})

// ── R8: dashboard-bundle route tests ─────────────────────────────────────────
// Sequential-then-parallel: cacheGet returns cached safe-to-spend (hit), then
// buildBudgetPayload is mocked, leaving only _buildAccountOverviewPayload (6 queries)
// and _snapshotComputedAt (1 query) to consume DB sequences. Interleave order in
// Promise.all is deterministic (debt_summary removed from the bundle in SC-1/2):
//   sequences[0] → accountOverview Q1 (spendMtd)
//   sequences[1] → snapshotComputedAt Q1
//   sequences[2–6] → accountOverview Q2–Q6

describe("GET /api/analytics/dashboard-bundle", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(cacheSet).mockResolvedValue(true)
  })
  afterEach(() => vi.restoreAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/dashboard-bundle")
    expect(res.status).toBe(401)
  })

  // B2-1 (10d zod month conversion).
  it("B2-1: malformed month → 400 byte-identical no-period string", async () => {
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-bundle?month=2024-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("month must be in YYYY-MM format")
    expect(body.code).toBe("validation_error")
  })

  it("B2-1: absent month uses hand-rolled default → 200 (D2 split)", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(
      new Date(Date.UTC(2026, 4, 10)), // 2026-05-10 → currentMonth="2026-05"
    )
    vi.mocked(cacheGet).mockResolvedValue(JSON.stringify({ daily_rate_kd: "40.250" }))
    vi.mocked(buildBudgetPayload).mockResolvedValue({
      month: "2026-05",
      items: [],
      profile_context: {
        budget_total_kd: "0.000",
        monthly_income_kd: "0.000",
        income_source: "not_set",
        budget_to_income_pct: null,
        payday_day: 25,
      },
    })
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "500.000" }],
        [{ computedAt: new Date("2026-05-09T10:00:00.000Z") }],
        [{ total: "2000.000" }],
        [{ count: "5" }],
        [{ total: "300.000" }],
        [{ category: "Food", total: "500.000" }],
        [{ ym: "2026-05", incomeTotal: "2000.000", spendTotal: "500.000" }],
      ]),
    )
    const res = await app.request("/api/analytics/dashboard-bundle", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
  })

  it("R8: happy path — shape + key field assertions", async () => {
    vi.spyOn(analyticsHelpers, "currentLocalDate").mockReturnValue(
      new Date(Date.UTC(2026, 4, 10)), // 2026-05-10 → currentMonth="2026-05"
    )
    // cache hit for safe-to-spend
    vi.mocked(cacheGet).mockResolvedValue(JSON.stringify({ daily_rate_kd: "40.250" }))
    vi.mocked(buildBudgetPayload).mockResolvedValue({
      month: "2026-05",
      items: [{ id: 1, month: "2026-05", category: "Food", amount_kd: "300.000" }],
      profile_context: {
        budget_total_kd: "300.000",
        monthly_income_kd: "2000.000",
        income_source: "declared_in_profile",
        budget_to_income_pct: "15.0",
        payday_day: 25,
      },
    })
    // DB sequences for _buildAccountOverviewPayload (Q1–Q6) + _snapshotComputedAt (Q1),
    // interleaved in Promise.all resolution order.
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ total: "500.000" }],   // accountOverview Q1: total expense MTD
        [{ computedAt: new Date("2026-05-09T10:00:00.000Z") }], // snapshotComputedAt
        [{ total: "2000.000" }],  // accountOverview Q2: total income MTD
        [{ count: "5" }],         // accountOverview Q3: manual count MTD
        [{ total: "300.000" }],   // accountOverview Q4: manual spend MTD
        [{ category: "Food", total: "500.000" }], // accountOverview Q5: top cats
        [{ ym: "2026-05", incomeTotal: "2000.000", spendTotal: "500.000" }], // Q6: trend
      ]),
    )
    // Pin the month explicitly — the fixtures above are all 2026-05, and a
    // no-param request defaults to currentMonthKey() (wall-clock dependent). See
    // the "default month (no param)" test above for the currentMonthKey() case.
    const res = await app.request("/api/analytics/dashboard-bundle?month=2026-05", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.month).toBe("2026-05")
    expect(data.snapshot_computed_at).toBe("2026-05-09T10:00:00+00:00")
    expect((data.safe_to_spend as Record<string, unknown>).daily_rate_kd).toBe("40.250")
    expect(data.budget_alerts).toEqual({ month: "2026-05", items: [] })
    expect((data.account_overview as Record<string, unknown>).total_spend_mtd).toBe("500.000")
    expect(body.meta).toEqual({ budget_count: 1, alert_count: 0 })
  })

  it("CacheBackendUnavailableError → 503 analytics_cache_unavailable", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation(() => {
      throw new CacheBackendUnavailableError()
    })
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-bundle", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_cache_unavailable")
  })

  it("AnalyticsComputationTimeoutError → 503 analytics_timeout", async () => {
    vi.mocked(withAnalyticsTimeout).mockImplementation(() => {
      throw new AnalyticsComputationTimeoutError()
    })
    vi.mocked(getDb).mockReturnValue(makeDbReturning([]))
    const res = await app.request("/api/analytics/dashboard-bundle", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_timeout")
  })
})
