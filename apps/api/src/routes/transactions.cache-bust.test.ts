// MOB-R63 C2 — a transaction write removes the VERSIONED R3 (dashboard_metrics:) and R9
// (safe_to_spend:) keys of that user, and leaves another user's. Real analytics-cache, real
// transactions route; an in-memory Redis whose SCAN honours MATCH the way Redis does, so a delete
// pattern that misses the version suffix leaves the key behind.
import { afterEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"
import { _setRedisFactoryForTest } from "../lib/analytics-cache"
import { versionedCacheKey } from "../lib/analytics-cache-version"

vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

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

// Glob for Redis MATCH: * is any run of characters, ? one character.
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`)
}

function memoryRedis(keys: string[]) {
  const store = new Set(keys)
  const redis = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
    scan: vi.fn(async (_cursor: string, _m: string, pattern: string) => {
      const re = globToRegExp(pattern)
      return ["0", [...store].filter((k) => re.test(k))]
    }),
    del: vi.fn(async (...ks: string[]) => {
      let n = 0
      for (const k of ks) if (store.delete(k)) n++
      return n
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _setRedisFactoryForTest(() => redis as any)
  return store
}

afterEach(() => _setRedisFactoryForTest(null))

describe("transaction write busts the versioned analytics keys (MOB-R63 C2)", () => {
  it("POST /api/transactions removes the user's versioned R3 and R9 keys and no one else's", async () => {
    const mine = [versionedCacheKey("dashboard_metrics:1:24:"), versionedCacheKey("safe_to_spend:1:2026-04")]
    const theirs = [versionedCacheKey("dashboard_metrics:2:24:"), versionedCacheKey("safe_to_spend:2:2026-04")]
    const store = memoryRedis([...mine, ...theirs])

    const created = {
      id: 99, date: new Date("2026-04-15T00:00:00Z"), name: "Coffee", memo: null, amountKd: "3.500",
      source: "manual", importBatchId: null, categoryId: null, merchantId: null, categoryName: null, merchantName: null,
    }
    let callCount = 0
    vi.mocked(getDb).mockImplementation(() => {
      const proxy: ReturnType<typeof getDb> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "transaction") return async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(proxy)
          return (..._args: unknown[]) => {
            callCount++
            if (callCount === 1) return makeChain([])
            if (callCount === 2) return makeChain([{ id: 1 }])
            if (callCount === 3) return makeChain([])
            if (callCount === 4) return makeChain([{ id: 99 }])
            return makeChain([created])
          }
        },
      }) as ReturnType<typeof getDb>
      return proxy
    })

    const token = await createSessionToken({ userId: 1, externalId: "test-ext", authProvider: "test", sv: 1 })
    const res = await new Hono().route("/api/transactions", transactionsRouter).request("/api/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-15", name: "Coffee", amount_kd: "3.500", category: "Food" }),
    })
    expect(res.status).toBe(201)
    expect(mine.filter((k) => store.has(k))).toEqual([])
    expect(theirs.filter((k) => store.has(k))).toEqual(theirs)
  })
})
