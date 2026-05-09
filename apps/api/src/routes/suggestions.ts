import { Hono } from "hono"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { getDb } from "../db/connection"
import { suggestTransactions } from "../lib/suggestions-lib"

export const suggestionsRouter = new Hono()

suggestionsRouter.get("/", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const q = (c.req.query("q") ?? "").trim()
  const rawLimit = c.req.query("limit")
  const limit = rawLimit != null ? Math.max(1, Math.min(Number.parseInt(rawLimit, 10) || 10, 50)) : 10

  if (!q) {
    return c.json({ ok: true, data: { items: [] }, error: null, meta: { count: 0 } })
  }

  const db = getDb()
  const items = await suggestTransactions(q, userId, db, limit)
  return c.json({ ok: true, data: { items }, error: null, meta: { count: items.length } })
})
