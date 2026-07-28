import { Hono } from "hono"
import type { Context } from "hono"
import { z } from "zod"
import { zodErrorToEnvelope } from "./route-helpers"
import { createCustomRateLimiter } from "../lib/rate-limit"
import { Sentry, scrubText } from "../lib/sentry"
import { tryReadUserId } from "../middleware/auth"

// ── phase4-frontend-error-tracking — T1-1 backend endpoint ─────────────────────
//
// Approved transport: SEQ-3 (2026-07-27) Option (c) — a hand-rolled frontend
// reporter POSTs here, and this route forwards into the ALREADY-INITIALIZED
// server-side Sentry (lib/sentry.ts). Same-origin only, so no CSP change and no
// browser→third-party origin (preserves the design-5.4e privacy narrowing).
//
// Deliberate deviations / design notes:
//  - UNAUTHENTICATED by design (SEQ-3): the pre-auth crash class (/login,
//    /privacy, /terms, /auth/2fa-verify, /delete-account/confirm, pre-hydration
//    chunk failures) must be visible — the pre-announcement legal pages are
//    where a public crash matters most. Rate-limited per-IP + a global ceiling.
//  - The client CANNOT set arbitrary Sentry fields: the event is built
//    server-side from ONLY the validated schema fields.
//  - The installed Sentry `beforeSend` scrubs event.request/extra/breadcrumbs but
//    NOT event.message / event.exception, so client message + stack are scrubbed
//    HERE (scrubFrontendText) before the event is built. event.extra.client_stack
//    is additionally re-scrubbed by beforeSend (defence in depth).
//  - Scrubbing boundary (honest): scrubFrontendText redacts emails / IBANs /
//    enc1: / PII key=value (reused backend scrubber) PLUS KWD-format amounts
//    (DECIMAL(_,3)) and finance key=value (merchant/category/amount/...). A bare,
//    UNKEYED merchant name in free prose is not regex-scrubbable; the primary
//    protection against that is the reporter's tight allowlist payload (no query
//    string, no props, no amounts sent), with this scrubbing as defence in depth.

const BODY_CAP_BYTES = 16 * 1024 // hard pre-parse cap, far below Caddy's 25MB global
const MESSAGE_MAX = 2000
const NAME_MAX = 200
const STACK_MAX = 8000
const ROUTE_MAX = 512
const UA_MAX = 512
const RELEASE_MAX = 64
const SHA_RE = /^[0-9a-f]{40}$/

const PER_IP_MAX = 30 // reports / minute / IP
const GLOBAL_MAX = 300 // reports / minute across all sources (bounds total Sentry forwards)

// Stable, greppable prefix for every dropped report (SEQ-3 condition (i)).
const DROP_LOG_PREFIX = "[client-errors.drop]"

const KIND_VALUES = [
  "boundary",
  "onerror",
  "unhandledrejection",
  "chunk-reload-failed",
  "chunk-self-healed",
] as const

// z.object strips unknown keys by default, so a client cannot smuggle extra
// (e.g. Sentry-control) fields through — they are silently dropped, not rejected.
const ReportSchema = z.object({
  message: z.string().min(1, "message is required.").max(MESSAGE_MAX),
  name: z.string().max(NAME_MAX).optional(),
  stack: z.string().max(STACK_MAX).optional(),
  route: z.string().max(ROUTE_MAX).optional(),
  kind: z.enum(KIND_VALUES),
  release: z.string().max(RELEASE_MAX).optional(),
  occurrences: z.number().int().min(1).max(100_000).optional(),
  ua: z.string().max(UA_MAX).optional(),
})

// ── Scrubbing ──────────────────────────────────────────────────────────────────
// KWD amounts are DECIMAL(_,3): a number ending in exactly three decimals. Stack
// frames use `file:line:col` (integer:integer) so this does not eat stack numbers.
const KWD_AMOUNT_RE = /\b\d{1,3}(?:,\d{3})*\.\d{3}\b/g
const FINANCE_KV_RE =
  /\b(merchant|merchant_name|category|category_name|amount|amount_kd|payee|note|memo)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi

function scrubFrontendText(value: string): string {
  return scrubText(value)
    .replace(KWD_AMOUNT_RE, "[REDACTED]")
    .replace(FINANCE_KV_RE, (_m, key: string) => `${key}=[REDACTED]`)
}

