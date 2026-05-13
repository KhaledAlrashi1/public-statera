/**
 * Unit tests for POST /2fa/verify (Module 7b verify-on-login).
 *
 * The pending-2FA JWT is signed with the same session secret used in auth.ts,
 * so we construct it directly here with jose rather than calling the route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
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

// ── Redis mock ────────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn()
const mockRedisDel = vi.fn()
const mockMultiIncr = vi.fn()
const mockMultiExpire = vi.fn()
const mockMultiExec = vi.fn()

const mockMulti = vi.fn(() => ({
  incr: mockMultiIncr.mockReturnThis(),
  expire: mockMultiExpire.mockReturnThis(),
  exec: mockMultiExec,
}))

vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 1, externalId: "ext-1", authProvider: "google", sv: 1 })
    await next()
  }),
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
  createSessionToken: vi.fn().mockResolvedValue("new-session-token"),
  getAuthRedis: vi.fn(() => ({
    get: mockRedisGet,
    del: mockRedisDel,
    multi: mockMulti,
  })),
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

// ── Pending-2FA JWT helper ────────────────────────────────────────────────────

import { SignJWT } from "jose"

const SESSION_SECRET = "test-session-secret-at-least-32-chars-long"

async function makePending2faToken(userId: number, expiresIn = "5m"): Promise<string> {
  return new SignJWT({ userId, pendingAt: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(SESSION_SECRET))
}

// ── Imports under test ────────────────────────────────────────────────────────

import { testClient } from "hono/testing"
import * as connection from "../db/connection"
import { authRouter } from "./auth"
import { verifyTotpCode, verifyAndConsumeBackupCode } from "../lib/totp-lib"

const client = testClient(authRouter)

beforeEach(() => {
  vi.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)   // default: no failures recorded
  mockRedisDel.mockResolvedValue(1)
  mockMultiExec.mockResolvedValue([[null, 1], [null, 1]]) // incr → 1
})

// ── helpers ───────────────────────────────────────────────────────────────────

async function postVerify(
  pendingToken: string,
  body: Record<string, unknown>,
) {
  // @ts-expect-error Hono testClient typing
  return client["2fa"]["verify"].$post(
    { json: body },
    { headers: { Cookie: `statera_pending_2fa=${pendingToken}` } },
  )
}

// ── POST /2fa/verify — TOTP success ──────────────────────────────────────────

describe("POST /2fa/verify — TOTP success", () => {
  it("issues session cookie and returns ok:true on valid TOTP code", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true,
      totpSecret: "enc1:FAKESECRET",
      totpBackupCodesJson: null,
      sessionVersion: 1,
      authProvider: "google",
      externalId: "ext-42",
      isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(true)

    const res = await postVerify(token, { code: "123456", type: "totp" })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.user_id).toBe(42)
    expect(data.warning).toBeUndefined()
    // Success: failure counter should be deleted
    expect(mockRedisDel).toHaveBeenCalledWith("pending_2fa_failures:42")
  })
})

// ── POST /2fa/verify — TOTP failure progression ───────────────────────────────

describe("POST /2fa/verify — TOTP failures", () => {
  it("returns INVALID_TOTP_CODE on 1st failure (count=1)", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET", totpBackupCodesJson: null,
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    mockMultiExec.mockResolvedValue([[null, 1], [null, 1]])

    const res = await postVerify(token, { code: "000000", type: "totp" })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("INVALID_TOTP_CODE")
  })

  it("returns INVALID_TOTP_CODE on 2nd failure (count=2)", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET", totpBackupCodesJson: null,
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    mockMultiExec.mockResolvedValue([[null, 2], [null, 1]])

    const res = await postVerify(token, { code: "000000", type: "totp" })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("INVALID_TOTP_CODE")
  })

  it("returns PENDING_2FA_RESTART on 3rd failure (count=3)", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET", totpBackupCodesJson: null,
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    mockMultiExec.mockResolvedValue([[null, 3], [null, 1]])

    const res = await postVerify(token, { code: "000000", type: "totp" })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("PENDING_2FA_RESTART")
  })
})

// ── POST /2fa/verify — backup code ───────────────────────────────────────────

describe("POST /2fa/verify — backup code success", () => {
  it("returns ok:true on valid backup code", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET",
      totpBackupCodesJson: '["$2b$12$h1","$2b$12$h2","$2b$12$h3","$2b$12$h4"]',
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyAndConsumeBackupCode).mockResolvedValue({
      consumed: true,
      remainingHashes: ["$2b$12$h2", "$2b$12$h3", "$2b$12$h4"],
    })

    const res = await postVerify(token, { code: "ab12-cd34", type: "backup" })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.warning).toBeUndefined()
  })

  it("includes BACKUP_CODES_LOW warning when ≤2 codes remain", async () => {
    const token = await makePending2faToken(42)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET",
      totpBackupCodesJson: '["$2b$12$h1","$2b$12$h2","$2b$12$h3"]',
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyAndConsumeBackupCode).mockResolvedValue({
      consumed: true,
      remainingHashes: ["$2b$12$h2"],
    })

    const res = await postVerify(token, { code: "ab12-cd34", type: "backup" })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.warning).toBe("BACKUP_CODES_LOW")
    expect(data.backup_codes_remaining).toBe(1)
  })
})

// ── POST /2fa/verify — cookie errors ─────────────────────────────────────────

describe("POST /2fa/verify — missing or invalid cookie", () => {
  it("returns 410 PENDING_2FA_GONE when cookie is absent", async () => {
    // @ts-expect-error Hono testClient typing
    const res = await client["2fa"]["verify"].$post({ json: { code: "123456", type: "totp" } })
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("PENDING_2FA_GONE")
  })

  it("returns 410 PENDING_2FA_GONE when JWT is tampered/expired", async () => {
    const res = await postVerify("not.a.valid.jwt", { code: "123456", type: "totp" })
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("PENDING_2FA_GONE")
  })

  it("returns 410 for an already-expired pending token", async () => {
    // Build a token with exp set 10 seconds in the past
    const expiredToken = await new SignJWT({ userId: 42, pendingAt: Date.now() })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SESSION_SECRET))
    const res = await postVerify(expiredToken, { code: "123456", type: "totp" })
    expect(res.status).toBe(410)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("PENDING_2FA_GONE")
  })
})

// ── POST /2fa/verify — pre-check safety net ───────────────────────────────────

describe("POST /2fa/verify — pre-check safety net", () => {
  it("returns PENDING_2FA_RESTART if counter already ≥ 3 before processing code", async () => {
    const token = await makePending2faToken(42)
    // No DB call expected — the pre-check short-circuits before we reach user load.
    mockRedisGet.mockResolvedValue("3") // already at limit

    const res = await postVerify(token, { code: "123456", type: "totp" })
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.code).toBe("PENDING_2FA_RESTART")
    // Verify the increment pipeline was NOT called (pre-check short-circuited)
    expect(mockMultiExec).not.toHaveBeenCalled()
  })
})

// ── POST /2fa/verify — counter pipeline shape ────────────────────────────────

describe("POST /2fa/verify — Redis pipeline shape on failure", () => {
  it("calls multi().incr(key).expire(key, 300).exec() on failed attempt", async () => {
    const token = await makePending2faToken(99)
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET", totpBackupCodesJson: null,
      sessionVersion: 1, authProvider: "google", externalId: "ext-99", isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(false)
    mockMultiExec.mockResolvedValue([[null, 1], [null, 1]])

    await postVerify(token, { code: "000000", type: "totp" })

    expect(mockMulti).toHaveBeenCalled()
    expect(mockMultiIncr).toHaveBeenCalledWith("pending_2fa_failures:99")
    expect(mockMultiExpire).toHaveBeenCalledWith("pending_2fa_failures:99", 300)
    expect(mockMultiExec).toHaveBeenCalled()
  })
})

// ── POST /2fa/verify — cross-user safety ─────────────────────────────────────

describe("POST /2fa/verify — cross-user: userId comes from JWT, not request body", () => {
  it("uses the userId from the cookie JWT regardless of what the body contains", async () => {
    // Cookie is for user 42; body tries to sneak in user 99
    const token = await makePending2faToken(42)
    const getDbSpy = vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      totpEnabled: true, totpSecret: "enc1:FAKESECRET", totpBackupCodesJson: null,
      sessionVersion: 1, authProvider: "google", externalId: "ext-42", isActive: true,
    }]))
    vi.mocked(verifyTotpCode).mockReturnValue(true)

    // Include a userId in the body that differs from the cookie
    const res = await postVerify(token, { code: "123456", type: "totp", userId: 99 })
    expect(res.status).toBe(200)

    // The DB was queried exactly once (for the user from the JWT, not from the body).
    // The failure counter key must reference userId 42, not 99.
    expect(mockRedisDel).toHaveBeenCalledWith("pending_2fa_failures:42")
    expect(mockRedisDel).not.toHaveBeenCalledWith("pending_2fa_failures:99")
    getDbSpy.mockRestore()
  })
})
