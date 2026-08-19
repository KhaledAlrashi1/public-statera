# 10e-3a — Phase-A proposal: `POST /api/auth/magic-link/verify`

**STATUS: PROPOSAL — NOT APPROVED.** Delivered to the review channel 2026-08-15. No ruling
has been issued on its contents, and nothing in this document is authority to implement.
Committed under **10e-R105** so that a deliverable too large to relay in chat is not held
only as an untracked working-tree file — the 10e-R56 class, where an uncommitted edit was
discarded and is unrecoverable. When a ruling block lands it is appended verbatim below and
this header is superseded rather than edited; the original text is never revised.

**[SUPERSEDED 2026-08-15 — retained, not edited.]** The status above is discharged: the
review channel's ruling block on this document's contents is appended verbatim at the end
of this file. The header's own mechanism ("appended verbatim below") is satisfied there;
this line exists because that text is ~1350 lines away and a linear reader meets the
superseded claim here. Per 10e-R111 the correction is adjacent, not only appended.

**PROPOSAL ONLY.** No implementation code, no route file, nothing committed beyond
`10e-3a-DOCS` (`fe63668`). Written against the charter in **10e-R104** (2026-08-15).

**[SUPERSEDED IN PART 2026-08-15, 10e-R114 — retained as the authorship-state record, not edited.]**
The third clause above is false as of `b565914`, which committed this file under 10e-R105:
that commit is beyond `fe63668`. The first two clauses — no implementation code, no route
file — remain TRUE and remain in force; this marker corrects the commit-ledger claim only,
and is not a retraction of the propose-before-implement guarantee. Marked here rather than
only at the status paragraph below because a linear reader meets this claim first.

The design is already approved (A2, A3, A8, R9–R17 in `phase4-10e.md`). This document does not
re-derive or re-litigate it. Its job is to show the tree, state the plan against it, and surface
contradictions.

**Status of this file:** UNCOMMITTED. Written under the persist-first standing rule so the
proposal survives compaction; R104 forbids committing anything further, so it stays in the working
tree until the ruling lands. This is the only dirty path.

**[SUPERSEDED 2026-08-15, 10e-R111 — retained as the authorship-state record, not edited.]**
Every clause of the paragraph above is false as of `b565914`, which committed this file under
10e-R105. It is kept because it accurately records the file's state when it was written, and
because 10e-R105's "the original text is never revised" governs. It is marked here rather than
appended-to-elsewhere because a linear reader meets the false claim at this point in the file
and nowhere else.

---

## (A) Step 0 — captured

```
$ pwd
/Users/khaledalrashidi/DevLocal/public-statera

$ git rev-parse --short HEAD
fe63668

$ git status --porcelain
                      (empty)

$ git rev-list --count origin/main..HEAD
8
```

All four match the charter's expectation: repo root, `10e-3a-DOCS`'s sha, empty status, 8.
(The status above is the capture taken *before* this file was written; this file now makes it
non-empty, as disclosed.)

---

## (B) Verbatim source

Everything 10e-3a replicates or touches, at `fe63668`, pasted rather than described.

### B1 — `apps/api/src/routes/magic-link.ts`, entire

Verify lands in **this file**, on **this router**, and inherits its mounting and limiter
constraints. Lines 1–44 are the file header; the R37 argument in it is what makes the placement
decision for verify already-made rather than open.

```ts
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
```

### B2 — `apps/api/src/routes/auth.ts`, the OIDC callback's `totpEnabled` branch (`:280`–`:341`)

This is what verify's TOTP handoff replicates. Note `packPending2faToken`, the
`PENDING_2FA_COOKIE` option block, and the redirect target — all three are the subject of
finding **F-3a-1** below.

```ts
    const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"

    // 7b: Gate on TOTP — issue a short-lived pending-2FA cookie and redirect to the
    // verify page. For delete-reauth flows, deleteIntent is embedded in the JWT so
    // /2fa/verify issues the delete-intent cookie instead of a new session on success.
    if (existing.totpEnabled) {
      const pendingToken = await packPending2faToken(userId, stateDeleteIntent ?? false)
      setCookie(c, PENDING_2FA_COOKIE, pendingToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: PENDING_2FA_TTL,
        path: "/",
      })
      if (stateDeleteIntent) {
        auditSecurityEvent(db, "account.delete_reauth.pending_2fa", {
          userId,
          ipAddress: c.req.header("x-forwarded-for") ?? undefined,
          userAgent: c.req.header("user-agent") ?? undefined,
        })
        return c.redirect(`${frontendOrigin}/auth/2fa-verify?intent=delete`)
      }
      auditSecurityEvent(db, "login.pending_2fa", {
        userId,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })
      return c.redirect(`${frontendOrigin}/auth/2fa-verify`)
    }

    // No TOTP: for delete-reauth, issue delete-intent cookie directly without
    // touching the existing session.
    if (stateDeleteIntent) {
      const deleteIntentToken = await packDeleteIntentToken(userId)
      setCookie(c, DELETE_INTENT_COOKIE, deleteIntentToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: DELETE_INTENT_TTL,
        path: "/api/account",
      })
      auditSecurityEvent(db, "account.delete_reauth.confirmed", {
        userId,
        ipAddress: c.req.header("x-forwarded-for") ?? undefined,
        userAgent: c.req.header("user-agent") ?? undefined,
      })
      return c.redirect(`${frontendOrigin}/delete-account/confirm`)
    }
  }

  // Non-blocking: failure must not delay the redirect or surface to the user.
  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId))
    .catch((err) => Sentry.captureException(err, { tags: { handler: "auth.callback.lastLoginAt", userId } }))

  const sessionToken = await createSessionToken({ userId, externalId, authProvider: provider, sv: sessionVersion })
  setSessionCookie(c, sessionToken)

  const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"
  return c.redirect(`${frontendOrigin}${isNewUser ? "/welcome?source=signup" : "/"}`)
})
```

The pending-2FA primitives it depends on, `routes/auth.ts:41`–`:44` and `:79`–`:94` — **all
module-private**:

```ts
// Short-lived cookie carries userId across the 2FA verify step (post-OIDC, pre-session).
const PENDING_2FA_COOKIE = "statera_pending_2fa"
const PENDING_2FA_TTL = 300 // 5 minutes
const PENDING_2FA_MAX_FAILURES = 3
```

```ts
async function packPending2faToken(userId: number, deleteIntent?: boolean): Promise<string> {
  const claims: Record<string, unknown> = { userId, pendingAt: Date.now() }
  if (deleteIntent) claims.deleteIntent = true
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${PENDING_2FA_TTL}s`)
    .sign(stateSecret())
}

