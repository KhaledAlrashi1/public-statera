// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// Real-Redis verification of the /api/client-errors per-IP rate limiter
// (T1-1-APPROVE follow-up): the hermetic file cannot trip the real limiter (the
// ioredis mock always reports "first hit"), so the 429 path was previously only
// asserted against a mock — the exact gap the reopened isolation ticket names.
// This file exercises the REAL limiter against real Redis. It has NO module-level
// db/redis mock (standing convention for *.integration.test.ts). Sentry has no DSN
// in dev, so the pre-throttle successful requests are no-op captures. The IP is
// unique PER RUN (randomUUID), so the `rl:client-errors:ip:*` bucket is isolated
// by construction and needs no residue flush of its own.

import { describe, it, expect, vi } from "vitest"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"
import { clientErrorsRouter } from "./client-errors"
import { readJson } from "../test/json"

const INTEGRATION = process.env.INTEGRATION === "true"
const app = new Hono().route("/api/client-errors", clientErrorsRouter)

function post(ip: string) {
  return app.request("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify({ message: "TypeError: integration probe", kind: "boundary" }),
  })
}

describe.skipIf(!INTEGRATION)("POST /api/client-errors — real-Redis rate limit [integration]", () => {
  it("trips the per-IP limiter against real Redis: standard 429 envelope + throttle drop logged", async () => {
    const ip = `rl-int-${randomUUID()}` // unique per run → no residue collision
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    // The default per-IP ceiling is 30/min; send enough to cross it.
    let throttled: Response | null = null
    for (let i = 0; i < 40 && !throttled; i++) {
      const res = await post(ip)
      if (res.status === 429) throttled = res
    }

    expect(throttled).not.toBeNull()
    expect(await readJson(throttled as Response)).toEqual({
      ok: false,
      data: null,
      error: "Too many requests. Please try again later.",
      code: "rate_limit_exceeded",
      meta: { retry_after: 60 },
    })

    // CONDITION (i): the real throttle drop is logged with the stable prefix + reason.
    const throttleLine = warn.mock.calls
      .map((c) => c[0] as string)
      .find((l) => l?.startsWith?.("[client-errors.drop]") && l.includes('"reason":"throttled_ip"'))
    expect(throttleLine).toBeDefined()

    warn.mockRestore()
  })
})
