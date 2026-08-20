// Hermetic tests for POST /api/auth/magic-link/request (Module 10e-2).
//
// ../lib/rate-limit is deliberately NOT mocked: the base ioredis stub's evalsha
// returns [1, 60000] ("first hit"), so the real limiters run and never trip. The
// three rate-limit cases force a 429 by spying on RedisMock.prototype.evalsha — the
// M1 remedy from docs/modules/phase4-rate-limit-test-isolation.md:68 — and are
// skipped under INTEGRATION, where RedisMock is dead code and the spy would be inert.
// Their real-Redis behaviour lives in magic-link.integration.test.ts (10e-R16).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Hono } from "hono"
import { getTableName } from "drizzle-orm"
import { createHash, randomUUID } from "node:crypto"

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
vi.mock("../lib/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/sentry")>()
  return {
    ...actual,
    Sentry: { ...actual.Sentry, captureException: vi.fn(), captureMessage: vi.fn() },
  }
})
vi.mock("../lib/email-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email-templates")>()
  return { ...actual, sendTemplatedEmail: vi.fn().mockResolvedValue(true) }
})

import { getDb } from "../db/connection"
import { Sentry } from "../lib/sentry"
import { sendTemplatedEmail, renderEmailTemplate } from "../lib/email-templates"
import { RedisMock } from "../test/redis-mock.setup"
import { magicLinkRouter, __resetThrottleStateForTest } from "./magic-link"
import { MAGIC_LINK_TTL_SECONDS } from "../lib/magic-link-lib"
import { readJson } from "../test/json"

const app = new Hono().route("/api/auth", magicLinkRouter)

const KNOWN_EMAIL = "known@example.com"
const UNKNOWN_EMAIL = "nobody@example.com"
const KNOWN_ROW = { id: 42, isActive: true, email: KNOWN_EMAIL }

// Records every insert/update the handler issues so ordering and values are assertable.
// Table identity is resolved through drizzle's own getTableName — the same technique
// the 10e-1 F8 guard uses — rather than reaching into internals.
type Call = { op: string; table?: string; values?: Record<string, unknown> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nameOf = (t: any): string => getTableName(t)

function makeMockDb(selectRows: unknown[], calls: Call[] = []) {
  const db = {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            calls.push({ op: "select", table: nameOf(t) })
            return selectRows
          },
        }),
      }),
    }),
    update: (t: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          calls.push({ op: "update", table: nameOf(t), values })
          return [{ affectedRows: 0 }]
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (values: Record<string, unknown>) => {
        calls.push({ op: "insert", table: nameOf(t), values })
        // securityEvents inserts are fire-and-forget: the helper calls .catch() on
        // the result, so this must be a real promise.
        return Promise.resolve([{ affectedRows: 1 }]) as Promise<unknown> & {
          catch: (f: (e: unknown) => unknown) => Promise<unknown>
        }
      },
    }),
  }
  return db as unknown as ReturnType<typeof getDb>
}

// Unique X-Real-IP per request so the per-IP bucket is isolated BY CONSTRUCTION —
// under INTEGRATION no test shares `rl:magic-link:ip:*` with another or with residue.
function post(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/auth/magic-link/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": `t-${randomUUID()}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetThrottleStateForTest()
  vi.mocked(sendTemplatedEmail).mockResolvedValue(true)
})

// ── 10e-R14: the uniform envelope ─────────────────────────────────────────────
// The RED-first case. Proven able to fail by returning { sent: true, existing: true }
// on the known branch and capturing the red (see the 10e-2 close-out); without that
// demonstration this is indistinguishable from asserting true === true.
describe("POST /api/auth/magic-link/request — byte-identical response (10e-R14)", () => {
  it("returns the identical status, content-type and body for a known and an unknown email", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([KNOWN_ROW]))
    const known = await post({ email: KNOWN_EMAIL })
    const knownBody = await known.text()

    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const unknown = await post({ email: UNKNOWN_EMAIL })
    const unknownBody = await unknown.text()

    expect(known.status).toBe(unknown.status)
    expect(known.headers.get("content-type")).toBe(unknown.headers.get("content-type"))
    expect(knownBody).toBe(unknownBody)
    expect(knownBody).toBe(
      JSON.stringify({ ok: true, data: { sent: true }, error: null, meta: {} }),
    )
  })

  it("sends the byte-identical MAIL for both, under the single-template design (10e-R65)", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([KNOWN_ROW]))
    await post({ email: KNOWN_EMAIL })
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    await post({ email: UNKNOWN_EMAIL })

    const [a, b] = vi.mocked(sendTemplatedEmail).mock.calls
    expect(a![1]).toBe(b![1]) // subject
    expect(a![2]).toBe(b![2]) // template key — one template, both branches
    expect(a![2]).toBe("magic_link")
  })
})

