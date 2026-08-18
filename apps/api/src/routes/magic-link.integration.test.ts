// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// Real-Redis + real-MySQL verification for POST /api/auth/magic-link/request
// (10e-R16). The hermetic file forces 429 by spying on RedisMock.prototype.evalsha,
// which is inert under INTEGRATION (setupFiles is [] there, so RedisMock is dead
// code); those three cases are skipIf'd out of this mode and their REAL behaviour is
// proven here. No module-level db/redis mock, per the standing *.integration.test.ts
// convention.
//
// RESIDUE-IMMUNITY BY CONSTRUCTION (10e-R16), not by a flush:
//  - the per-IP bucket keys on a unique-per-run X-Real-IP (randomUUID);
//  - the per-email bucket keys on the SHA-256 of a unique-per-run address;
//  so `rl:rl:magic-link:ip:*` and `rl:rl:magic-link:email:*` cannot collide with
//  another test, another case, or a prior run's leftovers.
//
// THE GLOBAL CEILING IS THE ONE EXCEPTION, and its isolation is stated here rather
// than discovered in a red run. Its key is FIXED by definition, so uniqueness is
// unavailable. Three facts and one action:
//   1. src/test/rl-flush.globalSetup.ts already SCAN+DELs `rl:*` once per INTEGRATION
//      run, so the key starts clean across runs.
//   2. WITHIN a run it does not stay clean — every case below also increments it.
//   3. So the global case runs LAST (file order), scoped-DELs its own single key in a
//      beforeAll, and asserts that the limiter TRIPS rather than at which request.
//   4. The DEL reply is ASSERTED, not assumed: a flush that silently matched nothing
//      is indistinguishable from a flush that worked (standing rule — print the thing
//      that proves the observer was pointed at the target).
// Residual, accepted: two concurrent INTEGRATION runs against one Redis would contend
// on that fixed key. That is the same assumption rl-flush.globalSetup.ts already makes
// repo-wide, and this is a single-operator repo.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { magicLinkRouter } from "./magic-link"
import { getDb } from "../db/connection"
import { magicLinkTokens, productEvents, securityEvents, users } from "../db/schema"
import { hashMagicLinkToken, magicLinkExpiry, mintMagicLinkToken } from "../lib/magic-link-lib"
import { hashEmail, purgeUserAccountRows } from "../lib/account-deletion"
import { readJson } from "../test/json"

const INTEGRATION = process.env.INTEGRATION === "true"
const app = new Hono().route("/api/auth", magicLinkRouter)

const GLOBAL_KEY = "rl:rl:magic-link:global" // RedisStore prefix "rl:" + our own "rl:"

function post(email: string, ip: string) {
  return app.request("/api/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify({ email }),
  })
}

const uniqueEmail = () => `rl-int-${randomUUID()}@example.test`
const uniqueIp = () => `rl-int-${randomUUID()}`

const STANDARD_429 = {
  ok: false,
  data: null,
  error: "Too many requests. Please try again later.",
  code: "rate_limit_exceeded",
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/magic-link/verify (10e-3a, cases I1–I5 + 10e-R108's per-IP case)
//
// PLACED BEFORE the request block DELIBERATELY. That block's global-ceiling case drives
// `rl:rl:magic-link:global` to its 100 limit, so anything calling the REQUEST endpoint
// afterwards would be throttled for a reason unrelated to what it is testing. I2 calls
// the request endpoint, so it must run while that bucket is still low. Verify's own keys
// are distinct (`magic-link-verify:*`), so this ordering costs the request block nothing
// and its global case remains last in file order, exactly as its header requires.
// ═════════════════════════════════════════════════════════════════════════════

const createdUserIds: number[] = []
const createdEmails: string[] = []

function verifyReq(token: string) {
  return app.request("/api/auth/magic-link/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": uniqueIp() },
    body: JSON.stringify({ token }),
  })
}

