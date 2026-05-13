import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { SignJWT, jwtVerify } from "jose"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema"
import { env } from "../lib/env"
import { generators, getOidcClient } from "../lib/oidc"
import { createSessionToken, revokeSessionVersion, requireAuth } from "../middleware/auth"
import { Sentry } from "../lib/sentry"
import { recordEventOnce } from "../lib/product-events-lib"
import { createRateLimiter } from "../lib/rate-limit"
import { encrypt, decrypt } from "../lib/crypto"
import {
  generateTotpSecret,
  generateTotpQrDataUri,
  generateBackupCodes,
  hashBackupCodes,
  verifyTotpCode,
  verifyAndConsumeBackupCode,
  parseBackupCodeHashes,
} from "../lib/totp-lib"

const router = new Hono()

// Short-lived signed cookie carries state + nonce across the OAuth redirect.
const OIDC_STATE_COOKIE = "oidc_state"
const OIDC_STATE_TTL = 600 // 10 minutes

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}

async function packStateCookie(state: string, nonce: string): Promise<string> {
  return new SignJWT({ state, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${OIDC_STATE_TTL}s`)
    .sign(stateSecret())
}

async function unpackStateCookie(
  token: string,
): Promise<{ state: string; nonce: string }> {
  const { payload } = await jwtVerify(token, stateSecret())
  return { state: payload["state"] as string, nonce: payload["nonce"] as string }
}

// GET /api/auth/login
// Redirects to the OIDC provider's authorization endpoint.
router.get("/login", async (c) => {
  if (!env.oauthClientId) {
    return c.json({ error: "OAuth not configured — set OAUTH_CLIENT_ID" }, 503)
  }

  const client = await getOidcClient()
  const state = generators.state()
  const nonce = generators.nonce()

  const packed = await packStateCookie(state, nonce)
  setCookie(c, OIDC_STATE_COOKIE, packed, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: OIDC_STATE_TTL,
    path: "/",
  })

  const authUrl = client.authorizationUrl({
    scope: "openid email profile",
    state,
    nonce,
  })

  return c.redirect(authUrl)
})

// GET /api/auth/callback
// Exchanges the authorization code, upserts the user, and sets the session cookie.
router.get("/callback", async (c) => {
  const packed = getCookie(c, OIDC_STATE_COOKIE)
  deleteCookie(c, OIDC_STATE_COOKIE, { path: "/" })

  if (!packed) {
    return c.json(
      { error: "Missing state cookie — login session expired or cookies blocked" },
      400,
    )
  }

  let storedState: string
  let storedNonce: string
  try {
    ;({ state: storedState, nonce: storedNonce } = await unpackStateCookie(packed))
  } catch {
    return c.json({ error: "Invalid or expired state cookie" }, 400)
  }

  const client = await getOidcClient()
  // callbackParams() accepts a full URL string in openid-client v5.
  const params = client.callbackParams(c.req.url)

  let tokenSet
  try {
    tokenSet = await client.callback(env.oauthRedirectUri, params, {
      state: storedState,
      nonce: storedNonce,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed"
    return c.json({ error: message }, 400)
  }

  const claims = tokenSet.claims()
  const externalId = claims.sub
  const email = claims.email
  if (!email) {
    return c.json(
      { error: "No email in OIDC claims — verify provider scopes include 'email'" },
      400,
    )
  }

  const provider = env.oauthProvider
  const db = getDb()

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.externalId, externalId)))
    .limit(1)

  let userId: number
  let sessionVersion: number

  if (!existing) {
    const [inserted] = await db
      .insert(users)
      .values({
        authProvider: provider,
        externalId,
        email,
        displayName: (claims["name"] as string | undefined) ?? null,
        firstName: (claims["given_name"] as string | undefined) ?? null,
        lastName: (claims["family_name"] as string | undefined) ?? null,
      })
      .$returningId()
    userId = inserted.id
    sessionVersion = 1 // DB default
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.signup_completed", userId } }),
    )
  } else {
    if (!existing.isActive) {
      return c.json({ error: "Account is deactivated" }, 403)
    }
    userId = existing.id
    sessionVersion = existing.sessionVersion
    // Refresh email and display name in case they changed at the provider.
    await db
      .update(users)
      .set({
        email,
        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
      })
      .where(eq(users.id, userId))
  }

  // Non-blocking: failure must not delay the redirect or surface to the user.
  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId))
    .catch((err) => Sentry.captureException(err, { tags: { handler: "auth.callback.lastLoginAt", userId } }))

  const sessionToken = await createSessionToken({ userId, externalId, authProvider: provider, sv: sessionVersion })
  setCookie(c, "statera_session", sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })

  const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"
  return c.redirect(`${frontendOrigin}/`)
})

// POST /api/auth/logout
router.post("/logout", (c) => {
  deleteCookie(c, "statera_session", { path: "/" })
  return c.json({ ok: true })
})

// GET /api/auth/me
router.get("/me", requireAuth, (c) => {
  return c.json({ session: c.var.session })
})

// ── 2FA ───────────────────────────────────────────────────────────────────────

// POST /api/auth/2fa/setup
// Generates a new TOTP secret + backup codes and stores them (totp_enabled remains false
// until the user confirms with a valid TOTP code via /confirm).
// Rate: 5 per 60 s per authenticated user. Matches Flask's require_rate_limit(5, window_seconds=60).
router.post(
  "/2fa/setup",
  requireAuth,
  createRateLimiter(5, 60),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()

    const [user] = await db
      .select({ totpEnabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (user?.totpEnabled) {
      return c.json({ ok: false, data: null, error: "Two-factor authentication is already enabled.", code: "TOTP_ALREADY_ENABLED" }, 400)
    }

    const secret = generateTotpSecret()
    const backupCodes = generateBackupCodes()
    const backupCodeHashes = await hashBackupCodes(backupCodes)

    await db
      .update(users)
      .set({
        totpSecret: encrypt(secret),
        totpEnabled: false,
        totpBackupCodesJson: JSON.stringify(backupCodeHashes),
      })
      .where(eq(users.id, userId))

    const qrDataUri = await generateTotpQrDataUri(secret, c.var.session.externalId)

    return c.json({
      ok: true,
      data: { qr_data_uri: qrDataUri, secret_b32: secret, backup_codes: backupCodes },
      error: null,
      meta: {},
    })
  },
)

// POST /api/auth/2fa/confirm
// Verifies the TOTP code and activates 2FA (sets totp_enabled = true).
// Rate: 5 per 60 s per authenticated user.
router.post(
  "/2fa/confirm",
  requireAuth,
  createRateLimiter(5, 60),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const rawCode = String(body.code ?? "")

    const [user] = await db
      .select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.totpSecret) {
      return c.json({ ok: false, data: null, error: "2FA setup not initiated.", code: "TOTP_NOT_SETUP" }, 400)
    }

    const decryptedSecret = decrypt(user.totpSecret)
    if (!verifyTotpCode(decryptedSecret, rawCode)) {
      return c.json({ ok: false, data: null, error: "Invalid authentication code.", code: "INVALID_TOTP_CODE" }, 401)
    }

    await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId))

    return c.json({ ok: true, data: null, error: null, meta: {} })
  },
)

// POST /api/auth/2fa/disable
// Requires a valid current TOTP code. Clears all TOTP fields and bumps session_version
// to invalidate existing sessions (forces re-login on all devices).
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH). Matches Flask.
router.post(
  "/2fa/disable",
  requireAuth,
  createRateLimiter(10, 60),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const rawCode = String(body.code ?? "")

    const [user] = await db
      .select({
        totpSecret: users.totpSecret,
        totpEnabled: users.totpEnabled,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.totpEnabled) {
      return c.json({ ok: false, data: null, error: "Two-factor authentication is not enabled.", code: "TOTP_NOT_ENABLED" }, 400)
    }

    const decryptedSecret = user.totpSecret ? decrypt(user.totpSecret) : ""
    if (!verifyTotpCode(decryptedSecret, rawCode)) {
      return c.json({ ok: false, data: null, error: "Invalid authentication code.", code: "INVALID_TOTP_CODE" }, 401)
    }

    const oldSv = user.sessionVersion ?? 1
    const newSv = oldSv + 1
    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, totpBackupCodesJson: null, sessionVersion: newSv })
      .where(eq(users.id, userId))

    // Revoke all existing sessions by deny-listing the old sv value.
    // Re-issue caller's cookie with the new sv so their current session survives.
    await revokeSessionVersion(userId, oldSv)
    const { externalId, authProvider } = c.var.session
    const newToken = await createSessionToken({ userId, externalId, authProvider, sv: newSv })
    setCookie(c, "statera_session", newToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: !env.isDev,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })

    return c.json({ ok: true, data: null, error: null, meta: {} })
  },
)

export { router as authRouter }
