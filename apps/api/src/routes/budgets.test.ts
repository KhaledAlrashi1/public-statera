import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { budgetsRouter } from "./budgets"
import { createSessionToken } from "../middleware/auth"

// ── DB mock ───────────────────────────────────────────────────────────────────

function makeChain(result: unknown): object {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        if (prop === "$returningId") return () => Promise.resolve([{ id: 99 }])
        return (..._args: unknown[]) => makeChain(result)
      },
    },
  )
}

function makeMockDb(defaultResult: unknown = []): ReturnType<typeof getDb> {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "transaction") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (cb: (tx: any) => Promise<unknown>) =>
            cb(makeMockDb(defaultResult))
        }
        return (..._args: unknown[]) => makeChain(defaultResult)
      },
    },
  ) as ReturnType<typeof getDb>
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

vi.mock("../lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/budgets", budgetsRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

// ── GET /api/budgets/months ───────────────────────────────────────────────────

describe("GET /api/budgets/months", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/budgets/months")
    expect(res.status).toBe(401)
  })

  it("returns 200 with months array", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ month: "2026-04" }, { month: "2026-03" }]))
    const res = await app.request("/api/budgets/months", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).months).toEqual(["2026-04", "2026-03"])
  })

  it("returns empty months array when no budgets", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets/months", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).data).toMatchObject({ months: [] })
  })
})

// ── GET /api/budgets ──────────────────────────────────────────────────────────

