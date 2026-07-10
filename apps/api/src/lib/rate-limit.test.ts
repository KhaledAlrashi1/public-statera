// Proves the REAL createRateLimiter middleware end-to-end: counting + the exact
// 429 standard envelope. The base ioredis stub's evalsha returns [1, 60000]
// ("first hit"), which never trips a limit — so here we spy evalsha with an
// INCREMENTING counter (hit N → [N, 60000]) and drive a limit of 2: hits 1-2 pass,
// hit 3 exceeds and returns the envelope. Route tests assert wiring; this asserts
// the middleware's own behaviour independent of any route.

import { describe, it, expect, vi, afterEach } from "vitest"
import { Hono } from "hono"
import { createRateLimiter } from "./rate-limit"
import { RedisMock } from "../test/redis-mock.setup"

describe("createRateLimiter — counting + 429 envelope", () => {
  afterEach(() => vi.restoreAllMocks())

  it("passes hits 1-2 under limit 2, then returns the standard 429 envelope on hit 3", async () => {
    let hits = 0
    vi.spyOn(RedisMock.prototype, "evalsha").mockImplementation(async () => {
      hits += 1
      return [hits, 60_000]
    })

    const app = new Hono()
    app.use("/limited", createRateLimiter(2))
    app.get("/limited", (c) => c.json({ ok: true, data: { hit: hits }, error: null, meta: {} }))

    const r1 = await app.request("/limited")
    expect(r1.status).toBe(200)

    const r2 = await app.request("/limited")
    expect(r2.status).toBe(200)

    const r3 = await app.request("/limited")
    expect(r3.status).toBe(429)
    const body = (await r3.json()) as Record<string, unknown>
    expect(body).toEqual({
      ok: false,
      data: null,
      error: "Too many requests. Please try again later.",
      code: "rate_limit_exceeded",
      meta: { retry_after: 60 },
    })
  })
})
