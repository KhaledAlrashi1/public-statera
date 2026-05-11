/*
 * Deliberate deviations from Flask (routes/analytics/__init__.py):
 * - Routes mounted at /api/analytics/* instead of Flask's /api/* root paths.
 *   Module 9 verifies frontend URL parity.
 * - currentLocalDate() uses fixed UTC+3 (Kuwait, no DST) instead of Flask's
 *   per-user IANA timezone from profile.
 *   TODO(module-analytics-tz-per-user): switch when timezone UI is added.
 * - income_source: Flask null → Hono "not_set" (see intelligence-lib.ts).
 *   Module 9 verifies frontend compatibility.
 * - R11 wrapped in withAnalyticsTimeout (hardFail:false); Flask has no timeout
 *   guard on /income-pattern. Added for MySQL DoS prevention consistency.
 */

import { Hono } from "hono"
import { getDb } from "../db/connection"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { Sentry } from "../lib/sentry"
import { withAnalyticsTimeout, AnalyticsComputationTimeoutError } from "../lib/analytics-cache"
import { env } from "../lib/env"
import { buildIncomePatternPayload } from "../lib/intelligence-lib"

export const intelligenceRouter = new Hono()

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
