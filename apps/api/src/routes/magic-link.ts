/*
 * Magic-link sign-in — request endpoint (Module 10e-2).
 *
 * POST /api/auth/magic-link/request. UNAUTHENTICATED by design: this is the
 * acquisition path, so no session exists yet. 10e-3a mounts the verify endpoint.
 *
 * WHY THIS IS A SEPARATE ROUTER AND NOT PART OF routes/auth.ts (10e-R37):
 * the four auth route-test files (auth.callback / auth.2fa / auth.2fa-verify /
 * auth.sessions) replace ../lib/rate-limit with a whole-module vi.mock FACTORY that
 * enumerates only `createRateLimiter`. A factory is a CLOSED LIST: importing
 * createCustomRateLimiter into routes/auth.ts would resolve to `undefined` in all
 * four, and because the limiters below are constructed at MODULE SCOPE the throw
 * happens at import — failing every test in those files, not merely the new ones.
 * Mounting a second router on /api/auth (app.ts, the same pattern already used twice
 * for /api/transactions and /api/analytics) serves the same URL with routes/auth.ts
 * byte-untouched.
 *
 * Deliberate deviations / design notes:
 *  - createRateLimiter is UNUSABLE here (Finding F5). Its keyGenerator is
 *    `rl:${session?.userId ?? "anon"}:${path}`, so on an unauthenticated route every
 *    caller on earth shares ONE bucket — that is not a weak limit, it is a global
 *    denial of the signup path from any single client. Three explicit keys instead,
 *    via createCustomRateLimiter, following routes/client-errors.ts.
 *  - The per-email key is a SHA-256 HASH of the normalized address, never the address
 *    (10e-R61). Two reasons, either sufficient: (1) the key is built in the
 *    keyGenerator, which runs BEFORE zod, so the input is unvalidated and unbounded —
 *    a megabyte of JSON string would otherwise become a megabyte Redis key; (2) a
 *    Redis key is neither exported nor purged, the same property that keeps addresses
 *    out of security_events under 10e-R11, one surface over.
 *  - clientIp is duplicated from routes/client-errors.ts rather than promoted.
 *    Promoting it to lib/rate-limit.ts would add an export to a module five test
 *    factories wholesale-mock, so contract/frontend-contract.test.ts's factory would
 *    have to gain the symbol — the 10e-R37 hazard, incurred to save six lines.
 *  - sendTemplatedEmail, NOT sendEmailBackground. Per ERRATA E1 the latter has ZERO
 *    production callers and is dead code with a live test; there is no precedent to
 *    inherit, and this endpoint needs the return value.
 *  - The send is AWAITED and branched on `=== false` (Finding F6). sendEmail RETURNS
 *    false, it does not throw, on a missing key / missing from-address / Postmark
 *    exception — a try/catch around it would catch nothing and report success on
 *    every failure.
 *  - In dev, sendEmail short-circuits on env.isDev and returns true (email.ts:61-64),
 *    so nothing is sent locally and the 502 branch is unreachable: read the link out
 *    of logs/email_dev.log.
 */

import { Hono } from "hono"
import type { Context } from "hono"
import { createHash } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { zodErrorToEnvelope } from "./route-helpers"
import { getDb } from "../db/connection"
import { magicLinkTokens, users } from "../db/schema"
import { env } from "../lib/env"
import { createCustomRateLimiter } from "../lib/rate-limit"
import { sendTemplatedEmail } from "../lib/email-templates"
import { Sentry } from "../lib/sentry"
import { auditSecurityEvent } from "../lib/security-events-lib"
import {
  MAGIC_LINK_TTL_SECONDS,
  hashMagicLinkToken,
  magicLinkExpiry,
  mintMagicLinkToken,
  normalizeEmail,
} from "../lib/magic-link-lib"

const EMAIL_MAX = 255 // matches magic_link_tokens.email varchar(255)

// Implementer's choices, not derived from any ruling; revisit at announcement.
// per-email 3/TTL is an anti-mail-bomb bound aligned to the link lifetime (a fourth
// link inside one window is nearly always abuse, since each supersedes the last).
// per-IP is 3x that so a household NAT can serve several people. global bounds
// total outbound mail.
const PER_EMAIL_MAX = 3
const PER_IP_MAX = 10
const GLOBAL_MAX = 100

const MAGIC_LINK_SUBJECT = "Your Statera sign-in link"

// Stable, greppable prefix for every throttled request. The three limiters return a
// BYTE-IDENTICAL 429 envelope, so without a distinct reason nothing — not a test, not
// production triage — can tell which one fired.
const THROTTLE_LOG_PREFIX = "[magic-link.throttled]"

