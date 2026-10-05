// MOB-R55 P2 / MOB-R58 D1 / MOB-R56 KS1 — R4 account-overview: the month's expense total excludes
// savings-kind categories, total_savings_mtd carries them, and top_categories keeps a savings row
// with no share (pct null) while the expense shares are over the expense total.
import { describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { aggregationRouter } from "./aggregation"
import { createSessionToken } from "../middleware/auth"
import { readJson } from "../test/json"

// Each successive await resolves the next entry in sequences[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSequentialDb(sequences: unknown[][]): any {
  let callIndex = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxy(): any {
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
          return (..._args: unknown[]) => proxy()
        },
      },
    )
  }
  return proxy()
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

const app = new Hono().route("/api/analytics", aggregationRouter)

async function get(path: string) {
  const token = await createSessionToken({ userId: 1, externalId: "test-ext", authProvider: "test", sv: 1 })
  return app.request(path, { headers: { Authorization: `Bearer ${token}` } })
}

// The ruled month: income 100, expenses 40, savings 30.
function ruledMonthDb() {
  return makeSequentialDb([
    [{ total: "40.000", savings: "30.000" }], // Q1: month totals (expense, savings)
    [{ total: "100.000" }], // Q2: income
    [{ count: "3" }], // Q3: manual count
    [{ total: "40.000" }], // Q4: manual expense spend
    [
      { category: "Groceries", total: "40.000" },
      { category: "Savings & investing", total: "30.000" },
    ], // Q5: top categories
    [{ ym: "2026-05", incomeTotal: "100.000", spendTotal: "40.000" }], // Q6: trend
  ])
}

describe("GET /api/analytics/account-overview — savings (MOB-R58 D1)", () => {
  it("excludes savings from total_spend_mtd and reports it as total_savings_mtd", async () => {
    vi.mocked(getDb).mockReturnValue(ruledMonthDb())
    const res = await get("/api/analytics/account-overview?month=2026-05")
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.data.total_spend_mtd).toBe("40.000")
    expect(body.data.total_savings_mtd).toBe("30.000")
    expect(body.data.total_income_mtd).toBe("100.000")
  })

  it("keeps a savings row in top_categories with no share; expense shares are over expenses", async () => {
    vi.mocked(getDb).mockReturnValue(ruledMonthDb())
    const res = await get("/api/analytics/account-overview?month=2026-05")
    const body = await readJson(res)
    expect(body.data.top_categories).toEqual([
      { category: "Groceries", amount_kd: "40.000", pct: 100 },
      { category: "Savings & investing", amount_kd: "30.000", pct: null },
    ])
  })
})
