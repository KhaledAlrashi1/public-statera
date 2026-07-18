/*
 * Deliberate deviations from Flask (routes/analytics/__init__.py):
 * - Routes mounted at /api/analytics/* instead of Flask's /api/* root paths.
 *   Module 9 verifies frontend URL parity.
 * - currentLocalDate() uses fixed UTC+3 (Kuwait, no DST) instead of Flask's
 *   per-user IANA timezone from profile.
 *   TODO(module-analytics-tz-per-user): switch when timezone UI is added.
 * - income_source: Flask null → Hono "not_set" (see intelligence-lib.ts).
 *   Module 9 verifies frontend compatibility.
 * - R11/R12 wrapped in withAnalyticsTimeout; Flask has no timeout guard on
 *   /income-pattern or /recurring-patterns. Added for MySQL DoS prevention.
 * - R12 feature-flag disabled returns success envelope { patterns: [] } with
 *   meta: { count: 0, enabled: false } — matching Flask exactly.
 * - R13 KWD fields returned as strings (not floats). See intelligence-lib.ts deviation block.
 * - R13 generated_at uses ms precision. See intelligence-lib.ts deviation block.
 * - R13 is intentionally uncached. Bounded by user transaction count.
 */

import { Hono } from "hono"
import { z } from "zod"
import { getDb } from "../db/connection"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { Sentry } from "../lib/sentry"
import { withAnalyticsTimeout, AnalyticsComputationTimeoutError } from "../lib/analytics-cache"
import { env } from "../lib/env"
import { buildIncomePatternPayload, buildRecurringPatternsPayload, buildSnapshotPayload } from "../lib/intelligence-lib"
import { parseIntParam, zodErrorToEnvelope } from "./route-helpers"

export const intelligenceRouter = new Hono()

// B2-1 (10d zod adoption): range-only schema for the R12 `days` param. The
// absent → default 90 AND the non-numeric → 90 leniency stay hand-rolled in
// parseIntParam (D2 split); this schema sees only the resolved integer and
// validates the 30–365 bound, emitting the byte-identical combined message via
// zodErrorToEnvelope regardless of over/under. Behavior is unchanged: a
// non-numeric `days` still resolves to 90 and returns 200, never a 400.
const DaysRangeSchema = z
  .number()
  .min(30, "days must be between 30 and 365")
  .max(365, "days must be between 30 and 365")

// ── R11: GET /api/analytics/income-pattern ───────────────────────────────────
// Income detection payload. No query params. Auth + search rate limit.
// Flask: routes/analytics/__init__.py api_income_pattern()

intelligenceRouter.get("/income-pattern", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      () => buildIncomePatternPayload(userId, db),
    )
    return c.json({ ok: true, data: payload, error: null, meta: {} })
  } catch (err) {
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "Analytics are taking longer than expected. Please try again shortly.",
          code: "analytics_timeout",
        },
        503,
      )
    }
    Sentry.captureException(err, { tags: { handler: "GET /api/analytics/income-pattern", userId } })
    throw err
  }
})

// ── R12: GET /api/analytics/recurring-patterns ──────────────────────────────
// Recurring expense detection. Query param: days (30–365, default 90).
// Feature-flagged via ENABLE_RECURRING_PATTERNS (default true).
// Flask: routes/analytics/__init__.py api_recurring_patterns()

intelligenceRouter.get("/recurring-patterns", requireAuth, searchRateLimit, async (c) => {
  if (!env.enableRecurringPatterns) {
    return c.json({ ok: true, data: { patterns: [] }, error: null, meta: { count: 0, enabled: false } })
  }

  const days = parseIntParam(c.req.query("days"), 90)
  const parsedDays = DaysRangeSchema.safeParse(days)
  if (!parsedDays.success) return zodErrorToEnvelope(c, parsedDays.error)

  const { userId } = c.get("session")
  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      () => buildRecurringPatternsPayload(userId, db, days),
    )
    return c.json({
      ok: true,
      data: payload,
      error: null,
      meta: { count: payload.patterns.length, days },
    })
  } catch (err) {
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "Analytics are taking longer than expected. Please try again shortly.",
          code: "analytics_timeout",
        },
        503,
      )
    }
    Sentry.captureException(err, { tags: { handler: "GET /api/analytics/recurring-patterns", userId } })
    throw err
  }
})

// ── R13: GET /api/analytics/snapshot ────────────────────────────────────────
// Financial position snapshot. No query params. Auth + search rate limit.
// Flask: routes/analytics/__init__.py api_snapshot()

intelligenceRouter.get("/snapshot", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  try {
    const payload = await withAnalyticsTimeout(
      db,
      env.analyticsComputeTimeoutSeconds,
      () => buildSnapshotPayload(userId, db),
    )
    return c.json({ ok: true, data: payload, error: null, meta: {} })
  } catch (err) {
    if (err instanceof AnalyticsComputationTimeoutError) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "Analytics are taking longer than expected. Please try again shortly.",
          code: "analytics_timeout",
        },
        503,
      )
    }
    Sentry.captureException(err, { tags: { handler: "GET /api/analytics/snapshot", userId } })
    throw err
  }
})
