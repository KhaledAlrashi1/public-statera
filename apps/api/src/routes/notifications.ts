import { Hono } from "hono"
import { getDb } from "../db/connection"
import { requireAuth } from "../middleware/auth"
import {
  BUDGET_ALERT_DISMISSED_EVENT_NAME,
  listActiveBudgetAlerts,
} from "../lib/budget-alerts-lib"
import { recordEvent } from "../lib/product-events-lib"

export const notificationsRouter = new Hono()

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// ── GET /api/notifications/budget-alerts ──────────────────────────────────────

notificationsRouter.get("/budget-alerts", requireAuth, async (c) => {
  const month = (c.req.query("month") ?? "").trim()
  if (!month) {
    return c.json(
      { ok: false, data: null, error: "month is required (YYYY-MM).", code: "validation_error" },
      400,
    )
  }
  if (!MONTH_RE.test(month)) {
    return c.json(
      { ok: false, data: null, error: "month must be in YYYY-MM format.", code: "validation_error" },
      400,
    )
  }

  const { userId } = c.get("session")
  const db = getDb()
  const items = await listActiveBudgetAlerts(userId, month, db)

  return c.json({
    ok: true,
    data: { month, items, alert_count: items.length },
    error: null,
    meta: {},
  })
})

// ── POST /api/notifications/budget-alerts/dismiss ─────────────────────────────

notificationsRouter.post("/budget-alerts/dismiss", requireAuth, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const alertKey = String(body["alert_key"] ?? "").trim()

  if (!alertKey) {
    return c.json(
      { ok: false, data: null, error: "alert_key is required.", code: "validation_error" },
      400,
    )
  }

  const db = getDb()
  await recordEvent(userId, BUDGET_ALERT_DISMISSED_EVENT_NAME, { alert_key: alertKey }, db)

  return c.json({ ok: true, data: { dismissed: true }, error: null, meta: {} })
})