// ── Happy path, row shape, supersession ───────────────────────────────────────
describe("POST /api/auth/magic-link/request — token row", () => {
  it("mints a row whose token_hash is 64 lowercase hex and expires at now + TTL", async () => {
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"))
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))

    const res = await post({ email: UNKNOWN_EMAIL })
    expect(res.status).toBe(200)

    const insert = calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")!
    expect(insert).toBeDefined()
    expect(insert.values!["tokenHash"]).toMatch(/^[0-9a-f]{64}$/)
    expect((insert.values!["expiresAt"] as Date).getTime()).toBe(
      new Date("2026-08-14T12:00:00.000Z").getTime() + MAGIC_LINK_TTL_SECONDS * 1000,
    )
    vi.useRealTimers()
  })

  it("supersedes BEFORE inserting (order is load-bearing — see the handler comment)", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))
    await post({ email: UNKNOWN_EMAIL })

    const ops = calls.filter((c) => c.table === "magic_link_tokens").map((c) => c.op)
    expect(ops).toEqual(["update", "insert"])
    const update = calls.find((c) => c.op === "update" && c.table === "magic_link_tokens")!
    expect(update.values).toEqual({ consumedAt: expect.any(Date) })
  })

  it("sets user_id to the found id for a known email", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([KNOWN_ROW], calls))
    await post({ email: KNOWN_EMAIL })
    const insert = calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")!
    expect(insert.values!["userId"]).toBe(42)
  })

  it("sets user_id to NULL for an unknown email (the documented orphan class)", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))
    await post({ email: UNKNOWN_EMAIL })
    const insert = calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")!
    expect(insert.values!["userId"]).toBeNull()
  })

  // 10e-R84. The fixture is stored-vs-typed CASE, not an accent variant: zod's
  // .email() rejects a non-ASCII local part, so an accent fixture would never reach
  // this branch and the test would silently assert a 400 it was never written to
  // check (10e-R82). Stored case IS reachable — the OIDC callback stores
  // claims.email verbatim (auth.ts:179 → :206), so nothing lowercases it.
  it("mails and stores the STORED address, not the typed one, when case differs (10e-R62)", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeMockDb([{ id: 7, isActive: true, email: "Khaled@Gmail.com" }], calls),
    )
    const res = await post({ email: "khaled@gmail.com" })

    // Reaching the branch at all is part of the assertion — an unreachable fixture
    // would 400 here and every later expectation would be vacuous.
    expect(res.status).toBe(200)
    expect(vi.mocked(sendTemplatedEmail).mock.calls[0]![0]).toBe("Khaled@Gmail.com")
    const insert = calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")!
    expect(insert.values!["email"]).toBe("Khaled@Gmail.com")
  })

  it("treats an INACTIVE user as found (10e-R64): user_id set, no activation policy here", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeMockDb([{ id: 9, isActive: false, email: KNOWN_EMAIL }], calls),
    )
    const res = await post({ email: KNOWN_EMAIL })
    expect(res.status).toBe(200)
    const insert = calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")!
    expect(insert.values!["userId"]).toBe(9)
  })
})

// ── 10e-R11: no email address in any event payload ────────────────────────────
// Proven able to fail by temporarily passing the address into the audit call and
// capturing the red (see the 10e-2 close-out). A guard whose pass has never been
// distinguished from a vacuous pass means nothing.
describe("POST /api/auth/magic-link/request — audit (10e-R11 BLOCKING)", () => {
  it("emits login.magic_link.requested with NO address anywhere in the row", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))
    await post({ email: UNKNOWN_EMAIL }, { "User-Agent": "probe/1.0" })

    const audit = calls.find((c) => c.op === "insert" && c.table === "security_events")!
    expect(audit).toBeDefined()
    expect(audit.values!["eventType"]).toBe("login.magic_link.requested")
    expect(audit.values!["userId"]).toBeNull()
    expect(audit.values!["userAgent"]).toBe("probe/1.0")
    // detailsJson must be SQL NULL — the field is not passed at all.
    expect(audit.values!["detailsJson"]).toBeNull()
    // The whole serialized row must not contain the address, in any field.
    expect(JSON.stringify(audit.values)).not.toContain(UNKNOWN_EMAIL)
    expect(JSON.stringify(audit.values)).not.toContain("nobody")
  })

  it("records the userId when the email is known", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([KNOWN_ROW], calls))
    await post({ email: KNOWN_EMAIL })
    const audit = calls.find((c) => c.op === "insert" && c.table === "security_events")!
    expect(audit.values!["userId"]).toBe(42)
    expect(JSON.stringify(audit.values)).not.toContain(KNOWN_EMAIL)
  })
})

