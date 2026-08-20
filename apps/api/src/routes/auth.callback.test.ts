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
const oidc = vi.hoisted(() => ({ claims: {} as Record<string, unknown>, throwOnExchange: false }))

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
    callback: async () => {
      // Reaches the token-exchange failure exit (auth.ts :163), which calls
      // failCallback DIRECTLY — not via refuseAdoption. That independence is
      // what makes it a non-degenerate counterpart for the R161 pin.
      if (oidc.throwOnExchange) throw new Error("token exchange failed")
      return { claims: () => oidc.claims }
    },
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

// ── 10e-3b harness ────────────────────────────────────────────────────────────
//
// `makeDb` above resolves EVERY select to the same `rows`, which cannot express
// adoption (first select misses on the composite identity, second hits on email).
// It is left byte-intact so the 10d-0b test's environment is unchanged; the
// sequence-aware variant below is additive.

const dupErr = () => Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeErrChain(err: unknown): any {
  return new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.reject(err).then(res, rej)
      }
      if (prop === "catch") return (cb: (e: unknown) => unknown) => Promise.reject(err).catch(cb)
      return () => makeErrChain(err)
    },
  })
}

type SeqOpts = {
  selects?: unknown[][]
  updateErrors?: (unknown | null)[]
  insertError?: unknown
  insertId?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSeqDb(opts: SeqOpts, updateSets: any[], insertValues: any[]): any {
  const selects = [...(opts.selects ?? [])]
  const updateErrors = [...(opts.updateErrors ?? [])]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = (): any =>
    new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          const next = selects.length ? selects.shift()! : []
          return (resolve: (v: unknown) => unknown) => Promise.resolve(next).then(resolve)
        }
        if (prop === "update") {
          return () => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            set: (arg: any) => {
              updateSets.push(arg)
              const e = updateErrors.length ? updateErrors.shift() : null
              return e ? makeErrChain(e) : makeChain()
            },
          })
        }
        if (prop === "insert") {
          return () => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values: (arg: any) => {
              insertValues.push(arg)
              return {
                catch: () => makeChain(),
                $returningId: () =>
                  opts.insertError
                    ? Promise.reject(opts.insertError)
                    : Promise.resolve([{ id: opts.insertId ?? 99 }]),
              }
            },
          })
        }
        return (..._args: unknown[]) => root()
      },
    })
  return root()
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
  oidc.throwOnExchange = false
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

// ── 10e-3b: OIDC email adoption ──────────────────────────────────────────────

/** Runs the callback and returns the response. */
async function callCallback(): Promise<Response> {
  const stateCookie = await makeStateCookie()
  // @ts-expect-error Hono testClient typing
  return client.callback.$get({}, { headers: { Cookie: `oidc_state=${stateCookie}` } })
}

const ADOPT_TARGET = {
  id: 7,
  isActive: true,
  sessionVersion: 5,
  displayName: "Mail User",
  email: "user@example.com",
  externalId: "some-uuid",
  authProvider: "email",
  totpEnabled: false,
}

