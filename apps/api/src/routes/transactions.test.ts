import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"

// Cache-bust and Sentry mocks — must be hoisted before transactionsRouter import.
vi.mock("../lib/analytics-cache", () => ({
  cacheBustDashboardMetrics: vi.fn().mockResolvedValue(0),
  cacheBustSafeToSpend: vi.fn().mockResolvedValue(0),
}))
vi.mock("../lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}))

// ── DB mock (same Proxy pattern as categories/merchants) ──────────────────────

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
  const proxy: ReturnType<typeof getDb> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "transaction") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (cb: (tx: any) => Promise<unknown>) => cb(proxy)
        }
        return (..._args: unknown[]) => makeChain(defaultResult)
      },
    },
  ) as ReturnType<typeof getDb>
  return proxy
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"
import { cacheBustDashboardMetrics } from "../lib/analytics-cache"
import { Sentry } from "../lib/sentry"

// Rate-limit middleware: pass-through in tests
vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/transactions", transactionsRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

// ── GET /api/transactions/:id ─────────────────────────────────────────────────

describe("GET /api/transactions/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/1")
    expect(res.status).toBe(401)
  })

  it("returns 404 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/abc", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 404 when transaction not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/999", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with item when found", async () => {
    const txn = {
      id: 5,
      date: new Date("2026-04-15T00:00:00Z"),
      name: "Coffee",
      memo: null,
      amountKd: "3.500",
      source: "manual",
      importBatchId: null,
      categoryId: 1,
      merchantId: null,
      categoryName: "Food",
      merchantName: null,
    }
    vi.mocked(getDb).mockReturnValue(makeMockDb([txn]))
    const res = await app.request("/api/transactions/5", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const item = (body.data as Record<string, unknown>).item as Record<string, unknown>
    expect(item.id).toBe(5)
    expect(item.name).toBe("Coffee")
    expect(item.amount_kd).toBe("3.500")
    expect(item.category).toBe("Food")
    expect(item.source).toBe("manual")
    expect(item.source_label).toBe("Manual")
  })
})

// ── POST /api/transactions ────────────────────────────────────────────────────

describe("POST /api/transactions", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when name is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", amount_kd: "10.000" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when date is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Coffee", amount_kd: "3.500" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when amount_kd is invalid", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", name: "Coffee", amount_kd: "abc" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 409 transaction_duplicate_conflict when duplicate exists and force=false", async () => {
    // First DB call (dup check) returns an existing row
    const existing = { id: 3 }
    vi.mocked(getDb).mockReturnValue(makeMockDb([existing]))
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", name: "Coffee", amount_kd: "3.500" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("transaction_duplicate_conflict")
    expect(body.duplicate).toBe(true)
  })

  it("returns 201 with item when created successfully", async () => {
    const created = {
      id: 99,
      date: new Date("2026-04-15T00:00:00Z"),
      name: "Coffee",
      memo: null,
      amountKd: "3.500",
      source: "manual",
      importBatchId: null,
      categoryId: null,
      merchantId: null,
      categoryName: null,
      merchantName: null,
    }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])          // category get (not found)
            if (callCount === 2) return makeChain([{ id: 1 }]) // category insert $returningId
            if (callCount === 3) return makeChain([])          // dup check (no dup)
            if (callCount === 4) return makeChain([{ id: 99 }]) // insert $returningId
            return makeChain([created])                         // select after insert
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", name: "Coffee", amount_kd: "3.500", category: "Food" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).item).toBeDefined()
  })
})

// ── PATCH /api/transactions/:id ───────────────────────────────────────────────