// ── zod (10e-R51) ─────────────────────────────────────────────────────────────
describe("POST /api/auth/magic-link/request — validation", () => {
  it("rejects a malformed address with the exact envelope", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await post({ email: "not-an-email" })
    expect(res.status).toBe(400)
    expect(await readJson(res)).toEqual({
      ok: false,
      data: null,
      error: "Enter a valid email address.",
      code: "validation_error",
    })
  })

  it("rejects a missing address with the exact envelope", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    const res = await post({})
    expect(res.status).toBe(400)
    expect(await readJson(res)).toEqual({
      ok: false,
      data: null,
      error: "Email is required.",
      code: "validation_error",
    })
  })

  it("rejects an unparseable body before touching the DB", async () => {
    vi.mocked(getDb).mockReturnValue(makeMockDb([]))
    vi.mocked(getDb).mockClear()
    const res = await post("{not json")
    expect(res.status).toBe(400)
    expect((await readJson(res)).code).toBe("invalid_json")
    expect(getDb).not.toHaveBeenCalled()
  })
})

// ── Send failure (Finding F6) ─────────────────────────────────────────────────
describe("POST /api/auth/magic-link/request — send failure", () => {
  it("returns 502 on `=== false`, reports to Sentry, and still persisted the token", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))
    vi.mocked(sendTemplatedEmail).mockResolvedValue(false)

    const res = await post({ email: UNKNOWN_EMAIL })
    expect(res.status).toBe(502)
    expect((await readJson(res)).code).toBe("MAGIC_LINK_SEND_FAILED")
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    // The row is written before the send, so a dead-lettered link is still recorded.
    expect(calls.some((c) => c.op === "insert" && c.table === "magic_link_tokens")).toBe(true)
  })
})

// ── Template (10e-R65) ────────────────────────────────────────────────────────
describe("magic_link email template", () => {
  it("interpolates link and ttl_minutes into both html and text", () => {
    const { html, text } = renderEmailTemplate("magic_link", {
      link: "https://staterafinance.app/auth/magic?token=abc",
      ttl_minutes: 15,
    })
    for (const body of [html, text]) {
      expect(body).toContain("https://staterafinance.app/auth/magic?token=abc")
      expect(body).toContain("15 minutes")
      expect(body).not.toContain("{{")
    }
  })

  it("leaves the pre-existing budget_alert template unchanged", () => {
    const { html, text } = renderEmailTemplate("budget_alert", {
      ratio_pct: 90,
      category: "Food",
      month_label: "August 2026",
      spent_kd: "90.000",
      budget_kd: "100.000",
    })
    expect(html).toContain("Budget Alert")
    expect(text).toContain("You have used 90% of your Food budget for August 2026.")
  })
})

