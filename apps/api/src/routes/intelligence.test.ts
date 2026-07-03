/**
 * Tests for intelligence routes: R11 income-pattern (5c-1), R12 recurring-patterns (5c-2),
 * R13 snapshot (5c-3).
 *
 * Route tests focus on auth, envelope shape, and error handling.
 * Algorithm correctness is covered by intelligence-lib.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Hono } from "hono"
import { intelligenceRouter } from "./intelligence"
import { createSessionToken } from "../middleware/auth"
import { env } from "../lib/env"
import { readJson } from "../test/json"

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))

vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

vi.mock("../lib/analytics-cache", () => {
  class AnalyticsComputationTimeoutError extends Error {
    constructor(msg = "") {
      super(msg)
      this.name = "AnalyticsComputationTimeoutError"
    }
  }
  return {
    withAnalyticsTimeout: vi.fn((_db: unknown, _sec: unknown, fn: () => Promise<unknown>) => fn()),
    AnalyticsComputationTimeoutError,
  }
})
import { withAnalyticsTimeout, AnalyticsComputationTimeoutError } from "../lib/analytics-cache"

vi.mock("../lib/intelligence-lib", () => ({
  buildIncomePatternPayload: vi.fn(),
  buildRecurringPatternsPayload: vi.fn(),
  buildSnapshotPayload: vi.fn(),
}))
import { buildIncomePatternPayload, buildRecurringPatternsPayload, buildSnapshotPayload } from "../lib/intelligence-lib"

const app = new Hono().route("/api/analytics", intelligenceRouter)

async function authHeader(userId = 1): Promise<string> {
  const token = await createSessionToken({ userId, externalId: "test-ext", authProvider: "test", sv: 1 })
  return `Bearer ${token}`
}

// ── R11: income-pattern ───────────────────────────────────────────────────────

describe("GET /api/analytics/income-pattern", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Re-establish after resetAllMocks (which clears vi.fn(impl) implementations).
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _sec, fn) => fn())
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/income-pattern")
    expect(res.status).toBe(401)
  })

  it("returns income pattern payload in ok envelope", async () => {
    vi.mocked(buildIncomePatternPayload).mockResolvedValue({
      detected: true,
      monthly_income_kd: "1000.000",
      income_source: "detected_from_transactions",
      income_auto_detected: true,
      suggested_monthly_income_kd: "1000.000",
      suggested_payday_day: 1,
      confidence: "high",
      evidence_months: 3,
      largest_income_name: "Salary",
    })

    const res = await app.request("/api/analytics/income-pattern", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.error).toBeNull()
    expect(body.meta).toEqual({})
    expect(body.data.detected).toBe(true)
    expect(body.data.monthly_income_kd).toBe("1000.000")
    expect(body.data.income_source).toBe("detected_from_transactions")
    expect(body.data.confidence).toBe("high")
    expect(body.data.evidence_months).toBe(3)
    expect(body.data.largest_income_name).toBe("Salary")
  })

  it("returns 503 on AnalyticsComputationTimeoutError", async () => {
    vi.mocked(withAnalyticsTimeout).mockRejectedValue(
      new AnalyticsComputationTimeoutError("timed out"),
    )

    const res = await app.request("/api/analytics/income-pattern", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("analytics_timeout")
  })

  it("not_set income_source is returned as string (Hono deviation from Flask null)", async () => {
    vi.mocked(buildIncomePatternPayload).mockResolvedValue({
      detected: false,
      monthly_income_kd: null,
      income_source: "not_set",
      income_auto_detected: false,
      suggested_monthly_income_kd: null,
      suggested_payday_day: null,
      confidence: "low",
      evidence_months: 0,
      largest_income_name: null,
    })

    const res = await app.request("/api/analytics/income-pattern", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.data.income_source).toBe("not_set")
  })
})

// ── R12: recurring-patterns ───────────────────────────────────────────────────

describe("GET /api/analytics/recurring-patterns", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _sec, fn) => fn())
    ;(env as Record<string, unknown>).enableRecurringPatterns = true
  })

  afterEach(() => {
    ;(env as Record<string, unknown>).enableRecurringPatterns = true
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/recurring-patterns")
    expect(res.status).toBe(401)
  })

  it("returns patterns in ok envelope with count and days meta", async () => {
    vi.mocked(buildRecurringPatternsPayload).mockResolvedValue({
      patterns: [
        {
          name: "Netflix",
          frequency: "monthly",
          avg_amount_kd: "15.000",
          last_seen: "2025-11-01",
          confidence: "high",
          occurrences: 3,
          group: "Subscriptions",
        },
      ],
    })

    const res = await app.request("/api/analytics/recurring-patterns", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.error).toBeNull()
    expect(body.data.patterns).toHaveLength(1)
    expect(body.data.patterns[0].name).toBe("Netflix")
    expect(body.meta.count).toBe(1)
    expect(body.meta.days).toBe(90)
  })

  it("returns 503 on AnalyticsComputationTimeoutError", async () => {
    vi.mocked(withAnalyticsTimeout).mockRejectedValue(
      new AnalyticsComputationTimeoutError("timed out"),
    )

    const res = await app.request("/api/analytics/recurring-patterns", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("analytics_timeout")
  })

  it("returns empty patterns when feature flag is disabled", async () => {
    ;(env as Record<string, unknown>).enableRecurringPatterns = false

    const res = await app.request("/api/analytics/recurring-patterns", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.data.patterns).toEqual([])
    expect(body.meta.count).toBe(0)
    expect(body.meta.enabled).toBe(false)
  })

  it("returns 400 for days out of range", async () => {
    const res = await app.request("/api/analytics/recurring-patterns?days=29", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.error).toBe("days must be between 30 and 365")
    expect(body.code).toBe("validation_error")
  })
})

// ── R13: snapshot ─────────────────────────────────────────────────────────────

describe("GET /api/analytics/snapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withAnalyticsTimeout).mockImplementation((_db, _sec, fn) => fn())
  })

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/analytics/snapshot")
    expect(res.status).toBe(401)
  })

  it("returns snapshot payload in ok envelope with correct field forwarding", async () => {
    vi.mocked(buildSnapshotPayload).mockResolvedValue({
      net_position: {
        income_total_kd: "500.000",
        expense_total_kd: "175.000",
        net_kd: "325.000",
        total_debt_kd: "200.000",
        total_savings_kd: "150.000",
      },
      cash_flow: {
        "30d": { income_kd: "500.000", expense_kd: "100.000", net_kd: "400.000" },
        "60d": { income_kd: "500.000", expense_kd: "150.000", net_kd: "350.000" },
        "90d": { income_kd: "500.000", expense_kd: "175.000", net_kd: "325.000" },
      },
      accounts: [],
      generated_at: "2025-11-10T12:00:00.000+00:00",
    })

    const res = await app.request("/api/analytics/snapshot", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.error).toBeNull()
    expect(body.meta).toEqual({})
    expect(body.data.net_position.income_total_kd).toBe("500.000")
    expect(body.data.cash_flow["30d"].expense_kd).toBe("100.000")
    expect(body.data.accounts).toEqual([])
  })

  it("returns 503 on AnalyticsComputationTimeoutError", async () => {
    vi.mocked(withAnalyticsTimeout).mockRejectedValue(
      new AnalyticsComputationTimeoutError("timed out"),
    )

    const res = await app.request("/api/analytics/snapshot", {
      headers: { Authorization: await authHeader() },
    })
    expect(res.status).toBe(503)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("analytics_timeout")
  })
})