describe("GET /api/budgets", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/budgets")
    expect(res.status).toBe(401)
  })

  it("returns 400 when month is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 for invalid month format", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets?month=2026-13", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 with budget payload including profile_context", async () => {
    const budgetRow = { id: 1, month: "2026-04", amountKd: "500.000", categoryName: "Food" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([budgetRow])          // budget rows
            if (callCount === 2) return makeChain([{ total: "2000.000" }]) // income from transactions
            if (callCount === 3) return makeChain([{ paydayDay: 25 }])  // profile for payday_day
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets?month=2026-04", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.month).toBe("2026-04")
    expect(Array.isArray(data.items)).toBe(true)
    const ctx = data.profile_context as Record<string, unknown>
    expect(ctx.budget_total_kd).toBe("500.000")
    expect(ctx.income_source).toBe("detected_from_transactions")
    expect(ctx.payday_day).toBe(25)
    // 500 / 2000 * 100 = 25.0
    expect(ctx.budget_to_income_pct).toBe("25.0")
  })

  it("profile_context has null pct when no income exists", async () => {
    const budgetRow = { id: 1, month: "2026-04", amountKd: "300.000", categoryName: "Food" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([budgetRow])           // budget rows
            if (callCount === 2) return makeChain([{ total: "0" }])      // income from transactions (none)
            if (callCount === 3) return makeChain([{ monthlyIncomeKd: null, paydayDay: null }]) // profile
            if (callCount === 4) return makeChain([{ paydayDay: null }]) // paydayDay query
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets?month=2026-04", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const ctx = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    const profileCtx = ctx.profile_context as Record<string, unknown>
    expect(profileCtx.monthly_income_kd).toBeNull()
    expect(profileCtx.budget_to_income_pct).toBeNull()
  })

  it("profile_context uses declared income fallback when no transactions", async () => {
    const budgetRow = { id: 1, month: "2026-04", amountKd: "400.000", categoryName: "Food" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([budgetRow])                              // budget rows
            if (callCount === 2) return makeChain([{ total: "0" }])                         // no income txns
            if (callCount === 3) return makeChain([{ monthlyIncomeKd: "1000.000", paydayDay: null }]) // profile with declared income
            if (callCount === 4) return makeChain([{ paydayDay: null }])                    // paydayDay query
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets?month=2026-04", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const ctx = (((await res.json()) as Record<string, unknown>).data as Record<string, unknown>).profile_context as Record<string, unknown>
    expect(ctx.income_source).toBe("declared_in_profile")
    expect(ctx.monthly_income_kd).toBe("1000.000")
    // 400 / 1000 * 100 = 40.0
    expect(ctx.budget_to_income_pct).toBe("40.0")
  })
})

// ── POST /api/budgets ─────────────────────────────────────────────────────────

describe("POST /api/budgets", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/budgets", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when month is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 for invalid month format", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ month: "April 2026", items: [] }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for duplicate category names (case-insensitive)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [
          { category: "Food", amount_kd: "100.000" },
          { category: "food", amount_kd: "50.000" },
        ],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("budget_duplicate_category")
    const meta = body.meta as Record<string, unknown>
    expect(Array.isArray(meta.duplicate_categories)).toBe(true)
  })

  it("returns 400 for duplicate with leading/trailing whitespace", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [
          { category: "Coffee", amount_kd: "100.000" },
          { category: "  Coffee  ", amount_kd: "50.000" },
        ],
      }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("budget_duplicate_category")
  })

  it("returns 400 when amount is invalid", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [{ category: "Food", amount_kd: "not-a-number" }],
      }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when amount exceeds 999999.999", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [{ category: "Food", amount_kd: "1000000.000" }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when amount is zero or negative", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [{ category: "Food", amount_kd: "0.000" }],
      }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 with payload on successful save", async () => {
    const budgetRow = { id: 1, month: "2026-04", amountKd: "200.000", categoryName: "Food" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (cb: (tx: any) => Promise<unknown>) => {
              let txCallCount = 0
              const tx: ReturnType<typeof getDb> = new Proxy({}, {
                get(_t2, prop2: string) {
                  return (..._args: unknown[]) => {
                    txCallCount++
                    if (txCallCount === 1) return makeChain([])            // delete
                    if (txCallCount === 2) return makeChain([])            // getOrCreateCategory: no existing
                    if (txCallCount === 3) return makeChain([{ id: 5 }])  // category insert $returningId
                    return makeChain([{ id: 1 }])                          // budgets insert $returningId
                  }
                },
              }) as ReturnType<typeof getDb>
              return cb(tx)
            }
          }
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])                    // first_budget_set check
            if (callCount === 2) return makeChain([])                    // budget_saved insert
            if (callCount === 3) return makeChain([])                    // first_budget_set insert
            if (callCount === 4) return makeChain([budgetRow])           // buildBudgetPayload: rows
            if (callCount === 5) return makeChain([{ total: "0" }])     // income txns
            if (callCount === 6) return makeChain([{ monthlyIncomeKd: null, paydayDay: null }]) // profile
            if (callCount === 7) return makeChain([{ paydayDay: null }]) // paydayDay
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        month: "2026-04",
        items: [{ category: "Food", amount_kd: "200.000" }],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).month).toBe("2026-04")
  })

  it("returns 200 with empty items when items array is empty (clears the month)", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (cb: (tx: any) => Promise<unknown>) => cb(makeMockDb([]))
          }
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])              // budget rows (now empty)
            if (callCount === 2) return makeChain([{ total: "0" }]) // income
            if (callCount === 3) return makeChain([])               // profile
            if (callCount === 4) return makeChain([])               // paydayDay
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ month: "2026-04", items: [] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).items).toEqual([])
  })

  it("amount assertions use string equality", async () => {
    const budgetRow = { id: 1, month: "2026-04", amountKd: "150.500", categoryName: "Food" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (cb: (tx: any) => Promise<unknown>) => {
              let txCallCount = 0
              const tx: ReturnType<typeof getDb> = new Proxy({}, {
                get(_t2) {
                  return (..._args: unknown[]) => {
                    txCallCount++
                    if (txCallCount === 1) return makeChain([])
                    if (txCallCount === 2) return makeChain([])
                    if (txCallCount === 3) return makeChain([{ id: 5 }])
                    return makeChain([{ id: 1 }])
                  }
                },
              }) as ReturnType<typeof getDb>
              return cb(tx)
            }
          }
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])             // recordProductEvent: insert
            if (callCount === 2) return makeChain([])             // recordProductEventOnce: check
            if (callCount === 3) return makeChain([])             // recordProductEventOnce: insert
            if (callCount === 4) return makeChain([budgetRow])    // buildBudgetPayload: rows
            if (callCount === 5) return makeChain([{ total: "0" }]) // income txns
            if (callCount === 6) return makeChain([])             // profile
            if (callCount === 7) return makeChain([])             // paydayDay
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/budgets", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ month: "2026-04", items: [{ category: "Food", amount_kd: "150.500" }] }),
    })
    const body = (await res.json()) as Record<string, unknown>
    const items = (body.data as Record<string, unknown>).items as Array<Record<string, unknown>>
    expect(items[0].amount_kd).toBe("150.500")
  })
})