// ── Rate limiting (HERMETIC-ONLY — see the file header; M1 remedy) ────────────
describe.skipIf(process.env.INTEGRATION === "true")(
  "POST /api/auth/magic-link/request — rate limits",
  () => {
    afterEach(() => vi.restoreAllMocks())

    for (const reason of ["ip", "global", "email"] as const) {
      it(`returns the standard 429 envelope and logs reason="${reason}"`, async () => {
        vi.mocked(getDb).mockReturnValue(makeMockDb([]))
        vi.mocked(getDb).mockClear()
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])

        const res = await post({ email: UNKNOWN_EMAIL })

        expect(res.status).toBe(429)
        expect(await readJson(res)).toEqual({
          ok: false,
          data: null,
          error: "Too many requests. Please try again later.",
          code: "rate_limit_exceeded",
          // The per-email limiter's window is the TTL; the other two are 60s. The
          // first limiter in the chain (per-IP) is the one that answers here.
          meta: { retry_after: 60 },
        })
        // Short-circuits before the handler.
        expect(getDb).not.toHaveBeenCalled()
        // With every limiter over its cap the FIRST in the chain answers, so only
        // "ip" is observable from outside; the reason field is what makes the three
        // distinguishable at all (they share a byte-identical envelope).
        const lines = warn.mock.calls.map((c) => c[0] as string)
        expect(lines.some((l) => l?.startsWith?.("[magic-link.throttled]"))).toBe(true)
        expect(lines.some((l) => l?.includes?.('"reason":"ip"'))).toBe(true)
        warn.mockRestore()
      })
    }

    it("raises a Sentry warning when the GLOBAL ceiling is the limiter that fires", async () => {
      vi.mocked(getDb).mockReturnValue(makeMockDb([]))
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      // Trip only the global bucket: its fixed key differs from the per-IP key.
      // The stub declares evalsha with NO parameters, so the implementation must have
      // no REQUIRED ones; the real call is evalsha(sha1, numKeys, key, ...args), so
      // the key is args[2].
      vi.spyOn(RedisMock.prototype, "evalsha").mockImplementation(
        async (...args: unknown[]): Promise<[number, number]> => {
          const key = String(args[2] ?? "")
          return key.includes("magic-link:global") ? [9999, 60000] : [1, 60000]
        },
      )

      const res = await post({ email: UNKNOWN_EMAIL })
      expect(res.status).toBe(429)
      expect(
        warn.mock.calls.map((c) => c[0] as string).some((l) => l?.includes?.('"reason":"global"')),
      ).toBe(true)
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
      expect(vi.mocked(Sentry.captureMessage).mock.calls[0]![0]).toContain("global ceiling reached")
      warn.mockRestore()
    })

    it("hashes the address into the per-email key and never puts it in Redis (10e-R61)", async () => {
      vi.mocked(getDb).mockReturnValue(makeMockDb([]))
      const seen: string[] = []
      vi.spyOn(RedisMock.prototype, "evalsha").mockImplementation(
        async (...args: unknown[]): Promise<[number, number]> => {
          seen.push(String(args[2] ?? ""))
          return [1, 60000]
        },
      )

      await post({ email: UNKNOWN_EMAIL })

      const expected = createHash("sha256").update(UNKNOWN_EMAIL).digest("hex")
      expect(seen.some((k) => k.includes(`magic-link:email:${expected}`))).toBe(true)
      expect(seen.join("|")).not.toContain(UNKNOWN_EMAIL)
    })
  },
)

// ── 10e-R109 / 10e-R123: the co-variance pin ──────────────────────────────────
// user_id and email are assigned from the SAME `user` binding two lines apart, so
// `user_id IS NULL` implies `email` took the `?? normalized` arm — i.e. the zod-gated,
// normalized, ASCII typed address. The whole R100 argument for verify's sign-up branch
// rests on that, and nothing pinned it: a future edit setting email from the stored
// address while leaving user_id null would break it with no test going red, for the same
// structural reason 10e-R82/R83 records (no test can cover an input zod refuses to admit).
// This asserts the INVARIANT at the write boundary rather than mirroring the two lines.
describe("POST /api/auth/magic-link/request — user_id/email co-variance (10e-R109)", () => {
  const tokenInsert = (calls: Call[]) =>
    calls.find((c) => c.op === "insert" && c.table === "magic_link_tokens")?.values

  it("unknown address: user_id IS NULL and email is the NORMALIZED typed address", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(makeMockDb([], calls))
    await post({ email: "  NoBody@Example.COM  " })

    const v = tokenInsert(calls)
    expect(v?.userId).toBeNull()
    expect(v?.email).toBe("nobody@example.com")
  })

  it("known address with a case-differing stored form: user_id is SET and email is the STORED form", async () => {
    const calls: Call[] = []
    const stored = "Known@Example.com"
    vi.mocked(getDb).mockReturnValue(makeMockDb([{ id: 42, isActive: true, email: stored }], calls))
    await post({ email: KNOWN_EMAIL })

    const v = tokenInsert(calls)
    expect(v?.userId).toBe(42)
    expect(v?.email).toBe(stored)
    // The two arms move together: a set user_id NEVER co-occurs with the typed address.
    expect(v?.email).not.toBe(KNOWN_EMAIL)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/magic-link/verify (Module 10e-3a)
// ═════════════════════════════════════════════════════════════════════════════

// Verify touches more tables in sequence than the request endpoint, so it needs a mock
// that answers per-table and in call order rather than returning one canned row set.
function makeVerifyDb(opts: {
  consumeAffected?: number
  tokenRows?: unknown[][]
  userRows?: unknown[][]
  insertedId?: number
  calls?: Call[]
}) {
  const calls = opts.calls ?? []
  const tokenQ = [...(opts.tokenRows ?? [])]
  const userQ = [...(opts.userRows ?? [])]
  let tokenUpdates = 0

  const db = {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            const table = nameOf(t)
            calls.push({ op: "select", table })
            return table === "magic_link_tokens" ? (tokenQ.shift() ?? []) : (userQ.shift() ?? [])
          },
        }),
      }),
    }),
    update: (t: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          const table = nameOf(t)
          calls.push({ op: "update", table, values })
          let affected = 1
          if (table === "magic_link_tokens") {
            tokenUpdates += 1
            if (tokenUpdates === 1) affected = opts.consumeAffected ?? 1
          }
          return Promise.resolve([{ affectedRows: affected }])
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: (values: Record<string, unknown>) => {
        calls.push({ op: "insert", table: nameOf(t), values })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p: any = Promise.resolve([{ affectedRows: 1 }])
        p.$returningId = async () => [{ id: opts.insertedId ?? 4242 }]
        return p
      },
    }),
  }
  return db as unknown as ReturnType<typeof getDb>
}

