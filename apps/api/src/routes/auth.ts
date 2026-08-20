import { Hono } from "hono"
import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { SignJWT, jwtVerify } from "jose"
import { z } from "zod"
import { and, desc, eq, like } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, userProfiles, securityEvents } from "../db/schema"
import { env } from "../lib/env"
import { generators, getOidcClient } from "../lib/oidc"
import { createSessionToken, revokeSessionVersion, requireAuth, getAuthRedis } from "../middleware/auth"
import { setSessionCookie, SESSION_COOKIE } from "../middleware/session-cookie"
import {
  PENDING_2FA_COOKIE,
  packPending2faToken,
  setPending2faCookie,
  verifyPending2faToken,
} from "../middleware/pending-2fa"
import { Sentry } from "../lib/sentry"
import { recordEventOnce } from "../lib/product-events-lib"
import { auditSecurityEvent } from "../lib/security-events-lib"
import { normalizeEmail } from "../lib/magic-link-lib"
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

// Failure ceiling for POST /2fa/verify. Stays here deliberately (10e-3a-EXTRACT-2): it is
// that endpoint's retry policy, not a property of the token. PENDING_2FA_COOKIE and
// PENDING_2FA_TTL moved to middleware/pending-2fa.ts with the mint and the cookie setter.
const PENDING_2FA_MAX_FAILURES = 3

// ── 10e-3b: OIDC email adoption ──────────────────────────────────────────────
//
// Deliberate deviations from Flask: Flask has no OIDC callback at all, so every
// decision below is Hono-native and is ruled rather than ported.
//
// Closed reason set for a refused adoption (10e-R162(d), 2026-08-19). Enumerated
// in code, not free-form: the enumeration is what makes the BLOCKING no-address-
// in-payload scan checkable rather than a promise.
//
// `inexact_email_match` is SHARED BY VALUE with magic-link's VERIFY_FAIL_REASONS
// — one decision class must not report two literals. The two arrays are pinned
// byte-identical by a hermetic assertion (10e-R162(d)); a comment would rot,
// an assertion goes red.
const ADOPT_FAIL_REASONS = [
  "claim_unparseable",
  "email_unverified",
  "inexact_email_match",
  "delete_reauth_context",
  "duplicate_email_race",
] as const
export type AdoptFailReason = (typeof ADOPT_FAIL_REASONS)[number]
export { ADOPT_FAIL_REASONS }

function frontendOrigin(): string {
  return env.corsOrigins[0] ?? "http://127.0.0.1:3002"
}

/**
 * The ONE generic callback-failure exit (10e-R161, 2026-08-19).
 *
 * Bare `/login`, no query parameter. A distinguishing literal such as
 * `?error=oidc_adopt_refused` would be an ACCOUNT-EXISTENCE ORACLE: an attacker
 * holding a Google account at josé@x.com who receives a refusal distinguishable
 * from the callback's other failures has learned a Statera account exists at an
 * accent-variant of that address. That is the signal R14's uniform envelope
 * suppresses on the verify side, arriving through a query param instead of a
 * response body — the adoption decision has two front doors and both must be
 * uniform. No param at all also means a param with one value cannot later
 * acquire a second one, which is how such oracles get reintroduced.
 *
 * Co-routed causes, so the refusal is not the only redirecting failure and the
 * anonymity set is larger than one: token-exchange failure and an unparseable
 * email claim. State-cookie failures are deliberately NOT co-routed — their
 * dominant cause is blocked/expired cookies, and redirecting such a user to
 * /login produces a silent sign-in loop with no diagnostic, which is worse than
 * the JSON that names the cause in words.
 */
function failCallback(c: Context): Response {
  return c.redirect(`${frontendOrigin()}/login`)
}

/**
 * Refuse an adoption: audit, then take the generic exit. The audit is
 * fire-and-forget and never reaches the response, so every refusal is
 * byte-identical to every co-routed failure.
 *
 * `userId` is the TARGET account when one was located. That is a single-account
 * security event the owner would want, not a cross-account link — contrast
 * `account.email_refresh_skipped`, which deliberately omits the colliding row's
 * id (10e-R162(e)).
 */
function refuseAdoption(
  c: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  reason: AdoptFailReason,
  userId: number | null,
): Response {
  auditSecurityEvent(db, "login.failed", {
    userId: userId ?? undefined,
    ipAddress: c.req.header("x-forwarded-for") ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
    details: { reason },
  })
  return failCallback(c)
}

/** MySQL 1062 — the `users_email_unique` violation, observed as ER_DUP_ENTRY. */
function isDuplicateEmailError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY"
}

