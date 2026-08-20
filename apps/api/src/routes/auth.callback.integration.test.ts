/**
 * INTEGRATION — 10e-3b OIDC email adoption against real MySQL.
 *
 * Gated on INTEGRATION=true and living in a dedicated *.integration.test.ts file
 * with NO module-level db mock, per the standing convention earned by the 7.5
 * fix-forward (an integration `describe` inside a mock-contaminated unit file is
 * structurally never-runnable and rots silently).
 *
 * What this adds over the hermetic cases, which is the whole reason it exists:
 * the hermetic tests fabricate the ER_DUP_ENTRY error object and assert the
 * branch it drives, so they would pass identically if `isDuplicateEmailError`
 * were wrong about the real error's shape. Here the constraint is the actual
 * `users_email_unique` index and the error is whatever mysql2 genuinely throws.
 *
 * `../lib/oidc` is the ONLY mock: it stands in for the identity provider, which
 * is a data SOURCE (a fixture), never a serializer and never the database.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { SignJWT } from "jose"
import { eq, inArray } from "drizzle-orm"

const INTEGRATION = process.env.INTEGRATION === "true"

const oidc = vi.hoisted(() => ({ claims: {} as Record<string, unknown> }))

vi.mock("../lib/oidc", () => ({
  generators: { state: vi.fn(() => "st"), nonce: vi.fn(() => "no") },
  getOidcClient: vi.fn(async () => ({
    callbackParams: () => ({}),
    callback: async () => ({ claims: () => oidc.claims }),
  })),
}))

import { testClient } from "hono/testing"
import { getDb } from "../db/connection"
import { users, securityEvents, productEvents } from "../db/schema"
import { authRouter } from "./auth"
import { env } from "../lib/env"

const client = testClient(authRouter)

// Unique per run so a previous run's residue cannot satisfy or break an assertion.
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const addr = (label: string) => `10e3b-${label}-${RUN}@example.test`
const createdIds: number[] = []

async function stateCookie(): Promise<string> {
  return new SignJWT({ state: "st", nonce: "no" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.sessionSecret))
}

async function callback(): Promise<Response> {
  const cookie = await stateCookie()
  // @ts-expect-error Hono testClient typing
  return client.callback.$get({}, { headers: { Cookie: `oidc_state=${cookie}` } })
}

async function seedUser(fields: {
  email: string
  authProvider: string
  externalId: string
  isActive?: boolean
}): Promise<number> {
  const db = getDb()
  const [row] = await db.insert(users).values(fields).$returningId()
  createdIds.push(row.id)
  return row.id
}

afterAll(async () => {
  if (!INTEGRATION || createdIds.length === 0) return
  const db = getDb()
  // FK order: children before parents. Getting this wrong produces a file-level
  // teardown error that exits 1 while every test still reports as passing — the
  // counts are non-discriminating and only the exit code carries the signal.
  await db.delete(productEvents).where(inArray(productEvents.userId, createdIds))
  await db.delete(securityEvents).where(inArray(securityEvents.userId, createdIds))
  await db.delete(users).where(inArray(users.id, createdIds))
})

describe.skipIf(!INTEGRATION)("10e-3b adoption against real MySQL", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("adopts a magic-link account: same row id, provider identity rewritten", async () => {
    const email = addr("adopt")
    const userId = await seedUser({ email, authProvider: "email", externalId: `uuid-${RUN}` })

    oidc.claims = { sub: `ext-${RUN}`, email, email_verified: true, name: "Adopted" }
    const res = await callback()

    expect(res.status).toBe(302)

    const db = getDb()
    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    // The SAME row — adoption must not create a second account.
    expect(row.id).toBe(userId)
    expect(row.authProvider).toBe("google")
    expect(row.externalId).toBe(`ext-${RUN}`)
    expect(row.email).toBe(email)

    // And exactly one row holds that address.
    const holders = await db.select().from(users).where(eq(users.email, email))
    expect(holders).toHaveLength(1)
  })

  it("REFUSES an accent-inexact match and leaves both rows untouched", async () => {
    // The ai_ci lookup finds the stored accented row for an ASCII claim; the exact
    // adoption decision must refuse. Real index, real collation.
    const stored = `10e3b-josé-${RUN}@example.test`
    const claimed = `10e3b-jose-${RUN}@example.test`
    const victimId = await seedUser({ email: stored, authProvider: "email", externalId: `uuid-v-${RUN}` })

    oidc.claims = { sub: `ext-att-${RUN}`, email: claimed, email_verified: true }
    const res = await callback()

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toContain("/login")

    const db = getDb()
    const [victim] = await db.select().from(users).where(eq(users.id, victimId)).limit(1)
    // Not bound, not renamed — the refusal is terminal.
    expect(victim.authProvider).toBe("email")
    expect(victim.externalId).toBe(`uuid-v-${RUN}`)
    expect(victim.email).toBe(stored)

    // And no new row was inserted for the claimed address (the F2 crash path).
    //
    // NOTE, and it is the point of this file: a plain `eq(users.email, claimed)`
    // is ITSELF accent-insensitive under utf8mb4_0900_ai_ci, so it matches the
    // stored accented row. The verification query shares the widening it is meant
    // to detect. Asserting "no rows" here fails against CORRECT code. What is
    // actually being claimed is that the victim is the ONLY holder — i.e. nothing
    // new was created — so that is what is asserted.
    const matching = await db.select().from(users).where(eq(users.email, claimed))
    expect(matching).toHaveLength(1)
    expect(matching[0].id).toBe(victimId)
  })

  it("R13(b): a colliding email refresh does not fail the login, against the real index", async () => {
    // The genuine users_email_unique violation, not a fabricated error object.
    const holderEmail = addr("holder")
    const loginEmail = addr("mover")
    await seedUser({ email: holderEmail, authProvider: "email", externalId: `uuid-h-${RUN}` })
    const moverId = await seedUser({
      email: loginEmail,
      authProvider: "google",
      externalId: `ext-mover-${RUN}`,
    })

    // The Google user's provider-side address has moved onto the holder's address.
    oidc.claims = { sub: `ext-mover-${RUN}`, email: holderEmail, email_verified: true, name: "Moved" }
    const res = await callback()

    // The login SUCCEEDS — the refresh is cosmetic and must not fail it.
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).not.toContain("/login")

    const db = getDb()
    const [mover] = await db.select().from(users).where(eq(users.id, moverId)).limit(1)
    // Address left stale rather than crashing.
    expect(mover.email).toBe(loginEmail)
    expect(mover.displayName).toBe("Moved")

    // `auditSecurityEvent` is fire-and-forget BY DESIGN — a tracking write must
    // never block the response — so the row is not guaranteed to have landed when
    // the handler returns. A synchronous assertion here is flaky in both
    // directions, which is worse than no assertion. Poll with a bound instead;
    // failing to find it within the bound is a real failure, not a slow write.
    let found = false
    for (let i = 0; i < 40 && !found; i++) {
      const rows = await db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.userId, moverId))
      found = rows.some((e) => e.eventType === "account.email_refresh_skipped")
      if (!found) await new Promise((r) => setTimeout(r, 25))
    }
    expect(found).toBe(true)
  })
})
