import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"
import { merchantsRouter } from "./merchants"
import { createSessionToken } from "../middleware/auth"
import { RedisMock } from "../test/redis-mock.setup"

// ── DB mock (same Proxy pattern as categories.test.ts) ────────────────────────

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
  // Capture the proxy so the transaction callback receives the same proxy as tx.
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

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/merchants", merchantsRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/merchants", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/merchants")
    expect(res.status).toBe(401)
  })

  it("returns 200 with empty items list", async () => {
    const res = await app.request("/api/merchants", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).items).toEqual([])
  })
})

describe("POST /api/merchants", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/merchants", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when name is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when name exceeds 128 characters", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X".repeat(129) }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 409 merchant_name_exists with existing item on duplicate", async () => {
    const existing = { id: 3, userId: 1, name: "Starbucks" }
    vi.mocked(getDb).mockReturnValue(makeMockDb([existing]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "starbucks" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("merchant_name_exists")
    expect((body.existing_item as Record<string, unknown>).id).toBe(3)
    expect((body.existing_item as Record<string, unknown>).name).toBe("Starbucks")
  })

  it("returns 201 with created merchant on success", async () => {
    const created = { id: 99, userId: 1, name: "Costa" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: any) => cb(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([]) // duplicate check → none
            if (callCount === 2) return makeChain([{ id: 99 }]) // $returningId
            return makeChain([created]) // select after insert
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/merchants", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Costa" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).item).toBeDefined()
  })
})

describe("PATCH /api/merchants/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/merchants/1", { method: "PATCH" })
    expect(res.status).toBe(401)
  })

  it("returns 400 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants/abc", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when merchant not found or wrong user", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants/999", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 409 when new name is taken by a different merchant", async () => {
    const existing = { id: 5, userId: 1, name: "Original" }
    const conflicting = { id: 9, userId: 1, name: "AlreadyExists" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: any) => cb(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([existing]) // fetch merchant by id
            return makeChain([conflicting]) // duplicate name check
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/merchants/5", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "AlreadyExists" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("merchant_name_exists")
  })
})

describe("DELETE /api/merchants/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/merchants/5", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when merchant not found or wrong user", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 409 has_dependents when dependents exist and reassign_to is absent", async () => {
    const merchant = { id: 5, userId: 1, name: "Costco" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: any) => cb(proxy)
          return (..._args: unknown[]) => {
            callCount++
            return makeChain(callCount === 1 ? [merchant] : [{ count: 2 }])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/merchants/5", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("has_dependents")
    expect(body.dependent_counts).toBeDefined()
  })

  it("returns 200 deleted:true when no dependents", async () => {
    const merchant = { id: 5, userId: 1, name: "Costco" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: any) => cb(proxy)
          return (..._args: unknown[]) => {
            callCount++
            return makeChain(callCount === 1 ? [merchant] : [{ count: 0 }])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/merchants/5", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted).toBe(true)
  })
})

describe("POST /api/merchants/:id/remap", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/merchants/5/remap", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when source and target are the same", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants/5/remap", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: 5 }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 404 when source not found or wrong user", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/merchants/999/remap", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: 1 }),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("not_found")
  })
})

// ── Rate limiting ─────────────────────────────────────────────────────────────
// The base ioredis stub's evalsha returns [1, 60000] ("first hit"), so the real
// createRateLimiter never trips. Spy evalsha to report an over-limit totalHits and
// assert writeRateLimit (30/min) on POST short-circuits with the standard 429
// envelope BEFORE the handler runs (getDb untouched).
describe("POST /api/merchants — rate limit", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns 429 with the standard envelope and never reaches the handler", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    vi.mocked(getDb).mockClear()
    vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])

    const res = await app.request("/api/merchants", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Lulu" }),
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.code).toBe("rate_limit_exceeded")
    expect(getDb).not.toHaveBeenCalled()
  })
})