describe("PATCH /api/transactions/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/1", { method: "PATCH" })
    expect(res.status).toBe(401)
  })

  it("returns 404 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/abc", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Coffee" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 404 when transaction not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/999", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Coffee" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when name is provided empty in summary fields", async () => {
    const txn = {
      id: 5, date: new Date("2026-04-15"), name: "Coffee", memo: null,
      amountKd: "3.500", source: "manual", importBatchId: null,
      categoryId: null, merchantId: null,
    }
    vi.mocked(getDb).mockReturnValue(makeMockDb([txn]))
    const res = await app.request("/api/transactions/5", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", amount_kd: "3.500", category: "Food" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })
})

// ── DELETE /api/transactions/:id ──────────────────────────────────────────────

describe("DELETE /api/transactions/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/1", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 deleted:true when found", async () => {
    const txn = { id: 5 }
    vi.mocked(getDb).mockReturnValue(makeMockDb([txn]))
    const res = await app.request("/api/transactions/5", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted).toBe(true)
  })
})

// ── POST /api/transactions/:id/split ─────────────────────────────────────────

describe("POST /api/transactions/:id/split", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/5/split", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when transaction not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/999/split", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [
        { name: "A", amount_kd: "5.000" },
        { name: "B", amount_kd: "5.000" },
      ]}),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when fewer than 2 rows provided", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ id: 5, amountKd: "10.000", date: new Date(), source: "manual", merchantId: null, memo: null, categoryId: null }]))
    const res = await app.request("/api/transactions/5/split", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ name: "A", amount_kd: "10.000" }] }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when amounts do not sum to original", async () => {
    const txn = { id: 5, amountKd: "10.000", date: new Date("2026-04-15"), source: "manual", merchantId: null, memo: null, categoryId: null }
    vi.mocked(getDb).mockReturnValue(makeMockDb([txn]))
    const res = await app.request("/api/transactions/5/split", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [
        { name: "A", amount_kd: "3.000" },
        { name: "B", amount_kd: "4.000" },
      ]}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
    expect(String(body.error)).toContain("sum")
  })
})

// ── GET /api/transactions/summary ────────────────────────────────────────────

describe("GET /api/transactions/summary", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/summary")
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid month format", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 0 }]))
    const res = await app.request("/api/transactions/summary?month=not-a-month", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 200 with counts", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 5 }]))
    const res = await app.request("/api/transactions/summary?month=2026-04", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).month).toBe("2026-04")
  })
})

// ── GET /api/transactions/top-patterns ───────────────────────────────────────

describe("GET /api/transactions/top-patterns", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/top-patterns")
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid range", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/top-patterns?range=999", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 200 with items for valid range", async () => {
    const row = { nameKey: "coffee", name: "Coffee", count: 5, sumKd: "17.500" }
    vi.mocked(getDb).mockReturnValue(makeMockDb([row]))
    const res = await app.request("/api/transactions/top-patterns?range=30", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).range).toBe("30")
  })
})

// ── GET /api/transactions/search ──────────────────────────────────────────────

describe("GET /api/transactions/search", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/search")
    expect(res.status).toBe(401)
  })

  it("returns 400 when income_only and exclude_income are both true", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/search?income_only=true&exclude_income=true", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when date_from > date_to", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request(
      "/api/transactions/search?date_from=2026-04-30&date_to=2026-04-01",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("invalid_date_range")
  })

  it("returns 200 with items and meta", async () => {
    const txn = {
      id: 1, date: new Date("2026-04-15"), name: "Coffee", memo: null,
      amountKd: "3.500", source: "manual", importBatchId: null,
      categoryId: null, merchantId: null, categoryName: null, merchantName: null,
    }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ count: 1 }]) // total count
            return makeChain([txn])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/transactions/search", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(Array.isArray((body.data as Record<string, unknown>).items)).toBe(true)
    expect((body.meta as Record<string, unknown>).total).toBe(1)
  })
})

// ── B2-2 (10d zod adoption): read-query shape conversion ─────────────────────
// Message-identity, D3 first-fail ordering, and the P4 branch pins. Byte-identical
// wire strings; numeric coercion/defaults stay hand-rolled (D2).

describe("B2-2 zod conversion — /summary month", () => {
  it("B2-2: malformed month → 400 byte-identical string WITH period", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 0 }]))
    const res = await app.request("/api/transactions/summary?month=not-a-month", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("month must be in YYYY-MM format.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2 (flag-1 summary-month-looseness): accepts loose month '2024-99' → 200", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 0 }]))
    const res = await app.request("/api/transactions/summary?month=2024-99", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).month).toBe("2024-99")
  })
})