function clientIp(c: Context): string {
  return (
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

// The global ceiling is deliberately the F5 SHAPE — one shared bucket on an
// unauthenticated route — because bounding total outbound mail requires it. That
// means hitting it refuses sign-in for EVERYONE, which is an alert condition and not
// a journal entry (10e-R69). Rate-limited to <=1 warning/hour so a flood cannot
// self-amplify, following the drop-counter in routes/client-errors.ts.
const GLOBAL_WARN_WINDOW_MS = 60 * 60 * 1000
const globalWarnState = { windowStart: 0 }

function recordThrottle(reason: "ip" | "global" | "email", c: Context): void {
  console.warn(
    `${THROTTLE_LOG_PREFIX} ${JSON.stringify({
      reason,
      ip: clientIp(c),
      ts: new Date().toISOString(),
    })}`,
  )
  if (reason !== "global") return
  const now = Date.now()
  if (now - globalWarnState.windowStart < GLOBAL_WARN_WINDOW_MS) return
  globalWarnState.windowStart = now
  Sentry.captureMessage(
    "[magic-link] global ceiling reached: sign-in requests are being refused for ALL users",
    "warning",
  )
}

// Test hook (isolated per file; never called in production).
export function __resetThrottleStateForTest(): void {
  globalWarnState.windowStart = 0
}

const perIpLimiter = createCustomRateLimiter({
  max: PER_IP_MAX,
  keyGenerator: (c) => `rl:magic-link:ip:${clientIp(c)}`,
  onLimit: (c) => recordThrottle("ip", c),
})

const globalLimiter = createCustomRateLimiter({
  max: GLOBAL_MAX,
  keyGenerator: () => "rl:magic-link:global",
  onLimit: (c) => recordThrottle("global", c),
})

// ASYNC keyGenerator — supported natively by hono-rate-limiter (see the note on
// createCustomRateLimiter). It reads the body via c.req.text(), which Hono memoizes;
// the handler below re-reads with the SAME accessor so the cross-accessor
// re-derivation branch of HonoRequest#cachedBody is never taken.
const perEmailLimiter = createCustomRateLimiter({
  max: PER_EMAIL_MAX,
  // Derived from the TTL rather than a literal, so the window cannot drift from it.
  windowSec: MAGIC_LINK_TTL_SECONDS,
  keyGenerator: async (c) => {
    // IP-scoped on purpose: a garbage-body flood must not exhaust one shared bucket.
    const unparsed = () => `rl:magic-link:email-unparsed:${clientIp(c)}`
    try {
      const body: unknown = JSON.parse(await c.req.text())
      const raw = (body as { email?: unknown } | null)?.email
      if (typeof raw !== "string") return unparsed()
      const normalized = normalizeEmail(raw)
      if (!normalized) return unparsed()
      // 10e-R61: hash, never the address. Bounds the key component to 64 chars
      // regardless of what was posted, and keeps the address out of Redis.
      return `rl:magic-link:email:${createHash("sha256").update(normalized).digest("hex")}`
    } catch {
      return unparsed()
    }
  },
  onLimit: (c) => recordThrottle("email", c),
})

const RequestSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .trim()
    .min(1, "Email is required.")
    .max(EMAIL_MAX, "Enter a valid email address.")
    .email("Enter a valid email address."),
})

export const magicLinkRouter = new Hono()

