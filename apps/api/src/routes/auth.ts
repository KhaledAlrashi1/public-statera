import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { SignJWT, jwtVerify } from "jose"
import { and, desc, eq, like } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, userProfiles, securityEvents } from "../db/schema"
import { env } from "../lib/env"
import { generators, getOidcClient } from "../lib/oidc"
import { createSessionToken, revokeSessionVersion, requireAuth, getAuthRedis } from "../middleware/auth"
import { Sentry } from "../lib/sentry"
import { recordEventOnce } from "../lib/product-events-lib"
import { createRateLimiter } from "../lib/rate-limit"
import { cacheBustDashboardMetrics, cacheBustSafeToSpend } from "../lib/analytics-cache"
import {
  loadDemoWorkspace,
  clearDemoWorkspace,
  getDemoWorkspaceState,
  DemoDataConflictError,
  DemoDataNotLoadedError,
} from "../lib/demo-data-lib"
import { encrypt, decrypt } from "../lib/crypto"
import { formatKd, parseKd } from "../lib/kd"
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

// Short-lived cookie carries userId across the 2FA verify step (post-OIDC, pre-session).
const PENDING_2FA_COOKIE = "statera_pending_2fa"
const PENDING_2FA_TTL = 300 // 5 minutes
const PENDING_2FA_MAX_FAILURES = 3

// Short-lived cookie confirms that the user re-authenticated specifically to delete their account.
// Path=/api/account scopes it to the deletion endpoints only.
const DELETE_INTENT_COOKIE = "statera_delete_intent"
const DELETE_INTENT_TTL = 900 // 15 minutes

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}

interface StateCookiePayload {
  state: string
  nonce: string
  deleteIntent?: boolean
  userId?: number
}

async function packStateCookie(payload: StateCookiePayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${OIDC_STATE_TTL}s`)
    .sign(stateSecret())
}

async function unpackStateCookie(token: string): Promise<StateCookiePayload> {
  const { payload } = await jwtVerify(token, stateSecret())
  return {
    state: payload["state"] as string,
    nonce: payload["nonce"] as string,
    deleteIntent: payload["deleteIntent"] as boolean | undefined,
    userId: payload["userId"] as number | undefined,
  }
}

async function packPending2faToken(userId: number, deleteIntent?: boolean): Promise<string> {
  const claims: Record<string, unknown> = { userId, pendingAt: Date.now() }
  if (deleteIntent) claims.deleteIntent = true
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${PENDING_2FA_TTL}s`)
    .sign(stateSecret())
}

async function verifyPending2faToken(token: string): Promise<{ userId: number; deleteIntent?: boolean }> {
  const { payload } = await jwtVerify(token, stateSecret())
  return {
    userId: payload["userId"] as number,
    deleteIntent: payload["deleteIntent"] as boolean | undefined,
  }
}

