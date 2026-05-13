import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { memorizedRouter } from "./memorized"
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

// Rate-limit: pass-through
vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// Sentry: no-op in tests
vi.mock("../lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/memorized-transactions", memorizedRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

const baseRow = {
  id: 7,
  canonical: "Starbucks Coffee",
  count: 3,
  lastSeen: new Date("2026-04-15T10:00:00Z"),
  isPinned: false,
  pinnedAt: null,
  categoryId: 1,
  merchantId: 2,
  categoryName: "Food",
  merchantName: "Starbucks",
}

// ── GET /api/memorized-transactions ──────────────────────────────────────────

describe("GET /api/memorized-transactions", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions")
    expect(res.status).toBe(401)
  })

  it("returns 200 with items and meta", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ count: 1 }]) // total count
            return makeChain([baseRow])                             // data rows
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(Array.isArray(data.items)).toBe(true)
    const meta = body.meta as Record<string, unknown>
    expect(meta.total).toBe(1)
  })

  it("serializes last_seen in Flask timestamp format (no millis, +00:00)", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ count: 1 }])
            return makeChain([baseRow])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const items = (body.data as Record<string, unknown>).items as Record<string, unknown>[]
    expect(items[0].last_seen).toBe("2026-04-15T10:00:00+00:00")
  })

  it("returns 200 with empty items when none exist", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ count: 0 }])
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).items).toEqual([])
    expect((body.meta as Record<string, unknown>).total).toBe(0)
  })
})

// ── POST /api/memorized-transactions ─────────────────────────────────────────

describe("POST /api/memorized-transactions", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when canonical is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 when category name not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))  // category lookup returns empty
    const res = await app.request("/api/memorized-transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Coffee", category: "Foood" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("not_found")
    expect(String(body.error)).toContain("Foood")
  })

  it("returns 201 on new insert", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])          // prune delete
            if (callCount === 2) return makeChain([])          // check existing by norm
            if (callCount === 3) return makeChain([{ id: 99 }]) // insert $returningId
            return makeChain([baseRow])                         // fetchMemorizedRow
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Starbucks Coffee" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).item).toBeDefined()
  })

  it("returns 200 on update of existing row", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])       // prune delete
            if (callCount === 2) return makeChain([baseRow]) // check existing by norm
            if (callCount === 3) return makeChain([])        // update
            return makeChain([baseRow])                      // fetchMemorizedRow
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Starbucks Coffee" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
  })
})

// ── PATCH /api/memorized-transactions/:id ────────────────────────────────────

describe("PATCH /api/memorized-transactions/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions/1", { method: "PATCH" })
    expect(res.status).toBe(401)
  })

  it("returns 404 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions/abc", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Coffee" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions/999", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Coffee" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when canonical is empty", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseRow]))
    const res = await app.request("/api/memorized-transactions/7", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when category name not found", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseRow]) // fetch existing
            return makeChain([])                             // category lookup returns empty
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions/7", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Coffee", category: "Typo" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("not_found")
  })

  it("returns 200 on successful update", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseRow]) // fetch existing
            if (callCount === 2) return makeChain([])        // update
            return makeChain([baseRow])                      // fetchMemorizedRow
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions/7", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ canonical: "Starbucks Coffee" }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true)
  })
})

// ── DELETE /api/memorized-transactions/:id ────────────────────────────────────

describe("DELETE /api/memorized-transactions/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions/1", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with deleted:true", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 7 }]) // select owned
            return makeChain([])                                // delete
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions/7", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect((body.data as Record<string, unknown>).deleted).toBe(true)
  })
})

// ── POST /api/memorized-transactions/:id/pin ─────────────────────────────────

describe("POST /api/memorized-transactions/:id/pin", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions/1/pin", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions/999/pin", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with item after pin", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 7 }])  // ownership check
            if (callCount === 2) return makeChain([])            // update
            return makeChain([{ ...baseRow, isPinned: true, pinnedAt: new Date("2026-04-15T10:00:00Z") }])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions/7/pin", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const item = (body.data as Record<string, unknown>).item as Record<string, unknown>
    expect(item.is_pinned).toBe(true)
  })
})

// ── POST /api/memorized-transactions/bulk-delete ─────────────────────────────

describe("POST /api/memorized-transactions/bulk-delete", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/memorized-transactions/bulk-delete", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when ids is empty", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/memorized-transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when ids exceeds 200", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const ids = Array.from({ length: 201 }, (_, i) => i + 1)
    const res = await app.request("/api/memorized-transactions/bulk-delete", {
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
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([{ id: 1 }, { id: 2 }]) // select owned
            return makeChain([])                                             // delete
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })
    const res = await app.request("/api/memorized-transactions/bulk-delete", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [1, 2, 999] }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).data).toMatchObject({ deleted: 2 })
  })
})
