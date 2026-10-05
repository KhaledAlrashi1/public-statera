// MOB-R60 C3 — the Redis keys for R3 (dashboard_metrics:) and R9 (safe_to_spend:) carry the
// analytics cache version, so an entry computed under the old rule is never read. A fake Redis
// records every key the code asks for; each test serves a cached payload so no db work runs.
import { afterEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { _setRedisFactoryForTest, getDashboardMetricsWithCache } from "./analytics-cache"
import { aggregationRouter } from "../routes/aggregation"
import { createSessionToken } from "../middleware/auth"

vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(): any {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve([]).then(resolve, reject)
        }
        return (..._args: unknown[]) => makeDb()
      },
    },
  )
}

function fakeRedisServing(payload: unknown) {
  const keys: string[] = []
  const redis = {
    get: vi.fn(async (key: string) => {
      keys.push(key)
      return JSON.stringify(payload)
    }),
    set: vi.fn(async () => "OK"),
    scan: vi.fn(async () => ["0", []]),
    del: vi.fn(async () => 0),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _setRedisFactoryForTest(() => redis as any)
  return keys
}

afterEach(() => _setRedisFactoryForTest(null))

describe("analytics cache keys carry the version (MOB-R60 C3)", () => {
  it("R3 reads dashboard_metrics with the version suffix", async () => {
    const keys = fakeRedisServing({
      months: ["2026-01"],
      monthly: [{ month: "2026-01", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000" }],
      expense_by_category: {},
      cycle_enabled: false,
      cycle_start: null,
      cycle_end: null,
    })
    const { cacheStatus } = await getDashboardMetricsWithCache(1, makeDb(), {
      months: 24,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
      hardFail: false,
    })
    expect(cacheStatus).toBe("hit")
    expect(keys).toEqual(["dashboard_metrics:1:24::v2"])
  })

  it("R9 reads safe_to_spend with the version suffix", async () => {
    const keys = fakeRedisServing({ month: "2026-05", daily_rate_kd: "1.000" })
    vi.mocked(getDb).mockReturnValue(makeDb())
    const app = new Hono().route("/api/analytics", aggregationRouter)
    const token = await createSessionToken({ userId: 7, externalId: "test-ext", authProvider: "test", sv: 1 })
    const res = await app.request("/api/analytics/safe-to-spend?month=2026-05", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect(keys).toContain("safe_to_spend:7:2026-05:v2")
  })
})