describe("B2-2 zod conversion — /top-patterns range (P4 both branches)", () => {
  it("B2-2 (P4): absent range defaults to '30' → 200", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/top-patterns", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).range).toBe("30")
  })

  it("B2-2 (P4): empty range '' → 400 (NOT defaulted), byte-identical message", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/top-patterns?range=", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("range must be one of: 30, 90, 365, all")
    expect(body.code).toBe("validation_error")
  })
})

describe("B2-2 zod conversion — /by-category (D3 ordering + P4)", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/by-category?category=Food")
    expect(res.status).toBe(401)
  })

  it("B2-2: missing category → 400 'category is required.'", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("category is required.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2 (P4): non-numeric limit → range message (not zod default)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category?category=Food&limit=abc", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("limit must be between 1 and 100.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2: offset negative → 400 'offset must be >= 0.'", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category?category=Food&offset=-1", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("offset must be >= 0.")
  })

  it("B2-2 (D3): missing category + bad limit → category-required wins (order)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category?limit=999", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("category is required.")
  })

  it("B2-2 (D3): bad limit + bad offset → limit wins (order)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category?category=Food&limit=999&offset=-1", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("limit must be between 1 and 100.")
  })

  it("B2-2: valid input passes validation → 200", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/by-category?category=Food", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
  })
})

describe("B2-2 zod conversion — /search (D3 ordering + D-B2-2-a)", () => {
  it("B2-2: income_only+exclude_income → 400 byte-identical message", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/search?income_only=true&exclude_income=true", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("income_only and exclude_income cannot both be true.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2 (P4): non-numeric limit → range message (not zod default)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/search?limit=abc", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("limit must be between 1 and 100.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2: bad date_from format → 400 byte-identical message", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/search?date_from=2026-4-1", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("date_from must be in YYYY-MM-DD format.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-2-P2(b): date_from>date_to only → code 'invalid_date_range', byte-identical", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request(
      "/api/transactions/search?date_from=2026-04-30&date_to=2026-04-01",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("date_from must be on or before date_to.")
    expect(body.code).toBe("invalid_date_range")
  })

  it("B2-2-P2(a): schema check + range check both fail → schema (limit) wins, NOT invalid_date_range", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request(
      "/api/transactions/search?limit=999&date_from=2026-04-30&date_to=2026-04-01",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("limit must be between 1 and 100.")
    expect(body.code).toBe("validation_error")
  })
})

// ── GET /api/transactions/dup-check ──────────────────────────────────────────

describe("GET /api/transactions/dup-check", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/dup-check")
    expect(res.status).toBe(401)
  })

  it("returns 400 when params missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/dup-check?date=2026-04-15", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 with count=0 when no duplicate", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 0 }]))
    const res = await app.request(
      "/api/transactions/dup-check?date=2026-04-15&name=Coffee&amount_kd=3.500",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).count).toBe(0)
  })

  it("returns 200 with count=1 when duplicate exists", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ count: 1 }]))
    const res = await app.request(
      "/api/transactions/dup-check?date=2026-04-15&name=Coffee&amount_kd=3.500",
      { headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).count).toBe(1)
  })
})

// ── POST /api/transactions/bulk-delete ───────────────────────────────────────

describe("POST /api/transactions/bulk-delete", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/bulk-delete", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when ids is missing or empty", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when ids exceeds 200", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const ids = Array.from({ length: 201 }, (_, i) => i + 1)
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 with deleted count", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 1 }, { id: 2 }]) // select owned rows
            return makeChain([])                                             // delete
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1, 2, 999] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted).toBe(2)
  })
})

// ── POST /api/transactions/bulk-update ───────────────────────────────────────

