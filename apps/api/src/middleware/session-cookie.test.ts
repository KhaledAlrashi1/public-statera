/**
 * Set-Cookie attribute guard for setSessionCookie (10e-3a-EXTRACT, condition 10e-R9(c)).
 *
 * WHY THIS FILE EXISTS. Before it, NO test in this repo asserted a single attribute of the
 * session cookie — not HttpOnly, not Secure, not SameSite, not Max-Age, not Path. An edit
 * that dropped `secure` produced a green suite, a green typecheck, and a session cookie
 * transmitted in plaintext. That is what made the four-call-site extraction worth doing to a
 * working production login path: it leaves behind a guard the codebase lacked.
 *
 * WHY env IS MOCKED, and why the obvious test would have been vacuous. The helper sets
 * `secure: !env.isDev`, and vitest.config.ts sets STATERA_DEV_MODE="true", so in the hermetic
 * run env.isDev === true and the emitted header carries NO Secure attribute. A test asserting
 * `Secure` against the real env would fail for the wrong reason; a test asserting its ABSENCE
 * would pass forever while pinning the wrong posture and saying nothing about production.
 * Mocking env is what makes the production branch reachable, so `Secure` is asserted where it
 * actually applies rather than asserted vacuously or skipped.
 *
 * Both postures are pinned, and the pair is the point: PROD asserts the full attribute set,
 * DEV asserts that `Secure` is the ONE attribute that differs. Together they catch both an
 * unconditional drop of Secure (PROD goes red) and an unconditional force of it (DEV goes red).
 *
 * SCOPE OF THIS FILE. It pins the helper's OUTPUT. It does not, and cannot, prove that the
 * four protected auth route-test files execute the real helper rather than a mock — that is a
 * property of THEIR mock configuration, not of this file, and it is verified separately and
 * reported in the 10e-3a-EXTRACT close-out (10e-R36 condition 2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

// vi.mock factories are hoisted above imports, so the mutable env must be created inside
// vi.hoisted or the factory would reference an uninitialised binding.
const h = vi.hoisted(() => ({
  mockEnv: {
    isDev: true,
    sessionSecret: "test-session-secret",
    redisUrl: "redis://127.0.0.1:6379/1",
  },
}))
vi.mock("../lib/env", () => ({ env: h.mockEnv }))

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, setSessionCookie } from "./session-cookie"

/** Emit one Set-Cookie via the real helper on a real Hono route and return the header. */
async function emitSetCookie(): Promise<string> {
  const app = new Hono()
  app.get("/emit", (c) => {
    setSessionCookie(c, "test.jwt.token")
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

describe("setSessionCookie — emitted Set-Cookie attributes", () => {
  it("carries the cookie name and the token value", async () => {
    const attrs = parseAttrs(await emitSetCookie())
    expect(attrs.get(SESSION_COOKIE)).toBe("test.jwt.token")
  })

  it("PROD posture (isDev=false): HttpOnly, Secure, SameSite=Lax, Max-Age=2592000, Path=/", async () => {
    h.mockEnv.isDev = false
    const header = await emitSetCookie()
    const attrs = parseAttrs(header)

    expect(attrs.has("httponly")).toBe(true)
    expect(attrs.has("secure")).toBe(true)
    expect(attrs.get("samesite")).toBe("Lax")
    expect(attrs.get("max-age")).toBe("2592000")
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
    expect(attrs.get("max-age")).toBe("2592000")
    expect(attrs.get("path")).toBe("/")
  })

  it("Max-Age is exactly the exported 30-day constant, not a coincidentally equal literal", async () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(2592000)
    const attrs = parseAttrs(await emitSetCookie())
    expect(attrs.get("max-age")).toBe(String(SESSION_MAX_AGE_SECONDS))
  })
})
