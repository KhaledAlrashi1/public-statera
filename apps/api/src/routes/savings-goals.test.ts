import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { savingsGoalsRouter } from "./savings-goals"
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

vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── Test app ──────────────────────────────────────────────────────────────────

const app = new Hono().route("/api/savings-goals", savingsGoalsRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

const baseGoal = {
  id: 1,
  userId: 1,
  name: "Emergency Fund",
  goalType: "emergency_fund",
  targetKd: "1000.000",
  currentKd: "500.000",
  targetDate: "2027-01-01",
  linkedCategoryId: null,
  isActive: true,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

// ── GET /api/savings-goals ────────────────────────────────────────────────────

describe("GET /api/savings-goals", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals")
    expect(res.status).toBe(401)
  })

  it("returns 200 with goals list", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])   // list SELECT
            return makeChain([])                                   // goalProjection: product_events
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(Array.isArray(data.goals)).toBe(true)
    expect((body.meta as Record<string, unknown>).count).toBe(1)
  })

  it("serializes target_kd as string with 3 decimal places", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const goals = (body.data as Record<string, unknown>).goals as Array<Record<string, unknown>>
    expect(goals[0].target_kd).toBe("1000.000")
    expect(goals[0].current_kd).toBe("500.000")
  })

  it("serializes created_at in Flask timestamp format (+00:00)", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const goals = (body.data as Record<string, unknown>).goals as Array<Record<string, unknown>>
    expect(goals[0].created_at).toBe("2026-01-01T00:00:00+00:00")
  })

  it("goal includes projection object", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals", {
      headers: { Authorization: await authHeader() },
    })
    const body = (await res.json()) as Record<string, unknown>
    const goals = (body.data as Record<string, unknown>).goals as Array<Record<string, unknown>>
    const proj = goals[0].projection as Record<string, unknown>
    expect(typeof proj.on_track).toBe("boolean")
    expect(typeof proj.current_pace_monthly).toBe("string")
  })
})

// ── GET /api/savings-goals/:id/projection ────────────────────────────────────

describe("GET /api/savings-goals/:id/projection", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals/1/projection")
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals/999/projection", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with projection", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal]) // SELECT goal
            return makeChain([])                               // product_events
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1/projection", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.projection).toBeDefined()
  })
})

// ── POST /api/savings-goals ───────────────────────────────────────────────────

describe("POST /api/savings-goals", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when target_kd is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fund" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 400 for zero target_kd", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fund", target_kd: "0.000" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when current_kd exceeds target_kd", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fund", target_kd: "100.000", current_kd: "200.000" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for past target_date", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fund", target_kd: "500.000", target_date: "2020-01-01" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 201 with goal and projection on success", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])           // resolveLinkedCategoryId: no category
            if (callCount === 2) {
              const chain = makeChain([baseGoal])
              ;(chain as Record<string, unknown>)["$returningId"] = () => Promise.resolve([{ id: 1 }])
              return chain
            }
            if (callCount === 3) return makeChain([baseGoal])   // SELECT created
            return makeChain([])                                  // product_events
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Emergency Fund",
        goal_type: "emergency_fund",
        target_kd: "1000.000",
        current_kd: "500.000",
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const goal = (body.data as Record<string, unknown>).goal as Record<string, unknown>
    expect(goal.target_kd).toBe("1000.000")
    expect(goal.projection).toBeDefined()
  })
})

// ── PATCH /api/savings-goals/:id ─────────────────────────────────────────────

describe("PATCH /api/savings-goals/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals/1", { method: "PATCH" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals/999", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when current_kd would exceed target_kd", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([baseGoal]))
    const res = await app.request("/api/savings-goals/1", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ current_kd: "9999.000" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 on successful patch", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])                              // fetch existing
            if (callCount === 2) return makeChain([])                                       // UPDATE
            if (callCount === 3) return makeChain([{ ...baseGoal, name: "Updated Fund" }]) // SELECT updated
            return makeChain([])                                                             // product_events
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Fund" }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true)
  })

  it("accepts same past target_date without error (existing_date bypass)", async () => {
    // goal already has targetDate "2026-01-01" which is in the past.
    // PATCH with the same value should succeed.
    const pastGoal = { ...baseGoal, targetDate: "2026-01-01" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([pastGoal])
            if (callCount === 2) return makeChain([])
            if (callCount === 3) return makeChain([pastGoal])
            return makeChain([])
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1", {
      method: "PATCH",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_date: "2026-01-01" }),
    })
    expect(res.status).toBe(200)
  })
})