/**
 * CRASH PATHS 2 and 3 of 3 (10e-R13(b), extended to the reactivate branch by
 * 10e-R154 after F-3b-1 found a third site the ruling did not name).
 *
 * Both surviving branches refresh `users.email` from the provider claims, and
 * both hit `users_email_unique` when the provider-side address has moved to one
 * another Statera row already holds. 10e materially enlarges this because
 * magic-link creates users keyed on arbitrary user-supplied addresses, not only
 * on addresses Google issued. It is reachable rather than theoretical because
 * `purgeUserAccountRows` never clears `users.email` (F-3b-2), so soft-deleted
 * rows keep occupying the unique index — a retention that is LOAD-BEARING, not a
 * defect, since both reactivation paths find their row by it (10e-R155).
 *
 * The identity is already established by (auth_provider, external_id), so the
 * refresh is COSMETIC. Failing a login over a cosmetic write would be strictly
 * worse than a stale address, so the write is attempted and, on collision,
 * retried without `email`; the login proceeds. Attempt-and-translate rather than
 * pre-check-then-write deliberately: a pre-check carries its own TOCTOU race and
 * costs an extra SELECT on every login for a branch that almost never fires.
 *
 * The stale-address consequence is the queued 10e-R72/R85 item — same root, same
 * user, post-announcement, its own cycle. Cited, not bundled.
 */
