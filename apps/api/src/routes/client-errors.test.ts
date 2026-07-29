import { describe, it, expect, beforeEach, vi } from "vitest"
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
    // CONDITION (i): log line + counter for the over-cap drop path
    expect(__getDropCountForTest()).toBe(1)
    const line = warn.mock.calls.map((c) => c[0] as string).find((l) => l?.startsWith?.("[client-errors.drop]"))
    expect(line).toBeDefined()
    expect(line).toMatch(/"reason":"over_cap_(declared|actual)"/)
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
    // CONDITION (i): log line + counter for the cross-origin drop path
    expect(__getDropCountForTest()).toBe(1)
    const line = warn.mock.calls.map((c) => c[0] as string).find((l) => l?.startsWith?.("[client-errors.drop]"))
    expect(line).toBeDefined()
    expect(line).toMatch(/"reason":"cross_origin"/)
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

// The 429 / throttle-drop path is verified against REAL Redis in
// client-errors.integration.test.ts (T1-1-APPROVE follow-up): a limiter whose
// behaviour is only ever asserted against a mock is the gap the reopened
// isolation ticket names. Per-run-unique X-Real-IP (post() default) isolates the
// bucket by construction, so that integration test needs no skip in the hermetic
// file and no residue flush of its own bucket.
