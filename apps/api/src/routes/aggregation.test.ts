/**
 * Tests for aggregation routes: R1–R7 (5b-2), R3+R4 (5b-3a).
 *
 * Uses the flat self-referential proxy pattern (CLAUDE.md: "Drizzle proxy-mock
 * pattern") for single-query routes, and makeSequentialDb for R7/R4 which make
 * multiple sequential DB calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import Decimal from "decimal.js"
import { Hono } from "hono"
import { aggregationRouter } from "./aggregation"
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

vi.mock("../lib/savings-goals-lib", () => ({
  monthlyPaceFromDeposits: vi.fn(),
}))
import { monthlyPaceFromDeposits } from "../lib/savings-goals-lib"

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/analytics", aggregationRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test" })
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
// Fixtures F1–F5: computed from Flask's _build_safe_to_spend_payload arithmetic
// using fixed inputs and stable past month 2025-06 (today > cycle_end always,
// so days_elapsed=30, days_remaining=0, spend_window_end="2025-06-30").
//
// Capture methodology: inputs are substituted into Flask's formula
// (digest.py:113-219) symbolically; format_kd()/Decimal arithmetic verified by
// running backend/money_math.py directly. Results hardcoded below.

// F1: baseline — detected income, budget + debt set, no goals. data_complete=true, no warnings.
const FIXTURE_F1 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1500.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "500.000",
  debt_minimum_total_kd: "75.000",
  savings_goal_count: 0,
  savings_goal_unscheduled_count: 0,
  savings_goal_monthly_total_kd: "0.000",
  savings_goal_budget_covered_kd: "0.000",
  savings_goal_reserve_kd: "0.000",
  committed_kd: "575.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
    debt_minimums: "75.000",
    savings_goal_reserve: "0.000",
    savings_goal_budget_covered: "0.000",
  },
  actual_spend_kd: "120.000",
  remaining_budget_kd: "805.000",
  daily_rate_kd: "805.000",   // days_remaining=0 → div by max(0,1)=1
  data_complete: true,
  warnings: [],
} as const

// F2: income_not_set — no income transactions or profile income. data_complete=false.
const FIXTURE_F2 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: null,
  income_auto_detected: false,
  income_source: "not_set",
  total_budget_kd: "500.000",
  debt_minimum_total_kd: "75.000",
  savings_goal_count: 0,
  savings_goal_unscheduled_count: 0,
  savings_goal_monthly_total_kd: "0.000",
  savings_goal_budget_covered_kd: "0.000",
  savings_goal_reserve_kd: "0.000",
  committed_kd: "575.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
    debt_minimums: "75.000",
    savings_goal_reserve: "0.000",
    savings_goal_budget_covered: "0.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "0.000",
  daily_rate_kd: "0.000",
  data_complete: false,
  warnings: ["income_not_set"],
} as const

// F3: budgets_not_set — income declared in profile, no budgets for month. data_complete=false.
const FIXTURE_F3 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1200.000",
  income_auto_detected: false,
  income_source: "declared_in_profile",
  total_budget_kd: "0.000",
  debt_minimum_total_kd: "75.000",
  savings_goal_count: 0,
  savings_goal_unscheduled_count: 0,
  savings_goal_monthly_total_kd: "0.000",
  savings_goal_budget_covered_kd: "0.000",
  savings_goal_reserve_kd: "0.000",
  committed_kd: "75.000",
  committed_breakdown_kd: {
    budget_allocations: "0.000",
    debt_minimums: "75.000",
    savings_goal_reserve: "0.000",
    savings_goal_budget_covered: "0.000",
  },
  actual_spend_kd: "0.000",
  remaining_budget_kd: "1125.000",
  daily_rate_kd: "1125.000",
  data_complete: false,
  warnings: ["budgets_not_set"],
} as const

// F4: commitments_over_40pct_cap — income=1000, committed=450 (45%>40%). data_complete=true.
// Arithmetic check: 350+100=450 > 40%*1000=400 → cap triggered.
const FIXTURE_F4 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1000.000",
  income_auto_detected: true,
  income_source: "detected_from_transactions",
  total_budget_kd: "350.000",
  debt_minimum_total_kd: "100.000",
  savings_goal_count: 0,
  savings_goal_unscheduled_count: 0,
  savings_goal_monthly_total_kd: "0.000",
  savings_goal_budget_covered_kd: "0.000",
  savings_goal_reserve_kd: "0.000",
  committed_kd: "450.000",
  committed_breakdown_kd: {
    budget_allocations: "350.000",
    debt_minimums: "100.000",
    savings_goal_reserve: "0.000",
    savings_goal_budget_covered: "0.000",
  },
  actual_spend_kd: "50.000",
  remaining_budget_kd: "500.000",
  daily_rate_kd: "500.000",
  data_complete: true,
  warnings: ["commitments_over_40pct_cap"],
} as const

// F5: debts_not_set_optional + savings_goals_unscheduled_optional.
// 1 active goal with no target_date and no deposit history → source="unscheduled", monthly=0.
// Mutual-exclusivity note: commitments_over_40pct_cap cannot appear here because
// income is set (income_not_set absent) and committed=500 < 40%*1500=600
// (commitmentsOverCap requires incomeForCalc.gt(0) AND committed.gt(40% income)).
// income_not_set cannot appear here because income is declared_in_profile.
// Therefore F5 is the only fixture that tests both optional warnings simultaneously
// without either of the two mutually-exclusive conditions triggering.
const FIXTURE_F5 = {
  month: "2025-06",
  cycle_start: "2025-06-01",
  cycle_end: "2025-06-30",
  days_elapsed: 30,
  days_remaining: 0,
  monthly_income_kd: "1500.000",
  income_auto_detected: false,
  income_source: "declared_in_profile",
  total_budget_kd: "500.000",
  debt_minimum_total_kd: "0.000",
  savings_goal_count: 1,
  savings_goal_unscheduled_count: 1,
  savings_goal_monthly_total_kd: "0.000",
  savings_goal_budget_covered_kd: "0.000",
  savings_goal_reserve_kd: "0.000",
  committed_kd: "500.000",
  committed_breakdown_kd: {
    budget_allocations: "500.000",
    debt_minimums: "0.000",
    savings_goal_reserve: "0.000",
    savings_goal_budget_covered: "0.000",
  },
  actual_spend_kd: "100.000",
  remaining_budget_kd: "900.000",
  daily_rate_kd: "900.000",
  data_complete: true,
  warnings: ["debts_not_set_optional", "savings_goals_unscheduled_optional"],
} as const

// Helper: sequential DB mock for R9 — covers budgets, savings_goals, debt, expense queries.
// Sequences assume resolveIncomeForPeriod and monthlyPaceFromDeposits are separately mocked.
function makeR9Db(
  budgetRows: unknown[],
  goalRows: unknown[],
  debtRows: unknown[],
  expenseRows: unknown[],
) {
  return makeSequentialDb([budgetRows, goalRows, debtRows, expenseRows])
}

describe("GET /api/analytics/safe-to-spend", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _seconds, fn) => fn())
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(cacheSet).mockResolvedValue(true)
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06")
    expect(res.status).toBe(401)
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
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
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
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("analytics_timeout")
  })

  // ── F1: baseline — detected income, budget+debt set, no goals ─────────────
  it("F1: baseline — full Hono response matches Flask-captured fixture", async () => {
    // Seed: income=1500 detected, budget=500, debt=75 (1 account), actual_spend=120
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "500.000", catName: "Groceries" }],      // budgets
        [],                                                   // savings goals (none)
        [{ total: "75.000", count: "1" }],                   // debt: 1 account
        [{ total: "120.000" }],                              // expense sum
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(FIXTURE_F1)
  })

  // ── F2: income_not_set ────────────────────────────────────────────────────
  it("F2: income_not_set — full Hono response matches Flask-captured fixture", async () => {
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({ amountKd: null, source: "not_set" })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "500.000", catName: "Groceries" }],
        [],
        [{ total: "75.000", count: "1" }],
        [{ total: "0.000" }],
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.data).toEqual(FIXTURE_F2)
  })

  // ── F3: budgets_not_set ───────────────────────────────────────────────────
  it("F3: budgets_not_set — full Hono response matches Flask-captured fixture", async () => {
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1200.000"),
      source: "declared_in_profile",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [],                                                   // no budgets
        [],
        [{ total: "75.000", count: "1" }],
        [{ total: "0.000" }],
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.data).toEqual(FIXTURE_F3)
  })

  // ── F4: commitments_over_40pct_cap ────────────────────────────────────────
  // Boundary: income=1000, committed=350+100=450, 40%*1000=400. 450>400 → cap.
  it("F4: commitments_over_40pct_cap — full Hono response matches Flask-captured fixture", async () => {
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1000.000"),
      source: "detected_from_transactions",
    })
    vi.mocked(getDb).mockReturnValue(
      makeR9Db(
        [{ amount: "350.000", catName: "Food" }],
        [],
        [{ total: "100.000", count: "1" }],
        [{ total: "50.000" }],
      ),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.data).toEqual(FIXTURE_F4)
  })

  // ── F5: debts_not_set_optional + savings_goals_unscheduled_optional ────────
  // 1 active goal, no target_date, no deposit history → pace=0 → source="unscheduled".
  // Mutual-exclusivity: commitments_over_40pct_cap absent (500 < 40%*1500=600);
  // income_not_set absent (income is declared_in_profile).
  it("F5: debts_not_set_optional + savings_goals_unscheduled_optional — full Hono response matches Flask-captured fixture", async () => {
    vi.mocked(resolveIncomeForPeriod).mockResolvedValue({
      amountKd: new Decimal("1500.000"),
      source: "declared_in_profile",
    })
    // monthlyPaceFromDeposits returns 0 → source="unscheduled"
    vi.mocked(monthlyPaceFromDeposits).mockResolvedValue(new Decimal("0"))
    vi.mocked(getDb).mockReturnValue(
      makeSequentialDb([
        [{ amount: "500.000", catName: "Groceries" }],       // budgets
        // goal row: no target_date, no linked category
        [{ id: 10, userId: 1, targetKd: "300.000", currentKd: "0.000", targetDate: null, catName: null }],
        [{ total: "0.000", count: "0" }],                    // debt: 0 accounts
        [{ total: "100.000" }],                              // expense sum
      ]),
    )
    const res = await app.request("/api/analytics/safe-to-spend?month=2025-06", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.data).toEqual(FIXTURE_F5)
  })
})