async function verifyPending2faToken(token: string): Promise<{ userId: number; deleteIntent?: boolean }> {
  const { payload } = await jwtVerify(token, stateSecret())
  return {
    userId: payload["userId"] as number,
    deleteIntent: payload["deleteIntent"] as boolean | undefined,
  }
}
```

with `stateSecret` at `:51`–`:53`:

```ts
function stateSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}
```

### B3 — `apps/api/src/routes/auth.ts`, `POST /api/auth/2fa/verify` (`:584`–`:731`)

From handler entry through session issuance. Verify's TOTP handoff hands off **into** this
endpoint unchanged; nothing here is edited by 10e-3a.

```ts
router.post(
  "/2fa/verify",
  createRateLimiter(5, 60),
  async (c) => {
    const db = getDb()
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
    const rawCode = String(body.code ?? "")
    const codeType = (body.type === "backup" ? "backup" : "totp") as "totp" | "backup"
    const ipAddress = c.req.header("x-forwarded-for") ?? undefined
    const userAgent = c.req.header("user-agent") ?? undefined

    // 1. Read and verify the pending-2FA JWT cookie.
    const pendingCookieValue = getCookie(c, PENDING_2FA_COOKIE)
    if (!pendingCookieValue) {
      return c.json({ ok: false, data: null, error: "No pending 2FA session.", code: "PENDING_2FA_GONE" }, 410)
    }

    let userId: number
    let deleteIntent: boolean | undefined
    try {
      ;({ userId, deleteIntent } = await verifyPending2faToken(pendingCookieValue))
    } catch {
      return c.json({ ok: false, data: null, error: "Pending 2FA session expired or invalid.", code: "PENDING_2FA_GONE" }, 410)
    }

    // 2. Pre-check failure counter — safety net against replayed cookies after 3rd failure.
    const redis = getAuthRedis()
    const failureKey = `pending_2fa_failures:${userId}`
    try {
      const currentFailures = await redis.get(failureKey)
      if (currentFailures !== null && parseInt(currentFailures, 10) >= PENDING_2FA_MAX_FAILURES) {
        deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })
        return c.json({ ok: false, data: null, error: "Too many failed attempts. Please sign in again.", code: "PENDING_2FA_RESTART" }, 401)
      }
    } catch { /* Redis error: fail open — proceed to code check */ }

    // 3. Load user.
    const [user] = await db
      .select({
        totpEnabled: users.totpEnabled,
        totpSecret: users.totpSecret,
        totpBackupCodesJson: users.totpBackupCodesJson,
        sessionVersion: users.sessionVersion,
        authProvider: users.authProvider,
        externalId: users.externalId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.isActive) {
      // (10d-0c) Surviving inactive-rejection path (e.g. a pending_2fa cookie issued before
      // deletion, then completed after the purge). Envelope + code already compliant; add the
      // audit event to match Flask's login.failed/account_disabled discipline. XHR endpoint —
      // JSON is correct here (not a full-document nav), so no redirect-with-error-param.
      auditSecurityEvent(db, "login.failed", { userId, ipAddress, userAgent, details: { reason: "account_disabled" } })
      return c.json({ ok: false, data: null, error: "Account is deactivated.", code: "ACCOUNT_INACTIVE" }, 403)
    }

    if (!user?.totpEnabled) {
      return c.json({ ok: false, data: null, error: "Two-factor authentication is not enabled.", code: "TOTP_NOT_ENABLED" }, 400)
    }

    // 4. Verify the supplied code.
    let codeValid = false
    let backupCodesLow = false
    let remainingBackupHashes: string[] | null = null

    if (codeType === "backup") {
      const { consumed, remainingHashes } = await verifyAndConsumeBackupCode(rawCode, user.totpBackupCodesJson)
      if (consumed) {
        codeValid = true
        remainingBackupHashes = remainingHashes
        backupCodesLow = remainingHashes.length <= 2
        // Persist consumed backup codes (fire-and-forget would risk race; await for correctness).
        await db
          .update(users)
          .set({ totpBackupCodesJson: JSON.stringify(remainingHashes) })
          .where(eq(users.id, userId))
      }
    } else {
      const decryptedSecret = user.totpSecret ? decrypt(user.totpSecret) : ""
      // TODO(module-future-hardening): add Redis totp_used:{userId}:{code} cache (90s TTL)
      // to reject replayed valid TOTP codes. Flask does not implement this; matching Flask for now.
      codeValid = verifyTotpCode(decryptedSecret, rawCode)
    }

    // 5. Handle failure — increment counter; restart if limit reached.
    if (!codeValid) {
      let newCount = PENDING_2FA_MAX_FAILURES // fail-safe default on Redis error
      try {
        const results = await redis.multi().incr(failureKey).expire(failureKey, 300).exec()
        const raw = results?.[0]?.[1]
        if (typeof raw === "number") newCount = raw
      } catch { /* Redis error: treat as limit reached to avoid infinite retries */ }

      auditSecurityEvent(db, "login.2fa.failed", { userId, ipAddress, userAgent, details: { type: codeType } })

      if (newCount >= PENDING_2FA_MAX_FAILURES) {
        deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })
        return c.json({ ok: false, data: null, error: "Too many failed attempts. Please sign in again.", code: "PENDING_2FA_RESTART" }, 401)
      }

      return c.json({ ok: false, data: null, error: "Invalid authentication code.", code: "INVALID_TOTP_CODE" }, 401)
    }

    // 6. Success — clear counter, delete pending cookie.
    redis.del(failureKey).catch(() => {})
    deleteCookie(c, PENDING_2FA_COOKIE, { path: "/" })

    // delete-reauth path: issue the narrow-scope delete-intent cookie instead of a new session.
    // The user's existing statera_session remains valid — we only need to confirm intent.
    if (deleteIntent) {
      const deleteIntentToken = await packDeleteIntentToken(userId)
      setCookie(c, DELETE_INTENT_COOKIE, deleteIntentToken, {
        httpOnly: true,
        sameSite: "Lax",
        secure: !env.isDev,
        maxAge: DELETE_INTENT_TTL,
        path: "/api/account",
      })
      auditSecurityEvent(db, "account.delete_reauth.confirmed", { userId, ipAddress, userAgent })
      return c.json({ ok: true, data: { user_id: userId, delete_intent: true }, error: null, meta: {} })
    }

    // Normal login path: update lastLoginAt and issue the real session cookie.
    db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId))
      .catch((err: unknown) =>
        Sentry.captureException(err, { tags: { handler: "auth.2fa.verify.lastLoginAt", userId } }),
      )
    auditSecurityEvent(db, "login.success", { userId, ipAddress, userAgent, details: { type: codeType } })

    const { authProvider, externalId, sessionVersion } = user
    const sessionToken = await createSessionToken({ userId, externalId, authProvider, sv: sessionVersion })
    setSessionCookie(c, sessionToken)

    const data: Record<string, unknown> = { user_id: userId }
    if (backupCodesLow && remainingBackupHashes !== null) {
      data.warning = "BACKUP_CODES_LOW"
      data.backup_codes_remaining = remainingBackupHashes.length
    }

    return c.json({ ok: true, data, error: null, meta: {} })
  },
)
```

### B4 — `apps/api/src/routes/auth.ts`, the reactivate-as-fresh branch in full (`:218`–`:260`)

10e-R3 requires verify to replicate this.

```ts
  } else if (!existing.isActive) {
    // ── Reactivate-as-fresh (10d-0b) ──────────────────────────────────────────
    // Deliberate deviation from Flask: neither checkout ever reactivates. `is_active = True`
    // appears only in Flask test fixtures/scripts; the production inactive-login handler
    // (personal-finance auth.py:702-712, personal_statera auth.py:711-721) rejects with
    //   if not user.is_active: _audit_security_event("login.failed", ... account_disabled)
    //   return _legacy_api_error(error_code="auth_account_disabled", status=403, ...)
    // We deviate on product grounds (approved 2026-07-07): a consumer app must let a deleted
    // user return with the same Google account. The purge already emptied all data; the
    // retained row is a stub; the composite (auth_provider, external_id) unique is never
    // challenged. We treat this as a fresh registration.
    userId = existing.id
    // Read sessionVersion as-is: the purge that preceded this login already bumped it
    // (10d-0a), so the new token issued below is not self-denied by the sv_revoked key.
    sessionVersion = existing.sessionVersion

    // Flip active, refresh email/displayName from the provider claims (mirrors the active
    // path), and null the TOTP fields. The TOTP null is idempotent for post-10d-0a purges
    // (already null) but heals legacy stubs purged before this fix — without it, their
    // second and subsequent logins would hit the 2FA gate against a deleted-era secret.
    await db
      .update(users)
      .set({
        isActive: true,
        email,
        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
        totpSecret: null,
        totpEnabled: false,
        totpBackupCodesJson: null,
      })
      .where(eq(users.id, userId))

    // Mirror the new-user branch: re-emit signup_completed (product_events were purged).
    isNewUser = true
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.reactivated.signup_completed", userId } }),
    )
    // Positive audit analog of Flask's login.failed/account_disabled rejection.
    auditSecurityEvent(db, "account.reactivated", {
      userId,
      ipAddress: c.req.header("x-forwarded-for") ?? undefined,
      userAgent: c.req.header("user-agent") ?? undefined,
    })
  } else {
```

And the new-user INSERT branch it mirrors (`:200`–`:217`), which verify's sign-up path replicates:

```ts
  if (!existing) {
    const [inserted] = await db
      .insert(users)
      .values({
        authProvider: provider,
        externalId,
        email,
        displayName: (claims["name"] as string | undefined) ?? null,
        firstName: (claims["given_name"] as string | undefined) ?? null,
        lastName: (claims["family_name"] as string | undefined) ?? null,
      })
      .$returningId()
    userId = inserted.id
    sessionVersion = 1 // DB default
    isNewUser = true
    recordEventOnce(userId, "signup_completed", {}, db).catch((err) =>
      Sentry.captureException(err, { tags: { handler: "auth.callback.signup_completed", userId } }),
    )
```

### B5 — `apps/api/src/middleware/session-cookie.ts`, entire

```ts
/*
 * Session cookie issuance — the single canonical home for the session cookie's name,
 * lifetime, and attribute set (10e-3a-EXTRACT).
 *
 * WHY THIS IS ITS OWN MODULE rather than part of middleware/auth.ts (10e-R36, superseding
 * 10e-R9's naming of that file as the destination). The four protected auth route-test files
 * (auth.callback / auth.2fa / auth.2fa-verify / auth.sessions) replace `../middleware/auth`
 * with a whole-module `vi.mock` FACTORY that enumerates its exports. That enumeration is a
 * CLOSED LIST: any new export added to middleware/auth.ts and called from routes/auth.ts
 * resolves to `undefined` in those four files and throws at runtime — measured, 8 failures,
 * all on cookie-issuing paths. Putting the helper here means those four mocks are untouched
 * and the REAL helper executes in them, so a refactor advertised as zero-behaviour-change is
 * provable by those files staying green without being edited.
 *
 * NO RE-EXPORT FROM middleware/auth.ts, deliberately (10e-R36 condition 1). auth.ts imports
 * SESSION_COOKIE FROM here. Re-exporting it there would recreate exactly the enumeration
 * coupling this split exists to remove, and would give one symbol two import paths.
 *
 * The attribute set below is the ONLY place these five options are written. It replaced four
 * byte-identical hand-typed copies in routes/auth.ts (OIDC callback, 2FA disable re-issue,
 * 2FA verify login, revoke-all re-issue). The four were verified identical BEFORE the
 * extraction — no divergence had crept in yet — which is precisely why this was the moment to
 * extract: 10e-3a was about to add a fifth copy.
 */

import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import { env } from "../lib/env"

export const SESSION_COOKIE = "statera_session"

/**
 * Session cookie lifetime, in seconds. 30 days — matches the JWT's own
 * setExpirationTime("30d") in createSessionToken (middleware/auth.ts), so the cookie and the
 * token it carries expire together.
 *
 * Deliberately NOT unified with middleware/auth.ts's SV_REVOKE_TTL_SECONDS even though both
 * are 30 days: that one is the sv deny-list key's TTL and is pinned to JWT expiry, this one
 * is the browser's cookie lifetime. They coincide today for the same underlying reason but
 * are independently motivated, and collapsing them would let a future change to either
 * silently move the other.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/**
 * Set the session cookie.
 *
 * `secure` is derived from env.isDev at CALL time, not module-load time, so a test can drive
 * both postures. NOTE: before session-cookie.test.ts, NO test in this repo asserted ANY of
 * these attributes — a dropped `secure` produced a green suite, a green typecheck, and a
 * session cookie transmitted in plaintext. That guard, not the deduplication, is why touching
 * the working production login path was approved.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  })
}
```

### B6 — `apps/api/src/middleware/auth.ts`, `SessionData` + `createSessionToken`

```ts
export interface SessionData {
  userId: number
  externalId: string
  authProvider: string
  sv: number
}

declare module "hono" {
  interface ContextVariableMap {
    session: SessionData
  }
}
```

```ts
export async function createSessionToken(session: SessionData): Promise<string> {
  return new jose.SignJWT({
    userId: session.userId,
    externalId: session.externalId,
    authProvider: session.authProvider,
    sv: session.sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret())
}
```

`SessionData` requires a **non-null `externalId: string`** and `authProvider: string`. This is
load-bearing for the sign-up path — see finding **F-3a-2**.

### B7 — `apps/api/src/lib/magic-link-lib.ts`, entire

Verify reuses `hashMagicLinkToken` **only**. `mintMagicLinkToken`, `magicLinkExpiry` and
`normalizeEmail` are request-side; verify does not call them (it reads the already-normalized
`magic_link_tokens.email`, which is what makes the R100 argument in (D) work).

```ts
/** Bytes of CSPRNG entropy per token. 32 bytes = 256 bits. */
export const MAGIC_LINK_TOKEN_BYTES = 32

/**
 * Link lifetime. 15 minutes is the value the user-facing copy states verbatim
 * (10e-R14: "Links expire after 15 minutes, and requesting a new link replaces any
 * earlier one."), so changing it here requires changing that string too.
 */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60

export function mintMagicLinkToken(): string {
  return randomBytes(MAGIC_LINK_TOKEN_BYTES).toString("base64url")
}

/**
 * SHA-256 hex of a raw token — the value stored in magic_link_tokens.token_hash and the
 * value looked up on verify. Exactly 64 lowercase hex chars, matching varchar(64).
 */
export function hashMagicLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

/**
 * Trim + lowercase ONLY. See the file-top note: no provider-specific aliasing, ever.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Absolute expiry instant for a token minted at `now` (default: the current time). */
export function magicLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000)
}
```

### B8 — `apps/api/src/routes/account.ts` around the bare literal (`:149`–`:151`)

```ts
    // Clear the session cookie — the account is being deleted.
    deleteCookie(c, "statera_session", { path: "/" })