describe("GET /callback — 10e-3b adoption gates", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let updateSets: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let insertValues: any[]

  beforeEach(() => {
    updateSets = []
    insertValues = []
  })

  const auditOf = (t: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertValues.filter((v: any) => v?.eventType === t)

  it("adopts an existing account when the claim is verified and the match is exact", async () => {
    oidc.claims = { sub: "ext-new", email: "user@example.com", email_verified: true, name: "N" }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [ADOPT_TARGET]] }, updateSets, insertValues),
    )

    const res = await callCallback()

    // The bind is the first update: provider identity rewritten onto the existing row.
    expect(updateSets[0]).toEqual({ authProvider: "google", externalId: "ext-new" })
    expect(auditOf("account.provider_linked")).toHaveLength(1)
    // Adopted row was active, so this is a returning login, not a signup.
    expect(res.headers.get("location")).toBe("http://localhost:3002/")
    expect(createSessionToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, sv: 5 }))
  })

  it("ADOPTS when the claim differs from the stored address only by CASE (10e-R156(c))", async () => {
    // The pin for the amendment: BOTH sides are normalized. Under R122(b)'s naive
    // mirror — normalizeEmail(found.email) against the RAW claim — this refuses a
    // legitimate adoption, which is a denial-of-adoption bug wearing a gate's clothes.
    oidc.claims = { sub: "ext-new", email: "Khaled@Gmail.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        { selects: [[], [{ ...ADOPT_TARGET, email: "khaled@gmail.com" }]] },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    expect(updateSets[0]).toEqual({ authProvider: "google", externalId: "ext-new" })
    expect(auditOf("account.provider_linked")).toHaveLength(1)
    expect(res.headers.get("location")).toBe("http://localhost:3002/")
  })

  it("REFUSES when the ai_ci match is inexact beyond case (accent variant)", async () => {
    oidc.claims = { sub: "ext-att", email: "jose@x.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        { selects: [[], [{ ...ADOPT_TARGET, email: "josé@x.com" }]] },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    // Terminal: neither bound nor inserted.
    expect(updateSets).toHaveLength(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(insertValues.filter((v: any) => v?.email)).toHaveLength(0)
    expect(auditOf("login.failed")[0].detailsJson).toContain("inexact_email_match")
  })

  it("REFUSES when email_verified is absent", async () => {
    oidc.claims = { sub: "ext-new", email: "user@example.com" }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [ADOPT_TARGET]] }, updateSets, insertValues),
    )

    const res = await callCallback()

    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(updateSets).toHaveLength(0)
    expect(auditOf("login.failed")[0].detailsJson).toContain("email_unverified")
  })

  it("REFUSES when email_verified is explicitly false", async () => {
    oidc.claims = { sub: "ext-new", email: "user@example.com", email_verified: false }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [ADOPT_TARGET]] }, updateSets, insertValues),
    )

    const res = await callCallback()

    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(auditOf("login.failed")[0].detailsJson).toContain("email_unverified")
  })

  it("REFUSES an unparseable email claim at the boundary (10e-R156(d))", async () => {
    oidc.claims = { sub: "ext-new", email: "not-an-address" }
    vi.spyOn(connection, "getDb").mockReturnValue(makeSeqDb({}, updateSets, insertValues))

    const res = await callCallback()

    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(auditOf("login.failed")[0].detailsJson).toContain("claim_unparseable")
  })

  it("routes an adopted row that has TOTP through the existing 2FA gate", async () => {
    oidc.claims = { sub: "ext-new", email: "user@example.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        { selects: [[], [{ ...ADOPT_TARGET, totpEnabled: true }]] },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    expect(res.headers.get("location")).toBe("http://localhost:3002/auth/2fa-verify")
    expect(auditOf("login.pending_2fa")).toHaveLength(1)
    // No session issued at the handoff.
    expect(res.headers.get("set-cookie") ?? "").toContain("statera_pending_2fa")
  })

  it("still inserts a genuinely new user when no row holds the address", async () => {
    oidc.claims = { sub: "ext-brand-new", email: "fresh@example.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], []], insertId: 123 }, updateSets, insertValues),
    )

    const res = await callCallback()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userInsert = insertValues.find((v: any) => v?.email === "fresh@example.com")
    expect(userInsert).toBeTruthy()
    expect(userInsert.authProvider).toBe("google")
    expect(res.headers.get("location")).toBe("http://localhost:3002/welcome?source=signup")
  })

  it("REFUSES adoption in a delete-reauth context (gate 3)", async () => {
    // Defensive: a delete-reauth flow requires a live session, so the composite
    // lookup resolves and adoption is unreachable. The guard exists so that if
    // the reasoning is ever wrong it fails closed rather than binding an identity
    // mid-deletion. Exercised so the closed reason set has no unused literal —
    // an unexercised literal is exactly what rots.
    const cookie = await new SignJWT({ state: "st", nonce: "no", deleteIntent: true, userId: 7 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(SESSION_SECRET))

    oidc.claims = { sub: "ext-new", email: "user@example.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [ADOPT_TARGET]] }, updateSets, insertValues),
    )

    // @ts-expect-error Hono testClient typing
    const res = await client.callback.$get({}, { headers: { Cookie: `oidc_state=${cookie}` } })

    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(updateSets).toHaveLength(0)
    expect(auditOf("login.failed")[0].detailsJson).toContain("delete_reauth_context")
  })

  it("translates an adopt-BIND identity-collision race into its own literal, not a 500", async () => {
    // The fourth crash site (10e-R166): the bind rewrites (auth_provider,
    // external_id), itself UNIQUE, and a concurrent login of the same new identity
    // can win the race between the composite lookup and this write. Its literal is
    // DISTINCT from duplicate_email_race because no email participates in that
    // constraint. Exercised so the closed set has no unused literal.
    oidc.claims = { sub: "ext-new", email: "user@example.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [ADOPT_TARGET]], updateErrors: [dupErr()] }, updateSets, insertValues),
    )

    const res = await callCallback()

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(auditOf("login.failed")[0].detailsJson).toContain("duplicate_identity_race")
    // And NOT the email literal — the two must not collapse.
    expect(auditOf("login.failed")[0].detailsJson).not.toContain("duplicate_email_race")
  })

  it("translates an INSERT unique-collision race into the generic refusal, not a 500", async () => {
    oidc.claims = { sub: "ext-race", email: "raced@example.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], []], insertError: dupErr() }, updateSets, insertValues),
    )

    const res = await callCallback()

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("http://localhost:3002/login")
    expect(auditOf("login.failed")[0].detailsJson).toContain("duplicate_email_race")
  })
})