async function packDeleteIntentToken(userId: number): Promise<string> {
  return new SignJWT({ userId, issuedAt: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${DELETE_INTENT_TTL}s`)
    .sign(stateSecret())
}

// Exported so routes/account.ts can verify the delete-intent cookie.
export async function verifyDeleteIntentToken(token: string): Promise<{ userId: number }> {
  const { payload } = await jwtVerify(token, stateSecret())
  return { userId: payload["userId"] as number }
}

// Fire-and-forget security event write. Never throws — Sentry-captured on failure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function auditSecurityEvent(
  db: ReturnType<typeof getDb>,
  eventType: string,
  opts: { userId?: number | null; ipAddress?: string; userAgent?: string; details?: Record<string, unknown> } = {},
): void {
  db.insert(securityEvents)
    .values({
      userId: opts.userId ?? null,
      eventType,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      detailsJson: opts.details ? JSON.stringify(opts.details) : null,
    })
    .catch((err: unknown) =>
      Sentry.captureException(err, { tags: { handler: "auditSecurityEvent", eventType } }),
    )
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

  const packed = await packStateCookie({ state, nonce })
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
  let stateDeleteIntent: boolean | undefined
  let stateUserId: number | undefined
  try {
    ;({ state: storedState, nonce: storedNonce, deleteIntent: stateDeleteIntent, userId: stateUserId } =
      await unpackStateCookie(packed))
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
  let isNewUser = false

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
    isNewUser = true
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.signup_completed", userId } }),
    )
  } else {
    if (!existing.isActive) {
      return c.json({ error: "Account is deactivated" }, 403)
    }
    userId = existing.id
    sessionVersion = existing.sessionVersion

    // Anti-substitution: for delete-reauth flows the state cookie carries the userId that
    // initiated the request. Verify the re-authenticated user matches.
    if (stateDeleteIntent && stateUserId !== undefined && stateUserId !== userId) {
      return c.json({ error: "Re-authenticated user does not match the initiating session." }, 403)
    }

    // Refresh email and display name in case they changed at the provider.
    await db
      .update(users)
      .set({
        email,
        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
      })
      .where(eq(users.id, userId))

    const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"

    // 7b: Gate on TOTP — issue a short-lived pending-2FA cookie and redirect to the
    // verify page. For delete-reauth flows, deleteIntent is embedded in the JWT so
    // /2fa/verify issues the delete-intent cookie instead of a new session on success.
    if (existing.totpEnabled) {
      const pendingToken = await packPending2faToken(userId, stateDeleteIntent ?? false)
      setCookie(c, PENDING_2FA_COOKIE, pendingToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: PENDING_2FA_TTL,
        path: "/",
      })
      if (stateDeleteIntent) {
        auditSecurityEvent(db, "account.delete_reauth.pending_2fa", {
          userId,
          ipAddress: c.req.header("x-forwarded-for") ?? undefined,
          userAgent: c.req.header("user-agent") ?? undefined,
        })
        return c.redirect(`${frontendOrigin}/auth/2fa-verify?intent=delete`)
      }
      auditSecurityEvent(db, "login.pending_2fa", {
        userId,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })
      return c.redirect(`${frontendOrigin}/auth/2fa-verify`)
    }

    // No TOTP: for delete-reauth, issue delete-intent cookie directly without
    // touching the existing session.
    if (stateDeleteIntent) {
      const deleteIntentToken = await packDeleteIntentToken(userId)
      setCookie(c, DELETE_INTENT_COOKIE, deleteIntentToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: DELETE_INTENT_TTL,
        path: "/api/account",
      })
      auditSecurityEvent(db, "account.delete_reauth.confirmed", {
        userId,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })
      return c.redirect(`${frontendOrigin}/delete-account/confirm`)
    }
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
  return c.redirect(`${frontendOrigin}${isNewUser ? "/welcome?source=signup" : "/"}`)
})

// POST /api/auth/logout
router.post("/logout", (c) => {
  deleteCookie(c, "statera_session", { path: "/" })
  return c.json({ ok: true })
})

// GET /api/auth/me
router.get("/me", requireAuth, async (c) => {
  const { userId } = c.var.session
  const db = getDb()
  const [found] = await db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.displayName,
      first_name: users.firstName,
      last_name: users.lastName,
      totp_enabled: users.totpEnabled,
      created_at: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!found) {
    return c.json({ ok: false, data: null, error: "User not found.", code: "user_not_found" }, 401)
  }

  return c.json({
    ok: true,
    user: {
      ...found,
      created_at: found.created_at.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    },
    // template_suggestions and open_banking have no Hono routes (deferred indefinitely).
    // TODO(module-9-feature-flags-audit): wire up when features are ported.
    flags: { template_suggestions: false, open_banking: false },
  })
})

// ── Account deletion re-auth ──────────────────────────────────────────────────

// GET /api/auth/delete-reauth
// Initiates a fresh OIDC login (prompt=login) specifically for account deletion intent.
// Embeds deleteIntent=true and the caller's userId in the state cookie so the callback
// can issue the statera_delete_intent cookie after re-authentication is confirmed.
//
// Deliberate deviations from Flask:
// - Flask uses password re-verification (two-step DELETE /api/account with session token).
//   Hono has no password column — OIDC re-auth with prompt=login is the equivalent.
// - prompt=login forces the IdP to show the login UI even if there is an active IdP session,
//   so the re-authentication is not silently skipped. max_age=0 is included as a secondary
//   hint for IdPs that honour max_age but not prompt (both params, Belt + Suspenders).
// - 2FA enforcement: if the user has TOTP enabled, the callback issues a statera_pending_2fa
//   cookie (with deleteIntent=true) and redirects to /auth/2fa-verify?intent=delete.
//   The /2fa/verify endpoint reads deleteIntent from the JWT and issues the delete-intent
//   cookie on success instead of (in addition to) a new session. The user's existing session
//   is not replaced — we are only issuing the narrow-scope intent cookie.
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH).
router.get(
  "/delete-reauth",
  requireAuth,
  createRateLimiter(10, 60),
  async (c) => {
    if (!env.oauthClientId) {
      return c.json({ error: "OAuth not configured — set OAUTH_CLIENT_ID" }, 503)
    }

    const { userId } = c.var.session
    const client = await getOidcClient()
    const state = generators.state()
    const nonce = generators.nonce()

    const packed = await packStateCookie({ state, nonce, deleteIntent: true, userId })
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
      prompt: "login",
      max_age: 0,
    })

    return c.redirect(authUrl)
  },
)

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

// POST /api/auth/2fa/verify
// Pre-auth endpoint — no requireAuth. Verifies the TOTP/backup code after the OIDC callback
// redirected to /auth/2fa-verify. On success, issues the real session cookie.
//
// Deliberate deviations from Flask:
// - Flask uses server-side sessions for pending_2fa state; Hono uses a short-lived JWT cookie
//   (statera_pending_2fa). The JWT carries only userId — no code or secret — so it cannot be
//   used to bypass anything.
// - Pre-check on failure counter (≥ PENDING_2FA_MAX_FAILURES) before processing the code is
//   added as a safety net against replayed valid JWTs after cookie deletion on the 3rd failure.
// - CSRF: SameSite=Lax + same-origin XHR is sufficient. No CSRF token needed — identical
//   to Flask's session-cookie approach under SameSite semantics.
// - Rate limit keyed by path (anonymous) rather than userId — userId is not yet established
//   when the limiter runs.
router.post(
  "/2fa/verify",
  createRateLimiter(5, 60),
  async (c) => {
    const db = getDb()
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const rawCode = String(body.code ?? "")
    const codeType = (body.type === "backup" ? "backup" : "totp") as "totp" | "backup"
    const ipAddress = c.req.header("x-forwarded-for") ?? undefined
    const userAgent = c.req.header("user-agent") ?? undefined

    // 1. Read and verify the pending-2FA JWT cookie.
    const pendingCookieValue = getCookie(c, PENDING_2FA_COOKIE)
    if (!pendingCookieValue) {
      return c.json({ ok: false, data: null, error: "No pending 2FA session.", code: "PENDING_2FA_GONE" }, 410)
    }

    let userId: number
    let deleteIntent: boolean | undefined
    try {
      ;({ userId, deleteIntent } = await verifyPending2faToken(pendingCookieValue))
    } catch {
      return c.json({ ok: false, data: null, error: "Pending 2FA session expired or invalid.", code: "PENDING_2FA_GONE" }, 410)
    }

    // 2. Pre-check failure counter — safety net against replayed cookies after 3rd failure.
    const redis = getAuthRedis()
    const failureKey = `pending_2fa_failures:${userId}`
    try {
      const currentFailures = await redis.get(failureKey)
      if (currentFailures !== null && parseInt(currentFailures, 10) >= PENDING_2FA_MAX_FAILURES) {
        deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })
        return c.json({ ok: false, data: null, error: "Too many failed attempts. Please sign in again.", code: "PENDING_2FA_RESTART" }, 401)
      }
    } catch { /* Redis error: fail open — proceed to code check */ }

    // 3. Load user.
    const [user] = await db
      .select({
        totpEnabled: users.totpEnabled,
        totpSecret: users.totpSecret,
        totpBackupCodesJson: users.totpBackupCodesJson,
        sessionVersion: users.sessionVersion,
        authProvider: users.authProvider,
        externalId: users.externalId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.isActive) {
      return c.json({ ok: false, data: null, error: "Account is deactivated.", code: "ACCOUNT_INACTIVE" }, 403)
    }

    if (!user?.totpEnabled) {
      return c.json({ ok: false, data: null, error: "Two-factor authentication is not enabled.", code: "TOTP_NOT_ENABLED" }, 400)
    }

    // 4. Verify the supplied code.
    let codeValid = false
    let backupCodesLow = false
    let remainingBackupHashes: string[] | null = null

    if (codeType === "backup") {
      const { consumed, remainingHashes } = await verifyAndConsumeBackupCode(rawCode, user.totpBackupCodesJson)
      if (consumed) {
        codeValid = true
        remainingBackupHashes = remainingHashes
        backupCodesLow = remainingHashes.length <= 2
        // Persist consumed backup codes (fire-and-forget would risk race; await for correctness).
        await db
          .update(users)
          .set({ totpBackupCodesJson: JSON.stringify(remainingHashes) })
          .where(eq(users.id, userId))
      }
    } else {
      const decryptedSecret = user.totpSecret ? decrypt(user.totpSecret) : ""
      // TODO(module-future-hardening): add Redis totp_used:{userId}:{code} cache (90s TTL)
      // to reject replayed valid TOTP codes. Flask does not implement this; matching Flask for now.
      codeValid = verifyTotpCode(decryptedSecret, rawCode)
    }

    // 5. Handle failure — increment counter; restart if limit reached.
    if (!codeValid) {
      let newCount = PENDING_2FA_MAX_FAILURES // fail-safe default on Redis error
      try {
        const results = await redis.multi().incr(failureKey).expire(failureKey, 300).exec()
        const raw = results?.[0]?.[1]
        if (typeof raw === "number") newCount = raw
      } catch { /* Redis error: treat as limit reached to avoid infinite retries */ }

      auditSecurityEvent(db, "login.2fa.failed", { userId, ipAddress, userAgent, details: { type: codeType } })

      if (newCount >= PENDING_2FA_MAX_FAILURES) {
        deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })
        return c.json({ ok: false, data: null, error: "Too many failed attempts. Please sign in again.", code: "PENDING_2FA_RESTART" }, 401)
      }

      return c.json({ ok: false, data: null, error: "Invalid authentication code.", code: "INVALID_TOTP_CODE" }, 401)
    }

    // 6. Success — clear counter, delete pending cookie.
    redis.del(failureKey).catch(() => {})
    deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })

    // delete-reauth path: issue the narrow-scope delete-intent cookie instead of a new session.
    // The user's existing statera_session remains valid — we only need to confirm intent.
    if (deleteIntent) {
      const deleteIntentToken = await packDeleteIntentToken(userId)
      setCookie(c, DELETE_INTENT_COOKIE, deleteIntentToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: DELETE_INTENT_TTL,
        path: "/api/account",
      })
      auditSecurityEvent(db, "account.delete_reauth.confirmed", { userId, ipAddress, userAgent })
      return c.json({ ok: true, data: { user_id: userId, delete_intent: true }, error: null, meta: {} })
    }

    // Normal login path: update lastLoginAt and issue the real session cookie.
    db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId))
      .catch((err: unknown) =>
        Sentry.captureException(err, { tags: { handler: "auth.2fa.verify.lastLoginAt", userId } }),
      )
    auditSecurityEvent(db, "login.success", { userId, ipAddress, userAgent, details: { type: codeType } })

    const { authProvider, externalId, sessionVersion } = user
    const sessionToken = await createSessionToken({ userId, externalId, authProvider, sv: sessionVersion })
    setCookie(c, "statera_session", sessionToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: !env.isDev,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })

    const data: Record<string, unknown> = { user_id: userId }
    if (backupCodesLow && remainingBackupHashes !== null) {
      data.warning = "BACKUP_CODES_LOW"
      data.backup_codes_remaining = remainingBackupHashes.length
    }

    return c.json({ ok: true, data, error: null, meta: {} })
  },
)

// ── Sessions ──────────────────────────────────────────────────────────────────

// POST /api/auth/sessions/revoke-all
// Bumps session_version in DB (new sessions issued after this carry newSv) and writes
// a Redis deny-list key for oldSv (sv_revoked:{userId}:{oldSv}, 30-day TTL matching JWT
// expiry) so existing tokens fail requireAuth immediately without a DB lookup.
// Re-issues the caller's session cookie with newSv so they aren't locked out.
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH).
router.post(
  "/sessions/revoke-all",
  requireAuth,
  createRateLimiter(10, 60),
  async (c) => {
    const { userId, externalId, authProvider } = c.var.session
    const db = getDb()

    const [user] = await db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const oldSv = user?.sessionVersion ?? 1
    const newSv = oldSv + 1

    await db.update(users).set({ sessionVersion: newSv }).where(eq(users.id, userId))

    // Write the deny-list key for oldSv. TTL = 30 days = JWT expiry, so the key
    // is guaranteed to outlive every token that carries the revoked sv value.
    await revokeSessionVersion(userId, oldSv)

    // Re-issue caller's cookie with newSv before returning — prevents self-lockout.
    const newToken = await createSessionToken({ userId, externalId, authProvider, sv: newSv })
    setCookie(c, "statera_session", newToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: !env.isDev,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })

    auditSecurityEvent(db, "sessions.revoke_all", {
      userId,
      ipAddress: c.req.header("x-forwarded-for") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
      details: { session_version: newSv },
    })

    return c.json({ ok: true, data: { session_version: newSv }, error: null, meta: {} })
  },
)

// ── Profile security events ───────────────────────────────────────────────────

// GET /api/auth/profile/security-events
// Returns combined user + profile fields for the authenticated user.
//
// Deliberate deviation from standard envelope convention:
// Returns { ok, user, profile, demo_workspace } at top level (NOT under data) to match
// the Flask contract that authApi.profile() consumers already expect.
// demo_workspace reflects the real demo-workspace state (10b-3 D2; demo-workspace ported in 10b-2).
router.get("/profile", requireAuth, async (c) => {
  const { userId } = c.var.session
  const db = getDb()

  const [[foundUser], [foundProfile]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        totpEnabled: users.totpEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        monthlyIncomeKd: userProfiles.monthlyIncomeKd,
        paydayDay: userProfiles.paydayDay,
        country: userProfiles.country,
        timezone: userProfiles.timezone,
        emailNotificationsEnabled: userProfiles.emailNotificationsEnabled,
        hasDebtChoice: userProfiles.hasDebtChoice,
        setupGuideSeen: userProfiles.setupGuideSeen,
        setupGuideDismissed: userProfiles.setupGuideDismissed,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
  ])

  if (!foundUser) {
    return c.json({ ok: false, data: null, error: "User not found.", code: "user_not_found" }, 401)
  }

  const demoWorkspace = await getDemoWorkspaceState(db, userId)

  return c.json({
    ok: true,
    user: {
      id: foundUser.id,
      email: foundUser.email,
      display_name: foundUser.displayName,
      first_name: foundUser.firstName,
      last_name: foundUser.lastName,
      totp_enabled: foundUser.totpEnabled,
      created_at: foundUser.createdAt instanceof Date
        ? foundUser.createdAt.toISOString().replace(/\.\d{3}Z$/, "+00:00")
        : String(foundUser.createdAt),
    },
    profile: {
      monthly_income_kd: foundProfile?.monthlyIncomeKd != null
        ? formatKd(foundProfile.monthlyIncomeKd)
        : null,
      payday_day: foundProfile?.paydayDay ?? null,
      country: foundProfile?.country ?? null,
      timezone: foundProfile?.timezone ?? "Asia/Kuwait",
      email_notifications_enabled: foundProfile?.emailNotificationsEnabled ?? true,
      has_debt_choice: foundProfile?.hasDebtChoice ?? null,
      setup_guide_seen: foundProfile?.setupGuideSeen ?? false,
      setup_guide_dismissed: foundProfile?.setupGuideDismissed ?? false,
    },
    demo_workspace: demoWorkspace,
  })
})

// Callers: ProfilePage.saveName (first_name, last_name), updateEmailNotificationPreference
// (email_notifications_enabled), saveTimezonePreference (timezone); DashboardPage.syncSetupGuideProfile
// (setup_guide_seen, setup_guide_dismissed); DebtAccountsSection.setDebtChoice (has_debt_choice).
// Silently strips email and current_password — OIDC-only, no password column.
// display_name intentionally omitted — no current caller; add when first needed.
// errors[] never populated on success (all-or-nothing; validation failure → 400).
// SET objects typed against Drizzle $inferInsert to catch column typos at compile time (lesson from 9.6).
router.post("/profile/update", requireAuth, async (c) => {
  const { userId } = c.var.session
  const db = getDb()

  let body: Record<string, unknown>
  try {
    body = await c.req.json() as Record<string, unknown>
  } catch {
    body = {}
  }

  const errors: string[] = []
  const usersSet: Partial<typeof users.$inferInsert> = {}
  const profileSet: Partial<typeof userProfiles.$inferInsert> = {}

  // ── users table fields ────────────────────────────────────────────────────
  if (body.first_name !== undefined) {
    usersSet.firstName = body.first_name === null
      ? null
      : String(body.first_name ?? "").trim().slice(0, 64) || null
  }
  if (body.last_name !== undefined) {
    usersSet.lastName = body.last_name === null
      ? null
      : String(body.last_name ?? "").trim().slice(0, 64) || null
  }

  // ── userProfiles table fields ─────────────────────────────────────────────
  if (body.monthly_income_kd !== undefined) {
    if (body.monthly_income_kd === null) {
      profileSet.monthlyIncomeKd = null
    } else {
      try {
        profileSet.monthlyIncomeKd = formatKd(parseKd(String(body.monthly_income_kd)))
      } catch {
        errors.push("monthly_income_kd: invalid decimal value.")
      }
    }
  }
  if (body.payday_day !== undefined) {
    if (body.payday_day === null) {
      profileSet.paydayDay = null
    } else {
      const n = Number(body.payday_day)
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        errors.push("payday_day: must be an integer between 1 and 31.")
      } else {
        profileSet.paydayDay = n
      }
    }
  }
  if (body.country !== undefined) {
    profileSet.country = body.country === null
      ? null
      : String(body.country ?? "").trim().slice(0, 64) || null
  }
  if (body.timezone !== undefined && body.timezone !== null) {
    // timezone column is NOT NULL — silently drop null to preserve the DB default (Asia/Kuwait).
    const tz = String(body.timezone ?? "").trim().slice(0, 64)
    if (tz) profileSet.timezone = tz
  }
  if (body.email_notifications_enabled !== undefined) {
    profileSet.emailNotificationsEnabled = Boolean(body.email_notifications_enabled)
  }
  if (body.has_debt_choice !== undefined) {
    profileSet.hasDebtChoice = body.has_debt_choice === null ? null : Boolean(body.has_debt_choice)
  }
  if (body.setup_guide_seen !== undefined) {
    profileSet.setupGuideSeen = Boolean(body.setup_guide_seen)
  }
  if (body.setup_guide_dismissed !== undefined) {
    profileSet.setupGuideDismissed = Boolean(body.setup_guide_dismissed)
  }

  if (errors.length) {
    return c.json({ ok: false, data: null, error: errors.join("; "), code: "validation_error" }, 400)
  }

  const hasUsersUpdate = Object.keys(usersSet).length > 0
  const hasProfileUpdate = Object.keys(profileSet).length > 0

  if (hasUsersUpdate && hasProfileUpdate) {
    await db.transaction(async (tx) => {
      await tx.update(users).set(usersSet).where(eq(users.id, userId))
      await tx
        .insert(userProfiles)
        .values({ userId, ...profileSet })
        .onDuplicateKeyUpdate({ set: profileSet })
    })
  } else if (hasUsersUpdate) {
    await db.update(users).set(usersSet).where(eq(users.id, userId))
  } else if (hasProfileUpdate) {
    await db
      .insert(userProfiles)
      .values({ userId, ...profileSet })
      .onDuplicateKeyUpdate({ set: profileSet })
  }
  // else: no recognized fields — no-op; re-fetch and return current state

  const [[updatedUser], [updatedProfile]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        totpEnabled: users.totpEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        monthlyIncomeKd: userProfiles.monthlyIncomeKd,
        paydayDay: userProfiles.paydayDay,
        country: userProfiles.country,
        timezone: userProfiles.timezone,
        emailNotificationsEnabled: userProfiles.emailNotificationsEnabled,
        hasDebtChoice: userProfiles.hasDebtChoice,
        setupGuideSeen: userProfiles.setupGuideSeen,
        setupGuideDismissed: userProfiles.setupGuideDismissed,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
  ])

  if (!updatedUser) {
    return c.json({ ok: false, data: null, error: "User not found.", code: "user_not_found" }, 401)
  }

  const demoWorkspaceState = await getDemoWorkspaceState(db, userId)

  return c.json({
    ok: true,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      display_name: updatedUser.displayName,
      first_name: updatedUser.firstName,
      last_name: updatedUser.lastName,
      totp_enabled: updatedUser.totpEnabled,
      created_at: updatedUser.createdAt instanceof Date
        ? updatedUser.createdAt.toISOString().replace(/\.\d{3}Z$/, "+00:00")
        : String(updatedUser.createdAt),
    },
    profile: {
      monthly_income_kd: updatedProfile?.monthlyIncomeKd != null
        ? formatKd(updatedProfile.monthlyIncomeKd)
        : null,
      payday_day: updatedProfile?.paydayDay ?? null,
      country: updatedProfile?.country ?? null,
      timezone: updatedProfile?.timezone ?? "Asia/Kuwait",
      email_notifications_enabled: updatedProfile?.emailNotificationsEnabled ?? true,
      has_debt_choice: updatedProfile?.hasDebtChoice ?? null,
      setup_guide_seen: updatedProfile?.setupGuideSeen ?? false,
      setup_guide_dismissed: updatedProfile?.setupGuideDismissed ?? false,
    },
    demo_workspace: demoWorkspaceState,
  })
})

// Returns profile.* events for the authenticated user (profile settings changes).
// Login, auth, and session events are written to security_events but not exposed here;
// this endpoint is intentionally a profile-change audit trail, not a full security log.
// Matches Flask's WHERE event_type LIKE 'profile.%' filter exactly.
// Pagination: offset-based (matches Flask), default limit 20, max 50.
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH).
//
// Deliberate deviation from Flask:
// - created_at format: +00:00 (project convention) vs Flask's naive isoformat.
router.get(
  "/profile/security-events",
  requireAuth,
  createRateLimiter(10, 60),
  async (c) => {
    const { userId } = c.var.session
    const db = getDb()

    const rawLimit = c.req.query("limit") ?? "20"
    const rawOffset = c.req.query("offset") ?? "0"
    const parsedLimit = parseInt(rawLimit, 10)
    const parsedOffset = parseInt(rawOffset, 10)
    const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 20 : parsedLimit, 50))
    const offset = Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset)

    const rows = await db
      .select({
        id: securityEvents.id,
        eventType: securityEvents.eventType,
        ipAddress: securityEvents.ipAddress,
        userAgent: securityEvents.userAgent,
        createdAt: securityEvents.createdAt,
        detailsJson: securityEvents.detailsJson,
      })
      .from(securityEvents)
      .where(and(eq(securityEvents.userId, userId), like(securityEvents.eventType, "profile.%")))
      .orderBy(desc(securityEvents.createdAt), desc(securityEvents.id))
      .offset(offset)
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((row) => {
      let details: Record<string, unknown> = {}
      if (row.detailsJson) {
        try {
          const parsed: unknown = JSON.parse(row.detailsJson)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            details = parsed as Record<string, unknown>
          }
        } catch { /* malformed JSON: return {} */ }
      }
      return {
        id: row.id,
        event_type: row.eventType,
        ip_address: row.ipAddress,
        user_agent: row.userAgent,
        created_at: row.createdAt
          ? row.createdAt.toISOString().replace(/\.\d{3}Z$/, "+00:00")
          : null,
        details,
      }
    })

    const payload = { items, has_more: hasMore, offset, limit }
    return c.json({ ok: true, data: payload, error: null, meta: { has_more: hasMore, offset, limit } })
  },
)

// ── Demo workspace (Flask port of routes/auth.py:1085 / :1148) ───────────────
// POST /api/auth/demo-data — seed a demo workspace into a brand-new (empty) account.
// Rate: 10 per 60 s per authenticated user (RATE_LIMIT_AUTH). Seed-all-or-nothing.
router.post("/demo-data", requireAuth, createRateLimiter(10, 60), async (c) => {
  const { userId } = c.var.session
  const db = getDb()
  try {
    const summary = await db.transaction(async (tx) => loadDemoWorkspace(tx, userId))
    // Cache-bust after commit, fire-and-forget (matches transactions.ts).
    ;(async () => {
      try {
        await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
      } catch (err) {
        Sentry.captureException(err, { tags: { handler: "auth.demoData.load.cacheBust", userId } })
      }
    })()
    return c.json({ ok: true, data: summary, error: null, meta: {} })
  } catch (err) {
    if (err instanceof DemoDataConflictError) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "Demo data can only be loaded into an empty account.",
          code: "demo_data_not_empty",
        },
        409,
      )
    }
    Sentry.captureException(err, { tags: { handler: "auth.demoData.load", userId } })
    console.error("[demo-data] load failed for userId=%d:", userId, err)
    return c.json(
      { ok: false, data: null, error: "Failed to load demo data.", code: "demo_data_load_failed" },
      500,
    )
  }
})

// POST /api/auth/demo-data/clear — remove the demo workspace without deleting the account.
// Rate: 3 per 600 s per authenticated user (RATE_LIMIT_DEMO_DATA_CLEAR). Clear-all-or-nothing.
router.post("/demo-data/clear", requireAuth, createRateLimiter(3, 600), async (c) => {
  const { userId } = c.var.session
  const db = getDb()
  try {
    const summary = await db.transaction(async (tx) => clearDemoWorkspace(tx, userId))
    ;(async () => {
      try {
        await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
      } catch (err) {
        Sentry.captureException(err, { tags: { handler: "auth.demoData.clear.cacheBust", userId } })
      }
    })()
    return c.json({ ok: true, data: summary, error: null, meta: {} })
  } catch (err) {
    if (err instanceof DemoDataNotLoadedError) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "No active demo workspace was found.",
          code: "demo_data_not_loaded",
        },
        409,
      )
    }
    Sentry.captureException(err, { tags: { handler: "auth.demoData.clear", userId } })
    console.error("[demo-data] clear failed for userId=%d:", userId, err)
    return c.json(
      { ok: false, data: null, error: "Failed to clear demo data.", code: "demo_data_clear_failed" },
      500,
    )
  }
})

export { router as authRouter, DELETE_INTENT_COOKIE }