// Server-side route normalization (defence — the client also normalizes, but this
// endpoint is public and must not trust it): drop query/hash, replace numeric and
// uuid-ish path segments with :id. Reduces PII and improves Sentry grouping.
const NUMERIC_SEG_RE = /^\d+$/
const UUID_SEG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function normalizeRoute(route: string): string {
  const path = route.split(/[?#]/, 1)[0] || route
  return path
    .split("/")
    .map((seg) => (NUMERIC_SEG_RE.test(seg) || UUID_SEG_RE.test(seg) ? ":id" : seg))
    .join("/")
}

function clientIp(c: Context): string {
  return (
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

// ── Drop accounting (SEQ-3 condition (i)) ──────────────────────────────────────
// Every dropped report — throttled, over-cap, cross-origin, bad-JSON,
// schema-rejected — emits a stable-prefix structured log line AND increments an
// in-process counter that is flushed to Sentry as at most ONE warning per hour
// with the count + window. Rationale of record: a silently-throttled endpoint
// makes "no frontend errors" and "frontend errors being discarded" look
// identical — the same failure shape as the CSP report-uri that collected nothing
// for seven weeks and the backup timer dead for 37 days. The silence must be audible.
const DROP_WINDOW_MS = 60 * 60 * 1000
const dropState = { count: 0, windowStart: Date.now() }

export function recordDrop(reason: string, c: Context): void {
  console.warn(
    `${DROP_LOG_PREFIX} ${JSON.stringify({
      reason,
      ip: clientIp(c),
      ts: new Date().toISOString(),
    })}`,
  )
  const now = Date.now()
  if (now - dropState.windowStart >= DROP_WINDOW_MS) {
    if (dropState.count > 0) {
      Sentry.captureMessage(
        `[client-errors] ${dropState.count} report(s) dropped in ~${Math.round(
          (now - dropState.windowStart) / 60_000,
        )}m`,
        "warning",
      )
    }
    dropState.windowStart = now
    dropState.count = 0
  }
  dropState.count += 1
}

// Test hooks (isolated per file; never called in production).
export function __resetDropStateForTest(): void {
  dropState.count = 0
  dropState.windowStart = Date.now()
}
export function __getDropCountForTest(): number {
  return dropState.count
}
export function __setDropWindowStartForTest(t: number): void {
  dropState.windowStart = t
}

// Per-IP limiter (mandatory — unauth route has no session, so the default userId
// keyGenerator collapses to one `rl:anon:` bucket). Valid while the Cloudflare
// proxy stays disabled (gray-cloud decision, CLAUDE.md), so X-Real-IP is the true
// client IP set by Caddy.
const perIpLimiter = createCustomRateLimiter({
  max: PER_IP_MAX,
  keyGenerator: (c) => `rl:client-errors:ip:${clientIp(c)}`,
  onLimit: (c) => recordDrop("throttled_ip", c),
})

// Global ceiling — a single shared bucket bounding total forwards to Sentry
// regardless of source IP. Fixed key → all requests increment the same counter.
const globalLimiter = createCustomRateLimiter({
  max: GLOBAL_MAX,
  keyGenerator: () => "rl:client-errors:global",
  onLimit: (c) => recordDrop("throttled_global", c),
})

export const clientErrorsRouter = new Hono()

clientErrorsRouter.post("/", perIpLimiter, globalLimiter, async (c) => {
  // Same-origin filter (SEQ-3): if an Origin header is present it must match the
  // request Host. Absent Origin is allowed (some clients / sendBeacon omit it).
  const origin = c.req.header("origin")
  if (origin) {
    let originHost = ""
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = ""
    }
    if (!originHost || originHost !== (c.req.header("host") ?? "")) {
      recordDrop("cross_origin", c)
      return c.json({ ok: false, data: null, error: "Forbidden.", code: "forbidden" }, 403)
    }
  }

  // Body cap BEFORE parse. Content-Length can be absent or lie, so cap twice.
  const declaredLen = Number(c.req.header("content-length") ?? "")
  if (Number.isFinite(declaredLen) && declaredLen > BODY_CAP_BYTES) {
    recordDrop("over_cap_declared", c)
    return c.json({ ok: false, data: null, error: "Payload too large.", code: "payload_too_large" }, 413)
  }
  const raw = await c.req.text()
  if (Buffer.byteLength(raw, "utf8") > BODY_CAP_BYTES) {
    recordDrop("over_cap_actual", c)
    return c.json({ ok: false, data: null, error: "Payload too large.", code: "payload_too_large" }, 413)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    recordDrop("invalid_json", c)
    return c.json({ ok: false, data: null, error: "Invalid JSON.", code: "invalid_json" }, 400)
  }

  const parsed = ReportSchema.safeParse(json)
  if (!parsed.success) {
    recordDrop("schema_rejected", c)
    return zodErrorToEnvelope(c, parsed.error)
  }
  const report = parsed.data

  // Scrub client-supplied free text HERE (beforeSend does not cover message/exception).
  const message = scrubFrontendText(report.message)
  const name = report.name ? scrubFrontendText(report.name) : undefined
  const stack = report.stack ? scrubFrontendText(report.stack) : undefined
  const route = report.route ? normalizeRoute(report.route) : undefined
  const ua = report.ua ? scrubFrontendText(report.ua) : undefined
  // Validate + length-cap the client release: expect a 40-hex SHA, else ignore it
  // (keep the report — a bad release is not a reason to drop a real error).
  const release = report.release && SHA_RE.test(report.release) ? report.release : undefined

  // Optional attribution: best-effort userId (integer only, never email).
  const userId = await tryReadUserId(c)

  Sentry.captureEvent({
    level: "error",
    ...(release ? { release } : {}),
    exception: { values: [{ type: name || "FrontendError", value: message }] },
    tags: {
      source: "frontend",
      kind: report.kind,
      ...(route ? { route } : {}),
      ...(userId !== null ? { user_id: String(userId) } : {}),
    },
    extra: {
      ...(stack ? { client_stack: stack } : {}),
      ...(report.occurrences ? { occurrences: report.occurrences } : {}),
      ...(ua ? { user_agent: ua } : {}),
    },
  })

  return c.json({ ok: true, data: { received: true }, error: null, meta: {} }, 202)
})