const RAW_TOKEN = "a".repeat(43)
const TOKEN_ROW = { id: 7, email: KNOWN_EMAIL, userId: 42 }
const ACTIVE_USER = {
  id: 42,
  isActive: true,
  totpEnabled: false,
  sessionVersion: 3,
  authProvider: "google",
  externalId: "ext-42",
}

function postVerify(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/auth/magic-link/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Real-IP": `v-${randomUUID()}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

// The single expected failure body. Written out here rather than imported so a change to
// the production constant has to be mirrored deliberately.
const MAGIC_LINK_INVALID_EXPECTED = {
  ok: false,
  data: null,
  error: "This sign-in link is no longer valid.",
  code: "MAGIC_LINK_INVALID",
}

const securityEventValues = (calls: Call[]) =>
  calls.filter((c) => c.op === "insert" && c.table === "security_events").map((c) => c.values)

describe("POST /api/auth/magic-link/verify — happy path", () => {
  it("consumes the token, issues a session cookie, and returns is_new_user", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]], calls }),
    )

    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({
      ok: true,
      data: { is_new_user: false },
      error: null,
      meta: {},
    })
    expect(res.headers.get("set-cookie")).toContain("statera_session=")
  })

  it("the emitted session cookie carries the shared helper's attribute set", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]] }),
    )
    const header = (await postVerify({ token: RAW_TOKEN })).headers.get("set-cookie") ?? ""
    // Delegation check, not a re-implementation: the attribute VALUES are pinned by
    // middleware/session-cookie.test.ts. What matters here is that verify goes through it.
    expect(header).toContain("HttpOnly")
    expect(header).toContain("SameSite=Lax")
    expect(header).toContain("Max-Age=2592000")
    expect(header).toContain("Path=/")
  })

  it("emits login.magic_link.success exactly once on the no-TOTP path", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]], calls }),
    )
    await postVerify({ token: RAW_TOKEN })

    const types = securityEventValues(calls).map((v) => v?.eventType)
    expect(types.filter((t) => t === "login.magic_link.success")).toHaveLength(1)
    expect(types).not.toContain("login.pending_2fa")
  })

  it("sets consumed_at on magic_link_tokens as its FIRST write", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]], calls }),
    )
    await postVerify({ token: RAW_TOKEN })

    const firstWrite = calls.find((c) => c.op === "update" || c.op === "insert")
    expect(firstWrite?.op).toBe("update")
    expect(firstWrite?.table).toBe("magic_link_tokens")
    expect(firstWrite?.values).toHaveProperty("consumedAt")
  })
})