/** Seed a live token row and return the RAW token, which is never stored. */
async function seedToken(email: string, userId: number | null): Promise<string> {
  const raw = mintMagicLinkToken()
  await getDb().insert(magicLinkTokens).values({
    email,
    tokenHash: hashMagicLinkToken(raw),
    userId,
    expiresAt: magicLinkExpiry(new Date()),
  })
  return raw
}

async function seedUser(email: string): Promise<number> {
  const [ins] = await getDb()
    .insert(users)
    .values({ authProvider: "test", externalId: `mlint-${randomUUID()}`, email })
    .$returningId()
  createdUserIds.push(ins.id)
  return ins.id
}

function verifyEmail(tag: string): string {
  const e = `ml-verify-${tag}-${randomUUID()}@example.test`
  createdEmails.push(e)
  return e
}

// Teardown order is FK order, and it is not guesswork: verify's own paths write
// product_events (signup_completed), security_events and magic_link_tokens, and all three
// carry an FK to users. The first version of this hook omitted product_events and the
// run failed on `Cannot delete or update a parent row` — the children must go first.
afterAll(async () => {
  if (!INTEGRATION) return
  const db = getDb()
  if (createdEmails.length) {
    await db.delete(magicLinkTokens).where(inArray(magicLinkTokens.email, createdEmails))
  }
  if (createdUserIds.length) {
    await db.delete(productEvents).where(inArray(productEvents.userId, createdUserIds))
    await db.delete(securityEvents).where(inArray(securityEvents.userId, createdUserIds))
    await db.delete(magicLinkTokens).where(inArray(magicLinkTokens.userId, createdUserIds))
    await db.delete(users).where(inArray(users.id, createdUserIds))
  }
})

// I1 — FALSE GREEN excluded: run sequentially and a read-then-write handler ALSO passes,
// because the first call sets consumed_at before the second reads. Only overlapping
// requests discriminate, and only asserting the PAIR does — "the second failed" is
// satisfied by a world with no atomicity at all.
describe.skipIf(!INTEGRATION)("magic-link verify — concurrent double-click [integration]", () => {
  it("exactly one of two CONCURRENT verifies succeeds", async () => {
    const email = verifyEmail("dbl")
    const userId = await seedUser(email)
    const raw = await seedToken(email, userId)

    const [a, b] = await Promise.all([verifyReq(raw), verifyReq(raw)])

    expect([a.status, b.status].sort()).toEqual([200, 400])
    const cookies = [a.headers.get("set-cookie"), b.headers.get("set-cookie")]
    expect(cookies.filter((c) => c?.includes("statera_session=")).length).toBe(1)
  })
})