// ── POST /api/savings-goals/:id/deposit ──────────────────────────────────────

describe("POST /api/savings-goals/:id/deposit", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals/1/deposit", { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("returns 400 when amount_kd is missing", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 404 when goal not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals/999/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(404)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("not_found")
  })

  it("returns 409 goal_inactive when goal is inactive", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ ...baseGoal, isActive: false }]))
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("goal_inactive")
  })

  it("returns 409 goal_fully_funded when current >= target", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ ...baseGoal, currentKd: "1000.000", targetKd: "1000.000" }]))
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("goal_fully_funded")
  })

  it("returns 400 validation_error when deposit would exceed target", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ ...baseGoal, currentKd: "990.000", targetKd: "1000.000" }]))
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("validation_error")
  })

  it("returns 200 with updated goal on successful deposit", async () => {
    const updatedGoal = { ...baseGoal, currentKd: "550.000" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])      // pre-flight SELECT
            if (callCount === 2) return makeChain([])               // conditional UPDATE
            if (callCount === 3) return makeChain([updatedGoal])    // SELECT after update
            if (callCount === 4) return makeChain([])               // recordProductEvent: INSERT
            return makeChain([])                                     // product_events / milestone checks
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    const goal = (body.data as Record<string, unknown>).goal as Record<string, unknown>
    expect(goal.current_kd).toBe("550.000")
  })

  it("returns 409 goal_deposit_conflict on race (UPDATE did not apply)", async () => {
    // After the pre-flight passes, the post-update SELECT shows unexpected currentKd
    // (race condition — another request mutated the row before our UPDATE)
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])               // pre-flight: 500.000
            if (callCount === 2) return makeChain([])                        // conditional UPDATE (0 rows)
            return makeChain([{ ...baseGoal, currentKd: "500.000" }])       // post-update still 500 → conflict
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(409)
    expect(((await res.json()) as Record<string, unknown>).code).toBe("goal_deposit_conflict")
  })

  it("milestone event is recorded when 50% threshold is crossed", async () => {
    // current=450 → deposit 50 → new current=500 = 50% of target=1000
    const preGoal = { ...baseGoal, currentKd: "450.000", targetKd: "1000.000" }
    const postGoal = { ...baseGoal, currentKd: "500.000", targetKd: "1000.000" }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([preGoal])    // pre-flight SELECT
            if (callCount === 2) return makeChain([])            // conditional UPDATE
            if (callCount === 3) return makeChain([postGoal])   // SELECT after update
            if (callCount === 4) return makeChain([])            // recordProductEvent: INSERT deposit
            // milestone recordProductEventOnce: SELECT + INSERT
            if (callCount === 5) return makeChain([])            // milestone check: no existing event
            if (callCount === 6) return makeChain([])            // milestone INSERT
            return makeChain([])                                  // product_events projection
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1/deposit", {
      method: "POST",
      headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ amount_kd: "50.000" }),
    })
    expect(res.status).toBe(200)
  })
})

// ── DELETE /api/savings-goals/:id ────────────────────────────────────────────

describe("DELETE /api/savings-goals/:id", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/savings-goals/1", { method: "DELETE" })
    expect(res.status).toBe(401)
  })

  it("returns 404 when not found", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await app.request("/api/savings-goals/999", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with is_active:false (soft-delete)", async () => {
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      return new Proxy({}, {
        get(_t, prop: string) {
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([baseGoal])                             // fetch existing
            if (callCount === 2) return makeChain([])                                      // UPDATE is_active=false
            if (callCount === 3) return makeChain([{ ...baseGoal, isActive: false }])     // SELECT updated
            return makeChain([])                                                            // product_events
          }
        },
      }) as ReturnType<typeof getDb>
    })
    const res = await app.request("/api/savings-goals/1", {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const goal = (body.data as Record<string, unknown>).goal as Record<string, unknown>
    expect(goal.is_active).toBe(false)
  })
})