describe("GET /callback — 10e-3b R13(b): all three unguarded email writes", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let updateSets: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let insertValues: any[]

  beforeEach(() => {
    updateSets = []
    insertValues = []
  })

  it("PATH 3 (existing-active): a colliding refresh does not fail the login", async () => {
    oidc.claims = { sub: "ext-42", email: "taken@example.com", email_verified: true, name: "New Name" }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        { selects: [[{ ...ADOPT_TARGET, id: 42, externalId: "ext-42", authProvider: "google" }]], updateErrors: [dupErr()] },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    // First attempt carried the email; the retry omits it and keeps the rest.
    expect(updateSets[0]).toEqual({ displayName: "New Name", email: "taken@example.com" })
    expect(updateSets[1]).toEqual({ displayName: "New Name" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skip = insertValues.filter((v: any) => v?.eventType === "account.email_refresh_skipped")
    expect(skip).toHaveLength(1)
    expect(skip[0].detailsJson).toContain("email_conflict")
    // The login proceeds.
    expect(res.headers.get("location")).toBe("http://localhost:3002/")
  })

  it("PATH 2 (reactivate): a colliding refresh does not fail the reactivation", async () => {
    oidc.claims = { sub: "ext-42", email: "taken@example.com", email_verified: true, name: "New Name" }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        {
          selects: [[{ ...ADOPT_TARGET, id: 42, isActive: false, sessionVersion: 3, externalId: "ext-42", authProvider: "google" }]],
          updateErrors: [dupErr()],
        },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    expect(updateSets[0]).toEqual({
      isActive: true,
      email: "taken@example.com",
      displayName: "New Name",
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodesJson: null,
    })
    // Retry keeps every field EXCEPT email — the TOTP nulls must survive the fallback.
    expect(updateSets[1]).toEqual({
      isActive: true,
      displayName: "New Name",
      totpSecret: null,
      totpEnabled: false,
      totpBackupCodesJson: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(insertValues.filter((v: any) => v?.eventType === "account.email_refresh_skipped")).toHaveLength(1)
    expect(res.headers.get("location")).toBe("http://localhost:3002/welcome?source=signup")
  })
})

describe("GET /callback — TOTP gate on the pre-existing active path (10e-R132 gap)", () => {
  it("issues the pending-2FA cookie and redirects, with no session, for a plain active user", async () => {
    // The carried R132 gap discharged directly. No test in the repository had ever
    // entered this branch: auth.callback.test.ts set totpEnabled:false at both of
    // its only two fixture sites, so the OIDC TOTP handoff had zero route-level
    // coverage while the magic-link handoff gained it at 10e-3a. 10e-3b routes new
    // traffic through this gate via adoption, so it is pinned on the path it
    // already had as well as on the new one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateSets: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertValues: any[] = []
    oidc.claims = { sub: "ext-42", email: "user@example.com", email_verified: true, name: "N" }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb(
        { selects: [[{ ...ADOPT_TARGET, id: 42, externalId: "ext-42", authProvider: "google", totpEnabled: true }]] },
        updateSets,
        insertValues,
      ),
    )

    const res = await callCallback()

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("http://localhost:3002/auth/2fa-verify")
    expect(res.headers.get("set-cookie") ?? "").toContain("statera_pending_2fa")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(insertValues.filter((v: any) => v?.eventType === "login.pending_2fa")).toHaveLength(1)
    // The gate must not issue a session.
    expect(res.headers.get("set-cookie") ?? "").not.toContain("statera_session=")
  })
})

describe("GET /callback — 10e-3b uniformity and payload hygiene", () => {
  it("the refusal is byte-identical to a co-routed failure cause (10e-R161)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a: any[] = []
    oidc.claims = { sub: "ext-att", email: "jose@x.com", email_verified: true }
    vi.spyOn(connection, "getDb").mockReturnValue(
      makeSeqDb({ selects: [[], [{ ...ADOPT_TARGET, email: "josé@x.com" }]] }, a, a),
    )
    const refusal = await callCallback()

    // COUNTERPART = the TOKEN-EXCHANGE failure (auth.ts :163), deliberately NOT
    // the boundary gate (10e-R167). Both the refusal and the boundary gate route
    // through `refuseAdoption`, so pinning refusal against the boundary gate would
    // hold BY CONSTRUCTION and prove nothing about the anonymity set — the same
    // shape as the mutation that moved both sides of this very comparison. :163
    // reaches `failCallback` by an independent path, so the pin has real content.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any[] = []
    oidc.throwOnExchange = true
    vi.spyOn(connection, "getDb").mockReturnValue(makeSeqDb({}, b, b))
    const coRouted = await callCallback()
    oidc.throwOnExchange = false

    // Independence made CHECKABLE, not merely asserted in prose: the refusal
    // audits and :163 does not, so a non-empty/empty split proves the two
    // responses were produced by different code paths. Without this, a future
    // edit could quietly re-point the counterpart at a shared helper and the pin
    // would go degenerate again with every assertion still green.
    expect(a.some((v) => v?.eventType === "login.failed")).toBe(true)
    expect(b).toHaveLength(0)

    expect(refusal.status).toBe(coRouted.status)
    expect(refusal.headers.get("location")).toBe(coRouted.headers.get("location"))
    // No distinguishing header anywhere in the pair.
    expect([...refusal.headers.keys()].sort()).toEqual([...coRouted.headers.keys()].sort())
  })

  it("BLOCKING (10e-R11): no email address reaches any security_events payload", async () => {
    const SECRET_ADDRESS = "victim@example.com"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captured: any[] = []

    // Drive every branch that audits, all against the same address.
    const runs: SeqOpts[] = [
      { selects: [[], [{ ...ADOPT_TARGET, email: "vïctim@example.com" }]] }, // inexact refusal
      { selects: [[], [{ ...ADOPT_TARGET, email: SECRET_ADDRESS }]] }, // adoption (provider_linked)
      { selects: [[{ ...ADOPT_TARGET, id: 42, externalId: "ext-42", authProvider: "google" }]], updateErrors: [dupErr()] }, // refresh skipped
      { selects: [[], []], insertError: dupErr() }, // duplicate race
    ]
    for (const opts of runs) {
      oidc.claims = { sub: "ext-x", email: SECRET_ADDRESS, email_verified: true }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sink: any[] = []
      vi.spyOn(connection, "getDb").mockReturnValue(makeSeqDb(opts, sink, captured))
      await callCallback()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = captured.filter((v: any) => typeof v?.eventType === "string")
    // The scan is only meaningful if it actually saw events.
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) {
      // WHOLE payload, not key-absence: an address under a differently-named key
      // would satisfy a key check and defeat the point.
      expect(JSON.stringify(ev)).not.toContain(SECRET_ADDRESS)
      expect(JSON.stringify(ev)).not.toContain("vïctim@example.com")
    }
  })
})