describe("POST /api/transactions/bulk-update", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/bulk-update", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when ids is empty", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [], changes: { category: "Food" } }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when changes is empty", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1], changes: {} }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when changes contains unknown field", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1], changes: { amount_kd: "5.000" } }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 200 with updated count", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])          // getOrCreateCategory: no existing
            if (callCount === 2) return makeChain([{ id: 7 }]) // category insert $returningId
            if (callCount === 3) return makeChain([{ id: 1 }, { id: 2 }]) // select owned ids
            return makeChain([])                                             // update
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1, 2], changes: { category: "Food" } }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).updated).toBe(2)
  })
})

// ── DELETE /api/transactions/import-batch/:batch_id ───────────────────────────

// ── B2-3 (10d zod adoption): bulk-op body shape — message-identity + D3 ────────

describe("B2-3 zod conversion — /bulk-delete + /bulk-update", () => {
  it("B2-3: bulk-delete empty ids → 400 byte-identical message", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("ids must be a non-empty list.")
    expect(body.code).toBe("validation_error")
  })

  it("B2-3: bulk-delete non-array ids → custom message (not zod default)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "nope" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("ids must be a non-empty list.")
  })

  it("B2-3 (D5): bulk-delete >200 ids → '…200 transactions at once.' (distinct from memorized)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const ids = Array.from({ length: 201 }, (_, i) => i + 1)
    const res = await app.request("/api/transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("Cannot delete more than 200 transactions at once.")
  })

  it("B2-3 (D3): bulk-update ids empty + changes empty → ids message wins (order)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [], changes: {} }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("ids must be a non-empty list.")
  })

  it("B2-3: bulk-update changes empty → 400 byte-identical message", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1], changes: {} }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("changes must be a non-empty object.")
  })

  it("B2-3: bulk-update unknown field → dynamic 'Unknown fields: …' message preserved", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/bulk-update", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1], changes: { amount_kd: "5.000" } }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).error).toBe("Unknown fields: amount_kd.")
  })
})

describe("DELETE /api/transactions/import-batch/:batch_id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request(
      "/api/transactions/import-batch/00000000-0000-0000-0000-000000000001",
      { method: "DELETE" },
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 for non-UUID batch_id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/import-batch/not-a-uuid", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("import_batch_not_found")
  })

  it("returns 404 when no transactions match the batch", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request(
      "/api/transactions/import-batch/00000000-0000-0000-0000-000000000001",
      { method: "DELETE", headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(404)
  })

  it("returns 200 with deleted_count when batch exists", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 10 }, { id: 11 }]) // select owned rows
            return makeChain([])                                               // delete
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request(
      "/api/transactions/import-batch/00000000-0000-0000-0000-000000000001",
      { method: "DELETE", headers: { Authorization: await authHeader() } },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted_count).toBe(2)
  })
})

// ── A3: cache-bust failure is non-fatal ───────────────────────────────────────

describe("POST /api/transactions — cache-bust failure is non-fatal", () => {
  beforeEach(() => {
    vi.mocked(cacheBustDashboardMetrics).mockResolvedValue(0)
    vi.mocked(Sentry.captureException).mockReset()
  })

  it("returns 201 and calls Sentry when cache bust throws", async () => {
    const bustError = new Error("Redis unavailable")
    vi.mocked(cacheBustDashboardMetrics).mockRejectedValueOnce(bustError)

    const created = {
      id: 99,
      date: new Date("2026-04-15T00:00:00Z"),
      name: "Coffee",
      memo: null,
      amountKd: "3.500",
      source: "manual",
      importBatchId: null,
      categoryId: null,
      merchantId: null,
      categoryName: null,
      merchantName: null,
    }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])            // category get (not found)
            if (callCount === 2) return makeChain([{ id: 1 }])  // category insert $returningId
            if (callCount === 3) return makeChain([])            // dup check (no dup)
            if (callCount === 4) return makeChain([{ id: 99 }]) // insert $returningId
            return makeChain([created])                          // select after insert
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })

    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", name: "Coffee", amount_kd: "3.500", category: "Food" }),
    })

    // Let fire-and-forget IIFE complete before asserting on Sentry
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(res.status).toBe(201)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      bustError,
      expect.objectContaining({
        tags: expect.objectContaining({ handler: "transactions.post.cacheBust" }),
      }),
    )
  })
})
