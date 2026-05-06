import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { categoriesRouter } from "./categories"
import { createSessionToken } from "../middleware/auth"

// ── DB mock ───────────────────────────────────────────────────────────────────
// A Proxy that makes any Drizzle query chain awaitable. Every method returns
// another Proxy with the same result; `then` resolves the chain.

function makeChain(result: unknown): object {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        // $returningId always resolves to [{ id: 99 }] so insert tests work
        if (prop === "$returningId") return () => Promise.resolve([{ id: 99 }])
        return (..._args: unknown[]) => makeChain(result)
      },
    },
  )
}

function makeMockDb(defaultResult: unknown = []): object {
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
  )
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/categories", categoriesRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test" })
  return `Bearer ${token}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/categories", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/categories")
    expect(res.status).toBe(401)
  })

  it("returns 200 with empty items when user has no categories", async () => {
    const res = await app.request("/api/categories", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).items).toEqual([])
  })
})

describe("POST /api/categories", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/categories", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when name is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when name exceeds 64 characters", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X".repeat(65) }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 409 category_name_exists with existing item when name is taken", async () => {
    const existingCat = { id: 7, userId: 1, name: "Food", isIncome: false, isSystem: false }
    // First query (duplicate check) returns the existing category
    vi.mocked(getDb).mockReturnValue(makeMockDb([existingCat]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "food" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("category_name_exists")
    expect((body.existing_item as Record<string, unknown>).id).toBe(7)
    expect((body.existing_item as Record<string, unknown>).name).toBe("Food")
  })

  it("returns 201 with created item on success", async () => {
    const createdCat = { id: 99, userId: 1, name: "Transport", isIncome: false, isSystem: false }
    // First query (duplicate check) returns empty, subsequent calls return the created cat
    const db = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: any) => cb(db)
          // insert.$returningId returns [{ id: 99 }]; everything else returns [createdCat]
          return (..._args: unknown[]) => {
            const chain = makeChain([createdCat])
            return new Proxy(chain, {
              get(t, p: string) {
                if (p === "$returningId") return () => Promise.resolve([{ id: 99 }])
                return Reflect.get(t, p)
              },
            })
          }
        },
      },
    )

    // Override first call (duplicate check) to return empty
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "transaction") return async (cb: any) => cb(this)
            return (..._args: unknown[]) => {
              callCount++
              if (callCount === 1) return makeChain([]) // duplicate check → no existing
              if (callCount === 2) return makeChain([{ id: 99 }]) // $returningId
              return makeChain([createdCat]) // select after insert
            }
          },
        },
      ) as ReturnType<typeof getDb>
    })

    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Transport" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect((body.data as Record<string, unknown>).item).toBeDefined()
  })
})

describe("DELETE /api/categories/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/categories/5", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 400 for non-integer id", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories/abc", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 404 when category not found or wrong user", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 403 when category is a system category", async () => {
    const sysCat = { id: 1, userId: 1, name: "Uncategorized", isIncome: false, isSystem: true }
    vi.mocked(getDb).mockReturnValue(makeMockDb([sysCat]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories/1", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("system_category_protected")
  })

  it("returns 409 has_dependents when dependents exist and reassign_to is absent", async () => {
    const cat = { id: 5, userId: 1, name: "Food", isIncome: false, isSystem: false }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() =>
      new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "transaction") return async (cb: any) => cb(this)
            return (..._args: unknown[]) => {
              callCount++
              // First select → category row; subsequent count queries return [{ count: 3 }]
              return makeChain(callCount === 1 ? [cat] : [{ count: 3 }])
            }
          },
        },
      ) as ReturnType<typeof getDb>,
    )

    const res = await app.request("/api/categories/5", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("has_dependents")
    expect(body.dependent_counts).toBeDefined()
  })
})

describe("POST /api/categories/:id/remap", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/api/categories/5/remap", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when source and target are the same", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]) as ReturnType<typeof getDb>)
    const res = await app.request("/api/categories/5/remap", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: 5 }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when source category is a system category", async () => {
    const sysCat = { id: 1, userId: 1, name: "Uncategorized", isIncome: false, isSystem: true }
    const targetCat = { id: 2, userId: 1, name: "Food", isIncome: false, isSystem: false }
    vi.mocked(getDb).mockReturnValue(
      makeMockDb([[sysCat], [targetCat]]) as ReturnType<typeof getDb>,
    )
    // Both parallel selects return from the same chain — mock returns the array with both
    // For this test, we just need source to be a system cat
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() =>
      new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "transaction") return async (cb: any) => cb(this)
            return (..._args: unknown[]) => {
              callCount++
              return makeChain(callCount % 2 === 1 ? [sysCat] : [targetCat])
            }
          },
        },
      ) as ReturnType<typeof getDb>,
    )
    const res = await app.request("/api/categories/1/remap", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: 2 }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("validation_error")
  })
})