// ── 10e-R14 / 10e-R122(c): ONE envelope for FIVE causes ──────────────────────
describe("POST /api/auth/magic-link/verify — uniform failure (10e-R14, five causes)", () => {
  const EXPIRED = { userId: 42, consumedAt: null, expiresAt: new Date(Date.now() - 60_000) }
  const CONSUMED = { userId: 42, consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }

  // Each entry drives a DIFFERENT cause to affectedRows === 0.
  const causes: Array<[string, () => ReturnType<typeof getDb>]> = [
    ["never existed", () => makeVerifyDb({ consumeAffected: 0, tokenRows: [[]] })],
    ["expired", () => makeVerifyDb({ consumeAffected: 0, tokenRows: [[EXPIRED]] })],
    ["consumed", () => makeVerifyDb({ consumeAffected: 0, tokenRows: [[CONSUMED]] })],
    ["superseded", () => makeVerifyDb({ consumeAffected: 0, tokenRows: [[CONSUMED]] })],
    [
      "inexact email match",
      () =>
        makeVerifyDb({
          tokenRows: [[{ id: 7, email: "jose@x.com", userId: null }], [{ userId: null, consumedAt: null, expiresAt: new Date(Date.now() + 60_000) }]],
          userRows: [[{ ...ACTIVE_USER, email: "josé@x.com" }]],
        }),
    ],
  ]

  it("returns a byte-identical 400 body for all five causes", async () => {
    const bodies: string[] = []
    for (const [, mk] of causes) {
      vi.mocked(getDb).mockReturnValue(mk())
      const res = await postVerify({ token: RAW_TOKEN })
      expect(res.status).toBe(400)
      bodies.push(await res.text())
    }
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toBe(JSON.stringify(MAGIC_LINK_INVALID_EXPECTED))
  })

  it("issues NO session cookie on any failing cause", async () => {
    for (const [, mk] of causes) {
      vi.mocked(getDb).mockReturnValue(mk())
      const res = await postVerify({ token: RAW_TOKEN })
      expect(res.headers.get("set-cookie")).toBeNull()
    }
  })

})

describe("POST /api/auth/magic-link/verify — failure audit (10e-R124)", () => {
  it("emits login.magic_link.failed with a closed-set reason and NO address", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        consumeAffected: 0,
        tokenRows: [[{ userId: 42, consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }]],
        calls,
      }),
    )
    await postVerify({ token: RAW_TOKEN })

    const ev = securityEventValues(calls)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.eventType).toBe("login.magic_link.failed")
    expect(ev[0]?.detailsJson).toContain("consumed_or_superseded")
  })
})

// ── 10e-R11 BLOCKING ─────────────────────────────────────────────────────────
describe("POST /api/auth/magic-link/verify — no email address in ANY audit payload", () => {
  it("scans every security_events insert payload across all branches", async () => {
    const scenarios: Array<() => { db: ReturnType<typeof getDb>; calls: Call[] }> = [
      () => {
        const calls: Call[] = []
        return { db: makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]], calls }), calls }
      },
      () => {
        const calls: Call[] = []
        return {
          db: makeVerifyDb({
            tokenRows: [[TOKEN_ROW]],
            userRows: [[{ ...ACTIVE_USER, isActive: false }]],
            calls,
          }),
          calls,
        }
      },
      () => {
        const calls: Call[] = []
        return {
          db: makeVerifyDb({
            tokenRows: [[TOKEN_ROW]],
            userRows: [[{ ...ACTIVE_USER, totpEnabled: true }]],
            calls,
          }),
          calls,
        }
      },
      () => {
        const calls: Call[] = []
        return {
          db: makeVerifyDb({
            consumeAffected: 0,
            tokenRows: [[{ userId: 42, consumedAt: new Date(), expiresAt: new Date() }]],
            calls,
          }),
          calls,
        }
      },
      () => {
        const calls: Call[] = []
        return {
          db: makeVerifyDb({
            tokenRows: [[{ id: 7, email: KNOWN_EMAIL, userId: null }]],
            userRows: [[], []],
            calls,
          }),
          calls,
        }
      },
    ]

    for (const mk of scenarios) {
      const { db, calls } = mk()
      vi.mocked(getDb).mockReturnValue(db)
      await postVerify({ token: RAW_TOKEN })
      // Whole-payload scan, not key-absence: an address under a differently-named key
      // would satisfy a `toHaveProperty` check and fail this one.
      for (const v of securityEventValues(calls)) {
        expect(JSON.stringify(v)).not.toContain(KNOWN_EMAIL)
      }
    }
  })
})

describe("POST /api/auth/magic-link/verify — TOTP handoff", () => {
  it("sets the pending-2FA cookie, emits login.pending_2fa, and issues NO session", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        tokenRows: [[TOKEN_ROW]],
        userRows: [[{ ...ACTIVE_USER, totpEnabled: true }]],
        calls,
      }),
    )
    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({
      ok: true,
      data: { pending_2fa: true },
      error: null,
      meta: {},
    })
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("statera_pending_2fa=")
    expect(cookie).not.toContain("statera_session=")

    const types = securityEventValues(calls).map((v) => v?.eventType)
    expect(types).toContain("login.pending_2fa")
    expect(types).not.toContain("login.magic_link.success")
  })
})

