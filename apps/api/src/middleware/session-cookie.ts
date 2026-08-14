/*
 * Session cookie issuance — the single canonical home for the session cookie's name,
 * lifetime, and attribute set (10e-3a-EXTRACT).
 *
 * WHY THIS IS ITS OWN MODULE rather than part of middleware/auth.ts (10e-R36, superseding
 * 10e-R9's naming of that file as the destination). The four protected auth route-test files
 * (auth.callback / auth.2fa / auth.2fa-verify / auth.sessions) replace `../middleware/auth`
 * with a whole-module `vi.mock` FACTORY that enumerates its exports. That enumeration is a
 * CLOSED LIST: any new export added to middleware/auth.ts and called from routes/auth.ts
 * resolves to `undefined` in those four files and throws at runtime — measured, 8 failures,
 * all on cookie-issuing paths. Putting the helper here means those four mocks are untouched
 * and the REAL helper executes in them, so a refactor advertised as zero-behaviour-change is
 * provable by those files staying green without being edited.
 *
 * NO RE-EXPORT FROM middleware/auth.ts, deliberately (10e-R36 condition 1). auth.ts imports
 * SESSION_COOKIE FROM here. Re-exporting it there would recreate exactly the enumeration
 * coupling this split exists to remove, and would give one symbol two import paths.
 *
 * The attribute set below is the ONLY place these five options are written. It replaced four
 * byte-identical hand-typed copies in routes/auth.ts (OIDC callback, 2FA disable re-issue,
 * 2FA verify login, revoke-all re-issue). The four were verified identical BEFORE the
 * extraction — no divergence had crept in yet — which is precisely why this was the moment to
 * extract: 10e-3a was about to add a fifth copy.
 */

import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import { env } from "../lib/env"

export const SESSION_COOKIE = "statera_session"

/**
 * Session cookie lifetime, in seconds. 30 days — matches the JWT's own
 * setExpirationTime("30d") in createSessionToken (middleware/auth.ts), so the cookie and the
 * token it carries expire together.
 *
 * Deliberately NOT unified with middleware/auth.ts's SV_REVOKE_TTL_SECONDS even though both
 * are 30 days: that one is the sv deny-list key's TTL and is pinned to JWT expiry, this one
 * is the browser's cookie lifetime. They coincide today for the same underlying reason but
 * are independently motivated, and collapsing them would let a future change to either
 * silently move the other.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * Set the session cookie.
 *
 * `secure` is derived from env.isDev at CALL time, not module-load time, so a test can drive
 * both postures. NOTE: before session-cookie.test.ts, NO test in this repo asserted ANY of
 * these attributes — a dropped `secure` produced a green suite, a green typecheck, and a
 * session cookie transmitted in plaintext. That guard, not the deduplication, is why touching
 * the working production login path was approved.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
}