// Chain order: the two header-keyed limiters run FIRST (no body read at all), then
// the body-dependent per-email bucket, then the handler.
magicLinkRouter.post(
  "/magic-link/request",
  perIpLimiter,
  globalLimiter,
  perEmailLimiter,
  async (c) => {
    let json: unknown
    try {
      json = JSON.parse(await c.req.text())
    } catch {
      return c.json({ ok: false, data: null, error: "Invalid JSON.", code: "invalid_json" }, 400)
    }

    const parsed = RequestSchema.safeParse(json)
    if (!parsed.success) return zodErrorToEnvelope(c, parsed.error)

    const normalized = normalizeEmail(parsed.data.email)
    const db = getDb()

    // COLLATION-DEPENDENT, DELIBERATELY (10e-R62). users.email is
    // utf8mb4_0900_ai_ci (0000_cultured_jimmy_woo.sql:33), so this eq() matches
    // case- AND accent-insensitively. That is load-bearing: link-by-verified-email
    // must find "Khaled@Gmail.com" for a typed "khaled@gmail.com", and an
    // exact/binary lookup would MISS, fall through to the sign-up path, and hit
    // ER_DUP_ENTRY on users_email_unique — manufacturing the F2 crash on a new path.
    //
    // Because the match may be INEXACT, the mail goes to user.email (the STORED
    // address), never to the address the caller typed. Otherwise a request for an
    // accent-variant of a victim's address would deliver a victim-bound link to a
    // mailbox the requester controls.
    //
    // REACHABILITY, STATED HONESTLY (10e-R82/R83) — this is DEFENCE IN DEPTH, not an
    // active mitigation. That accent-variant takeover is NOT currently reachable
    // through this endpoint, because zod's .email() rejects a non-ASCII local part
    // and returns validation_error before this lookup runs ("josé@x.com" REJECT,
    // "jose@x.com" ACCEPT, verified by probe). The path is therefore closed today by
    // a validator that was not chosen for that purpose and owes nothing to it. Swap
    // zod, relax the regex, or add a SECOND caller of this lookup, and it reopens —
    // and NO TEST WILL GO RED, because no test can cover an input the validator
    // refuses to admit. Do not delete this on the grounds that nothing exercises it.
    //
    // What IS reachable, and what the test therefore pins, is stored-vs-typed CASE:
    // the OIDC callback stores claims.email verbatim (auth.ts:179 → :206/:242/:275,
    // nothing lowercases it), so a stored "Khaled@Gmail.com" matches a typed
    // "khaled@gmail.com" under ai_ci and the two differ. No security claim attaches
    // to that one — case variants reach one mailbox in practice — but it exercises
    // this exact branch.
    const [user] = await db
      .select({ id: users.id, isActive: users.isActive, email: users.email })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1)

    // An INACTIVE (soft-deleted) user is treated as FOUND (10e-R64): user_id is set
    // and no activation policy runs here. 10e-R3's reactivate-as-fresh belongs at
    // consume, and a request endpoint that also carried activation policy would be a
    // second place for that policy to live — which is how two copies drift. Setting
    // user_id also keeps the row purgeable rather than stranding it in the orphan class.
    const userId = user?.id ?? null
    const effectiveEmail = user?.email ?? normalized

    const now = new Date()

    // SUPERSEDE BEFORE INSERT, and the order is load-bearing. This way fails OPEN (a
    // concurrent double-submit can leave two live links, both the same person's);
    // insert-then-supersede fails CLOSED, and worse, it is broken with no concurrency
    // at all — the predicate `email = ? AND consumed_at IS NULL` matches the row just
    // inserted, so it would consume its own token unless amended to exclude its own id.
    // consumed_at doubles as the supersession marker (10e-R2) — no second column.
    await db
      .update(magicLinkTokens)
      .set({ consumedAt: now })
      .where(and(eq(magicLinkTokens.email, effectiveEmail), isNull(magicLinkTokens.consumedAt)))

    const rawToken = mintMagicLinkToken()
    await db.insert(magicLinkTokens).values({
      email: effectiveEmail,
      tokenHash: hashMagicLinkToken(rawToken),
      userId,
      expiresAt: magicLinkExpiry(now),
    })

    // 10e-R11 BLOCKING: NO EMAIL ADDRESS IN ANY EVENT PAYLOAD. `details` is not
    // passed at all, so detailsJson is written as SQL NULL and there is no field for
    // an address to be added to by accident. The reason is specific: a row for an
    // unknown address carries user_id = NULL, so it is neither exported by
    // buildUserDataExport nor reachable by purgeUserAccountRows (both filter on
    // user_id) — the address would become a second orphan store, bounded only by
    // security-events' 365-day retention.
    auditSecurityEvent(db, "login.magic_link.requested", {
      userId,
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent") ?? undefined,
    })

    const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"
    // The token and NOTHING else. An `email` parameter here would hand the address to
    // the Referer header and browser history alongside the credential.
    // TODO(module-10e-4-token-in-url): the landing page should history.replaceState
    // the token out of the URL immediately after reading it.
    const link = `${frontendOrigin}/auth/magic?token=${encodeURIComponent(rawToken)}`

    const sent = await sendTemplatedEmail(effectiveEmail, MAGIC_LINK_SUBJECT, "magic_link", {
      link,
      ttl_minutes: MAGIC_LINK_TTL_SECONDS / 60,
    })
    if (sent === false) {
      // No address in the tags — same 10e-R11 reasoning as the audit row above.
      Sentry.captureException(new Error("magic-link send failed"), {
        tags: { handler: "magic-link.request" },
      })
      return c.json(
        {
          ok: false,
          data: null,
          error: "We could not send the sign-in link. Please try again.",
          code: "MAGIC_LINK_SEND_FAILED",
        },
        502,
      )
    }

    // ONE fixed envelope, constructed at a SINGLE site outside every branch, for a
    // known and an unknown address alike (10e-R14). Under the single-template design
    // (10e-R65) the MAIL is byte-identical too, so the only known/unknown differences
    // anywhere are the token row's user_id and the audit row's userId — neither
    // observable to the caller. A well-meant "we've sent you a link to create your
    // account" split here would reintroduce the enumeration oracle in one line.
    return c.json({ ok: true, data: { sent: true }, error: null, meta: {} }, 200)
  },
)