describe("POST /api/auth/magic-link/verify — reactivate-as-fresh (10e-R3)", () => {
  it("flips isActive, nulls the TOTP fields, and audits account.reactivated", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        tokenRows: [[TOKEN_ROW]],
        userRows: [[{ ...ACTIVE_USER, isActive: false, totpEnabled: true }]],
        calls,
      }),
    )
    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(200)
    // TOTP was enabled on the stub, but reactivation nulls it — so this must NOT be the
    // pending-2FA handoff. A deleted-era secret must never gate a returning user.
    expect(await readJson(res)).toEqual({
      ok: true,
      data: { is_new_user: true },
      error: null,
      meta: {},
    })

    const userUpdate = calls.find((c) => c.op === "update" && c.table === "users")
    expect(userUpdate?.values).toMatchObject({
      isActive: true,
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodesJson: null,
    })
    expect(securityEventValues(calls).map((v) => v?.eventType)).toContain("account.reactivated")
  })

  it("does NOT re-bump sessionVersion (F-3a-3)", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        tokenRows: [[TOKEN_ROW]],
        userRows: [[{ ...ACTIVE_USER, isActive: false }]],
        calls,
      }),
    )
    await postVerify({ token: RAW_TOKEN })

    for (const c of calls.filter((x) => x.op === "update" && x.table === "users")) {
      expect(c.values).not.toHaveProperty("sessionVersion")
    }
  })
})

describe("POST /api/auth/magic-link/verify — sign-up branch (user_id IS NULL)", () => {
  const NULL_TOKEN_ROW = { id: 7, email: UNKNOWN_EMAIL, userId: null }

  it("creates the user with authProvider 'email' and a random externalId (10e-R8(2))", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({ tokenRows: [[NULL_TOKEN_ROW]], userRows: [[], [{ externalId: "gen" }]], calls }),
    )
    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({
      ok: true,
      data: { is_new_user: true },
      error: null,
      meta: {},
    })
    const ins = calls.find((c) => c.op === "insert" && c.table === "users")
    expect(ins?.values).toMatchObject({ authProvider: "email", email: UNKNOWN_EMAIL })
    // A UUID, not the address — no PII in an export-excluded column.
    expect(String(ins?.values?.externalId)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it("ADOPTS an existing user on an EXACT match and does not INSERT (the R100 race)", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        tokenRows: [[NULL_TOKEN_ROW]],
        userRows: [[{ ...ACTIVE_USER, email: UNKNOWN_EMAIL }]],
        calls,
      }),
    )
    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(200)
    expect(calls.some((c) => c.op === "insert" && c.table === "users")).toBe(false)
  })

  it("backfills user_id on the token row so it leaves the orphan class", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        tokenRows: [[NULL_TOKEN_ROW]],
        userRows: [[{ ...ACTIVE_USER, email: UNKNOWN_EMAIL }]],
        calls,
      }),
    )
    await postVerify({ token: RAW_TOKEN })

    const backfill = calls.filter((c) => c.op === "update" && c.table === "magic_link_tokens")
    expect(backfill.some((c) => Object.prototype.hasOwnProperty.call(c.values ?? {}, "userId"))).toBe(
      true,
    )
  })
})

// ── 10e-R122(b) / 10e-R123 second pin: the adopt refusal ─────────────────────
describe("POST /api/auth/magic-link/verify — inexact-match adopt refusal (10e-R122)", () => {
  it("refuses, issues NO session for the seeded user, and does NOT fall through to INSERT", async () => {
    const calls: Call[] = []
    vi.mocked(getDb).mockReturnValue(
      makeVerifyDb({
        // token row was written on the sign-up path, so its email is the zod-gated ASCII form
        tokenRows: [[{ id: 7, email: "jose@x.com", userId: null }]],
        // the ai_ci lookup returns the victim's ACCENTED stored address
        userRows: [[{ ...ACTIVE_USER, id: 99, email: "josé@x.com" }]],
        calls,
      }),
    )
    const res = await postVerify({ token: RAW_TOKEN })

    expect(res.status).toBe(400)
    expect((await readJson(res)).code).toBe("MAGIC_LINK_INVALID")
    // The assertion that matters: a test asserting only the 400 passes in a world where
    // the handler adopted and then errored.
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(calls.some((c) => c.op === "insert" && c.table === "users")).toBe(false)
    const ev = securityEventValues(calls)
    expect(ev.map((v) => v?.eventType)).toContain("login.magic_link.failed")
    expect(String(ev[0]?.detailsJson)).toContain("inexact_email_match")
  })
})