```

Imports at `:21`–`:35` (no `middleware/session-cookie` import today):

```ts
import { Hono } from "hono"
import { getCookie, deleteCookie } from "hono/cookie"
import { eq } from "drizzle-orm"
import { Job } from "bullmq"
import { getDb } from "../db/connection"
import { users } from "../db/schema"
import { requireAuth, revokeSessionVersion } from "../middleware/auth"
...
```

---

## (C) The plan, stated with evidence

### C1 — The consume statement, and why `affectedRows` is the branch signal

Proposed, verbatim as it will be written:

```ts
const tokenHash = hashMagicLinkToken(parsed.data.token)
const now = new Date()

const [consumeResult] = await db
  .update(magicLinkTokens)
  .set({ consumedAt: now })
  .where(
    and(
      eq(magicLinkTokens.tokenHash, tokenHash),
      isNull(magicLinkTokens.consumedAt),
      gt(magicLinkTokens.expiresAt, now),
    ),
  )

if (consumeResult.affectedRows !== 1) {
  // uniform failure — see C2
}
```

**No `db.transaction()`**, per A8's explicit note: the single-statement
`UPDATE … WHERE consumed_at IS NULL` autocommits, making the consume globally visible the
instant it succeeds, which is the strongest available anti-double-click property. Wrapping
consume + user-creation would hold the row lock across the user INSERT — correct, but strictly
weaker on visibility and longer on lock hold.

**Why `affectedRows` is the signal, and why it is exactly 1 or 0.** MySQL evaluates the `WHERE`
under a row lock; two concurrent requests carrying the same token serialise, and the second one
finds `consumed_at IS NOT NULL` and matches nothing. `token_hash` is `UNIQUE`
(`magic-link-tokens.ts`: `.notNull().unique()`), so the predicate can never match more than one
row. Therefore `affectedRows === 1` means *this request* consumed the token, and `0` means
some other outcome — with no ambiguity to resolve afterwards.

**The result shape, checked rather than assumed.** `drizzle-orm@0.39.3` types the mysql2 update
result as a **tuple**:

```
node_modules/.pnpm/drizzle-orm@0.39.3_…/node_modules/drizzle-orm/mysql2/session.d.ts:11
export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
```

so the value must be **destructured** (`const [result] = await …`) before reading
`.affectedRows`. Four existing sites do exactly this and are the precedent —
`lib/memorized-prune.ts:47-48`, `lib/analytics-cache.ts:299-302`,
`worker/jobs/maintenance-jobs.ts:63-77` (twice, on this very table).

> **Near-miss recorded, because it is instance-(8)-rider-(b) precisely.** A grep for
> `affectedRows` returns lines reading `result.affectedRows` — which, against a tuple type, looks
> like a live bug across three files. It is not: every one of those lines is preceded by
> `const [result] = await …` on the line above, so `result` *is* the `ResultSetHeader`. The
> search found the sites; only reading the consumer decided them. No defect exists and none is
> reported.

**`gt(expiresAt, now)` folded into the predicate, not checked after.** Checking expiry in a
separate read would consume an expired token before rejecting it (harmless but wrong), and would
make expiry a second failure branch instead of the same one.

### C2 — Audit events per branch, matched against 10e-R11's table

R11's table, reproduced from `phase4-10e.md:1238-1244`:

| event | when |
|---|---|
| `login.magic_link.requested` | on accepted request, before the send |
| `login.magic_link.success` | on successful consume, no-TOTP path — session issued |
| `login.magic_link.failed` | invalid / expired / consumed / superseded |
| `login.pending_2fa` | reused verbatim — TOTP handoff |
| `account.reactivated` | reused verbatim — 10e-R3 reactivation |

10e-3a's mapping, branch by branch:

| verify branch | event(s) emitted |
|---|---|
| `affectedRows !== 1` (all four causes) | `login.magic_link.failed` |
| consumed, user active, `totpEnabled === false` | `login.magic_link.success` |
| consumed, user active, `totpEnabled === true` | `login.pending_2fa` — **verbatim reuse**, no magic-link-specific string |
| consumed, user inactive (10e-R3) | `account.reactivated` + `signup_completed` product event, then the TOTP-or-success branch above |
| consumed, no user → created | `signup_completed` product event, then `login.magic_link.success` |

**No third string is minted.** The TOTP path emits `login.pending_2fa` and nothing else —
identical to the OIDC callback at `auth.ts:302`. `login.magic_link.success` fires **only** on the
no-TOTP path, exactly as R11 words it ("no-TOTP path — session issued"); on the TOTP path the
session is issued later by `/2fa/verify`, which emits its own `login.success`, so emitting
`login.magic_link.success` at handoff would claim a session that does not exist yet.

**BLOCKING — no email address in any event payload.** Guaranteed **structurally, by the same
mechanism 10e-2 used**: `auditSecurityEvent` is called with `userId`, `ipAddress`, `userAgent`
and — where a reason is recorded — a `details` object whose only key is `reason`, drawn from a
**closed set of four literals**. The address is never in scope at the call site: on the failure
path the handler holds only `tokenHash`, and on the success path the email is read from the token
row but is never passed into an audit call. A closed literal set is what makes this checkable
rather than a promise.

**Proven able to fail** — the test does not assert "the `details` object lacks an `email` key",
which passes trivially if the address is put under a differently-named key. It captures **every**
`security_events` insert payload the request makes, `JSON.stringify`s each one whole, and asserts
the seeded address (a unique per-run literal) appears in **none** of them. Then the guard is
driven red by adding `details: { email }` at one audit call site, capturing the failure, and
reverting. A guard that has not been shown to fail is a claim (10e-R17).

**Recording the failure reason without leaking it (R14 tension, resolved).** The *response* is
uniform, but the schema's own comment states the audit trail is where "actually clicked" vs
"invalidated by a re-request" is distinguished. So on `affectedRows !== 1` the handler issues one
**additional indexed SELECT** on `token_hash` to classify: no row → `not_found`; `consumed_at`
non-null → `consumed_or_superseded`; `expires_at <= now` → `expired`. That reason goes in
`details.reason` and the `user_id` from the row (which may be `NULL`) goes in the audit row, so a
failure is attributable. **This is an implementer's choice, not a ruling**, and its cost is one
extra query on the failure path only. The alternative — `userId: null`, no reason — is cheaper and
strictly less useful; I recommend the classify version and will take either.

### C3 — Rate limiting

`createCustomRateLimiter`, never `createRateLimiter` (F5: its `anon` key collapses the whole
internet into one bucket on an unauthenticated route). Verify is unauthenticated by
construction — it is what *creates* the session.

Two limiters. Keys, literally:

| limiter | key | max | window |
|---|---|---|---|
| per-IP | `rl:magic-link-verify:ip:{clientIp}` | 10 | 60 s |
| global | `rl:magic-link-verify:global` | 100 | 60 s |

**No per-token bucket.** A token is single-use, so a second request carrying it is already
rejected by the consume predicate; a per-token limiter would spend a Redis key per sign-in to
re-implement a constraint the UNIQUE index and `consumed_at` already enforce.

The keys are **distinct from 10e-2's** (`…magic-link:ip:` vs `…magic-link-verify:ip:`) so a
user who requested a link is not throttled out of clicking it.

**Isolation, per 10e-R16.** The per-IP limiter is residue-immune **by construction**: every test
sends a unique-per-run `X-Real-IP` (`t-${randomUUID()}`), the `routes/client-errors.integration.test.ts`
precedent already adopted at `magic-link.test.ts:84-91`. No `describe.skipIf` is needed for it.

**The global limiter is the named exception** (fixed key by definition), and its isolation
approach is stated here rather than discovered in a red run: its test forces the limit by
spying on `RedisMock.prototype.evalsha`, which requires the module-wide ioredis mock and is
therefore **inert under INTEGRATION** — so that single test sits in a
`describe.skipIf(process.env.INTEGRATION === "true")`, exactly as `magic-link.test.ts:329`
already does. Under INTEGRATION the fixed key is never driven to its limit by the suite (the
verify tests issue far fewer than 100 requests), so it neither fails nor leaves residue that
matters.

> **Tension reported, not smoothed over.** R16 required unique-per-run keys for every rate-limit
> test *except* the global one, and 10e-2 in fact put **all five** of its rate-limit cases behind
> one `skipIf` describe (`magic-link.test.ts:329`; CLAUDE.md records this as "not drift"). The
> reason is mechanical — those tests force the limit via a `RedisMock` spy, which is inert without
> the module-wide mock — but it does mean 10e-2's per-IP limiter has **no INTEGRATION coverage**,
> which is the coverage gap R16 was written to prevent. For 10e-3a I propose splitting the
> difference: the per-IP limiter gets a **real** 11-request INTEGRATION test on a unique IP (no
> spy, genuinely residue-immune, R16-compliant), and only the global limiter keeps the
> spy+`skipIf` form. If you would rather 10e-3a simply match 10e-2's shape for consistency, say
> so and I will.

**[SUPERSEDED 2026-08-18, 10e-R136 — retained as the authorship-state record, not edited.]**
The block above is **FALSE**, and it is the premise the channel's 10e-R108 departure finding was
built on. `routes/magic-link.integration.test.ts` already existed at `33ca1bb` (10e-2) with five
tests covering the per-IP **and** per-email limiters against **real Redis**, plus real-MySQL
supersession and the global ceiling with its isolation stated in its own header. So 10e-2's per-IP
limiter does **not** lack INTEGRATION coverage; it has exactly the coverage 10e-R16 prescribes, in
the dedicated `*.integration.test.ts` file the standing convention requires. Both statements were
always true and do not conflict: CLAUDE.md's "all five rate-limit cases share one `skipIf`'d
describe — not drift" describes the HERMETIC file only. I read one as contradicting the other and
did not open the integration file before asserting it. **Consequences:** 10e-R108's departure
finding and its self-attribution are WITHDRAWN (10e-R136); the queue item it created closes as
**MOOT**, never having described real work. **10e-R108's operative ruling STANDS unchanged** — the
real 11-request INTEGRATION test on a unique IP for verify's per-IP limiter, with `skipIf` reserved
for the fixed-key global, is correct on its own merits and does not depend on this premise. A
remedy can be right while its diagnosis is wrong.

### C4 — 10e-R37 check, performed

Enumeration run, matched-file lists pasted. A channel enumeration is a hypothesis until a
matched-file list confirms it (10e-R38).

```
$ grep -rn "vi\.mock([\"'][^\"']*session-cookie[\"']" --include='*.test.ts' .
   (count: 0)

