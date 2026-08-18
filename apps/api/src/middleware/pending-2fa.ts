/*
 * Pending-2FA token and cookie — the single canonical home for the statera_pending_2fa
 * cookie's name, lifetime and attribute set, and for the short-lived JWT it carries
 * (10e-3a-EXTRACT-2).
 *
 * WHY THIS IS ITS OWN MODULE (10e-R107). These symbols were module-private to
 * routes/auth.ts, so routes/magic-link.ts could not reach them: 10e-3a's TOTP gate would
 * have had to hand-type a second copy of the JWT mint and the cookie option block. That is
 * the same fifth-copy problem 10e-3a-EXTRACT refused for the session cookie, one surface
 * over. Note the difference in shape, so the precedent is not over-read: that extract
 * COLLAPSED four existing byte-identical copies; this one collapses ONE and pre-empts the
 * second before it is written.
 *
 * WHY NOT middleware/auth.ts (10e-R36, inherited unchanged). The four protected auth
 * route-test files (auth.callback / auth.2fa / auth.2fa-verify / auth.sessions) replace
 * `../middleware/auth` with a whole-module `vi.mock` FACTORY that enumerates its exports —
 * a CLOSED LIST. A symbol added there and called from routes/auth.ts resolves to
 * `undefined` in all four and throws at runtime (measured at 10e-3a-EXTRACT: 8 failures,
 * every one on a cookie-issuing path). This module is wholesale-mocked by nobody, so those
 * four factories stay byte-untouched and the REAL helpers execute inside them.
 *
 * NO RE-EXPORT FROM routes/auth.ts (10e-R36 condition 1, inherited). routes/auth.ts
 * IMPORTS these symbols and re-exports none of them, so each has exactly one import path
 * and the enumeration coupling is not recreated one layer down.
 *
 * stateSecret DELIBERATELY NOT MOVED (10e-R125 / 10e-R128). Measured before deciding:
 * stateSecret() had SIX call sites in routes/auth.ts spanning THREE unrelated token
 * families — OAuth state (:66/:70), pending-2FA (:85/:89), delete-intent (:100/:105).
 * Filing a symbol that serves three families inside a module named for one of them is a
 * misfiling of the kind that reads as correct for a year. It is also not a secret:
 * `new TextEncoder().encode(env.sessionSecret)` is a TYPE ADAPTER (string -> Uint8Array,
 * which is what jose requires) over a value whose single home is lib/env.ts and stays
 * there under either option. The coupling between the three families is COINCIDENTAL, not
 * contractual — each family signs AND verifies within its own pair, so no cross-module
 * signature verification exists anywhere and two adapters cannot desynchronize anything.
 * Promoting it would assert a contract that does not exist, and would make a future
 * per-family key separation harder by having first declared them one thing. So this module
 * derives its own below, and routes/auth.ts keeps stateSecret for the remaining two
 * families (6 -> 4 call sites). This is why it does NOT contradict 10e-R9 or 10e-R63:
 * both refused copies of things genuinely shared — a cookie attribute set that must agree
 * across issuers, an audit path whose Sentry tagging must not drift. A duplication rule is
 * about shared contracts, not about repeated characters.
 *
 * QUEUED, NOT FIXED HERE (10e-R129). The token families sign with one key and carry no
 * family-distinguishing claim — no `typ`, `aud` or `iss` — so cross-family presentation
 * may be possible, and the consequence that would matter is whether a statera_pending_2fa
 * token satisfies verifyDeleteIntentToken (a 2FA bypass on account deletion). This is
 * PRE-EXISTING and 10e does not enlarge it: pendingSecret() derives from the same
 * env.sessionSecret the previous code did, so the surface after this commit is exactly
 * what it was before. Its own cycle; do not fix it inside a mechanical move.
 */

import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import { SignJWT, jwtVerify } from "jose"
import { env } from "../lib/env"

/** Short-lived cookie carrying userId across the 2FA verify step (post-OIDC, pre-session). */
export const PENDING_2FA_COOKIE = "statera_pending_2fa"

/**
 * Pending-2FA cookie and JWT lifetime, in seconds. 5 minutes — deliberately ONE constant
 * for both, so the cookie cannot outlive the token it carries or vice versa.
 */
export const PENDING_2FA_TTL = 300

/**
 * Signing key material for this token family only.
 *
 * Carried verbatim in VALUE from routes/auth.ts's stateSecret() — the same
 * env.sessionSecret, so every token minted before this commit still verifies after it.
 * Renamed and localised rather than shared: see the stateSecret note in the file header.
 */
function pendingSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}

/**
 * Mint the pending-2FA token. Carries only userId, an issued-at stamp, and the optional
 * delete-intent flag — never a code, never a secret — so possession of it cannot bypass
 * the code check it gates.
 */
export async function packPending2faToken(userId: number, deleteIntent?: boolean): Promise<string> {
  const claims: Record<string, unknown> = { userId, pendingAt: Date.now() }
  if (deleteIntent) claims.deleteIntent = true
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${PENDING_2FA_TTL}s`)
    .sign(pendingSecret())
}

/** Verify and unpack the pending-2FA token. Throws if the signature or expiry fails. */
export async function verifyPending2faToken(token: string): Promise<{ userId: number; deleteIntent?: boolean }> {
  const { payload } = await jwtVerify(token, pendingSecret())
  return {
    userId: payload["userId"] as number,
    deleteIntent: payload["deleteIntent"] as boolean | undefined,
  }
}

/**
 * Set the pending-2FA cookie.
 *
 * `secure` is derived from env.isDev at CALL time, not module-load time, so a test can
 * drive both postures. NOTE: before pending-2fa.test.ts, NO test in this repo asserted ANY
 * of these attributes — measured, not assumed: the only occurrence of the cookie name in
 * the suite was a test SENDING it, and every HttpOnly/SameSite/Max-Age assertion lived in
 * session-cookie.test.ts. A dropped `secure` here produced a green suite, a green
 * typecheck, and a pre-session 2FA cookie transmitted in plaintext. That guard, not the
 * deduplication, is what earns this refactor its risk (10e-R107(e)).
 */
export function setPending2faCookie(c: Context, token: string): void {
  setCookie(c, PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: PENDING_2FA_TTL,
    path: "/",
  })
}
