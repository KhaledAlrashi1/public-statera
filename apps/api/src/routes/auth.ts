import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { SignJWT, jwtVerify } from "jose"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema"
import { env } from "../lib/env"
import { generators, getOidcClient } from "../lib/oidc"
import { createSessionToken, requireAuth } from "../middleware/auth"
import { Sentry } from "../lib/sentry"

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
  } else {
    if (!existing.isActive) {
      return c.json({ error: "Account is deactivated" }, 403)
    }
    userId = existing.id
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

  const sessionToken = await createSessionToken({ userId, externalId, authProvider: provider })
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

export { router as authRouter }