// I2 — FALSE GREEN excluded: asserting only that the FIRST token fails is also satisfied
// by a request endpoint that issued nothing usable. The still-live-row half separates
// "superseded" from "nothing works".
describe.skipIf(!INTEGRATION)("magic-link verify — superseded token [integration]", () => {
  it("a re-request invalidates an earlier token, and verify refuses it", async () => {
    const email = verifyEmail("sup")
    const userId = await seedUser(email)
    const first = await seedToken(email, userId)

    // The real request endpoint supersedes every unconsumed row for this address.
    expect((await post(email, uniqueIp())).status).toBe(200)

    const db = getDb()
    const live = await db
      .select({ id: magicLinkTokens.id })
      .from(magicLinkTokens)
      .where(and(eq(magicLinkTokens.email, email), isNull(magicLinkTokens.consumedAt)))
    expect(live).toHaveLength(1) // the request endpoint's own token is live...

    const res = await verifyReq(first)
    expect(res.status).toBe(400) // ...and the earlier one is not
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

// I3 — FALSE GREEN excluded: asserting only isActive===true passes in a world where the
// branch never ran because the user was never deactivated. The pre-assertions that the
// seed landed AND the purge ran are what make the post-assertion mean anything.
describe.skipIf(!INTEGRATION)("magic-link verify — reactivate-as-fresh [integration]", () => {
  it("reactivates a purged user and does NOT re-bump sessionVersion", async () => {
    const email = verifyEmail("react")
    const userId = await seedUser(email)
    const db = getDb()

    const [before] = await db
      .select({ sv: users.sessionVersion, active: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
    expect(before!.active).toBe(true)

    await db.transaction(async (tx) => {
      await purgeUserAccountRows(userId, hashEmail(email), "127.0.0.1", "integration-test", tx)
    })

    const [purged] = await db
      .select({ sv: users.sessionVersion, active: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
    expect(purged!.active).toBe(false) // the purge actually ran
    expect(purged!.sv).toBe(before!.sv + 1) // and bumped sv, per 10d-0a

    const raw = await seedToken(email, userId)
    const res = await verifyReq(raw)
    expect(res.status).toBe(200)
    expect((await readJson(res)).data).toEqual({ is_new_user: true })

    const [after] = await db
      .select({ sv: users.sessionVersion, active: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
    expect(after!.active).toBe(true)
    // F-3a-3. Without this assertion a re-bump is completely invisible.
    expect(after!.sv).toBe(purged!.sv)
  })
})

// I4 — FALSE GREEN excluded: against a mocked DB this proves nothing, because
// users_email_unique IS the subject. And asserting only 200 is satisfied by a handler
// that inserted a duplicate on a DB without the constraint.
describe.skipIf(!INTEGRATION)("magic-link verify — duplicate-email recovery [integration]", () => {
  it("adopts a user created between request and verify: no ER_DUP_ENTRY, no second row", async () => {
    const email = verifyEmail("dup")
    const db = getDb()

    // Token minted when NO user existed → user_id IS NULL, email is the normalized form.
    const raw = await seedToken(email, null)
    // ...then the person signs up by another route before clicking.
    const userId = await seedUser(email)

    const res = await verifyReq(raw)
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toContain("statera_session=")

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(userId)
  })
})

// I5 — the orphan-row backfill is a data-minimisation property with nothing else behind
// it: purgeUserAccountRows deletes BY user_id, so a row left at NULL is unreachable by
// deletion and bounded only by the cleanup job's age cutoff. FALSE GREEN excluded:
// asserting the verify returned 200 says nothing whatever about the row.
describe.skipIf(!INTEGRATION)("magic-link verify — orphan backfill [integration]", () => {
  it("backfills user_id on a sign-up-path token row so deletion can reach it", async () => {
    const email = verifyEmail("orph")
    const db = getDb()
    const raw = await seedToken(email, null)
    const tokenHash = hashMagicLinkToken(raw)

    const [before] = await db
      .select({ userId: magicLinkTokens.userId })
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash))
    expect(before!.userId).toBeNull() // the orphan state actually existed

    expect((await verifyReq(raw)).status).toBe(200)

    const [after] = await db
      .select({ userId: magicLinkTokens.userId })
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash))
    expect(after!.userId).not.toBeNull()
    if (after!.userId !== null) createdUserIds.push(after!.userId)
  })
})

// 10e-R108 — verify's per-IP limiter against REAL Redis, residue-immune by construction
// (unique-per-run IP), NOT skipIf'd. The hermetic file only pins the KEY SHAPE.
describe.skipIf(!INTEGRATION)("magic-link verify — per-IP rate limit [integration]", () => {
  it("throttles the 11th request from one IP with the standard envelope", async () => {
    const ip = uniqueIp()
    const send = () =>
      app.request("/api/auth/magic-link/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": ip },
        body: JSON.stringify({ token: mintMagicLinkToken() }),
      })

    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await send()).status)

    // Reaching the handler at all (400 = token not found) is what proves the first ten
    // were NOT throttled; without that half, an all-429 run would also "pass".
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400))
    expect(statuses[10]).toBe(429)
    expect(await readJson(await send())).toEqual({ ...STANDARD_429, meta: { retry_after: 60 } })
  })
})

