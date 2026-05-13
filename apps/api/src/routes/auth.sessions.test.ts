/**
 * Unit tests for POST /sessions/revoke-all and GET /profile/security-events (Module 7c).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../middleware/auth", () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("session", { userId: 7, externalId: "ext-7", authProvider: "google", sv: 3 })
    await next()
  }),
  revokeSessionVersion: vi.fn().mockResolvedValue(undefined),
  createSessionToken: vi.fn().mockResolvedValue("new-session-token"),
  getAuthRedis: vi.fn(() => ({ get: vi.fn(), del: vi.fn(), multi: vi.fn() })),
}))
vi.mock("../lib/rate-limit", () => ({ createRateLimiter: vi.fn(() => (_c: unknown, next: () => Promise<void>) => next()) }))
vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc1:${s}`),
  decrypt: vi.fn((s: string) => s.replace(/^enc1:/, "")),
}))
vi.mock("../lib/totp-lib", () => ({
  generateTotpSecret: vi.fn(),
  generateTotpQrDataUri: vi.fn(),
  generateBackupCodes: vi.fn(),
  hashBackupCodes: vi.fn(),
  verifyTotpCode: vi.fn(),
  verifyAndConsumeBackupCode: vi.fn(),
  parseBackupCodeHashes: vi.fn(),
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
import { revokeSessionVersion, createSessionToken } from "../middleware/auth"

const client = testClient(authRouter)

beforeEach(() => { vi.clearAllMocks() })

// ── POST /sessions/revoke-all ─────────────────────────────────────────────────

describe("POST /sessions/revoke-all — success", () => {
  it("bumps sv, writes deny-list, re-issues cookie, returns session_version", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ sessionVersion: 3 }]))

    // @ts-expect-error Hono testClient typing
    const res = await client["sessions"]["revoke-all"].$post()
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(data.session_version).toBe(4)

    // Old sv (3) must be deny-listed, not the new sv (4)
    expect(revokeSessionVersion).toHaveBeenCalledWith(7, 3)
    expect(revokeSessionVersion).not.toHaveBeenCalledWith(7, 4)

    // New session token issued with sv=4
    expect(createSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, sv: 4 }),
    )
  })
})

describe("POST /sessions/revoke-all — deny-list TTL", () => {
  it("revokeSessionVersion is called (TTL is 30 days inside that function, matching JWT expiry)", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ sessionVersion: 5 }]))
    // @ts-expect-error Hono testClient typing
    await client["sessions"]["revoke-all"].$post()
    // The TTL guarantee is owned by revokeSessionVersion in middleware/auth.ts
    // (SV_REVOKE_TTL_SECONDS = 30 days). Verifying it is called is sufficient here;
    // the TTL correctness is an auth middleware concern.
    expect(revokeSessionVersion).toHaveBeenCalledOnce()
  })
})

describe("POST /sessions/revoke-all — caller is not locked out", () => {
  it("new session cookie carries the new sv, not the old one — caller's token is still valid", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{ sessionVersion: 2 }]))

    // @ts-expect-error Hono testClient typing
    const res = await client["sessions"]["revoke-all"].$post()
    expect(res.status).toBe(200)

    // createSessionToken was called with newSv=3, not oldSv=2
    expect(createSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({ sv: 3 }),
    )
    // The deny-list was written for the OLD sv (2), not the new one (3)
    // — so the newly issued token with sv=3 passes the Redis deny-list check
    expect(revokeSessionVersion).toHaveBeenCalledWith(7, 2)
    expect(revokeSessionVersion).not.toHaveBeenCalledWith(7, 3)
  })
})

// ── GET /profile/security-events ─────────────────────────────────────────────

describe("GET /profile/security-events — basic response shape", () => {
  it("returns items, has_more, offset, limit with profile.* events", async () => {
    const fakeRows = [
      {
        id: 1,
        eventType: "profile.updated",
        ipAddress: "1.2.3.4",
        userAgent: "Mozilla/5.0",
        createdAt: new Date("2026-03-10T12:00:00.000Z"),
        detailsJson: '{"fields":["display_name"]}',
      },
    ]
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(fakeRows))

    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get()
    expect(res.status).toBe(200)

    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    const data = body.data as Record<string, unknown>
    expect(Array.isArray(data.items)).toBe(true)
    const items = data.items as Record<string, unknown>[]
    expect(items).toHaveLength(1)
    expect(items[0]?.event_type).toBe("profile.updated")
    expect(items[0]?.ip_address).toBe("1.2.3.4")
    expect(items[0]?.user_agent).toBe("Mozilla/5.0")
    expect(items[0]?.details).toEqual({ fields: ["display_name"] })
    // created_at uses +00:00 format (project convention)
    expect(items[0]?.created_at).toBe("2026-03-10T12:00:00+00:00")
    expect(data.has_more).toBe(false)
    expect(data.offset).toBe(0)
    expect(data.limit).toBe(20)
    // meta mirrors pagination
    const meta = body.meta as Record<string, unknown>
    expect(meta.has_more).toBe(false)
    expect(meta.offset).toBe(0)
    expect(meta.limit).toBe(20)
  })
})

describe("GET /profile/security-events — has_more pagination", () => {
  it("sets has_more=true when limit+1 rows are returned and trims to limit", async () => {
    // Return 21 rows to trigger has_more with default limit=20
    const fakeRows = Array.from({ length: 21 }, (_, i) => ({
      id: i + 1,
      eventType: "profile.updated",
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      detailsJson: null,
    }))
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning(fakeRows))

    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get()
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.has_more).toBe(true)
    expect((data.items as unknown[]).length).toBe(20)
  })
})

describe("GET /profile/security-events — limit clamping", () => {
  it("clamps limit to max 50", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([]))
    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get({ query: { limit: "200" } })
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.limit).toBe(50)
  })

  it("clamps limit to min 1", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([]))
    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get({ query: { limit: "0" } })
    const body = await res.json() as Record<string, unknown>
    const data = body.data as Record<string, unknown>
    expect(data.limit).toBe(1)
  })
})

describe("GET /profile/security-events — details JSON handling", () => {
  it("returns {} for null detailsJson", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      id: 1, eventType: "profile.updated", ipAddress: null, userAgent: null,
      createdAt: new Date(), detailsJson: null,
    }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get()
    const body = await res.json() as Record<string, unknown>
    const items = (body.data as Record<string, unknown>).items as Record<string, unknown>[]
    expect(items[0]?.details).toEqual({})
  })

  it("returns {} for malformed detailsJson", async () => {
    vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([{
      id: 1, eventType: "profile.updated", ipAddress: null, userAgent: null,
      createdAt: new Date(), detailsJson: "{not json}",
    }]))
    // @ts-expect-error Hono testClient typing
    const res = await client["profile"]["security-events"].$get()
    const body = await res.json() as Record<string, unknown>
    const items = (body.data as Record<string, unknown>).items as Record<string, unknown>[]
    expect(items[0]?.details).toEqual({})
  })
})
