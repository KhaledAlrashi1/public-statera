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

import { describe, it, expect, beforeAll, vi } from "vitest"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { magicLinkRouter } from "./magic-link"
import { getDb } from "../db/connection"
import { magicLinkTokens } from "../db/schema"
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
