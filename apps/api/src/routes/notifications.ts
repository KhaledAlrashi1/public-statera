import { Hono } from "hono"
import { z } from "zod"
import { getDb } from "../db/connection"
import { requireAuth } from "../middleware/auth"
import { readRateLimit, writeRateLimit } from "../lib/rate-limit"
import { zodErrorToEnvelope } from "./route-helpers"
import {
  BUDGET_ALERT_DISMISSED_EVENT_NAME,
  listActiveBudgetAlerts,
} from "../lib/budget-alerts-lib"
import { recordEvent } from "../lib/product-events-lib"

export const notificationsRouter = new Hono()

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// ── Input schemas (phase-4 10d zod-adoption B1, shape-only) ─────────────────────
// Byte-identical to the pre-existing hand-written checks (Hono wire strings).
// Hono deliberately requires `month` here (Flask defaulted it — 9.5d divergence);
// .min(1)-before-.regex() preserves the required-then-format first-fail ordering.
const MonthQuerySchema = z
  .string()
  .trim()
  .min(1, "month is required (YYYY-MM).")
  .regex(MONTH_RE, "month must be in YYYY-MM format.")

// alert_key: the String(... ?? "").trim() coercion stays hand-rolled by
// necessity (z.string()/z.coerce.string() can't byte-reproduce null→"" vs
// null→"null"); zod validates only the normalized non-empty shape (D2).
const AlertKeySchema = z.string().min(1, "alert_key is required.")

// ── GET /api/notifications/budget-alerts ──────────────────────────────────────

notificationsRouter.get("/budget-alerts", requireAuth, readRateLimit, async (c) => {
  const parsed = MonthQuerySchema.safeParse(c.req.query("month") ?? "")
  if (!parsed.success) return zodErrorToEnvelope(c, parsed.error)
  const month = parsed.data

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

notificationsRouter.post("/budget-alerts/dismiss", requireAuth, writeRateLimit, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const alertKey = String(body["alert_key"] ?? "").trim()
  const parsed = AlertKeySchema.safeParse(alertKey)
  if (!parsed.success) return zodErrorToEnvelope(c, parsed.error)

  const db = getDb()
  await recordEvent(userId, BUDGET_ALERT_DISMISSED_EVENT_NAME, { alert_key: alertKey }, db)

  return c.json({ ok: true, data: { dismissed: true }, error: null, meta: {} })
})
