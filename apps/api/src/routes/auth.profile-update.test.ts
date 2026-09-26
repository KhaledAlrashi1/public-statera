/**
 * Unit tests for POST /api/auth/profile/update — the R9 cache bust (MOB-R33).
 *
 * This is the FIRST route-level test of /profile/update anywhere in the suite (recorded at
 * MOB-R33; before it, no test file issued a request to the route).
 *
 * Income is typed-only, so the profile's monthly_income_kd is what R9 (safe-to-spend) resolves.
 * R9 is cached in Redis for 300 s; without a bust, a user who types an income and opens Insights
 * sees the old figure for up to five minutes. The route now reuses the invalidation the demo-data
 * routes already call (cacheBustSafeToSpend), fire-and-forget.
 *
 * Why asserting "not called" right after the response is not a race: the handler invokes
 * cacheBustSafeToSpend synchronously when the fire-and-forget block starts (the call is evaluated
 * before the block's first await), and that block starts before the handler returns. So by the
 * time the response has arrived, the call has either been recorded or will never happen.
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
// The two exports routes/auth.ts imports from analytics-cache (auth.ts:24).
vi.mock("../lib/analytics-cache", () => ({
  cacheBustDashboardMetrics: vi.fn().mockResolvedValue(0),
  cacheBustSafeToSpend: vi.fn().mockResolvedValue(0),
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

import * as connection from "../db/connection"
import { authRouter } from "./auth"
import { cacheBustSafeToSpend } from "../lib/analytics-cache"

const ROW = {
  id: 7,
  email: "user@example.com",
  displayName: "User",
  firstName: "Ali",
  lastName: null,
  totpEnabled: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  monthlyIncomeKd: "1500.000",
  paydayDay: null,
  country: null,
  timezone: "Asia/Kuwait",
  emailNotificationsEnabled: true,
  setupGuideSeen: false,
  setupGuideDismissed: false,
}

function postUpdate(body: Record<string, unknown>) {
  return authRouter.request("/profile/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(connection, "getDb").mockReturnValue(makeDbReturning([ROW]))
})

describe("POST /profile/update — R9 cache bust (MOB-R33)", () => {
  it("an income update clears the R9 safe-to-spend cache", async () => {
    const res = await postUpdate({ monthly_income_kd: "1500.000" })
    expect(res.status).toBe(200)
    expect(vi.mocked(cacheBustSafeToSpend)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(cacheBustSafeToSpend)).toHaveBeenCalledWith(7)
  })

  it("an update that does not touch income does not clear it", async () => {
    const res = await postUpdate({ first_name: "Ali" })
    expect(res.status).toBe(200)
    expect(vi.mocked(cacheBustSafeToSpend)).not.toHaveBeenCalled()
  })
})
