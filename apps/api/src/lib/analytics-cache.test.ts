/**
 * Unit tests for analytics-cache.ts.
 *
 * Redis is injected via _setRedisFactoryForTest — no live instance needed.
 * Circuit state is reset between tests via resetAnalyticsCacheCircuitBreaker.
 * DB is injected via a minimal Proxy mock for withAnalyticsTimeout and
 * cacheBustDashboardMetrics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  CACHE_CIRCUIT_RESET_MS,
  CACHE_CIRCUIT_THRESHOLD,
  CacheBackendUnavailableError,
  AnalyticsComputationTimeoutError,
  _setRedisFactoryForTest,
  _testGetCircuitState,
  cacheDeletePattern,
  cacheGet,
  cacheSet,
  cacheBustSafeToSpend,
  dashboardMetricsCacheKey,
  getDashboardMetricsWithCache,
  resetAnalyticsCacheCircuitBreaker,
  safeToSpendCacheKey,
  withAnalyticsTimeout,
} from "./analytics-cache"

// ── Sentry mock ───────────────────────────────────────────────────────────────
vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── dashboard-snapshot-lib mock ───────────────────────────────────────────────
vi.mock("./dashboard-snapshot-lib", () => ({
  currentMonthKeyUtc: () => "2026-01",
  isSnapshotEligible: () => false,
  loadDashboardSnapshot: async () => null,
  persistDashboardSnapshot: async () => undefined,
  computeDashboardMetricsPayload: async () => ({
    months: ["2026-01"],
    monthly: [{ month: "2026-01", income_kd: "100.000", expense_kd: "50.000" }],
    expense_by_category: { "2026-01": { Food: "50.000" } },
    cycle_enabled: false,
    cycle_start: null,
    cycle_end: null,
  }),
}))

// ── DB mock ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(opts?: { executeResult?: unknown; deleteResult?: unknown }): any {
  const executeResult = opts?.executeResult ?? undefined
  const deleteResult = opts?.deleteResult ?? [{ affectedRows: 0 }]
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "execute") {
          return async () => executeResult
        }
        return (..._args: unknown[]) =>
          new Proxy(
            {},
            {
              get(_t2, prop2: string) {
                if (prop2 === "then") {
                  return (
                    resolve: (v: unknown) => unknown,
                    reject: (e: unknown) => unknown,
                  ) => Promise.resolve(deleteResult).then(resolve, reject)
                }
                return (..._inner: unknown[]) => makeDb(opts)
              },
            },
          )
      },
    },
  )
}

// ── Redis mock builder ────────────────────────────────────────────────────────

type RedisMock = {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  scan: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
}

function makeRedisMock(overrides: Partial<RedisMock> = {}): RedisMock {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

// ── Test setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  resetAnalyticsCacheCircuitBreaker()
  _setRedisFactoryForTest(null)
})

afterEach(() => {
  resetAnalyticsCacheCircuitBreaker()
  _setRedisFactoryForTest(null)
})

// ── Cache key builders ────────────────────────────────────────────────────────

describe("dashboardMetricsCacheKey", () => {
  it("includes userId, months, and empty string when until is null", () => {
    expect(dashboardMetricsCacheKey(1, 24, null)).toBe("dashboard_metrics:1:24:")
  })

  it("includes until when provided", () => {
    expect(dashboardMetricsCacheKey(42, 12, "2026-01")).toBe("dashboard_metrics:42:12:2026-01")
  })
})

describe("safeToSpendCacheKey", () => {
  it("includes userId and month", () => {
    expect(safeToSpendCacheKey(7, "2026-01")).toBe("safe_to_spend:7:2026-01")
  })
})

// ── cacheGet — no Redis client ────────────────────────────────────────────────

describe("cacheGet — no Redis configured", () => {
  it("returns null when factory returns null", async () => {
    _setRedisFactoryForTest(() => null)
    const result = await cacheGet("some-key")
    expect(result).toBeNull()
  })
})

// ── cacheGet — happy path ─────────────────────────────────────────────────────

describe("cacheGet — happy path", () => {
  it("returns the cached value", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockResolvedValue("cached-value") })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const result = await cacheGet("test-key")
    expect(result).toBe("cached-value")
    expect(redis.get).toHaveBeenCalledWith("test-key")
  })

  it("returns null when Redis returns null", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockResolvedValue(null) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const result = await cacheGet("missing-key")
    expect(result).toBeNull()
  })
})

// ── cacheGet — Redis error increments failure counter ─────────────────────────

describe("cacheGet — Redis error handling", () => {
  it("returns null on error (fail-open, hardFail=false)", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("connection refused")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const result = await cacheGet("key")
    expect(result).toBeNull()
    expect(_testGetCircuitState().failures).toBe(1)
  })

  it("throws CacheBackendUnavailableError on error when hardFail=true", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("timeout")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    await expect(cacheGet("key", { hardFail: true })).rejects.toBeInstanceOf(
      CacheBackendUnavailableError,
    )
  })
})

// ── cacheSet — happy path ─────────────────────────────────────────────────────

describe("cacheSet — happy path", () => {
  it("calls SET EX and returns true", async () => {
    const redis = makeRedisMock()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const result = await cacheSet("k", "v", 60)
    expect(result).toBe(true)
    expect(redis.set).toHaveBeenCalledWith("k", "v", "EX", 60)
  })

  it("clamps TTL to minimum 1 second", async () => {
    const redis = makeRedisMock()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    await cacheSet("k", "v", 0)
    expect(redis.set).toHaveBeenCalledWith("k", "v", "EX", 1)
  })

  it("returns false when factory returns null", async () => {
    _setRedisFactoryForTest(() => null)
    const result = await cacheSet("k", "v", 60)
    expect(result).toBe(false)
  })
})

// ── cacheDeletePattern ────────────────────────────────────────────────────────

describe("cacheDeletePattern", () => {
  it("returns 0 when no keys match", async () => {
    const redis = makeRedisMock({ scan: vi.fn().mockResolvedValue(["0", []]) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const deleted = await cacheDeletePattern("prefix:*")
    expect(deleted).toBe(0)
  })

  it("deletes all matched keys and returns count", async () => {
    const redis = makeRedisMock({
      scan: vi.fn().mockResolvedValue(["0", ["k1", "k2"]]),
      del: vi.fn().mockResolvedValue(2),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const deleted = await cacheDeletePattern("prefix:*")
    expect(deleted).toBe(2)
    expect(redis.del).toHaveBeenCalledWith("k1", "k2")
  })

  it("iterates multiple SCAN pages", async () => {
    const redis = makeRedisMock({
      scan: vi
        .fn()
        .mockResolvedValueOnce(["42", ["a"]])
        .mockResolvedValueOnce(["0", ["b"]]),
      del: vi.fn().mockResolvedValue(1),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    const deleted = await cacheDeletePattern("x:*")
    expect(deleted).toBe(2)
    expect(redis.scan).toHaveBeenCalledTimes(2)
  })
})

// ── Circuit breaker — threshold and open window ───────────────────────────────

describe("circuit breaker — threshold", () => {
  it("opens circuit after CACHE_CIRCUIT_THRESHOLD consecutive failures", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("err")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    for (let i = 0; i < CACHE_CIRCUIT_THRESHOLD; i++) {
      await cacheGet("k")
    }

    const state = _testGetCircuitState()
    expect(state.failures).toBe(CACHE_CIRCUIT_THRESHOLD)
    expect(state.openUntil).toBeGreaterThan(Date.now())
  })

  it("blocks further calls when circuit is open (returns null, Redis not called)", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("err")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    // Trip the circuit
    for (let i = 0; i < CACHE_CIRCUIT_THRESHOLD; i++) {
      await cacheGet("k")
    }
    const callCountAfterTrip = redis.get.mock.calls.length

    // Next call should be blocked
    const result = await cacheGet("k")
    expect(result).toBeNull()
    expect(redis.get.mock.calls.length).toBe(callCountAfterTrip)
  })

  it("resets failures to 0 on success", async () => {
    const redis = makeRedisMock({
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error("err"))
        .mockResolvedValue("ok"),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    await cacheGet("k") // fail → failures = 1
    expect(_testGetCircuitState().failures).toBe(1)

    await cacheGet("k") // success → failures = 0
    expect(_testGetCircuitState().failures).toBe(0)
    expect(_testGetCircuitState().openUntil).toBe(0)
  })
})

// ── Circuit breaker — half-open probe semantics (Addition 2) ─────────────────

describe("circuit breaker — half-open probe semantics", () => {
  it("probe succeeds: counter resets to 0, circuit closed", async () => {
    const redis = makeRedisMock({
      get: vi
        .fn()
        .mockRejectedValue(new Error("err")),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    // Trip the circuit
    for (let i = 0; i < CACHE_CIRCUIT_THRESHOLD; i++) {
      await cacheGet("k")
    }
    expect(_testGetCircuitState().openUntil).toBeGreaterThan(0)

    // Simulate reset window elapsed by setting openUntil in the past
    // Use fake timer manipulation: override Date.now so reset window appears elapsed
    const originalNow = Date.now
    // Set time past the reset window
    vi.spyOn(Date, "now").mockReturnValue(originalNow() + CACHE_CIRCUIT_RESET_MS + 1000)

    // Swap to a working Redis
    const goodRedis = makeRedisMock({ get: vi.fn().mockResolvedValue("value") })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => goodRedis as any)

    const result = await cacheGet("k")
    expect(result).toBe("value")
    expect(_testGetCircuitState().failures).toBe(0)
    expect(_testGetCircuitState().openUntil).toBe(0)

    vi.restoreAllMocks()
  })

  it("probe fails: counter = 1 (not re-opened immediately, 1 < threshold)", async () => {
    const redis = makeRedisMock({
      get: vi.fn().mockRejectedValue(new Error("err")),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    // Trip the circuit
    for (let i = 0; i < CACHE_CIRCUIT_THRESHOLD; i++) {
      await cacheGet("k")
    }
    const openUntilBeforeProbe = _testGetCircuitState().openUntil
    expect(openUntilBeforeProbe).toBeGreaterThan(0)

    // Simulate reset window elapsed
    vi.spyOn(Date, "now").mockReturnValue(openUntilBeforeProbe + 1000)

    // Probe fails — still the same failing Redis
    await cacheGet("k")

    const state = _testGetCircuitState()
    expect(state.failures).toBe(1) // reset from THRESHOLD to 0, then incremented to 1
    // 1 < CACHE_CIRCUIT_THRESHOLD (3), so circuit is NOT open yet
    expect(state.openUntil).toBe(0)

    vi.restoreAllMocks()
  })
})

// ── Analytics hard-fail breaker ───────────────────────────────────────────────

describe("analytics hard-fail breaker", () => {
  it("throws immediately when analytics breaker is open (hardFail=true)", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("err")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    // Trip the analytics breaker by calling hardFail=true on Redis error
    await expect(cacheGet("k", { hardFail: true })).rejects.toBeInstanceOf(
      CacheBackendUnavailableError,
    )

    // The analytics breaker is now open; subsequent hardFail calls throw immediately
    const goodRedis = makeRedisMock({ get: vi.fn().mockResolvedValue("ok") })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => goodRedis as any)
    await expect(cacheGet("k", { hardFail: true })).rejects.toBeInstanceOf(
      CacheBackendUnavailableError,
    )
    // Good Redis was never actually called
    expect(goodRedis.get).not.toHaveBeenCalled()
  })

  it("does not affect non-hardFail callers when analytics breaker is open", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("err")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    // Trip the analytics breaker
    await expect(cacheGet("k", { hardFail: true })).rejects.toBeInstanceOf(
      CacheBackendUnavailableError,
    )

    // softFail caller should still return null (not throw)
    // Circuit may or may not be open, but should not throw
    const result = await cacheGet("k") // hardFail defaults false
    expect(result).toBeNull()
  })
})

// ── withAnalyticsTimeout ──────────────────────────────────────────────────────

describe("withAnalyticsTimeout", () => {
  it("resolves with the fn result", async () => {
    const db = makeDb()
    const result = await withAnalyticsTimeout(db, 10, async () => "ok")
    expect(result).toBe("ok")
  })

  it("wraps errno 3024 as AnalyticsComputationTimeoutError", async () => {
    const db = makeDb()
    const mysqlTimeout = Object.assign(new Error("Query execution was interrupted"), { errno: 3024 })
    await expect(withAnalyticsTimeout(db, 10, async () => { throw mysqlTimeout })).rejects.toBeInstanceOf(
      AnalyticsComputationTimeoutError,
    )
  })

  it("wraps timeout message without errno as AnalyticsComputationTimeoutError", async () => {
    const db = makeDb()
    const msgTimeout = new Error("Query execution was interrupted (max_statement_time exceeded)")
    await expect(withAnalyticsTimeout(db, 10, async () => { throw msgTimeout })).rejects.toBeInstanceOf(
      AnalyticsComputationTimeoutError,
    )
  })

  it("re-throws non-timeout errors unchanged", async () => {
    const db = makeDb()
    const other = new Error("some other db error")
    await expect(withAnalyticsTimeout(db, 10, async () => { throw other })).rejects.toBe(other)
  })

  it("resets max_execution_time to 0 in finally even on error", async () => {
    const executeCalls: unknown[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = { execute: async (stmt: unknown) => { executeCalls.push(stmt) } }
    const err = new Error("kaboom")
    await expect(withAnalyticsTimeout(db, 5, async () => { throw err })).rejects.toBe(err)
    expect(executeCalls).toHaveLength(2) // SET SESSION ... and reset to 0
  })
})

// ── cacheBustSafeToSpend ──────────────────────────────────────────────────────

describe("cacheBustSafeToSpend", () => {
  it("returns 0 when no keys exist", async () => {
    _setRedisFactoryForTest(() => null)
    const deleted = await cacheBustSafeToSpend(1)
    expect(deleted).toBe(0)
  })
})

// ── getDashboardMetricsWithCache — cache miss path ────────────────────────────

describe("getDashboardMetricsWithCache — cache miss path", () => {
  it("returns computed payload with cacheStatus=miss when Redis and snapshot both miss", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockResolvedValue(null) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    const { payload, cacheStatus } = await getDashboardMetricsWithCache(1, makeDb(), {
      months: 24,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
      hardFail: false,
    })

    expect(cacheStatus).toBe("miss")
    expect(payload.months).toEqual(["2026-01"])
    expect(payload.monthly[0].income_kd).toBe("100.000")
  })
})

// ── getDashboardMetricsWithCache — cache hit path ─────────────────────────────

describe("getDashboardMetricsWithCache — cache hit path", () => {
  it("returns cached payload with cacheStatus=hit", async () => {
    const cachedPayload = {
      months: ["2025-12", "2026-01"],
      monthly: [
        { month: "2025-12", income_kd: "200.000", expense_kd: "100.000" },
        { month: "2026-01", income_kd: "300.000", expense_kd: "150.000" },
      ],
      expense_by_category: {},
      cycle_enabled: false,
      cycle_start: null,
      cycle_end: null,
    }
    const redis = makeRedisMock({ get: vi.fn().mockResolvedValue(JSON.stringify(cachedPayload)) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    const { payload, cacheStatus } = await getDashboardMetricsWithCache(1, makeDb(), {
      months: 24,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })

    expect(cacheStatus).toBe("hit")
    expect(payload.monthly[0].income_kd).toBe("200.000")
  })

  it("falls through corrupt cache entry to miss", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockResolvedValue("not-json{{") })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)

    const { cacheStatus } = await getDashboardMetricsWithCache(1, makeDb(), {
      months: 24,
      endYear: 2026,
      endMonth: 1,
      cycleEnabled: false,
    })

    expect(cacheStatus).toBe("miss")
  })
})

// ── resetAnalyticsCacheCircuitBreaker ─────────────────────────────────────────

describe("resetAnalyticsCacheCircuitBreaker", () => {
  it("resets all circuit state to zero", async () => {
    const redis = makeRedisMock({ get: vi.fn().mockRejectedValue(new Error("err")) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setRedisFactoryForTest(() => redis as any)
    for (let i = 0; i < CACHE_CIRCUIT_THRESHOLD; i++) {
      await cacheGet("k")
    }
    expect(_testGetCircuitState().failures).toBeGreaterThan(0)

    resetAnalyticsCacheCircuitBreaker()
    expect(_testGetCircuitState().failures).toBe(0)
    expect(_testGetCircuitState().openUntil).toBe(0)
  })
})