$ grep -rn "vi\.mock([\"'][^\"']*security-events-lib[\"']" --include='*.test.ts' .
   (count: 0)

$ grep -rn "vi\.mock([\"'][^\"']*rate-limit[\"']" --include='*.test.ts' .
contract/money-wire-shape.test.ts:120       contract/frontend-contract.test.ts:25
routes/auth.callback.test.ts:20             routes/auth.2fa.test.ts:21
routes/memorized.test.ts:44                 routes/intelligence.test.ts:18
routes/transactions.test.ts:55              routes/auth.2fa-verify.test.ts:13
routes/auth.sessions.test.ts:19             routes/aggregation.test.ts:63
routes/account.test.ts:19
   (count: 11)

$ grep -rn "vi\.mock([\"'][^\"']*db/connection[\"']" --include='*.test.ts' .   (count: 18, incl. routes/magic-link.test.ts:15)
$ grep -rn "vi\.mock([\"'](jose|hono/cookie)[\"']" --include='*.test.ts' .      (count: 0)
```

**Answers.**

- **Does any wholesale-mocked module gain an export?** **No.** Verify adds no export to
  `lib/rate-limit`, `middleware/auth`, `db/connection`, or any other mocked module. It is a new
  route handler inside the already-existing `routes/magic-link.ts`.
- **Does verify import from one?** It imports `getDb` from `db/connection` (mocked in 18 files,
  including `magic-link.test.ts:15` — but that factory already supplies `getDb`, which is the
  only symbol used) and `createCustomRateLimiter` from `lib/rate-limit`. The 11 files that mock
  `lib/rate-limit` do **not** import `routes/magic-link.ts`, with one exception —
  `contract/frontend-contract.test.ts:25`, whose factory **already lists
  `createCustomRateLimiter`** (recorded at 10e-2 and unchanged). So no factory needs a new symbol.
- `middleware/session-cookie` and `lib/security-events-lib` are mocked by **zero** files, so
  importing `setSessionCookie` and `auditSecurityEvent` is safe — the same structural reason
  10e-2-EXTRACT relied on.
- `jose` and `hono/cookie` are mocked by **zero** files, which is what makes F-3a-1's proposed
  extract safe.

**Full-app test-file set (10e-R60), re-derived not assumed:** `contract/frontend-contract.test.ts`
and `routes/health.test.ts` are the only files that build the whole app. `health.test.ts` has zero
`vi.mock` calls and constructs real limiters over `src/test/redis-mock.setup.ts`; two more
module-scope limiters are safe there for the reason established at 10e-2 (`getRedis()` is a lazy
singleton; `script`/`evalsha`/`decr` are stateless argument-ignoring stubs, so N constructions
issue 2N identical script-loads with nothing to deplete). **I will re-measure `health.test.ts`
before and after rather than inherit that argument.**

### C5 — 10e-R38: the `routes/account.ts` convergence

**Checked, not reasoned by analogy.** Converging `account.ts:150`'s bare `"statera_session"` onto
`SESSION_COOKIE` adds one import: `import { SESSION_COOKIE } from "../middleware/session-cookie"`.

`account.test.ts` mocks nine modules (`:9`, `:10`, `:19`, `:20`, `:21`, `:25`, `:33`, `:36`, `:47`).
`middleware/session-cookie` is **not** among them, so the real module loads. But
`session-cookie.ts` imports `../lib/env`, and `account.test.ts:47` **does** mock `../lib/env` with
a factory:

```ts
vi.mock("../lib/env", () => ({
  env: { isDev: true, encryptionKey: "0".repeat(64), encryptionKeyPrevious: undefined,
         sessionSecret: "…", corsOrigins: ["http://localhost:3002"], oauthClientId: "test",
         oauthRedirectUri: "…", oauthProvider: "google" },
}))
```

That factory supplies `isDev`, and in any case `session-cookie.ts` reads `env.isDev` only
**inside** `setSessionCookie` — module-scope evaluation touches nothing on `env`. Importing the
`SESSION_COOKIE` const is therefore safe in `account.test.ts`. **Verdict: the convergence is safe
and I propose including it** (it is the queued 10e-R38 item, and it is one line).

### C6 — Findings

**F-3a-1 — the TOTP handoff needs a pending-2FA extract that A8 does not name. NEW SCOPE.**
`packPending2faToken` (`auth.ts:79`), `PENDING_2FA_COOKIE` (`:42`), `PENDING_2FA_TTL` (`:43`) and
`stateSecret` (`:51`) are **all module-private** to `routes/auth.ts`. `routes/magic-link.ts`
cannot reach them, so verify's TOTP gate cannot be written without either (a) a second copy of
the JWT-minting and cookie-option code — which is exactly the fifth-copy problem
10e-3a-EXTRACT was created to prevent, one surface over — or (b) an extract, on the
10e-2-EXTRACT (`auditSecurityEvent`) precedent.

I propose **(b)**: a new `apps/api/src/middleware/pending-2fa.ts` holding `PENDING_2FA_COOKIE`,
`PENDING_2FA_TTL`, `packPending2faToken`, `verifyPending2faToken` and a `setPending2faCookie(c, token)`
helper collapsing the two hand-typed option blocks (`auth.ts:287-293` and the analogous read
path). Mechanical move, own sub-commit (**10e-3a-EXTRACT-2**), on the 10e-R9/R73 principle that a
mechanical refactor of the production auth path is reviewed without a feature diff around it.

Safety, checked: the new module's runtime imports would be `jose`, `hono/cookie` and `../lib/env`.
`jose` and `hono/cookie` are mocked by **zero** files (C4). `../lib/env` is mocked in all four auth
files, and all four factories already supply `sessionSecret` and `isDev` — measured:

```
routes/auth.callback.test.ts       sessionSecret:1 isDev:1
routes/auth.2fa.test.ts            sessionSecret:1 isDev:1
routes/auth.2fa-verify.test.ts     sessionSecret:1 isDev:1
routes/auth.sessions.test.ts       sessionSecret:1 isDev:1
```

so 10e-R37 does not fire. `PENDING_2FA_MAX_FAILURES` stays in `routes/auth.ts` (it is
`/2fa/verify`'s policy, not the token's).

**F-3a-2 — the sign-up path has no `externalId`, and `SessionData` requires one.**
`createSessionToken` (B6) takes `externalId: string` and `authProvider: string`, both non-null,
and `users.externalId` participates in the composite unique `(auth_provider, external_id)`. A
magic-link-created user has no OIDC identity at all. Verify must therefore choose values, and the
choice is visible in three places — the JWT, the unique index, and the TOTP QR label (queued
finding **F9**: labels use `external_id`, so a magic-link user's label becomes whatever is chosen
here).

Proposal: `authProvider: "email"`, `externalId: randomUUID()`. That keeps the composite unique
satisfied without collisions, keeps `authProvider` a truthful description of how the account was
created, and makes 10e-3b's adopt-by-email path a clean `UPDATE` of both columns. **This is a
schema-semantics decision that A2/A3 do not settle and I do not think it is mine to make
unilaterally — it wants a ruling.** F9 is the reason: whatever goes in `external_id` shows up in
the user's authenticator app.

**F-3a-3 — `sessionVersion` on the reactivation path.** B4 reads `existing.sessionVersion` as-is
because the preceding purge already bumped it (10d-0a). Verify's reactivation branch must do the
same, and must **not** re-bump — a bump here would issue a token whose `sv` the deny-list key
does not cover, silently widening the revocation window. Replicated verbatim from B4.

**F-3a-4 — response shape is JSON, not a redirect.** The OIDC callback redirects because it is a
full-document navigation; verify is called by the `/auth/magic` landing page over XHR (10e-4), so
it returns an envelope. Proposed: `{ ok: true, data: { user_id, is_new_user }, error: null, meta: {} }`
on success, and `{ ok: true, data: { pending_2fa: true }, error: null, meta: {} }` on the TOTP
handoff, with the frontend routing to `/auth/2fa-verify`. Recorded so the shape is ruled on now
rather than discovered by 10e-4.

---

## (D) 10e-R100 — BINDING. **It fires, on both limbs.**

**Enumeration of every path reaching `eq(users.email, …)`, run:**

```
$ grep -rn "eq(users\.email" --include='*.ts' apps/api/src
routes/magic-link.ts:226:      .where(eq(users.email, normalized))
```

**Exactly one caller exists in the entire codebase today** — the request endpoint. Every other
`users.email` occurrence is a SELECT projection (`data-export-lib.ts:153`,
`budget-alerts-job.ts:146`, `account.ts:91`, `auth.ts:356/796/963`, `magic-link.ts:224`), not a
predicate.

**Limb (a) — does verify add a second caller? YES.** It must. Verify's sign-up branch (token row
with `user_id IS NULL`) cannot blindly `INSERT`: a user may have been created between request and
verify — the person requests a link at T0 when no account exists, signs up with Google at T1, then
clicks the link at T2. A blind insert hits `users_email_unique` and 500s. That is the **F2 crash
class reproduced on a new path**, which is precisely what 10e-3b exists to fix on the OIDC side.
So verify performs `eq(users.email, tokenRow.email)` on that branch. **R100's trigger condition
(a) is met.**

**Limb (b) — does it reach the lookup with input zod does not gate? YES, and this is the part I
want on the record.** The input is `magic_link_tokens.email`, and the value written there is
`effectiveEmail = user?.email ?? normalized` (`magic-link.ts:235`). The `user?.email` arm is the
**STORED** address, written by the OIDC callback from `claims.email` **verbatim** — never
normalized, never zod-validated. So a Google-issued address with a non-ASCII local part can reach
`magic_link_tokens.email`, via a request whose *typed* address was plain ASCII: under `ai_ci` a
typed `jose@x.com` matches a stored `josé@x.com`, and R62's stored-address rule then writes the
non-ASCII value into the token row. **A value zod would have rejected is in the column verify
reads.** R100's condition (b) is met.

**The claim the mitigation now rests on, stated so it can be checked.** The lookup is only
performed on the `user_id IS NULL` branch, and `user_id` and `email` are assigned from the **same
`user` binding** two lines apart (`magic-link.ts:234-235`):

```ts
const userId = user?.id ?? null
const effectiveEmail = user?.email ?? normalized
```

They are exactly co-variant. `user_id IS NULL` ⟺ no user was found ⟺ `effectiveEmail` took the
`?? normalized` arm ⟺ the value is the **zod-gated, normalized, ASCII** typed address. The
non-ASCII stored values can only ever land in rows where `user_id IS NOT NULL` — the branch that
resolves by id and performs **no email lookup at all**. Rows are never updated after insert except
`consumed_at`, so the invariant holds for the row's lifetime.

**Re-classification of the mitigation, as R100 requires.** At the request endpoint, R62's
"mail the STORED address" rule is a *live* protection against delivering a victim-bound link to an
attacker's mailbox, whose reachability happens to be closed by zod. At verify **there is no mail
and no delivery**, so that protection does not carry over; what protects verify is different and
stronger — **the token itself is the credential**, 256 bits of CSPRNG output delivered only to the
stored address. An attacker who cannot read that mailbox cannot present the token, regardless of
what the lookup would match. So verify's email lookup is not an attack surface in the way the
request endpoint's is; it is a **race-resolution** lookup on a value that is provably zod-gated on
the only branch that reaches it.

**But the invariant is UNGUARDED, and that is the finding.** Nothing in the tree pins the
co-variance of `user_id` and `email` at `magic-link.ts:234-235`. A future edit that sets
`effectiveEmail` from the stored address while leaving `userId` null — or a second writer to
`magic_link_tokens` — silently breaks the argument above, and **no test goes red**, for the same
structural reason R82/R83 already recorded: no test can cover an input the validator refuses to
admit. Writers were enumerated (one, `magic-link.ts:251`; the only other references are the purge
delete and the cleanup-job deletes), so the invariant holds **today**.

**Proposed remedy, for ruling:** a hermetic test asserting the co-variance directly — request with
an unknown address, assert the inserted row has `user_id === null` **and** `email === normalized`;
request with a known address whose stored form differs in case, assert `user_id !== null` **and**
`email === storedForm`. That converts "the branch is zod-gated" from an argument into an assertion,
and it is cheap. I recommend it and did not assume approval for it.

**[SUPERSEDED 2026-08-15, 10e-R122 — retained as the authorship-state record, not edited.]**
The re-classification argued in this section is **REJECTED**. The accent-variant takeover IS
reachable at verify — not through the INPUT, which this section correctly proves zod-gated on
the branch that performs the lookup, but through the MATCH TARGET. On the `user_id IS NULL`
branch the mail went to the address the requester TYPED, not to a stored one, so "the token is
delivered only to the stored address" does not hold on the one branch that does the lookup; and
an `ai_ci` comparison against a `users` table that changed between request and verify adopts a
different person's account. The corrected classification, the three premises it rests on, and
the exact-match adopt guard are in the review-channel ruling block appended at the end of this
file. The co-variance analysis above STANDS and is unaffected — it is the conclusion drawn from
it that is superseded.

---

## (E) Tests

### Hermetic — `routes/magic-link.test.ts` (extended, same file)

| # | case |
|---|---|
| 1 | valid unconsumed unexpired token → 200, session cookie set, `user_id` returned |
| 2 | session cookie carries the full attribute set (delegates to `setSessionCookie`; asserts the call, not a re-implementation) |
| 3 | unknown token → 400 `MAGIC_LINK_INVALID` |
| 4 | already-consumed token → 400, byte-identical to (3) |
| 5 | expired token → 400, byte-identical to (3) |
| 6 | superseded token → 400, byte-identical to (3) |
| 7 | **10e-R14 pin**: the four failure envelopes are deep-equal to one another *and* the four responses' serialized bodies are byte-identical |
| 8 | consume predicate includes `consumed_at IS NULL` **and** `expires_at > now` (asserted at the query boundary) |
| 9 | `affectedRows === 0` → no session cookie is set (negative control for (1)) |
| 10 | active user, `totpEnabled` → `login.pending_2fa`, pending cookie set, **no** session cookie |
| 11 | active user, no TOTP → `login.magic_link.success` emitted exactly once |
| 12 | inactive user → `account.reactivated` + TOTP fields nulled + `isActive` flipped |
| 13 | reactivation does **not** re-bump `sessionVersion` (F-3a-3) |
| 14 | `user_id IS NULL` + no existing user → user INSERT with `authProvider`/`externalId` per F-3a-2 |
| 15 | `user_id IS NULL` + existing user with that email → adopts, does **not** INSERT (the R100 race) |
| 16 | **BLOCKING**: no captured `security_events` insert payload contains the seeded address, on any of the six paths |
| 17 | zod: missing / non-string / empty / over-length token → 400 validation envelope |
| 18 | `login.magic_link.failed` carries the classified reason and no address |
| 19 | co-variance pin, request side (D's proposed remedy) — two cases |
| 20 | per-IP limiter key literal is `rl:magic-link-verify:ip:{ip}` |
| 21 | global limiter forced → 429 standard envelope (**`skipIf(INTEGRATION)`**, C3) |

### INTEGRATION — `routes/magic-link.integration.test.ts` (new file, no module-level db/redis mocks)

R104 requires, for each, what a **false green** would look like — the result the case would
produce if the behaviour it targets were absent. A case that cannot distinguish those two worlds
is not a case.

**I1 — double-click (concurrent).** Fire two verify requests with the same token concurrently
(`Promise.all`); assert exactly one 200 and exactly one 400, and that exactly one session was
issued.
*False green:* if the atomic consume were absent (say the handler read-then-wrote), a sequential
test would still pass — the first call would set `consumed_at` before the second read. The case
only discriminates when the two requests genuinely overlap, so it **must** be concurrent, and it
must assert the **pair** (`one 200 AND one 400`), not merely "a 400 occurred". Asserting only
"the second failed" is satisfied by a world with no atomicity at all.

**I2 — supersession.** Request a link, request a second link for the same address, then verify the
**first** token. Assert 400 and that the second token still verifies to 200 afterwards.
*False green:* asserting only that the first token fails is also satisfied if the request endpoint
were broken and issued no usable token at all. The second-token-still-works assertion is what
distinguishes "the first was superseded" from "nothing works".

**I3 — reactivation.** Seed an active user, run the real `purgeUserAccountRows` (soft-delete +
`sessionVersion` bump + TOTP null), then request and verify a magic link for that address. Assert
`isActive` is true again, `signup_completed` re-emitted, `account.reactivated` written, and the
issued token's `sv` equals the **post-purge** `sessionVersion`.
*False green:* asserting only `isActive === true` passes in a world where the branch never ran and
the user was never deactivated — so the case must assert the purge landed **first** (user inactive
before verify), the "seeded row was actually there" discipline from the 10e-1 orphan case. And the
`sv` assertion is what would catch F-3a-3; without it a re-bump is invisible.

**I4 — duplicate-email recovery (the R100 race, against the real unique index).** Request a link
for an address with no account (token row gets `user_id = NULL`), then create a user with that
address, then verify. Assert 200, no `ER_DUP_ENTRY`, and that **no second user row** was created.
*False green:* run against a mocked DB and the case proves nothing — `users_email_unique` is the
whole point, so this **must** be INTEGRATION. And asserting only "200" is satisfied by a handler
that inserted a duplicate on a DB without the constraint; the row-count assertion is what makes it
discriminating.

**Fifth case proposed (not in A8's list of four):** **I5 — the orphan row is purgeable after
adopt.** After I4, assert the token row's `user_id` was backfilled, so the row is reachable by
`purgeUserAccountRows`. The schema's orphan-class comment makes this a data-minimisation property,
and nothing else would catch a missed backfill.

---

## (F) Baselines — DELTAS only

No absolutes carried. A8 predicts **hermetic +12–16, files +1, INTEGRATION +3–4**. Restated
against what is actually proposed here:

| | predicted delta |
|---|---|
| API hermetic | **+19 to +23** (21 listed cases, minus 2 if the co-variance pin is refused) |
| API hermetic files | **+1** (`routes/magic-link.integration.test.ts`); verify's unit cases extend the existing `magic-link.test.ts` |
| API skipped | **+1** (the global-limiter case) |
| INTEGRATION | **+5** (I1–I5), or **+4** if I5 is refused |
| `tsc --noEmit` | **0**, both packages |
| Frontend | **+0** — untouched, not re-run, carried unverified by design |

**The hermetic figure overshoots A8's +12–16 and I am flagging it rather than absorbing it.** The
excess is the R14 byte-identity pin (7), the BLOCKING address-scan (16), the co-variance pin (19),
and the F-3a-2/F-3a-3 assertions — all of which came from rulings and findings issued after A8 was
written. If the extract (F-3a-1) is approved it adds a further **+2 to +4** in its own sub-commit,
against `middleware/pending-2fa.ts`.

Absolutes will be **re-derived at execution** (`git stash -u` → run → restore), not read from
CLAUDE.md. The current recorded line is hermetic 828/25/59 and INTEGRATION 845/8/0; both get
re-measured before any delta is claimed.

**INTEGRATION obligation: FIRES.** 10e-3a adds integration cases, so the cadence rule applies
regardless of the deliberate absence of a `db.transaction()` boundary — exactly as A8 states.

---

## (G) Environment

Every host-side command touching the DB passes `DATABASE_URL` explicitly:

```
INTEGRATION=true DATABASE_URL='mysql://statera:change-me@127.0.0.1:3306/statera' \
  pnpm --filter statera-api test
