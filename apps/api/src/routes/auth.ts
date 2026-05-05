/**
 * Manus OAuth auth routes — stub implementation.
 *
 * Full flow:
 *   GET  /api/auth/login     → redirect to Manus authorization endpoint
 *   GET  /api/auth/callback  → exchange code → create/update user → set session cookie
 *   POST /api/auth/logout    → clear session cookie
 *   GET  /api/auth/me        → return current user (requires auth)
 *
 * NOTE: existing private-version users (bcrypt passwords) cannot log in to
 * this system without a separate account-migration step planned after Phase 3.
 *
 * TODO (Phase 3): implement full OAuth code exchange and user upsert.
 */
import { Hono } from "hono"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { env } from "../lib/env.js"
import { createSessionToken, requireAuth } from "../middleware/auth.js"

const auth = new Hono()

auth.get("/login", (c) => {
  if (!env.manusClientId || !env.manusAuthUrl) {
    if (env.isDev) {
      return c.json({ ok: false, error: "Manus OAuth not configured. Set MANUS_CLIENT_ID and MANUS_AUTH_URL." }, 503)
    }
    throw new HTTPException(503, { message: "OAuth provider not configured." })
  }

  const params = new URLSearchParams({
    client_id: env.manusClientId,
    redirect_uri: env.manusCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
  })

  return c.redirect(`${env.manusAuthUrl}?${params.toString()}`)
})

auth.get("/callback", async (c) => {
  // TODO (Phase 3): exchange code for token, fetch userinfo, upsert user row
  if (env.isDev) {
    return c.json({ ok: false, error: "OAuth callback stub — not yet implemented." }, 501)
  }
  throw new HTTPException(501, { message: "OAuth callback not yet implemented." })
})

auth.post("/logout", (c) => {
  deleteCookie(c, "statera_session", { path: "/" })
  return c.json({ ok: true })
})

auth.get("/me", requireAuth, (c) => {
  const session = c.get("session")
  return c.json({ ok: true, session })
})

export { auth as authRouter }