describe.skipIf(!INTEGRATION)("POST /api/auth/magic-link/request — real Redis + MySQL [integration]", () => {
  it("trips the per-IP limiter (10/min) with the standard envelope and reason=\"ip\"", async () => {
    const ip = uniqueIp()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    let throttled: Response | null = null
    // Each request uses a FRESH email so the per-email bucket (3) can never fire first.
    for (let i = 0; i < 20 && !throttled; i++) {
      const res = await post(uniqueEmail(), ip)
      if (res.status === 429) throttled = res
    }

    expect(throttled).not.toBeNull()
    expect(await readJson(throttled as Response)).toEqual({
      ...STANDARD_429,
      meta: { retry_after: 60 },
    })
    const lines = warn.mock.calls.map((c) => c[0] as string)
    expect(lines.some((l) => l?.includes?.('"reason":"ip"'))).toBe(true)
    warn.mockRestore()
  })

  it("trips the per-email limiter (3/TTL) with reason=\"email\", rotating the IP so per-IP cannot mask it", async () => {
    const email = uniqueEmail()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    let throttled: Response | null = null
    for (let i = 0; i < 8 && !throttled; i++) {
      const res = await post(email, uniqueIp()) // fresh IP every time
      if (res.status === 429) throttled = res
    }

    expect(throttled).not.toBeNull()
    // The per-email window is the link TTL, so retry_after is 900, not 60 — which is
    // also what distinguishes this limiter's envelope from the per-IP one.
    expect(await readJson(throttled as Response)).toEqual({
      ...STANDARD_429,
      meta: { retry_after: 900 },
    })
    const lines = warn.mock.calls.map((c) => c[0] as string)
    expect(lines.some((l) => l?.includes?.('"reason":"email"'))).toBe(true)
    warn.mockRestore()
  })

  it("supersedes the previous live token against real MySQL (consumed_at set on the first, null on the second)", async () => {
    const email = uniqueEmail()
    const db = getDb()

    expect((await post(email, uniqueIp())).status).toBe(200)
    expect((await post(email, uniqueIp())).status).toBe(200)

    const rows = await db
      .select({ id: magicLinkTokens.id, consumedAt: magicLinkTokens.consumedAt })
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.email, email))
      .orderBy(magicLinkTokens.id)

    // PRESENCE first: a "one row is live" assertion is equally satisfied by a seed
    // that never landed.
    expect(rows).toHaveLength(2)
    expect(rows[0]!.consumedAt).not.toBeNull() // superseded by the second request
    expect(rows[1]!.consumedAt).toBeNull() // the live one

    const live = await db
      .select({ id: magicLinkTokens.id })
      .from(magicLinkTokens)
      .where(and(eq(magicLinkTokens.email, email), isNull(magicLinkTokens.consumedAt)))
    expect(live).toHaveLength(1)
  })

  // LAST in file order, by design — see the header. Its bucket is shared with every
  // case above, so it flushes its own single key first and asserts THAT the limiter
  // trips, not at which request.
  describe("global ceiling (fixed key — isolation stated, not discovered)", () => {
    let delReply: number | undefined

    beforeAll(async () => {
      const { Redis } = await import("ioredis")
      const { getRedisConnection } = await import("../worker/connection")
      const client = new Redis(getRedisConnection())
      // Scoped SINGLE-key delete. Never a wildcard flush.
      delReply = await client.del(GLOBAL_KEY)
      await client.quit()
    })

    it("flushed its own key, observably", () => {
      // The DEL reply is the proof the observer was pointed at the target: 0 means
      // "nothing was there", 1 means "removed". Either is a clean start; `undefined`
      // would mean the beforeAll never ran, which is the state that must not pass.
      expect(delReply).toBeTypeOf("number")
      expect(delReply).toBeGreaterThanOrEqual(0)
    })

    it("trips the global ceiling (100/min) with reason=\"global\"", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

      let sawGlobal = false
      // Fresh IP and fresh email each time, so ONLY the global bucket can accumulate.
      for (let i = 0; i < 140 && !sawGlobal; i++) {
        const res = await post(uniqueEmail(), uniqueIp())
        if (res.status === 429) {
          const lines = warn.mock.calls.map((c) => c[0] as string)
          sawGlobal = lines.some((l) => l?.includes?.('"reason":"global"'))
        }
      }

      expect(sawGlobal).toBe(true)
      warn.mockRestore()
    })
  })
})
