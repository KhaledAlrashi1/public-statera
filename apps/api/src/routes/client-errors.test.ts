import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Hono } from "hono"
import { randomUUID } from "node:crypto"

// Mock lib/sentry so we can inspect the forwarded event / warning without a DSN.
// scrubText (and every other export) passes through to the real implementation —
// only the two capture sinks are replaced.
vi.mock("../lib/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sentry")>()
  return {
    ...actual,
    Sentry: { ...actual.Sentry, captureEvent: vi.fn(), captureMessage: vi.fn() },
  }
})

import { Sentry } from "../lib/sentry"
import { createSessionToken } from "../middleware/auth"
import {
  clientErrorsRouter,
  __resetDropStateForTest,
  __getDropCountForTest,
  __setDropWindowStartForTest,
} from "./client-errors"
import { RedisMock } from "../test/redis-mock.setup"
import { readJson } from "../test/json"

const app = new Hono().route("/api/client-errors", clientErrorsRouter)

const captureEvent = vi.mocked(Sentry.captureEvent)
const captureMessage = vi.mocked(Sentry.captureMessage)

// Every request defaults to a UNIQUE synthetic X-Real-IP so the per-IP rate-limit
// bucket is isolated BY CONSTRUCTION — under INTEGRATION (real Redis) no test shares
// the `rl:client-errors:ip:*` bucket with another or with a prior run's residue.
// This is the isolation SEQ-3 mandated; the rate-limit describe overrides with its
// own unique IP. (Callers may still override X-Real-IP explicitly.)
function post(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": `t-${randomUUID()}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const validReport = {
  message: "TypeError: d.toFixed is not a function",
  name: "TypeError",
  stack: "TypeError: d.toFixed is not a function\n  at Xr (index-a1b2c3.js:1:45678)",
  route: "/",
  kind: "boundary" as const,
  release: "a".repeat(40),
  occurrences: 3,
  ua: "Mozilla/5.0",
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetDropStateForTest()
})

describe("POST /api/client-errors — happy path & attribution", () => {
  it("accepts an anonymous report (no session) with 202 and forwards to Sentry", async () => {
    const res = await post(validReport)
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body).toEqual({ ok: true, data: { received: true }, error: null, meta: {} })
    expect(captureEvent).toHaveBeenCalledTimes(1)
    const event = captureEvent.mock.calls[0][0]
    expect(event.tags?.source).toBe("frontend")
    // anonymous → no user_id tag
    expect(event.tags?.user_id).toBeUndefined()
  })

  it("CONDITION (iv): tags source:frontend + kind + route, and a valid SHA release", async () => {
    await post(validReport)
    const event = captureEvent.mock.calls[0][0]
    expect(event.tags?.source).toBe("frontend")
    expect(event.tags?.kind).toBe("boundary")
    expect(event.tags?.route).toBe("/")
    expect(event.release).toBe("a".repeat(40))
    // exception carries the client name + message
    expect(event.exception?.values?.[0]).toMatchObject({
      type: "TypeError",
      value: "TypeError: d.toFixed is not a function",
    })
  })

  it("attaches integer user_id (never email) when a valid session cookie is present", async () => {
    const token = await createSessionToken({
      userId: 4242,
      externalId: "ext-abc",
      authProvider: "google",
      sv: 1,
    })
    const res = await post(validReport, { Cookie: `statera_session=${token}` })
    expect(res.status).toBe(202)
    const event = captureEvent.mock.calls[0][0]
    expect(event.tags?.user_id).toBe("4242")
    // nothing email-shaped anywhere in the tags
    expect(JSON.stringify(event.tags)).not.toMatch(/@/)
  })

  it("ignores a malformed release (non-40-hex) but still forwards the report", async () => {
    await post({ ...validReport, release: "not-a-sha" })
    const event = captureEvent.mock.calls[0][0]
    expect(event.release).toBeUndefined()
    expect(captureEvent).toHaveBeenCalledTimes(1)
  })

  it("normalizes route: strips query and :id-normalizes numeric/uuid segments", async () => {
    await post({ ...validReport, route: "/api/transactions/1234?merchant=Lulu#x" })
    expect(captureEvent.mock.calls[0][0].tags?.route).toBe("/api/transactions/:id")
  })

  it("client cannot set arbitrary Sentry fields (level/server_name/tags smuggling ignored)", async () => {
    await post({
      ...validReport,
      level: "fatal",
      server_name: "attacker",
      tags: { evil: "yes" },
      fingerprint: ["x"],
    })
    const event = captureEvent.mock.calls[0][0]
    expect(event.level).toBe("error") // server-set, not the client's "fatal"
    expect((event as Record<string, unknown>).server_name).toBeUndefined()
    expect(event.tags?.evil).toBeUndefined()
    expect(event.fingerprint).toBeUndefined()
  })
})

