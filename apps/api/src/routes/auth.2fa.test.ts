/**
 * Unit tests for the 2FA enable/disable routes.
 *
 * Uses Hono's test client. DB calls are mocked via the flat Drizzle proxy
 * pattern. totp-lib is mocked at the module level so no real crypto runs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 1, externalId: "ext-1", authProvider: "google", sv: 1 })
    await next()
  }),
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
  createSessionToken: vi.fn().mockResolvedValue("new-session-token"),
}))
vi.mock("../lib/rate-limit", () => ({ createRateLimiter: vi.fn(() => (_c: unknown, next: () => Promise<void>) => next()) }))
vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc1:${s}`),
  decrypt: vi.fn((s: string) => s.replace(/^enc1:/, "")),
}))
vi.mock("../lib/totp-lib", () => ({
  generateTotpSecret: vi.fn(() => "FAKESECRET"),
  generateTotpQrDataUri: vi.fn().mockResolvedValue("data:image/png;base64,FAKEQR"),
  generateBackupCodes: vi.fn(() => ["ab12-cd34", "ef56-gh78"]),
  hashBackupCodes: vi.fn().mockResolvedValue(["$2b$12$hashhash1", "$2b$12$hashhash2"]),
  verifyTotpCode: vi.fn(),
  verifyAndConsumeBackupCode: vi.fn(),
  parseBackupCodeHashes: vi.fn(() => ["$2b$12$hashhash1"]),
}))
vi.mock("../lib/product-events-lib", () => ({ recordEventOnce: vi.fn().mockResolvedValue(true) }))
vi.mock("../lib/sentry", () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock("../lib/oidc", () => ({ generators: { state: vi.fn(), nonce: vi.fn() }, getOidcClient: vi.fn() }))
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

// ── DB proxy mock ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve, reject)
      }
      return (..._args: unknown[]) => makeDbReturning(rows)
    },
  })
}

// ── Imports under test ────────────────────────────────────────────────────────

import { testClient } from "hono/testing"
import * as connection from "../db/connection"
import { authRouter } from "./auth"
import { verifyTotpCode } from "../lib/totp-lib"
import { revokeSessionVersion } from "../middleware/auth"

const client = testClient(authRouter)

beforeEach(() => { vi.clearAllMocks() })

// ── POST /2fa/setup ───────────────────────────────────────────────────────────

describe("POST /2fa/setup — success", () => {
  it("returns qr_data_uri, secret_b32, and backup_codes when 2FA is not yet enabled", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpEnabled: false }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["setup"].$post()
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.secret_b32).toBe("FAKESECRET")
    expect(data.qr_data_uri).toContain("data:image/png;base64,")
    expect(Array.isArray(data.backup_codes)).toBe(true)
  })
})

describe("POST /2fa/setup — already enabled", () => {
  it("returns 400 TOTP_ALREADY_ENABLED when 2FA is already active", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpEnabled: true }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["setup"].$post()
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("TOTP_ALREADY_ENABLED")
  })
})

// ── POST /2fa/confirm ─────────────────────────────────────────────────────────

describe("POST /2fa/confirm — valid code", () => {
  it("returns 200 ok:true when TOTP code is valid", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpSecret: "enc1:FAKESECRET", totpEnabled: false }]))
    vi.mocked(verifyTotpCode).mockReturnValue(true)
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["confirm"].$post({ json: { code: "123456" } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  })
})

describe("POST /2fa/confirm — invalid code", () => {
  it("returns 401 INVALID_TOTP_CODE when TOTP code is wrong", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpSecret: "enc1:FAKESECRET", totpEnabled: false }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["confirm"].$post({ json: { code: "000000" } })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("INVALID_TOTP_CODE")
  })

  it("returns 400 TOTP_NOT_SETUP when no secret is stored", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpSecret: null, totpEnabled: false }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["confirm"].$post({ json: { code: "123456" } })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("TOTP_NOT_SETUP")
  })
})

// ── POST /2fa/disable ─────────────────────────────────────────────────────────

describe("POST /2fa/disable — valid code", () => {
  it("disables 2FA and invalidates sv cache on valid code", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpSecret: "enc1:FAKESECRET",
      totpEnabled: true,
      sessionVersion: 1,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(true)
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["disable"].$post({ json: { code: "123456" } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(revokeSessionVersion).toHaveBeenCalledWith(1, 1)
  })
})

describe("POST /2fa/disable — error cases", () => {
  it("returns 400 TOTP_NOT_ENABLED when 2FA is not active", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ totpEnabled: false, sessionVersion: 1 }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["disable"].$post({ json: { code: "123456" } })
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("TOTP_NOT_ENABLED")
  })

  it("returns 401 INVALID_TOTP_CODE when TOTP code is wrong", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpSecret: "enc1:FAKESECRET",
      totpEnabled: true,
      sessionVersion: 1,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["disable"].$post({ json: { code: "000000" } })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("INVALID_TOTP_CODE")
    expect(revokeSessionVersion).not.toHaveBeenCalled()
  })
})
