/**
 * Unit tests for notifications routes.
 *
 * Uses Hono's test client. DB calls in listActiveBudgetAlerts and recordEvent
 * are mocked at the module level so no real DB is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { testClient } from "hono/testing"

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

const client = testClient(notificationsRouter)

beforeEach(() => { vi.clearAllMocks() })

// ── GET /budget-alerts ────────────────────────────────────────────────────────

describe("GET /budget-alerts — validation", () => {
  it("returns 400 when month is missing", async () => {
    const res = await client["budget-alerts"].$get({ query: {} })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
  })

  it("returns 400 when month format is invalid", async () => {
    const res = await client["budget-alerts"].$get({ query: { month: "26-5" } })
    expect(res.status).toBe(400)
    const body = await res.json()
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

    const res = await client["budget-alerts"].$get({ query: { month: "2026-05" } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.month).toBe("2026-05")
    expect(body.data.alert_count).toBe(1)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].alert_key).toBe("2026-05:1")
  })

  it("returns empty items when no alerts exist", async () => {
    vi.mocked(listActiveBudgetAlerts).mockResolvedValue([])
    const res = await client["budget-alerts"].$get({ query: { month: "2026-05" } })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.alert_count).toBe(0)
    expect(body.data.items).toHaveLength(0)
  })
})

// ── POST /budget-alerts/dismiss ───────────────────────────────────────────────

describe("POST /budget-alerts/dismiss — validation", () => {
  it("returns 400 when alert_key is missing", async () => {
    // @ts-expect-error testing Hono route directly via fetch
    const res = await client["budget-alerts"]["dismiss"].$post({ json: {} })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
  })
})

describe("POST /budget-alerts/dismiss — success", () => {
  it("records a budget_alert_dismissed event and returns dismissed: true", async () => {
    // @ts-expect-error testing Hono route directly via fetch
    const res = await client["budget-alerts"]["dismiss"].$post({
      json: { alert_key: "2026-05:3" },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
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