describe("POST /api/client-errors — CONDITION (ii): PII scrubbing before capture", () => {
  it("scrubs a KWD amount and a keyed merchant name from message AND stack", async () => {
    const res = await post({
      ...validReport,
      message: 'Cannot format amount 12.500 for merchant="Lulu Hypermarket"',
      stack:
        'Error: bad row amount=1,500.000 merchant="Sultan Center"\n  at f (index-x.js:2:9)',
    })
    expect(res.status).toBe(202)
    const event = captureEvent.mock.calls[0][0]
    const value = event.exception?.values?.[0]?.value ?? ""
    const stack = String((event.extra as Record<string, unknown>)?.client_stack ?? "")

    // KWD amounts gone
    expect(value).not.toContain("12.500")
    expect(stack).not.toContain("1,500.000")
    // merchant names gone
    expect(value).not.toContain("Lulu Hypermarket")
    expect(stack).not.toContain("Sultan Center")
    // redaction markers present
    expect(value).toContain("[REDACTED]")
    expect(stack).toContain("[REDACTED]")
  })

  it("scrubs an email embedded in the message (reused backend scrubber)", async () => {
    await post({ ...validReport, message: "Login failed for ali@example.com" })
    const value = captureEvent.mock.calls[0][0].exception?.values?.[0]?.value ?? ""
    expect(value).not.toContain("ali@example.com")
    expect(value).toContain("[REDACTED]")
  })
})

describe("POST /api/client-errors — CONDITION (i): drops are logged and counted", () => {
  it("logs a stable-prefix structured line and increments the drop counter on schema reject", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post({ kind: "boundary" }) // missing required `message`
    expect(res.status).toBe(400)
    expect(__getDropCountForTest()).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
    const line = warn.mock.calls[0][0] as string
    expect(line.startsWith("[client-errors.drop]")).toBe(true)
    expect(line).toContain('"reason":"schema_rejected"')
    warn.mockRestore()
  })

  it("emits at most one aggregated Sentry warning when the hourly window rolls", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await post({ kind: "boundary" }) // drop 1
    await post({ kind: "boundary" }) // drop 2
    expect(__getDropCountForTest()).toBe(2)
    expect(captureMessage).not.toHaveBeenCalled()
    // roll the window into the past, then one more drop flushes the prior count
    __setDropWindowStartForTest(Date.now() - 2 * 60 * 60 * 1000)
    await post({ kind: "boundary" }) // drop 3 triggers flush of the 2 accumulated
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage.mock.calls[0][0]).toContain("2 report(s) dropped")
    expect(captureMessage.mock.calls[0][1]).toBe("warning")
    warn.mockRestore()
  })
})

describe("POST /api/client-errors — rejection paths", () => {
  it("rejects an over-cap body (>16KB) with 413 and does not forward", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const huge = JSON.stringify({ ...validReport, message: "x".repeat(20_000) })
    const res = await post(huge)
    expect(res.status).toBe(413)
    const body = await readJson(res)
    expect(body.code).toBe("payload_too_large")
    expect(captureEvent).not.toHaveBeenCalled()
    expect(__getDropCountForTest()).toBe(1)
    warn.mockRestore()
  })

  it("rejects an invalid `kind` via the zod envelope (400) and drops", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post({ ...validReport, kind: "not-a-kind" })
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.ok).toBe(false)
    expect(body.code).toBe("validation_error")
    expect(captureEvent).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("rejects a cross-origin POST (Origin host != Host) with 403 and drops", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post(validReport, {
      Origin: "https://evil.example.com",
      Host: "staterafinance.app",
    })
    expect(res.status).toBe(403)
    const body = await readJson(res)
    expect(body.code).toBe("forbidden")
    expect(captureEvent).not.toHaveBeenCalled()
    expect(__getDropCountForTest()).toBe(1)
    warn.mockRestore()
  })

  it("allows a same-origin POST (Origin host == Host)", async () => {
    const res = await post(validReport, {
      Origin: "https://staterafinance.app",
      Host: "staterafinance.app",
    })
    expect(res.status).toBe(202)
  })
})

// HERMETIC-ONLY (skipped under INTEGRATION): forces 429 by spying on
// RedisMock.prototype.evalsha, which only exists when the ioredis mock is wired
// (setupFiles is [] under INTEGRATION, so RedisMock is dead code there and the spy
// is inert). Per-IP keying + a unique synthetic X-Real-IP per test isolate the
// bucket BY CONSTRUCTION, so this never keys on userId 1 and never contaminates a
// re-run — the exact class behind the reopened isolation ticket.
describe.skipIf(process.env.INTEGRATION === "true")("POST /api/client-errors — rate limit", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns 429 with the standard envelope and logs a throttle drop", async () => {
    vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post(validReport, { "X-Real-IP": `rl-test-${randomUUID()}` })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      ok: false,
      data: null,
      error: "Too many requests. Please try again later.",
      code: "rate_limit_exceeded",
      meta: { retry_after: 60 },
    })
    // over-limit request must not forward to Sentry
    expect(captureEvent).not.toHaveBeenCalled()
    // and the throttle drop is logged (condition i)
    const throttleLines = warn.mock.calls
      .map((c) => c[0] as string)
      .filter((l) => typeof l === "string" && l.includes('"reason":"throttled_ip"'))
    expect(throttleLines.length).toBeGreaterThanOrEqual(1)
  })
})
