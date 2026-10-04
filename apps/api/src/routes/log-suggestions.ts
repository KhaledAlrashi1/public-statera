// MOB-R53 B1 — GET /api/log-suggestions. Read-only suggestions for the hidden /log page (RM-26).
// Authenticated and scoped to the requesting user like the other GET routes; readRateLimit (G4).
import { Hono } from "hono"
import { requireAuth } from "../middleware/auth"
import { readRateLimit } from "../lib/rate-limit"
import { getDb } from "../db/connection"
import { buildLogSuggestions } from "../lib/log-suggestions-lib"

export const logSuggestionsRouter = new Hono()

logSuggestionsRouter.get("/", requireAuth, readRateLimit, async (c) => {
  const { userId } = c.get("session")
  const places = await buildLogSuggestions(getDb(), userId)
  return c.json({ ok: true, data: { places }, error: null, meta: { count: places.length } })
})
