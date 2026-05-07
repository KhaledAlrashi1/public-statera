import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"

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

// Rate-limit middleware: pass-through in tests
vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/transactions", transactionsRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test" })
  return `Bearer ${token}`
}

// ── GET /api/transactions/:id ─────────────────────────────────────────────────

describe("GET /api/transactions/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/transactions/1")
    expect(res.status).toBe(401)
  })

  it("returns 400 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/abc", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
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
    expect(item.amountKd).toBe("3.500")
    expect(item.category).toBe("Food")
    expect(item.source).toBe("manual")
    expect(item.sourceLabel).toBe("Manual")
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

  it("returns 400 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/transactions/abc", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Coffee" }),
    })
    expect(res.status).toBe(400)
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
