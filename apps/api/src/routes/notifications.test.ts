/**
 * Unit tests for notifications routes.
 *
 * Uses router.request() (Module 10f: was testClient, which typed the client as
 * `unknown` because notificationsRouter is a mutated Hono instance that carries no
 * RPC schema — TS18046). DB calls in listActiveBudgetAlerts and recordEvent are
 * mocked at the module level so no real DB is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readJson } from "../test/json"
import { RedisMock } from "../test/redis-mock.setup"

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 1 })
    await next()
  }),
}))
vi.mock("../lib/budget-alerts-lib", () => ({
  listActiveBudgetAlerts: vi.fn(),
  BUDGET_ALERT_DISMISSED_EVENT_NAME: "budget_alert_dismissed",
}))
vi.mock("../lib/product-events-lib", () => ({
  recordEvent: vi.fn().mockResolvedValue(true),
}))

import { notificationsRouter } from "./notifications"
import { listActiveBudgetAlerts } from "../lib/budget-alerts-lib"
import { recordEvent } from "../lib/product-events-lib"

function postDismiss(payload: unknown) {
  return notificationsRouter.request("/budget-alerts/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => { vi.clearAllMocks() })

// ── GET /budget-alerts ────────────────────────────────────────────────────────

describe("GET /budget-alerts — validation", () => {
  it("returns 400 when month is missing", async () => {
    const res = await notificationsRouter.request("/budget-alerts")
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when month format is invalid", async () => {
    const res = await notificationsRouter.request("/budget-alerts?month=26-5")
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.code).toBe("validation_error")
  })
})

describe("GET /budget-alerts — success", () => {
  it("returns active alert items for the requested month", async () => {
    const fakeItem = {
      id: 1,
      type: "budget_alert",
      alert_key: "2026-05:1",
      month: "2026-05",
      category: "Groceries",
      category_id: 1,
      budget_kd: "200.000",
      spent_kd: "190.000",
      ratio: 0.95,
      threshold: 0.9,
      created_at: "2026-05-10T09:00:00+00:00",
    }
    vi.mocked(listActiveBudgetAlerts).mockResolvedValue([fakeItem] as Parameters<typeof listActiveBudgetAlerts>[0] extends never ? never : Awaited<ReturnType<typeof listActiveBudgetAlerts>>)

    const res = await notificationsRouter.request("/budget-alerts?month=2026-05")
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.data.month).toBe("2026-05")
    expect(body.data.alert_count).toBe(1)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].alert_key).toBe("2026-05:1")
  })

  it("returns empty items when no alerts exist", async () => {
    vi.mocked(listActiveBudgetAlerts).mockResolvedValue([])
    const res = await notificationsRouter.request("/budget-alerts?month=2026-05")
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.data.alert_count).toBe(0)
    expect(body.data.items).toHaveLength(0)
  })
})

// ── POST /budget-alerts/dismiss ───────────────────────────────────────────────

describe("POST /budget-alerts/dismiss — validation", () => {
  it("returns 400 when alert_key is missing", async () => {
    const res = await postDismiss({})
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
  })
})

describe("POST /budget-alerts/dismiss — success", () => {
  it("records a budget_alert_dismissed event and returns dismissed: true", async () => {
    const res = await postDismiss({ alert_key: "2026-05:3" })
    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.data.dismissed).toBe(true)
    expect(recordEvent).toHaveBeenCalledWith(
      1,
      "budget_alert_dismissed",
      { alert_key: "2026-05:3" },
      undefined,
    )
  })
})

// ── Rate limiting ─────────────────────────────────────────────────────────────
// The base ioredis stub's evalsha returns [1, 60000] ("first hit"), so the real
// createRateLimiter never trips. Spy evalsha to report an over-limit totalHits and
// assert the writeRateLimit (30/min) on dismiss short-circuits with the standard
// 429 envelope BEFORE the handler runs (recordEvent untouched).
describe("POST /budget-alerts/dismiss — rate limit", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns 429 with the standard envelope and never reaches the handler", async () => {
    vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])

    const res = await postDismiss({ alert_key: "2026-05:3" })

    expect(res.status).toBe(429)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("rate_limit_exceeded")
    expect(recordEvent).not.toHaveBeenCalled()
  })
})