async function updateWithEmailFallback(
  c: Context,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: number,
  email: string,
  rest: Record<string, unknown>,
): Promise<void> {
  try {
    await db.update(users).set({ ...rest, email }).where(eq(users.id, userId))
    return
  } catch (err) {
    if (!isDuplicateEmailError(err)) throw err
  }

  await db.update(users).set(rest).where(eq(users.id, userId))

  // Records only the reason. NOT the colliding address (10e-R11 BLOCKING) and
  // NOT the other row's id: pairing "this address collided" with "with this
  // user" reconstructs the very association the address scan exists to prevent
  // (10e-R162(e)).
  auditSecurityEvent(db, "account.email_refresh_skipped", {
    userId,
    ipAddress: c.req.header("x-forwarded-for") ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
    details: { reason: "email_conflict" },
  })
}

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
  } catch {
    // Co-routed to the generic exit (10e-R161): post-state-validation, and
    // indistinguishable from an adoption refusal from outside. The provider's
    // message is deliberately dropped rather than rendered — it is diagnostic
    // text for an operator, not copy for a browser.
    return failCallback(c)
  }

  const claims = tokenSet.claims()
  const externalId = claims.sub
  const provider = env.oauthProvider
  const db = getDb()

  // ── Email boundary gate (10e-R156(d), 2026-08-19) ───────────────────────────
  // R122 bounded its own exposure on the magic-link side by leaning on zod's
  // .email(), which rejects a non-ASCII local part before any comparison runs.
  // THIS PATH HAD NO VALIDATOR OF ANY KIND (F-3b-4): claims.email reached the
  // INSERT and both UPDATEs verbatim, so the one mitigation R122 assumed was
  // absent exactly where the same match gate was about to be introduced.
  // Parsing and normalizing here restores it.
  //
  // This is DEFENCE IN DEPTH and must never be argued as the primary gate; the
  // primary gate is the exact adoption comparison below (10e-R156(d)).
  //
  // Subsumes the former "No email in OIDC claims" check — an absent claim fails
  // to parse — and that exit is co-routed here by 10e-R161 anyway.
  //
  // CONSEQUENCE, recorded rather than hidden: a provider issuing a non-ASCII
  // local part can no longer sign in at all, where today it would succeed. A
  // no-op against Google, whose addresses are ASCII — which is the point, since
  // the codebase is provider-agnostic by architectural decision and R13(a) says
  // the day a second provider is added is the day this becomes load-bearing.
  const parsedEmail = z.string().email().safeParse(claims.email)
  if (!parsedEmail.success) {
    return refuseAdoption(c, db, "claim_unparseable", null)
  }
  const email = normalizeEmail(parsedEmail.data)

  let [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.externalId, externalId)))
    .limit(1)

  // ── ADOPTION (10e-3b) ───────────────────────────────────────────────────────
  // Adoption converts a not-found into a found, and the three branches below then
  // run UNCHANGED. That shape is the design decision: an adopted row may be
  // soft-deleted or may carry TOTP, so a fourth branch would duplicate the
  // reactivate and 2FA-gate logic, and duplicated auth logic is what 10e-R9 and
  // 10e-R63 exist to prevent. Routing through the existing branches means an
  // adopted soft-deleted row inherits reactivate-as-fresh — including reading
  // sessionVersion as-is, never re-bumping it, whose reasoning ORIGINATED here
  // at 10d-0a (10e-R160) — and an adopted row with TOTP cannot bypass the gate.
  if (!existing) {
    const [byEmail] = await db
      .select()
      .from(users)
      // COLLATION-DEPENDENT BY DESIGN (utf8mb4_0900_ai_ci) and must NOT be made
      // exact: an exact lookup would miss a stored "Khaled@Gmail.com" for a
      // normalized "khaled@gmail.com", fall through to INSERT, and hit
      // users_email_unique — the F2 crash the adoption exists to prevent
      // (10e-R82/R83). What becomes exact is the ADOPTION DECISION below.
      // Those are different things.
      .where(eq(users.email, email))
      .limit(1)

    if (byEmail) {
      // GATE 1 (10e-R13(a)) — never bind an existing account to an identity on
      // the strength of an unverified claim. Absent and false collapse together.
      if (claims.email_verified !== true) {
        return refuseAdoption(c, db, "email_unverified", byEmail.id)
      }

      // GATE 2 (10e-R122(b) mirrored, amended by 10e-R156(c)) — BOTH SIDES are
      // normalized. R122(b)'s form compared against an already-normalized token
      // email; mirrored naively here the right-hand side is a raw provider claim,
      // and a claim of "Khaled@Gmail.com" against a stored "khaled@gmail.com"
      // would refuse a LEGITIMATE adoption — a security gate turned into a rare,
      // unreproducible sign-in failure. `email` is normalized above, so this
      // compares normalized to normalized: case-insensitive (load-bearing, stays)
      // and accent-SENSITIVE (the whole exposure).
      if (normalizeEmail(byEmail.email) !== email) {
        // TERMINAL — no INSERT fallthrough. Inserting here hits users_email_unique
        // under ai_ci and is the F2 crash on a new path (10e-R156(e)).
        return refuseAdoption(c, db, "inexact_email_match", byEmail.id)
      }

      // GATE 3 (defensive) — a delete-reauth flow requires a live session, so
      // (provider, external_id) resolves and adoption is unreachable here. The
      // guard costs one line and fails closed if that reasoning is ever wrong.
      if (stateDeleteIntent) {
        return refuseAdoption(c, db, "delete_reauth_context", byEmail.id)
      }

      // The bind rewrites (auth_provider, external_id), which is ITSELF a unique
      // index. It cannot collide in the ordinary case — we are only here because
      // the lookup on that exact composite returned nothing — but a concurrent
      // login of the same new identity can win the race between that lookup and
      // this write. Left unhandled it is an uncaught 500 on the auth path: the F2
      // class this sub-step exists to eliminate, and leaving one behind while
      // fixing three others would reproduce 10e-R154's own objection.
      //
      // Reuses `duplicate_email_race` rather than minting a sixth literal. The
      // literal names a CLASS — another request won the race for this identity —
      // and both index violations are that class. Mandate is 10e-R162(d)'s closed
      // set; this resolution is an implementation choice within it.
      try {
        await db
          .update(users)
          .set({ authProvider: provider, externalId })
          .where(eq(users.id, byEmail.id))
      } catch (err) {
        if (isDuplicateEmailError(err)) {
          return refuseAdoption(c, db, "duplicate_email_race", byEmail.id)
        }
        throw err
      }

      auditSecurityEvent(db, "account.provider_linked", {
        userId: byEmail.id,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })

      existing = { ...byEmail, authProvider: provider, externalId }
    }
  }

  let userId: number
  let sessionVersion: number
  let isNewUser = false

  if (!existing) {
    // CRASH PATH 1 of 3 (10e-R13(b) as extended by 10e-R154). The adoption block
    // above closes the ordinary case; what remains is the race, which adoption
    // narrows but cannot close — a concurrent request may claim this address
    // between the byEmail lookup and this INSERT. Translate the unique-constraint
    // violation into the same generic refusal rather than letting it 500.
    let inserted: { id: number }
    try {
      ;[inserted] = await db
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
    } catch (err) {
      if (isDuplicateEmailError(err)) {
        return refuseAdoption(c, db, "duplicate_email_race", null)
      }
      throw err
    }
    userId = inserted.id
    sessionVersion = 1 // DB default
    isNewUser = true
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.signup_completed", userId } }),
    )
  } else if (!existing.isActive) {
    // ── Reactivate-as-fresh (10d-0b) ──────────────────────────────────────────
    // Deliberate deviation from Flask: neither checkout ever reactivates. `is_active = True`
    // appears only in Flask test fixtures/scripts; the production inactive-login handler
    // (personal-finance auth.py:702-712, personal_statera auth.py:711-721) rejects with
    //   if not user.is_active: _audit_security_event("login.failed", ... account_disabled)
    //   return _legacy_api_error(error_code="auth_account_disabled", status=403, ...)
    // We deviate on product grounds (approved 2026-07-07): a consumer app must let a deleted
    // user return with the same Google account. The purge already emptied all data; the
    // retained row is a stub; the composite (auth_provider, external_id) unique is never
    // challenged. We treat this as a fresh registration.
    userId = existing.id
    // Read sessionVersion as-is: the purge that preceded this login already bumped it
    // (10d-0a), so the new token issued below is not self-denied by the sv_revoked key.
    sessionVersion = existing.sessionVersion

    // Flip active, refresh email/displayName from the provider claims (mirrors the active
    // path), and null the TOTP fields. The TOTP null is idempotent for post-10d-0a purges
    // (already null) but heals legacy stubs purged before this fix — without it, their
    // second and subsequent logins would hit the 2FA gate against a deleted-era secret.
    await updateWithEmailFallback(c, db, userId, email, {
      isActive: true,
      displayName: (claims["name"] as string | undefined) ?? existing.displayName,
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodesJson: null,
    })

    // Mirror the new-user branch: re-emit signup_completed (product_events were purged).
    isNewUser = true
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.reactivated.signup_completed", userId } }),
    )
    // Positive audit analog of Flask's login.failed/account_disabled rejection.
    auditSecurityEvent(db, "account.reactivated", {
      userId,
      ipAddress: c.req.header("x-forwarded-for") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    })
  } else {
    userId = existing.id
    sessionVersion = existing.sessionVersion

    // Anti-substitution: for delete-reauth flows the state cookie carries the userId that
    // initiated the request. Verify the re-authenticated user matches.
    if (stateDeleteIntent && stateUserId !== undefined && stateUserId !== userId) {
      return c.json({ error: "Re-authenticated user does not match the initiating session." }, 403)
    }

    // Refresh email and display name in case they changed at the provider.
    await updateWithEmailFallback(c, db, userId, email, {
      displayName: (claims["name"] as string | undefined) ?? existing.displayName,
    })

    // 7b: Gate on TOTP — issue a short-lived pending-2FA cookie and redirect to the
    // verify page. For delete-reauth flows, deleteIntent is embedded in the JWT so
    // /2fa/verify issues the delete-intent cookie instead of a new session on success.
    if (existing.totpEnabled) {
      const pendingToken = await packPending2faToken(userId, stateDeleteIntent ?? false)
      setPending2faCookie(c, pendingToken)
      if (stateDeleteIntent) {
        auditSecurityEvent(db, "account.delete_reauth.pending_2fa", {
          userId,
          ipAddress: c.req.header("x-forwarded-for") ?? undefined,
          userAgent: c.req.header("user-agent") ?? undefined,
        })
        return c.redirect(`${frontendOrigin()}/auth/2fa-verify?intent=delete`)
      }
      auditSecurityEvent(db, "login.pending_2fa", {
        userId,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })
      return c.redirect(`${frontendOrigin()}/auth/2fa-verify`)
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
      return c.redirect(`${frontendOrigin()}/delete-account/confirm`)
    }
  }

  // Non-blocking: failure must not delay the redirect or surface to the user.
  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId))
    .catch((err) => Sentry.captureException(err, { tags: { handler: "auth.callback.lastLoginAt", userId } }))

  const sessionToken = await createSessionToken({ userId, externalId, authProvider: provider, sv: sessionVersion })
  setSessionCookie(c, sessionToken)

  return c.redirect(`${frontendOrigin()}${isNewUser ? "/welcome?source=signup" : "/"}`)
})

// POST /api/auth/logout
router.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
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
    setSessionCookie(c, newToken)

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
      // (10d-0c) Surviving inactive-rejection path (e.g. a pending_2fa cookie issued before
      // deletion, then completed after the purge). Envelope + code already compliant; add the
      // audit event to match Flask's login.failed/account_disabled discipline. XHR endpoint —
      // JSON is correct here (not a full-document nav), so no redirect-with-error-param.
      auditSecurityEvent(db, "login.failed", { userId, ipAddress, userAgent, details: { reason: "account_disabled" } })
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
    setSessionCookie(c, sessionToken)

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
    setSessionCookie(c, newToken)

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
      setup_guide_seen: foundProfile?.setupGuideSeen ?? false,
      setup_guide_dismissed: foundProfile?.setupGuideDismissed ?? false,
    },
    demo_workspace: demoWorkspace,
  })
})

// Callers: ProfilePage.saveName (first_name, last_name), updateEmailNotificationPreference
// (email_notifications_enabled), saveTimezonePreference (timezone); DashboardPage.syncSetupGuideProfile
// (setup_guide_seen, setup_guide_dismissed). (has_debt_choice write-path removed in phase4
// SC-1/2 so the SC-3 column DROP is safe; the column is untouched by the running code.)
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
