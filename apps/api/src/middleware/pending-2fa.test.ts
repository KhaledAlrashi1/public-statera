/**
 * Set-Cookie attribute guard for setPending2faCookie, plus a mint/verify round-trip
 * (10e-3a-EXTRACT-2, condition 10e-R107(e)).
 *
 * WHY THIS FILE EXISTS, established by measurement rather than assumed. Before it, NO test
 * in this repo asserted a single attribute of the pending-2FA cookie. The only occurrence of
 * `statera_pending_2fa` in the whole api suite was auth.2fa-verify.test.ts:122, which SENDS
 * the cookie in a request header; every HttpOnly/SameSite/Max-Age assertion in the suite —
 * all eleven of them — lived in session-cookie.test.ts. So an edit dropping `secure` here
 * produced a green suite, a green typecheck, and a pre-session 2FA cookie transmitted in
 * plaintext. Leaving that guard behind is what earns a mechanical refactor of the production
 * auth path its risk; the deduplication alone would not.
 *
 * WHY env IS MOCKED, and why the obvious test would have been vacuous. The helper sets
 * `secure: !env.isDev`, and vitest.config.ts sets STATERA_DEV_MODE="true", so in the hermetic
 * run env.isDev === true and the emitted header carries NO Secure attribute. Asserting
 * `Secure` against the real env would fail for the wrong reason; asserting its ABSENCE would
 * pass forever while pinning the wrong posture. Mocking env is what makes the production
 * branch reachable. Both postures are pinned and the PAIR is the point: PROD catches an
 * unconditional drop of Secure, DEV catches an unconditional force of it.
 *
 * The round-trip cases exist because this commit MOVED a JWT mint and its verifier and
 * switched them from stateSecret() to a module-local pendingSecret(). Both derive from the
 * same env.sessionSecret, so the move is value-preserving — but "is value-preserving" is a
 * claim, and these cases are what make it checkable.
 *
 * SCOPE. This file pins the module's OUTPUT. It does not prove that routes/auth.ts executes
 * the real helpers rather than a mock — that is a property of the four protected auth test
 * files' own mock configuration, verified separately and reported in the close-out
 * (10e-R36 condition 2, inherited by 10e-R107(b)).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { decodeJwt } from "jose"

// vi.mock factories are hoisted above imports, so the mutable env must be created inside
// vi.hoisted or the factory would reference an uninitialised binding.
const h = vi.hoisted(() => ({
  mockEnv: {
    isDev: true,
    sessionSecret: "test-session-secret-at-least-32-chars-long",
    redisUrl: "redis://127.0.0.1:6379/1",
  },
}))
vi.mock("../lib/env", () => ({ env: h.mockEnv }))

import {
  PENDING_2FA_COOKIE,
  PENDING_2FA_TTL,
  packPending2faToken,
  setPending2faCookie,
  verifyPending2faToken,
} from "./pending-2fa"

/** Emit one Set-Cookie via the real helper on a real Hono route and return the header. */
async function emitSetCookie(): Promise<string> {
  const app = new Hono()
  app.get("/emit", (c) => {
    setPending2faCookie(c, "test.jwt.token")
    return c.body(null, 204)
  })
  const res = await app.request("/emit")
  const header = res.headers.get("set-cookie")
  expect(header).not.toBeNull()
  return header as string
}

/** Parse `a=b; HttpOnly; Path=/` into a lowercased-key attribute map. */
function parseAttrs(header: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of header.split(";")) {
    const seg = part.trim()
    if (!seg) continue
    const eq = seg.indexOf("=")
    if (eq === -1) out.set(seg.toLowerCase(), "")
    else out.set(seg.slice(0, eq).toLowerCase(), seg.slice(eq + 1))
  }
  return out
}

beforeEach(() => {
  h.mockEnv.isDev = true // restore the hermetic default after every case
})

describe("setPending2faCookie — emitted Set-Cookie attributes", () => {
  it("carries the cookie name and the token value", async () => {
    const attrs = parseAttrs(await emitSetCookie())
    expect(attrs.get(PENDING_2FA_COOKIE)).toBe("test.jwt.token")
  })

  it("PROD posture (isDev=false): HttpOnly, Secure, SameSite=Lax, Max-Age=300, Path=/", async () => {
    h.mockEnv.isDev = false
    const attrs = parseAttrs(await emitSetCookie())

    expect(attrs.has("httponly")).toBe(true)
    expect(attrs.has("secure")).toBe(true)
    expect(attrs.get("samesite")).toBe("Lax")
    expect(attrs.get("max-age")).toBe("300")
    expect(attrs.get("path")).toBe("/")
  })

  it("DEV posture (isDev=true, the hermetic default): identical EXCEPT Secure is absent", async () => {
    // Pins that `secure` is the ONLY env-dependent attribute. Without this, an edit making
    // some other attribute conditional on isDev would slip past the PROD case above.
    expect(h.mockEnv.isDev).toBe(true)
    const attrs = parseAttrs(await emitSetCookie())

    expect(attrs.has("httponly")).toBe(true)
    expect(attrs.has("secure")).toBe(false)
    expect(attrs.get("samesite")).toBe("Lax")
    expect(attrs.get("max-age")).toBe("300")
    expect(attrs.get("path")).toBe("/")
  })

  it("Max-Age is exactly the exported 5-minute constant, not a coincidentally equal literal", async () => {
    expect(PENDING_2FA_TTL).toBe(300)
    const attrs = parseAttrs(await emitSetCookie())
    expect(attrs.get("max-age")).toBe(String(PENDING_2FA_TTL))
  })
})

describe("packPending2faToken / verifyPending2faToken — round trip", () => {
  it("round-trips userId, and the JWT expiry derives from PENDING_2FA_TTL", async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await packPending2faToken(4242)

    const { userId } = await verifyPending2faToken(token)
    expect(userId).toBe(4242)

    // The cookie Max-Age and the JWT exp are driven by ONE constant, so the cookie cannot
    // outlive the token it carries. Asserted as a window, not an instant, to stay stable.
    const exp = decodeJwt(token).exp as number
    expect(exp).toBeGreaterThanOrEqual(before + PENDING_2FA_TTL)
    expect(exp).toBeLessThanOrEqual(before + PENDING_2FA_TTL + 5)
  })

  it("carries deleteIntent when true and OMITS it otherwise (absent, not false)", async () => {
    const withIntent = await verifyPending2faToken(await packPending2faToken(7, true))
    expect(withIntent.deleteIntent).toBe(true)

    // The delete branch in /2fa/verify tests truthiness, so an accidental `deleteIntent: false`
    // would behave the same today — but it would also serialise into the token, and a future
    // reader checking `"deleteIntent" in payload` would then get the wrong answer.
    const withoutIntent = await verifyPending2faToken(await packPending2faToken(7))
    expect(withoutIntent.deleteIntent).toBeUndefined()
  })

  it("rejects a token signed with a different secret", async () => {
    const token = await packPending2faToken(1)
    h.mockEnv.sessionSecret = "a-completely-different-secret-value-32ch"
    await expect(verifyPending2faToken(token)).rejects.toThrow()
    h.mockEnv.sessionSecret = "test-session-secret-at-least-32-chars-long"
  })
})
