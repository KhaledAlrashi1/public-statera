import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { debtRouter } from "./debt"
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
          return async (cb: (tx: any) => Promise<unknown>) => cb(makeMockDb(defaultResult))
        }
        return (..._args: unknown[]) => makeChain(defaultResult)
      },
    },
  ) as ReturnType<typeof getDb>
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/debt-accounts", debtRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

const baseAccount = {
  id: 1,
  name: "Visa",
  debtType: "credit_card",
  balanceKd: "500.000",
  minimumPaymentKd: "25.000",
  aprPct: "18.000",
  dueDay: 15,
  isActive: true,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

// ── GET /api/debt-accounts ────────────────────────────────────────────────────

describe("GET /api/debt-accounts", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts")
    expect(res.status).toBe(401)
  })

  it("returns 200 with accounts list", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseAccount]))
    const res = await app.request("/api/debt-accounts", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(Array.isArray(data.accounts)).toBe(true)
    expect((body.meta as Record<string, unknown>).count).toBe(1)
  })

  it("serializes balance_kd as string with 3 decimal places", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseAccount]))
    const res = await app.request("/api/debt-accounts", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const accounts = (body.data as Record<string, unknown>).accounts as Array<Record<string, unknown>>
    expect(accounts[0].balance_kd).toBe("500.000")
    expect(accounts[0].apr_pct).toBe("18.000")
  })

  it("serializes created_at in Flask timestamp format (+00:00)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseAccount]))
    const res = await app.request("/api/debt-accounts", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const accounts = (body.data as Record<string, unknown>).accounts as Array<Record<string, unknown>>
    expect(accounts[0].created_at).toBe("2026-01-01T00:00:00+00:00")
  })
})

// ── GET /api/debt-accounts/summary ───────────────────────────────────────────

describe("GET /api/debt-accounts/summary", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts/summary")
    expect(res.status).toBe(401)
  })

  it("returns 200 with aggregated totals as strings", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ totalBalance: "1500.000", totalMinimum: "75.000", accountCount: 3 }]))
    const res = await app.request("/api/debt-accounts/summary", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.total_balance_kd).toBe("1500.000")
    expect(data.total_minimum_kd).toBe("75.000")
    expect(data.account_count).toBe(3)
  })
})

// ── GET /api/debt-accounts/payoff-plan ───────────────────────────────────────

describe("GET /api/debt-accounts/payoff-plan", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts/payoff-plan")
    expect(res.status).toBe(401)
  })

  it("returns 400 when monthly_payment is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts/payoff-plan", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 with PAYMENT_TOO_LOW when below minimum", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([
      { id: 1, name: "Visa", balanceKd: "500.000", aprPct: "18.000", minimumPaymentKd: "50.000" },
    ]))
    const res = await app.request("/api/debt-accounts/payoff-plan?monthly_payment=10.000", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("PAYMENT_TOO_LOW")
  })

  it("returns 200 with avalanche and snowball plans", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([
      { id: 1, name: "Visa", balanceKd: "500.000", aprPct: "18.000", minimumPaymentKd: "25.000" },
    ]))
    const res = await app.request("/api/debt-accounts/payoff-plan?monthly_payment=100.000", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.avalanche).toBeDefined()
    expect(data.snowball).toBeDefined()
    expect(data.minimum_required).toBe("25.000")
  })

  it("returns 200 with empty plans when no active debts", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts/payoff-plan?monthly_payment=100.000", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const data = ((await res.json()) as Record<string, unknown>).data as Record<string, unknown>
    expect((data.avalanche as Record<string, unknown>).total_months).toBe(0)
  })
})

// ── POST /api/debt-accounts ───────────────────────────────────────────────────

describe("POST /api/debt-accounts", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when name is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ debt_type: "credit_card", balance_kd: "100.000", minimum_payment_kd: "10.000" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 for invalid debt_type", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Visa", debt_type: "mortgage", balance_kd: "100.000", minimum_payment_kd: "10.000" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for negative balance", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Visa", balance_kd: "-100.000", minimum_payment_kd: "10.000" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 409 debt_name_conflict on duplicate name", async () => {
    const dupError = Object.assign(new Error("ER_DUP_ENTRY: Duplicate entry 'Visa' for key"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    })
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "$returningId") return () => Promise.reject(dupError)
          return (..._args: unknown[]) => ({
            $returningId: () => Promise.reject(dupError),
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
              Promise.reject(dupError).then(res, rej),
            values: () => ({ $returningId: () => Promise.reject(dupError) }),
          })
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/debt-accounts", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Visa", balance_kd: "500.000", minimum_payment_kd: "25.000" }),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("debt_name_conflict")
  })

  it("returns 201 with account on success", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 99 }])  // insert $returningId
            return makeChain([baseAccount])                        // select after insert
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/debt-accounts", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Visa", debt_type: "credit_card", balance_kd: "500.000", minimum_payment_kd: "25.000", apr_pct: "18.000" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const account = (body.data as Record<string, unknown>).account as Record<string, unknown>
    expect(account.balance_kd).toBe("500.000")
    expect(account.apr_pct).toBe("18.000")
  })
})

// ── PATCH /api/debt-accounts/:id ─────────────────────────────────────────────

describe("PATCH /api/debt-accounts/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts/1", { method: "PATCH" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts/999", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 on successful patch", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseAccount])  // fetch existing
            if (callCount === 2) return makeChain([])             // update
            return makeChain([{ ...baseAccount, name: "Updated Visa" }])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/debt-accounts/1", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Visa" }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true)
  })

  it("returns 400 for due_day out of range", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseAccount]))
    const res = await app.request("/api/debt-accounts/1", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ due_day: 32 }),
    })
    expect(res.status).toBe(400)
  })
})

// ── DELETE /api/debt-accounts/:id ─────────────────────────────────────────────

describe("DELETE /api/debt-accounts/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/debt-accounts/1", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/debt-accounts/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with is_active:false (soft-delete)", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseAccount])  // fetch existing
            if (callCount === 2) return makeChain([])             // update is_active=false
            return makeChain([{ ...baseAccount, isActive: false }])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/debt-accounts/1", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const account = (body.data as Record<string, unknown>).account as Record<string, unknown>
    expect(account.is_active).toBe(false)
  })
})
