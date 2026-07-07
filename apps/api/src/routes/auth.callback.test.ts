/**
 * Unit test for the OIDC callback reactivation branch (Module 10d-0b).
 *
 * Focus: an existing user row with isActive=false is reactivated-as-fresh —
 * row flipped active, email/displayName refreshed, TOTP fields nulled, and the
 * user routed through the new-user redirect (/welcome?source=signup).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { SignJWT } from "jose"

const SESSION_SECRET = "test-session-secret-at-least-32-chars-long"

// Mutable OIDC claims holder (hoisted so the vi.mock factory can close over it).
const oidc = vi.hoisted(() => ({ claims: {} as Record<string, unknown> }))

// ── Module mocks (mirror auth.2fa-verify.test.ts, + a functional getOidcClient) ──

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../lib/rate-limit", () => ({ createRateLimiter: vi.fn(() => (_c: unknown, next: () => Promise<void>) => next()) }))
vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc1:${s}`),
  decrypt: vi.fn((s: string) => s.replace(/^enc1:/, "")),
}))
vi.mock("../lib/totp-lib", () => ({
  generateTotpSecret: vi.fn(() => "FAKESECRET"),
  generateTotpQrDataUri: vi.fn().mockResolvedValue("data:image/png;base64,FAKEQR"),
  generateBackupCodes: vi.fn(() => ["ab12-cd34"]),
  hashBackupCodes: vi.fn().mockResolvedValue(["$2b$12$h"]),
  verifyTotpCode: vi.fn(),
  verifyAndConsumeBackupCode: vi.fn(),
  parseBackupCodeHashes: vi.fn(() => []),
}))
vi.mock("../lib/product-events-lib", () => ({ recordEventOnce: vi.fn().mockResolvedValue(true) }))
vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../lib/oidc", () => ({
  generators: { state: vi.fn(() => "st"), nonce: vi.fn(() => "no") },
  getOidcClient: vi.fn(async () => ({
    callbackParams: () => ({}),
    callback: async () => ({ claims: () => oidc.claims }),
  })),
}))
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 42, externalId: "ext-42", authProvider: "google", sv: 1 })
    await next()
  }),
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
  createSessionToken: vi.fn().mockResolvedValue("new-session-token"),
  getAuthRedis: vi.fn(() => ({ get: vi.fn(), del: vi.fn(), multi: vi.fn() })),
}))
vi.mock("../lib/env", () => ({
  env: {
    isDev: true,
    sessionSecret: "test-session-secret-at-least-32-chars-long",
    oauthClientId: "test",
    oauthRedirectUri: "http://localhost:3000/api/auth/callback",
    oauthProvider: "google",
    corsOrigins: ["http://localhost:3002"],
  },
}))

// ── Capturing DB mock ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve)
      if (prop === "catch") return () => makeChain()
      return () => makeChain()
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(rows: unknown[], updateSets: any[], insertValues: any[]): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve)
      if (prop === "update") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return () => ({ set: (arg: any) => { updateSets.push(arg); return makeChain() } })
      }
      if (prop === "insert") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return () => ({ values: (arg: any) => { insertValues.push(arg); return { catch: () => makeChain() } } })
      }
      return (..._args: unknown[]) => makeDb(rows, updateSets, insertValues)
    },
  })
}

// ── Imports under test ────────────────────────────────────────────────────────

import { testClient } from "hono/testing"
import * as connection from "../db/connection"
import { authRouter } from "./auth"
import { recordEventOnce } from "../lib/product-events-lib"
import { createSessionToken } from "../middleware/auth"

const client = testClient(authRouter)

async function makeStateCookie(): Promise<string> {
  return new SignJWT({ state: "st", nonce: "no" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SESSION_SECRET))
}

beforeEach(() => {
  vi.clearAllMocks()
  oidc.claims = { sub: "ext-42", email: "user@example.com", name: "Refreshed Name" }
})

describe("GET /callback — reactivate-as-fresh on inactive account (10d-0b)", () => {
  it("flips active, refreshes claims, nulls TOTP, and redirects to /welcome?source=signup", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateSets: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertValues: any[] = []
    const existingInactive = {
      id: 42,
      isActive: false,
      sessionVersion: 3,
      displayName: "Old Name",
      email: "old@example.com",
      externalId: "ext-42",
      authProvider: "google",
      totpEnabled: false,
    }
    vi.spyOn(connection, "getDb").mockReturnValue(makeDb([existingInactive], updateSets, insertValues))

    const stateCookie = await makeStateCookie()
    // @ts-expect-error Hono testClient typing
    const res = await client.callback.$get({}, { headers: { Cookie: `oidc_state=${stateCookie}` } })

    // New-user redirect target.
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("http://localhost:3002/welcome?source=signup")

    // Reactivation UPDATE is the first update (lastLoginAt is the second).
    expect(updateSets[0]).toEqual({
      isActive: true,
      email: "user@example.com",
      displayName: "Refreshed Name",
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodesJson: null,
    })

    // Fresh-registration parity: signup_completed re-emitted, account.reactivated audited.
    expect(recordEventOnce).toHaveBeenCalledWith(42, "signup_completed", {}, expect.anything())
    expect(insertValues.some((v) => v.eventType === "account.reactivated")).toBe(true)

    // Session issued with the (already-bumped) sessionVersion read as-is.
    expect(createSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, sv: 3 }),
    )
  })
})