describe("POST /api/auth/magic-link/verify — validation", () => {
  it("rejects a missing, empty, non-string or over-long token with the validation envelope", async () => {
    vi.mocked(getDb).mockReturnValue(makeVerifyDb({}))
    for (const body of [{}, { token: "" }, { token: 5 }, { token: "x".repeat(513) }]) {
      const res = await postVerify(body)
      expect(res.status).toBe(400)
      expect((await readJson(res)).code).not.toBe("MAGIC_LINK_INVALID")
    }
  })

  it("rejects a non-JSON body", async () => {
    vi.mocked(getDb).mockReturnValue(makeVerifyDb({}))
    const res = await postVerify("not json")
    expect(res.status).toBe(400)
    expect((await readJson(res)).code).toBe("invalid_json")
  })
})

// ── Rate limiting (HERMETIC-ONLY; the per-IP limiter's real behaviour is
//    covered residue-immune under INTEGRATION per 10e-R108) ──────────────────
describe.skipIf(process.env.INTEGRATION === "true")(
  "POST /api/auth/magic-link/verify — rate limits",
  () => {
    afterEach(() => vi.restoreAllMocks())

    it("uses keys DISTINCT from the request endpoint's, so requesting cannot throttle clicking", async () => {
      vi.mocked(getDb).mockReturnValue(makeVerifyDb({ tokenRows: [[TOKEN_ROW]], userRows: [[ACTIVE_USER]] }))
      const keys: string[] = []
      vi.spyOn(RedisMock.prototype, "evalsha").mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (...args: any[]) => {
          keys.push(String(args[2]))
          return [1, 60000]
        },
      )
      await postVerify({ token: RAW_TOKEN })

      // Keys are DOUBLE-PREFIXED in the store (`rl:` from RedisStore + `rl:` from the
      // generator) — the documented RL-C1 observation, confirmed here rather than assumed.
      expect(keys.some((k) => k.includes("magic-link-verify:ip:"))).toBe(true)
      expect(keys.some((k) => k.endsWith("rl:magic-link-verify:global"))).toBe(true)
      // The request endpoint's buckets are untouched by a verify call.
      expect(keys.some((k) => /magic-link:ip:/.test(k) && !k.includes("verify"))).toBe(false)
      expect(keys.some((k) => k.endsWith("rl:magic-link:global"))).toBe(false)
    })

    it("returns the standard 429 envelope when the ceiling is reached", async () => {
      vi.mocked(getDb).mockReturnValue(makeVerifyDb({}))
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])

      const res = await postVerify({ token: RAW_TOKEN })
      expect(res.status).toBe(429)
      expect((await readJson(res)).code).toBe("rate_limit_exceeded")
    })
  },
)

// ── 10e-R162(d): shared-literal parity with routes/auth.ts ───────────────────
describe("inexact_email_match parity across the two closed reason sets", () => {
  it("is byte-identical in VERIFY_FAIL_REASONS and ADOPT_FAIL_REASONS", async () => {
    // One decision class — "the ai_ci match was inexact beyond case" — is reached
    // from two endpoints and must not report two different literals into the audit
    // trail. The sets are deliberately defined separately (the routers share no
    // vocabulary module); a comment saying "keep these in sync" would rot, so this
    // assertion goes red instead.
    const { VERIFY_FAIL_REASONS } = await import("./magic-link")
    const { ADOPT_FAIL_REASONS } = await import("./auth")

    const fromVerify = VERIFY_FAIL_REASONS.filter((r) => r.includes("inexact"))
    const fromAdopt = ADOPT_FAIL_REASONS.filter((r) => r.includes("inexact"))

    // Each set contributes exactly one, so the comparison below cannot pass vacuously.
    expect(fromVerify).toHaveLength(1)
    expect(fromAdopt).toHaveLength(1)
    expect(fromAdopt[0]).toBe(fromVerify[0])
    expect(fromVerify[0]).toBe("inexact_email_match")
  })
})