```

The root `.env` is invisible to `pnpm --filter … exec` (CWD is `apps/api/`), and an explicit
`DATABASE_URL` overrides `.env` because dotenv does not overwrite an existing `process.env` value
(10e-R89). The `.env` placeholders are correct and stay. The dev DB will be checked for pending
migrations (`drizzle-kit migrate`, host-pointed) before any INTEGRATION run is treated as
trustworthy.

---

## Rulings requested

1. **F-3a-1** — approve the `middleware/pending-2fa.ts` extract as its own sub-commit
   (10e-3a-EXTRACT-2), or direct a second copy instead.
2. **F-3a-2** — rule on `authProvider` / `externalId` for magic-link-created users. This one
   surfaces in the TOTP QR label (queued F9) and in 10e-3b's adopt path.
3. **F-3a-4** — confirm the JSON response shapes before 10e-4 consumes them.
4. **C2** — classify-the-failure-reason (one extra SELECT on the failure path) vs `userId: null`.
5. **C3** — real 11-request INTEGRATION test for the per-IP limiter (R16-compliant), or match
   10e-2's spy+`skipIf` shape for consistency.
6. **(D)** — approve the co-variance pin, and confirm the re-classification of the R100 mitigation.

**STOP.** No implementation, no route file, nothing further committed. Awaiting a ruling block.

---
---

# APPENDED VERBATIM — review-channel ruling block on this document's contents

Manifest item 1 (10e-R120). Appended verbatim; nothing above this line is revised. This block
supersedes the STATUS header at the top of this file.

---

Review-channel ruling block — 10e-3a PROPOSAL: APPROVED WITH CONDITIONS. 10e-R121 … 10e-R126, 2026-08-15

This is the contents ruling block. It is manifest item 1 and is appended verbatim to docs/modules/phase4-10e-3a-proposal.md.

10e-R121 — the proposal RECONCILES. Four of six requests are already ruled; here is the mapping.

Every section carries pasted source. The two enumerations I asked to be falsifiable (C4's mock surface, D's eq(users.email, …) caller set) were run with matched-file lists printed, and D reported against the convenient answer. C1's near-miss — three files that read as a live bug and are not — is rider (b) applied unprompted, and a recorded non-finding is worth as much as a finding.

Requests 1, 2, 5 are already ruled and are confirmed, not re-opened:

request	ruling	status
1 — the pending-2FA extract	10e-R107	APPROVED as 10e-3a-EXTRACT-2, conditions (a)–(e). See R125 — condition (a) is not yet discharged.
2 — authProvider / externalId	10e-R106	SETTLED at phase4-10e.md A1(c) + 10e-R8 item 2. authProvider: "email" / crypto.randomUUID(). Cite R8(2); do not re-request. F9 is the queued consequence and does not reopen.
5 — per-IP INTEGRATION test	10e-R108	Your split APPROVED: real 11-request test on a unique IP for per-IP; spy+skipIf for the fixed-key global only. "Consistency with 10e-2" refused; 10e-2's gap is a separate queue item.

Approved without amendment, so you know these were read and are settled: C1's consume statement including gt(expiresAt, now) folded into the predicate rather than checked after; affectedRows as the branch signal with the tuple destructure and its four precedents; no db.transaction(); C2's branch-by-branch event mapping, including that the TOTP path emits login.pending_2fa and no magic-link string because the session does not exist yet — that reading of R11 is correct and better than a looser one; C2's BLOCKING guard by whole-payload JSON.stringify scan rather than key-absence; C3's two limiters, their key literals, the deliberate distinctness from 10e-2's keys, and the refusal of a per-token bucket; C4 and C5 in full, including the account.test.ts env-factory check and the commitment to re-measure health.test.ts rather than inherit 10e-2's argument; F-3a-3; and every false-green statement in (E), which is the section that most clearly did what was asked.

Requests 3, 4, 6 are ruled in R123–R124. Request 6's second half is REJECTED — see R122.

10e-R122 — THE R100 RE-CLASSIFICATION IS REJECTED. The accent-variant takeover IS reachable at verify — through the MATCH, not the input.

You found both limbs correctly and the co-variance argument is sound as far as it goes. The re-classification built on top of it is not. The defect is one step past where the analysis stopped, and the analysis stopped because it was reasoning about the input when the exposure is in the match target.

The channel's reasoning, stated so you can falsify it rather than accept it:

The proposal's protective claim is: "the token itself is the credential, 256 bits of CSPRNG output delivered only to the stored address." That sentence is true on the user_id IS NOT NULL branch. On the user_id IS NULL branch there is no stored address — effectiveEmail = user?.email ?? normalized takes the ?? normalized arm, and the mail goes to the address the requester typed. So on precisely the branch that performs the email lookup, the token is delivered to the requester's own mailbox by design, and "an attacker who cannot read that mailbox cannot present the token" does not hold, because the attacker's mailbox is the delivery target.

That opens a race, and ai_ci is what closes it into a takeover:

T0 — attacker controls jose@x.com and requests a link for it. The request-side lookup finds no user (under ai_ci, so not even an accent variant exists). Token row: user_id = NULL, email = 'jose@x.com', zod-gated ASCII — exactly as your invariant says.
T1 — the victim signs up with Google as josé@x.com, a different mailbox. users_email_unique permits this only because no jose@x.com row exists.
T2, within the 15-minute TTL — the attacker clicks. Verify takes the user_id IS NULL branch and runs eq(users.email, 'jose@x.com'). Under ai_ci that matches the victim's stored josé@x.com. Verify adopts, issues a session, and the attacker is in the victim's account.

The token was legitimately the attacker's. No mailbox was compromised. The zod gate held perfectly — the input is ASCII, exactly as your invariant guarantees. The exposure is that the match target is a users table that changed between T0 and T2, and the comparison is accent-insensitive.

This is the identical shape to 10e-R13(a) on the OIDC side, and R13(a) already ruled on it: do not bind an existing account to an identity on the strength of a weak email signal; fail closed rather than either inserting (which 500s) or binding (which is an account-takeover primitive). Verify's adopt is the mirror image of 10e-3b's adopt. It needs the mirror-image gate.

Case variants are NOT the concern and must not be swept in. Jose@X.com and jose@x.com reach the same mailbox in practice, so an inexact case match is not a takeover — and the ai_ci lookup must keep finding it, exactly as 10e-R82/R83 records, or an exact lookup would miss a stored Khaled@Gmail.com and manufacture the F2 crash. Accent-insensitivity is the whole exposure; case-insensitivity is load-bearing and stays.

Ruled

(a) Verify the three premises FIRST, and report before implementing. I derived this; I did not measure it. Report:

That on the user_id IS NULL branch the request endpoint mails the typed/normalized address, not a stored one — from routes/magic-link.ts source, pasted.
That utf8mb4_0900_ai_ci matches 'jose@x.com' against a stored 'josé@x.com' — measured against the dev DB, not read from the collation's documentation. phase4-10e.md A1 asserts it; an assertion in a document is not a measurement, and this one is now load-bearing for a security ruling.
That users_email_unique permits the T1 insert of josé@x.com when no jose@x.com row exists, and forbids it when one does — the second half being why the attack needs the victim to arrive second.

If any premise fails, STOP and report the falsification. I would rather be wrong here in writing than have a guard built on a bad premise. If all three hold, (b) is pre-approved and needs no second round-trip.

(b) The guard: adopt only on an EXACT match, and fail CLOSED otherwise. On the user_id IS NULL branch, after the ai_ci lookup returns a row, compare normalizeEmail(foundUser.email) === tokenRow.email in application code. Equal → adopt. Not equal → the ai_ci match was inexact beyond case, so return the uniform 400 MAGIC_LINK_INVALID and emit login.magic_link.failed with a fifth reason literal.

Do not fall through to INSERT on refusal. Inserting jose@x.com while josé@x.com exists hits users_email_unique under ai_ci and is the F2 crash on a new path. The refusal branch is terminal.

Do not "fix" this by making the lookup exact. That reintroduces the F2 crash for the stored-case-variant user (10e-R82/R83's load-bearing note). The lookup stays ai_ci; the adoption decision becomes exact. Those are different things and the code must say so in a comment.

(c) The uniform envelope holds. The refusal is byte-identical to the other four causes — no new code, no distinguishing message. R14's pin extends to five causes; update case (7).

(d) Record the user-facing consequence, do not fix it here. A genuine jose@x.com owner cannot sign up while josé@x.com holds the ai_ci-unique slot. That is already the queued 10e-R72/R85 item — the same root, the same user, post-announcement, its own cycle. This ruling does not enlarge it; it makes the failure a clean 400 instead of a silent takeover. Cite R85 and do not bundle.

(e) The re-classification is rewritten, not amended in place. Your (D) section stays exactly as written — it is the authorship-state record, and the reasoning in it is 90% correct and worth preserving. The corrected classification lives in this appended block. Per 10e-R111, place an adjacent supersession marker at the end of (D) pointing here; per 10e-R118, no structural figure in it.

Credit where it is due, because it is the reason this was findable: your own paragraph — "the invariant is UNGUARDED, and that is the finding… no test goes red, for the same structural reason R82/R83 already recorded" — is what pointed at the right region. You identified that the argument rested on an unpinned invariant and said so. The error was concluding the surrounding surface was safe; the instinct that something under it was load-bearing and unguarded was correct.

10e-R123 — the co-variance pin is APPROVED, and it now has a sibling

Request 6, first half: APPROVED as proposed. Both cases as specified — unknown address → user_id === null and email === normalized; known address with a case-differing stored form → user_id !== null and email === storedForm. This is what converts "the branch is zod-gated" from an argument into an assertion, and it stays required under 10e-R109 independently of R122.

Second pin, required by R122(b): a hermetic case asserting the adopt refusal. Seed a user with a non-ASCII stored address; seed a token row with user_id = NULL and the ASCII-normalized form; verify; assert 400 MAGIC_LINK_INVALID, no session cookie, no user INSERT, and no session issued for the seeded user. The last assertion is the one that matters — a test asserting only the 400 passes in a world where the handler adopted and then errored.

Both pins proven able to fail, red captured, per 10e-R17.

10e-R124 — C2's classify APPROVED; F-3a-4 approved with one amendment

Request 4 — classify the failure reason. APPROVED, and there is a stronger argument for it than the one you made, which is why it is not merely the more useful of two options.

10e-1 shipped a committed schema comment stating that "actually clicked" vs "invalidated by a re-request" is distinguished by the security_events audit trail, not by a second column. Under the cheap alternative (userId: null, no reason) that committed comment is false — nothing anywhere distinguishes them, and the comment becomes a pointer to a capability that does not exist. The classify version is what makes an already-committed claim true. One extra indexed SELECT on the failure path only is not a cost worth weighing against a false comment in the schema.

The reason set is now five literals (R122(b) adds one). Closed set, enumerated in code, and the enumeration is what makes the BLOCKING address-scan checkable rather than a promise.

Request 3 — F-3a-4 response shapes. APPROVED with one amendment.

Drop user_id from the success payload. The frontend has /me; a caller that just authenticated does not need its own id echoed back, and the smallest surface that satisfies 10e-4 is the right one. Adding it later is cheap; removing a shipped field is a client-observable change.
Keep is_new_user — 10e-4 needs it to route to /welcome?source=signup, matching the OIDC callback's target.
The two shapes are ruled as specified otherwise, including ok: true on the TOTP handoff: ok reports that the request was handled, not that a session exists, which is the envelope's established meaning.
These are now a public API contract. They go in CLAUDE.md's "Public API contracts" section at 10e-close, not left to be discovered by 10e-4.

10e-R125 — F-3a-1's destination is INCOMPLETE. R107(a) is not discharged.

The extract is approved (R107) and middleware/pending-2fa.ts is a reasonable home. But the proposed module contents do not resolve their own dependency.

C6 names four module-private symbols: packPending2faToken, PENDING_2FA_COOKIE, PENDING_2FA_TTL, and stateSecret. The proposed module lists the first three plus verifyPending2faToken and setPending2faCookie. stateSecret is not among them — and packPending2faToken calls it (auth.ts:452: .sign(stateSecret())). Move the mint without the secret accessor and it does not compile.

That is exactly what R107(a) asked: which reasoning governs a set that mixes a JWT mint, a secret accessor, and cookie constants — one module or two? The module name was answered; the secret accessor was not.

Ruled: state the disposition for stateSecret with reasoning, before the extract is written. The channel is not choosing for you, but the options are not equal and the reasoning must engage with this:

stateSecret is named for the OAuth state cookie, and it is almost certainly used by more than the pending-2FA family — packDeleteIntentToken / verifyDeleteIntentToken are the obvious other consumers, the latter already exported for routes/account.ts. So a two-line accessor used by three unrelated token families would be filed inside a module named for one of them. That is a misfiling, and it is the kind that reads as correct for a year.

Establish it by measurement, not inference: enumerate every caller of stateSecret in routes/auth.ts, with the matched-line list printed. Then state the disposition and its reason. If it has one consumer family, moving it is fine. If it has three, it wants its own home or it stays put and the extract takes env.sessionSecret directly — and either of those is defensible, but the choice must follow the measurement rather than precede it.

R107's conditions (b)–(e) are unchanged. (e) remains the load-bearing one: establish by measurement whether any test asserts the statera_pending_2fa cookie's attributes; if none does, the extract leaves a guard behind, proven able to fail in both directions.

10e-R126 — test-count arithmetic, and the updated manifest

Two small things on (F), neither blocking.

The delta reads "+19 to +23 (21 listed cases…)", but the case table has 21 rows and row 19 is "two cases" — so the list is 22 tests, not 21. R122(b) adds a 23rd and R122(c) extends case 7 in place. Restate the delta as a count derived from the case list, with the row-vs-test distinction explicit. A count that requires the reader to reconcile rows against tests is the item-1 problem from the last close-out, one artifact over.
INTEGRATION I5 is APPROVED as a fifth case. The orphan-row backfill is a data-minimisation property with nothing else behind it, and its false-green statement is correct: nothing else would catch a missed backfill.

Sequencing, so nothing is ambiguous:

The pending commit — eight manifest items, this block as item 1.
R122(a) — the three-premise verification report. STOP after it.
R125 — the stateSecret enumeration and disposition. STOP after it.
Then 10e-3a-EXTRACT-2, then 10e-3a.

Manifest items 2–8 are unchanged from R120. Item 1 is this block, plus the R122(e) adjacent supersession marker at the end of section (D).

Nothing beyond the commit and the two reports is authorized.
