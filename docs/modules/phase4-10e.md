# Phase 4 — Module 10e: email magic-link authentication

**Status:** Phase A APPROVED WITH CONDITIONS (review channel, **"10e charter rulings, 2026-08-08"** →
approval block **10e-R7 … 10e-R17, 2026-08-08**). This document is the durable lineage
(persist-first standing rule) and is 10e's FIRST commit, written before any implementation.
**Implement from this file, not from conversation context.**

**Structure, per 10e-R7:** the Phase A report exactly as submitted, then the approval/ruling block
appended verbatim. Where the ruling block enumerated items whose list markers did not survive
transmission, markdown markers have been added so the rendered structure matches the source; no
words were changed. That is the only editorial act performed on the appended block.

**Ruling blocks in force for this module — cite by title + date:**
- **"10e charter rulings, 2026-08-08"** — 10e-R1 … 10e-R6 (the six delegated rulings that were
  settled input to Phase A; reproduced in the report's own attribution note and in the appended block's
  context).
- **"10e Phase A approval, 2026-08-08"** — 10e-R7 … 10e-R17 (appended below, verbatim).

**Baseline discipline (10e-R7, BINDING):** every baseline figure in this document is a **DELTA** and is
approved as a delta only. **No absolute in this document — 779, 795/3/0, 185/39, contract fixture 64 —
may be carried into a close-out.** Each is re-derived at execution against the then-current measured
baseline, per derive-don't-carry. Finding F10 below is the demonstration of why.

---

# Module 10e — Phase A: email magic-link authentication

## A1 — `users` table, verbatim

`apps/api/src/db/schema/users.ts:14-40`:

```ts
export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    authProvider: varchar("auth_provider", { length: 32 }).notNull().default("google"),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 128 }),
    firstName: varchar("first_name", { length: 64 }),
    lastName: varchar("last_name", { length: 64 }),
    // AES-256-GCM encrypted at rest — stored as enc1:<base64url>
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpBackupCodesJson: text("totp_backup_codes_json"),
    // Increment to invalidate all active sessions for this user.
    sessionVersion: int("session_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: datetime("last_login_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_users_email").on(t.email),
    uniqueIndex("uq_users_provider_external_id").on(t.authProvider, t.externalId),
  ],
)
```

The ORM file is not the authority on what shipped; the applied DDL is. `apps/api/src/db/migrations/0000_cultured_jimmy_woo.sql:16-33`:

```sql
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`auth_provider` varchar(32) NOT NULL DEFAULT 'google',
	`external_id` varchar(255) NOT NULL,
	`display_name` varchar(128),
	`first_name` varchar(64),
	`last_name` varchar(64),
	`totp_secret` text,
	`totp_enabled` boolean NOT NULL DEFAULT false,
	`totp_backup_codes_json` text,
	`session_version` int NOT NULL DEFAULT 1,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `uq_users_provider_external_id` UNIQUE(`auth_provider`,`external_id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

and `0000_cultured_jimmy_woo.sql:325`:

```sql
CREATE INDEX `ix_users_email` ON `users` (`email`);--> statement-breakpoint
```

**(a) UNIQUE index on `email`: YES.** `CONSTRAINT users_email_unique UNIQUE(email)` — shown above at `0000:31`. **A1 is not a STOP condition; A7 proceeds.**

Two extra facts that matter and are not obvious from the constraint alone:

- The table collation is `utf8mb4_0900_ai_ci` — **case-insensitive and accent-insensitive**. So `users_email_unique` already forbids `A@x.com` alongside `a@x.com`, and a lookup `WHERE email = 'a@x.com'` already matches a row stored as `A@x.com`. Trim+lowercase normalisation (a design point below) governs what we *store*; it is not what makes the lookup single-valued — the DB does that regardless of case. Accent-insensitivity is a genuine (obscure) edge: `José@x.com` and `Jose@x.com` collide at the unique index.
- `ix_users_email` (`0000:325`) is a **redundant non-unique index** on a column that already carries a unique index. Pre-existing, harmless (a small write cost), not 10e's to fix. Recorded so a future reader doesn't mistake it for the uniqueness guarantee.

**(b)** `email` — `varchar(255) NOT NULL`. `auth_provider` — `varchar(32) NOT NULL DEFAULT 'google'`. `external_id` — **`varchar(255) NOT NULL`** (no default, no nullability). Composite unique: `CONSTRAINT uq_users_provider_external_id UNIQUE(auth_provider, external_id)`.

**(c) What a magic-link-first user receives, and whether the composite unique tolerates it.**

`external_id` is `NOT NULL` with no default, so a magic-link-first row **must** supply a value; there is no "leave it null" option. And because `(auth_provider, external_id)` is unique, a constant sentinel (`''`, `'magic-link'`) works for exactly one user and then collides on the second signup. So the value must be **unique per user**.

Two candidates:
- `external_id = <normalized email>` — unique for free (email is unique), but duplicates the user's address into a column that is deliberately **excluded from the data export** as auth-infra (`data-export-lib.ts:94-95`), i.e. into a field the user cannot see. It also means external_id drifts if email ever becomes mutable.
- `external_id = crypto.randomUUID()` — opaque, stable, no PII, no drift.

**Implementation choice (mine): `crypto.randomUUID()`**, with `auth_provider = 'email'`. Rationale: it keeps the auth-infra column free of personal data, which is the property that let 10c-1 justify excluding it from the export in the first place; and it survives a future mutable-email feature without a data migration.

`auth_provider = 'email'` (not `'magic_link'`): the column names the *identity source*, and a future passkey addition would sit alongside a verified email rather than alongside a link-delivery mechanism. `varchar(32)` accommodates either.

**(d) Operator-runnable duplicate-email count (do not run here — production DB is operator-side):**

```sql
-- Run on the production DB. Expected result: Empty set.
SELECT LOWER(TRIM(email)) AS norm_email, COUNT(*) AS n
FROM users
GROUP BY LOWER(TRIM(email))
HAVING n > 1;
```

Note this is a **verification, not a discovery**: under `utf8mb4_0900_ai_ci` plus `users_email_unique`, a non-empty result is structurally impossible unless the constraint was dropped out-of-band. A non-empty result means something is wrong with the constraint, not with the data model. Worth running once anyway — the standing "a command that can return empty for two different reasons is not an observer" rule applies, so pair it with a positive control:

```sql
-- Positive control: proves the query CAN return rows (should return exactly one row, n=<total users>).
SELECT 'CONTROL' AS norm_email, COUNT(*) AS n FROM users HAVING n > 0;
```

---

## A2 — OIDC callback branch structure, verbatim

`apps/api/src/routes/auth.ts:158-365`. Reproduced from the lookup onward (the state/token-exchange preamble at `:158-203` is omitted only because it precedes every branch and is not replicated by magic-link; it is unchanged by this module).

```ts
  const provider = env.oauthProvider
  const db = getDb()

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.externalId, externalId)))
    .limit(1)

  let userId: number
  let sessionVersion: number
  let isNewUser = false

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
  } else if (!existing.isActive) {
    // ── Reactivate-as-fresh (10d-0b) ──────────────────────────────────────────
    // [file comment retained in tree at :237-246]
    userId = existing.id
    // Read sessionVersion as-is: the purge that preceded this login already bumped it
    // (10d-0a), so the new token issued below is not self-denied by the sv_revoked key.
    sessionVersion = existing.sessionVersion

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
    userId = existing.id
    sessionVersion = existing.sessionVersion

    // Anti-substitution: for delete-reauth flows the state cookie carries the userId that
    // initiated the request. Verify the re-authenticated user matches.
    if (stateDeleteIntent && stateUserId !== undefined && stateUserId !== userId) {
      return c.json({ error: "Re-authenticated user does not match the initiating session." }, 403)
    }

    // Refresh email and display name in case they changed at the provider.
    await db
      .update(users)
      .set({
        email,
        displayName: (claims["name"] as string | undefined) ?? existing.displayName,
      })
      .where(eq(users.id, userId))

    const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"

    // 7b: Gate on TOTP — [comment retained at :300-302]
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
        auditSecurityEvent(db, "account.delete_reauth.pending_2fa", { userId, ipAddress: ..., userAgent: ... })
        return c.redirect(`${frontendOrigin}/auth/2fa-verify?intent=delete`)
      }
      auditSecurityEvent(db, "login.pending_2fa", { userId, ipAddress: ..., userAgent: ... })
      return c.redirect(`${frontendOrigin}/auth/2fa-verify`)
    }

    // No TOTP: for delete-reauth, issue delete-intent cookie directly [...]
    if (stateDeleteIntent) {
      const deleteIntentToken = await packDeleteIntentToken(userId)
      setCookie(c, DELETE_INTENT_COOKIE, deleteIntentToken, { ..., path: "/api/account" })
      auditSecurityEvent(db, "account.delete_reauth.confirmed", { userId, ipAddress: ..., userAgent: ... })
      return c.redirect(`${frontendOrigin}/delete-account/confirm`)
    }
  }

  // Non-blocking: failure must not delay the redirect or surface to the user.
  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId))
    .catch((err) => Sentry.captureException(err, { tags: { handler: "auth.callback.lastLoginAt", userId } }))

  const sessionToken = await createSessionToken({ userId, externalId, authProvider: provider, sv: sessionVersion })
  setCookie(c, "statera_session", sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })

  const frontendOrigin = env.corsOrigins[0] ?? "http://127.0.0.1:3002"
  return c.redirect(`${frontendOrigin}${isNewUser ? "/welcome?source=signup" : "/"}`)
})
```

**Every `auditSecurityEvent` call in the callback, with its event-type string:**

| line | event type | branch |
|---|---|---|
| `auth.ts:274` | `"account.reactivated"` | inactive → reactivate-as-fresh |
| `auth.ts:313` | `"account.delete_reauth.pending_2fa"` | active + totpEnabled + deleteIntent |
| `auth.ts:320` | `"login.pending_2fa"` | active + totpEnabled, normal login |
| `auth.ts:339` | `"account.delete_reauth.confirmed"` | active + no TOTP + deleteIntent |

**Observation the magic-link path must inherit:** the callback emits **no `login.success` event** on the no-TOTP happy path. `login.success` is emitted only by `/2fa/verify` (`auth.ts:747`). A plain Google sign-in therefore leaves no positive audit row. This is pre-existing and is not 10e's to fix, but it means "audit parity with OIDC" is a lower bar than it sounds — see the audit-vocabulary section under Design Points.

**The lookup is by `(auth_provider, external_id)`, never by email.** This is the load-bearing fact behind Finding **F2** below.

---

## A3 — Session issuance, verbatim

`apps/api/src/middleware/auth.ts:80-91`:

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

with `SessionData` at `middleware/auth.ts:26-31`:

```ts
export interface SessionData {
  userId: number
  externalId: string
  authProvider: string
  sv: number
}
```

**Cookie-set call sites — there are four, and every one is written inline.** No helper exists.

`routes/auth.ts:355-361` (OIDC callback):
```ts
  setCookie(c, "statera_session", sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: !env.isDev,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
```

`routes/auth.ts:588-594` (2FA disable, re-issue):
```ts
    setCookie(c, "statera_session", newToken, {
      httpOnly: true,
      sameSite: "Lax",
      secure: !env.isDev,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
```

`routes/auth.ts:751-757` (2FA verify, normal login) and `routes/auth.ts:802-808` (revoke-all, re-issue) are byte-identical to the above modulo the token variable name.

The cookie **name** is also a repeated literal: `"statera_session"` appears at those four sites plus `middleware/auth.ts:39` (`const SESSION_COOKIE = "statera_session"`, which is module-private and not imported by `routes/auth.ts`) and `routes/auth.ts:369` (`deleteCookie` in `/logout`).

**Proposal — named sub-item, in 10e-3a.** Extract to `middleware/auth.ts`:

```ts
export const SESSION_COOKIE = "statera_session"   // promote the existing module-private const
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "Lax", secure: !env.isDev,
    maxAge: SESSION_MAX_AGE_SECONDS, path: "/",
  })
}
```

and convert the four existing sites plus 10e's new one. Rationale, stated as the prompt frames it: a fifth hand-typed copy of a security-relevant option set is a divergence waiting to happen, and the divergence would be silent (a missing `httpOnly` or `secure` is not a test failure anywhere in the suite today). Converting the four existing sites is a **refactor with zero behaviour change**, provable by the existing `auth.2fa.test.ts` / `auth.sessions.test.ts` / `auth.callback.test.ts` staying green untouched. I recommend doing it in 10e-3a rather than a separate commit so the diff shows the new call site and the extraction together.

**Risk flagged:** this touches production code on the OIDC path, which the channel wants left alone. It is a pure extraction (same options, same order, same values). If the channel prefers zero OIDC-path churn, the fallback is to add the helper and use it **only** at the new magic-link site, leaving four copies plus a helper — which is worse than either alternative. I'd rather do all five or none. **Open question O1.**

---

## A4 — Rate limiting, verbatim

`apps/api/src/lib/rate-limit.ts:64-93`:

```ts
// Key: userId from session. All rate-limited routes already require auth, so
// userId is always present — stronger than per-IP (which can be shared/rotated).
function keyGenerator(c: Context): string {
  const session = c.get("session") as { userId?: number } | undefined
  return `rl:${session?.userId ?? "anon"}:${c.req.path}`
}

export function createRateLimiter(max: number, windowSec = 60): MiddlewareHandler {
  return rateLimiter({
    windowMs: windowSec * 1000,
    limit: max,
    keyGenerator,
    store: new RedisStore({ client: makeRedisClient(getRedis()), prefix: "rl:", resetExpiryOnChange: false }),
    standardHeaders: "draft-6",
    message: {
      ok: false,
      data: null,
      error: "Too many requests. Please try again later.",
      code: "rate_limit_exceeded",
      meta: { retry_after: windowSec },
    },
  }) as MiddlewareHandler
}
```

`apps/api/src/lib/rate-limit.ts:120-147`:

```ts
export function createCustomRateLimiter(opts: {
  max: number
  windowSec?: number
  keyGenerator: (c: Context) => string
  onLimit?: (c: Context) => void
}): MiddlewareHandler {
  const windowSec = opts.windowSec ?? 60
  return rateLimiter({
    windowMs: windowSec * 1000,
    limit: opts.max,
    keyGenerator: opts.keyGenerator,
    store: new RedisStore({ client: makeRedisClient(getRedis()), prefix: "rl:", resetExpiryOnChange: false }),
    standardHeaders: "draft-6",
    handler: (c) => {
      opts.onLimit?.(c)
      return c.json(
        {
          ok: false, data: null,
          error: "Too many requests. Please try again later.",
          code: "rate_limit_exceeded",
          meta: { retry_after: windowSec },
        },
        429,
      )
    },
  }) as MiddlewareHandler
}
```

**Premise CONFIRMED, from source.** `keyGenerator` (`:66-69`) returns `rl:${session?.userId ?? "anon"}:${c.req.path}`, and `RedisStore` is constructed with `prefix: "rl:"`, so the true Redis key is the double-prefixed `rl:rl:anon:{path}` — matching the RL-C1 observation already recorded in CLAUDE.md.

**Consequence for an unauthenticated signup route, in my own words:** on a route with no `requireAuth`, `c.get("session")` is `undefined` for every caller on earth, so `keyGenerator` collapses the entire internet into the single key `rl:rl:anon:/api/auth/magic-link/request`. A `createRateLimiter(30)` on that route is not "30 requests per minute per person" — it is **30 requests per minute in total, globally**. That is not a weak limit; it is a trivially-triggered denial of the signup path, from any single client, at the exact moment the app is announced. The 31st person to try to sign up in a minute gets a 429.

Therefore: **`createRateLimiter` is unusable on both new 10e routes.** They must use `createCustomRateLimiter` with explicit keys, exactly as `routes/client-errors.ts` does. The `/2fa/verify` route (`auth.ts:616`) is the existing counter-example — it uses `createRateLimiter(5, 60)` unauthenticated and its own comment at `:612-613` acknowledges the key is anonymous. That is a pre-existing shared-bucket limiter (5/min globally on `/api/auth/2fa/verify`); I am **not** proposing to change it (it's outside 10e-R4's zod scope but also outside any charter I have), but it is worth recording as **F-pre1** below, because it will become materially more reachable once magic-link multiplies the sign-in paths.

---

## A5 — Email surface, verbatim

`apps/api/src/lib/email.ts:43-106`:

```ts
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): Promise<boolean> {
  const recipient = to.trim()
  if (!recipient) {
    console.warn("[email] Skipping send: missing recipient")
    return false
  }

  const mailSubject = subject.trim().slice(0, 255)
  if (!mailSubject) {
    console.warn("[email] Skipping send: missing subject")
    return false
  }

  if (env.isDev) {
    await writeDevLog(recipient, mailSubject, htmlBody ?? "", textBody ?? "")
    return true
  }

  if (!env.postmarkApiKey) {
    console.warn(`[email] POSTMARK_API_KEY not configured; skipping email to ${recipient}`)
    return false
  }

  if (!env.mailFromAddress) {
    console.warn(`[email] MAIL_FROM_ADDRESS not configured; skipping email to ${recipient}`)
    return false
  }

  try {
    const client = new postmark.ServerClient(env.postmarkApiKey)
    await client.sendEmail({
      From: env.mailFromAddress,
      To: recipient,
      Subject: mailSubject,
      HtmlBody: htmlBody ?? "",
      TextBody: textBody ?? "",
      MessageStream: "outbound",
    })
    return true
  } catch (exc) {
    Sentry.captureException(exc)
    console.error(`[email] Postmark send failed for ${recipient}:`, exc)
    return false
  }
}

// Fire-and-forget — does not block the caller. Node's event loop handles the
// concurrency; no thread pool needed (contrast with Flask's ThreadPoolExecutor).
export function sendEmailBackground(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): void {
  sendEmail(to, subject, htmlBody, textBody).catch((exc) => {
    Sentry.captureException(exc)
    console.error("[email] Background send threw unexpectedly:", exc)
  })
}
```

and the dev sink at `email.ts:19-41`:

```ts
function devLogPath(): string {
  const configured = (process.env["EMAIL_DEV_LOG_PATH"] ?? "").trim()
  return configured || join("logs", "email_dev.log")
}

async function writeDevLog(to, subject, htmlBody, textBody): Promise<void> {
  const logPath = devLogPath()
  await mkdir(dirname(resolve(logPath)), { recursive: true })
  const line = JSON.stringify({ ts: ..., to, subject, html_body: htmlBody, text_body: textBody }) + "\n"
  await appendFile(logPath, line, "utf8")
}
```

`apps/api/src/lib/email-templates.ts:43-71` — structure and the path-traversal guard:

```ts
function interpolate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const val = context[key]
    return val !== undefined ? String(val) : ""
  })
}

export function renderEmailTemplate(
  templateName: string,
  context: TemplateContext,
): TemplatePair {
  const base = (templateName || "").trim()
  if (!base || base.includes("/") || base.includes("\\") || base.includes("..")) {
    throw new Error("Invalid template name")
  }
  const tpl = TEMPLATES[base]
  if (!tpl) throw new Error(`Unknown email template: ${base}`)
  return { html: interpolate(tpl.html, context), text: interpolate(tpl.text, context) }
}

export async function sendTemplatedEmail(
  to: string, subject: string, templateName: string, context: TemplateContext,
): Promise<boolean> {
  const { html, text } = renderEmailTemplate(templateName, context)
  return sendEmail(to, subject, html, text)
}
```

`TEMPLATES` (`email-templates.ts:20-41`) currently holds exactly one entry, `budget_alert`, with inline `html`/`text` strings.

`apps/api/src/lib/email.test.ts:73-81` — the FIND-S2 site:

```ts
describe("sendEmailBackground", () => {
  it("fires without blocking and the log entry appears asynchronously", async () => {
    sendEmailBackground("bg@example.com", "Bg subject", "<p>bg</p>", "bg")
    // Give the event loop one tick to flush the promise.
    await new Promise((r) => setTimeout(r, 10))
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
    expect(entry.to).toBe("bg@example.com")
  })
})
```

**FIND-S2 failure mechanism as it actually stands.** `sendEmailBackground` returns `void` (`email.ts:96-106`) — it discards the promise chain, so the test has nothing to await and substitutes a fixed 10 ms sleep. Inside that chain, `writeDevLog` performs **two** awaited filesystem operations, `mkdir(..., { recursive: true })` then `appendFile(...)`. When the machine is loaded, those two syscalls do not complete inside 10 ms, `readFileSync(TEST_LOG)` throws `ENOENT`, and the hermetic suite exits 1. The race is genuinely two-sided: the test can also observe a *partially written* file, though in practice `appendFile` of a sub-4 KB line is atomic enough that ENOENT is the observed symptom.

**Proposed deterministic fix — return the promise.**

```ts
export function sendEmailBackground(
  to: string, subject: string, htmlBody: string, textBody: string,
): Promise<void> {
  return sendEmail(to, subject, htmlBody, textBody)
    .then(() => undefined)
    .catch((exc) => {
      Sentry.captureException(exc)
      console.error("[email] Background send threw unexpectedly:", exc)
    })
}
```

test becomes:

```ts
    await sendEmailBackground("bg@example.com", "Bg subject", "<p>bg</p>", "bg")
    const entry = JSON.parse(readFileSync(TEST_LOG, "utf8").trim())
```

Why this and not the alternatives:

- **It is deterministic, not faster.** The awaited promise *is* the `appendFile` completion. There is no window at all, at any machine load. A longer `setTimeout` — explicitly ruled out by the prompt, and correctly — only widens the window.
- **A bounded poll loop** would also work and touches no production file, but it is still time-shaped: it converts "flaky" into "flaky under pathological load", and it leaves the underlying fact (the caller has no way to know the send finished) unfixed.
- **A deterministic sink** (injecting the writer) is the most testable design but is a larger refactor of a module with two callers, for a test problem.
- **The signature change is safe.** The returned promise is already non-rejecting — the internal `.catch()` swallows everything — so no caller can acquire an unhandled rejection by ignoring it, and every existing call site (`grep`: `budget-alerts-lib.ts`, and the module's own tests) ignores return values today. `void` → `Promise<void>` is a widening; `tsc` will not complain at any existing call site.
- **It does not violate the fire-and-forget standing rule.** That rule is about not *blocking the response* on an audit/tracking write. Returning a promise nobody awaits blocks nothing; it only makes the completion *observable*, which is precisely what the test needs and what a future caller wanting delivery confirmation would need.

**Second FIND-S2-adjacent fact, reported not fixed:** `TEST_LOG` is PID-named, but Vitest runs test files in worker threads that can share a PID. If `email.test.ts` were ever split across two files both writing the same PID-named log, they would interleave and `readFileSync(...).trim()` (which parses the file as a *single* JSON line) would throw. Not currently reachable — one file owns the sink. Recorded so a future split doesn't reintroduce it.

**Two facts that constrain 10e-2's design, from the source above:**

1. **`sendEmail` returns `false`; it does not throw** on a missing API key, a missing from-address, or a Postmark exception (`email.ts:66-74`, `:87-91`). The "await the send, return an honest error on hard failure" design point must therefore branch on `=== false`, not on a rejection. A `try/await/catch` around it would catch nothing and report success on every failure.
2. **In dev, `sendEmail` never sends** — `env.isDev` short-circuits to the log file and returns `true` (`email.ts:61-64`). Local magic-link development reads the link out of `logs/email_dev.log`. This must be stated in the 10e-3a/10e-4 developer notes or the first person to run it locally will conclude the feature is broken.

---

## A6 — New-table consequence chain

Every site that must move for a new `magic_link_tokens` table, with the assertion that goes red.

**1. `purgeUserAccountRows` — `apps/api/src/lib/account-deletion.ts:98-112`.** The delete block is 11 statements today. Add one immediately after the `account_action_tokens` delete at `:109` (same auth-infra class, same ordering logic):

```ts
  await db.delete(accountActionTokens).where(eq(accountActionTokens.userId, userId))
  await db.delete(magicLinkTokens).where(eq(magicLinkTokens.userId, userId))   // ← new
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
```

Also `account-deletion.ts:40-53` (the import block) and the file-top deviations comment at `:6-11`, which states "the purge is now 11 tables, not 13" — that sentence becomes wrong and must be updated to 12.

**Assertion that goes red — `apps/api/src/lib/account-deletion.test.ts:90`:**
```ts
    expect(calls).toHaveLength(14)
```
1 `select` + 1 `insert` + 11 `delete` + 1 `update` = 14 → **15**. The sibling assertions at `:80` (`calls[0] === "select"`), `:82` (`calls[1] === "insert"`), `:84` (last is `"update"`) and `:87` (`middle.every(c => c === "delete")`) all still hold — which is the point of adding the delete inside the block rather than around it.

`apps/api/src/lib/account-deletion.integration.test.ts` does **not** enumerate tables (it asserts `revokedSv`, `isActive`, `sessionVersion`, and the three TOTP nulls at `:85-103`), so it does not go red. It **should** gain a case: seed a `magic_link_tokens` row for the test user, commit the purge, assert zero rows survive. Without it the new delete is covered only by a mock call-count.

**2. `apps/api/src/lib/data-export-lib.ts` — table-level EXCLUSION.** The table is auth-infra, exactly the class `account_action_tokens` sits in. Two sites:

- the file-top deviations comment, `data-export-lib.ts:29-35` (`TABLE-LEVEL exclusions` list) — add the entry;
- `DATA_EXPORT_EXCLUSIONS`, `data-export-lib.ts:94-102` — currently 7 entries, becomes 8:

```ts
  "account_action_tokens — short-lived authentication tokens",
  "magic_link_tokens — short-lived sign-in tokens (auth-infra, same rationale as account_action_tokens)",  // ← new
```

**Assertions that go red — `apps/api/src/lib/data-export-lib.test.ts:316` and `:329-333`:**
```ts
    expect(DATA_EXPORT_EXCLUSIONS.length).toBe(7)      // :316  → 8
...
  it("is exactly the seven documented exclusions, in order", () => {   // :329 — title + deep-equal array
    expect(DATA_EXPORT_EXCLUSIONS).toEqual([ ... ])
```
Both the `.length` check and the full `toEqual` deep-equal must move, and the `it` title ("the seven documented exclusions") must be renamed to eight. That title is prose inside an assertion name — easy to miss, and it is exactly the kind of stale-number line the derive-don't-carry rule exists for.

**3. `restore-repurge-lib.ts` `OWNED_TABLES` — `apps/api/src/lib/restore-repurge-lib.ts:22-33`.** Currently 10 entries. Add `"magic_link_tokens"` after `"account_action_tokens"` (`:29`). This array drives `ownedRowCounts` (`:106-121`), which the drill's Stage 2/3 asserts goes to zero after a re-purge; without the entry a restored token row would survive a re-purge and never be counted. No unit assertion pins the array length, so **nothing goes red** — this one is silent, which makes it the most dangerous item in the chain. **Mitigation I propose:** add a hermetic assertion pinning `OWNED_TABLES` against the purge's delete list, so the two cannot drift again. (Today they already differ by one on purpose — `security_events` is purged but excluded from `OWNED_TABLES` per the comment at `:20-21` — so the assertion must encode that documented difference rather than assert equality.)

**4. `deploy/restore-drill.sh` `DECLARED_TABLES` — `deploy/restore-drill.sh:38-59`.** 19 entries → 20; insert `magic_link_tokens` in sorted position (the list is consumed through `sort` at `:245`, but it is maintained alphabetically and should stay so). The manifest is a **declared-exact, both-directions** assertion — `deploy/restore-drill.sh:245-252`:

```bash
EXPECTED_TABLES=$(echo "${DECLARED_TABLES}" | sort)
MISSING=$(comm -23 <(echo "${EXPECTED_TABLES}") <(echo "${ACTUAL_TABLES}"))
EXTRA=$(comm -13 <(echo "${EXPECTED_TABLES}") <(echo "${ACTUAL_TABLES}"))
if [[ -n "${MISSING}" || -n "${EXTRA}" ]]; then
  ...
  die "restored table set does not match the declared set"
fi
```

so a post-10e backup restored against an un-updated manifest fails on `unexpected tables: magic_link_tokens`. Three more prose sites carry the literal count:

- `deploy/restore-drill.sh:253` — `echo "[drill]   table set: OK — matches the declared 19-table set exactly."`
- `docs/runbooks/backups.md:212` — "table set equals the **declared 19-table set** exactly, both directions"
- `docs/runbooks/backups.md:216-220` — the 21→19 cutover note, which now needs a 19→20 sibling: pre-10e backups carry 19 tables and will FAIL the 20-table assertion; that is expected-not-defect, and the restore self-heals because the next `migrate` creates the table.

(`backups.md:364` records the 21-table set inside the *historical execution record* of the 2026-07-08 drill — that is a log of what happened, not a live assertion, and must **not** be edited.)

**5. The cleanup job — extend, don't add.** `handleCleanupAccountTokens`, `apps/api/src/worker/jobs/maintenance-jobs.ts:21-56`:

```ts
export async function handleCleanupAccountTokens(_job: Job): Promise<void> {
  await markWorkerTaskStarted(TASK_CLEANUP_ACCOUNT_TOKENS)
  let errorMessage: string | undefined
  try {
    const db = getDb()
    const now = Date.now()
    // Keep expired tokens for 24 h after expiry before purging (clock-skew grace).
    const expiredCutoff = new Date(now - 24 * DAY_MS)
    // Keep consumed tokens for 7 days for audit trail before purging.
    const usedCutoff = new Date(now - 7 * DAY_MS)

    const [expired] = await db
      .delete(accountActionTokens)
      .where(lt(accountActionTokens.expiresAt, expiredCutoff))
    const [used] = await db
      .delete(accountActionTokens)
      .where(
        and(
          isNotNull(accountActionTokens.usedAt),
          lt(accountActionTokens.usedAt, usedCutoff),
        ),
      )
    console.log(
      `[${TASK_CLEANUP_ACCOUNT_TOKENS}] expired_deleted=${expired.affectedRows} used_deleted=${used.affectedRows}`,
    )
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, { tags: { handler: TASK_CLEANUP_ACCOUNT_TOKENS } })
    console.error(`[${TASK_CLEANUP_ACCOUNT_TOKENS}] Failed:`, err)
  }
  await markWorkerTaskFinished(TASK_CLEANUP_ACCOUNT_TOKENS, errorMessage ? "failure" : "success", errorMessage)
}
```

**Recommendation: extend this handler, do not add a fifth maintenance job.** The decisive argument is the **F1 lesson**, and it cuts unusually cleanly here. A new job requires a new `TASK_*` constant, a new `jobHandlers` registry entry, a new `registerScheduledJobs` block (`worker/scheduler.ts:29-46`), and usually a new env-var interval — four new things, each of which is a thing that can be committed and never activated, which is exactly how the backup timer was dead for 37 days. Extending `cleanup-account-tokens` inherits an **already-proven-running** schedule: it fires every `MAINT_ACCOUNT_TOKENS_INTERVAL_MINUTES` (default 15, `env.ts:107`) via `scheduler.ts:29-32`, and its `worker_task_runs` rows already exist in production.

The cost is honest and small: the task *name* becomes slightly imprecise (it cleans two token tables, not one), and one `worker_task_runs` row now covers both. I would not rename the task — renaming breaks the `worker_task_runs` history continuity for a cosmetic gain. I *would* extend the log line so the two are separable in the journal:

```ts
    console.log(
      `[${TASK_CLEANUP_ACCOUNT_TOKENS}] expired_deleted=${expired.affectedRows} used_deleted=${used.affectedRows}` +
      ` magic_expired_deleted=${mlExpired.affectedRows} magic_consumed_deleted=${mlConsumed.affectedRows}`,
    )
```

**This new log field is the on-box activation discriminator — see item 7.** One caveat to record: the handler has a single `try`, so a failure in the first delete aborts the rest. That is pre-existing (the two `accountActionTokens` deletes already share it) and I do not propose changing it; but it means a magic-link cleanup failure and an account-token cleanup failure are indistinguishable in `worker_task_runs`, and both show as one `failure` row. The Sentry exception carries the actual SQL error, so triage is not blind.

Retention windows for the new table: expired rows kept **24 h past `expires_at`** and consumed rows kept **7 days past `consumed_at`**, reusing the two cutoffs already computed at `:27-30` verbatim — no new constants, and the rationale (clock-skew grace; audit trail) transfers unchanged.

**6. The orphan class — and why this job is a privacy control, not housekeeping.**

A `magic_link_tokens` row created by the **sign-up** path has `user_id = NULL` (nobody has that email yet) and carries an **email address for a person who never became a user**. `purgeUserAccountRows` deletes by `user_id`, so it cannot reach these rows — there is no user to delete them with. Nothing else in the system deletes them.

Consequences, stated plainly for the proposal:

- The only bound on how long Statera holds the email address of a **non-user** — someone who typed their address into the login page and never clicked the link — is the cleanup job's retention window. That makes the job a **data-minimisation control**, and its continued execution a compliance property, not an operational nicety.
- The same is true of a row whose `user_id` never got backfilled because the account was created and then deleted before the token was consumed.
- The Privacy Policy does not currently disclose storing an email before an account exists — see **A10**. The retention window and the policy text must agree.

I propose the design carry this in two places: a comment block at the top of the schema file naming the orphan class, and one line in the 10e-close deploy report. It is the kind of fact that is obvious while writing it and invisible six months later.

**7. Proving the cleanup schedule is live on-box at close (the F1 lesson applied).**

The weak version of this proof is "the job is scheduled, we can see the code." The strong version needs an observation that a *non-extended* worker could not have produced. Because the extension changes the **shape of the log line** (item 5), that discriminator exists for free:

```
# Step 0 — CONFIRM PROMPT. You must be on the SERVER as deploy.
whoami && hostname          # expect: deploy / <production hostname>

# 1. Wait for at least one scheduled fire (interval is 15 minutes by default),
#    then read the worker journal for the cleanup task.
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since 30m worker \
  | grep 'cleanup-account-tokens'
```

**PASS requires the line to contain `magic_expired_deleted=` and `magic_consumed_deleted=`.** A pre-10e worker prints the old three-field line; a deployed-but-not-running worker prints nothing. The three outcomes are distinguishable, which is the property the standing rule demands — an empty grep would otherwise be indistinguishable from "the worker is running fine and had nothing to say."

Second, independent instrument (DB, not logs) — a fresh `finished_at` proves the schedule fired at all:

```sql
SELECT task_name, status, started_at, finished_at
FROM worker_task_runs
WHERE task_name = 'cleanup-account-tokens'
ORDER BY started_at DESC LIMIT 3;
```
PASS = the newest `started_at` post-dates the 10e deploy by less than one interval, and `status = 'success'`.

---

## A7 — Schema and migration plan

### Deviations from the channel's sketch, with reasons

| channel's sketch | proposed | why |
|---|---|---|
| `id bigint PK auto-inc` | **`id int PK auto-inc`** | Every table in this schema uses `int`. `users.id` is `int` (`0000:17`). Consistency, and see next row. |
| `user_id bigint NULL, FK → users` | **`user_id int NULL, FK → users`** | **Hard constraint, not a preference:** MySQL refuses to create a foreign key whose column type does not match the referenced column. `users.id` is `int`; a `bigint` FK fails at migrate time. Precedent: `accountActionTokens.userId` is `int(...).references(() => users.id)` (`account-action-tokens.ts:16-18`). |
| `token_hash char(64) UNIQUE` | **`token_hash varchar(64) UNIQUE`** | Matches the sibling auth-token table exactly — `accountActionTokens.tokenHash` is `varchar("token_hash", { length: 64 }).notNull().unique()` (`account-action-tokens.ts:20`). A hex SHA-256 is always exactly 64 chars so `CHAR` would be marginally tighter, but consistency with the one existing token table beats a byte, and it avoids `CHAR`'s trailing-space comparison semantics. |
| `request_ip` / `user_agent` omitted by default | **omitted — and I argue affirmatively for omitting them, not just accepting the default** | See below. |

### The `request_ip` / `user_agent` argument

I agree with omitting them, and there is a stronger reason available than "forensics value does not yet justify it":

**The forensic need is already met by a surface with better privacy properties.** The design already emits `security_events` rows on request and consume, and `auditSecurityEvent` (`auth.ts:109-125`) takes `ipAddress` and `userAgent` and writes them. Non-tombstone `security_events` rows **are included in the GDPR data export** (`data-export-lib.ts:37-39`) and **are purged on account deletion** (`account-deletion.ts:103-105`) and **are age-bounded** by `cleanup-security-data` (`maintenance-jobs.ts:58-78`). So an IP recorded there is disclosed, user-visible, deletable, and expiring.

An IP recorded in `magic_link_tokens` would be **none of those**: the table is a table-level export exclusion (item A6.2), so it is personal data the user cannot see; and on the sign-up path the row has `user_id = NULL`, so it is personal data attached to no account and reachable by no deletion request. That is strictly worse on every axis while duplicating information we already keep. Omit them.

### Proposed Drizzle schema — `apps/api/src/db/schema/magic-link-tokens.ts`

```ts
/*
 * Magic-link sign-in tokens (Module 10e).
 *
 * ORPHAN CLASS — read before changing the cleanup job. A row created by the
 * SIGN-UP path has user_id = NULL: nobody holds that email yet. purgeUserAccountRows
 * deletes by user_id and therefore CANNOT reach these rows. Their only bound is
 * handleCleanupAccountTokens (worker/jobs/maintenance-jobs.ts), which makes that job
 * a data-minimisation control, not housekeeping. If the job stops, Statera accumulates
 * the email addresses of people who never became users, indefinitely.
 *
 * Deliberate deviations / design notes:
 * - token_hash is an UNSALTED SHA-256 of 32 CSPRNG bytes. Unsalted is adequate and
 *   correct here: the pre-image is 256 bits of uniform randomness, so there is no
 *   dictionary to build and a salt would only prevent a rainbow table that cannot exist.
 *   The raw token is NEVER stored — it exists only in the mailed URL.
 * - lib/crypto.ts (enc1: AES-256-GCM) is deliberately NOT used: it is reversible, and
 *   reversibility is precisely the property being avoided. A DB read must not yield a
 *   usable sign-in token.
 * - consumed_at doubles as the SUPERSESSION marker (10e-R2). "Actually clicked" vs
 *   "invalidated by a re-request" is distinguished by the security_events audit trail,
 *   not by a second column.
 * - request_ip / user_agent are deliberately ABSENT. security_events already records
 *   both for the request and consume events, and does so on a surface that is exported,
 *   purged, and age-bounded — none of which is true of this table.
 */

import { sql } from "drizzle-orm"
import { datetime, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core"
import { users } from "./users"

export const magicLinkTokens = mysqlTable(
  "magic_link_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    // Normalized: trim + lowercase ONLY (never Gmail dot-stripping or +tag removal).
    email: varchar("email", { length: 255 }).notNull(),
    // SHA-256 hex of 32 CSPRNG bytes. Raw token never stored.
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    // NULL on the sign-up path (no user exists yet); backfilled on consume.
    userId: int("user_id").references(() => users.id),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    consumedAt: datetime("consumed_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_magic_link_tokens_email").on(t.email),
    index("ix_magic_link_tokens_user_id").on(t.userId),
    index("ix_magic_link_tokens_expires_at").on(t.expiresAt),
    index("ix_magic_link_tokens_consumed_at").on(t.consumedAt),
  ],
)
```

Index justification, one line each — these are not decorative:
- `email` — the supersession `UPDATE ... WHERE email = ? AND consumed_at IS NULL` on every request, and the per-email rate-limit accounting.
- `user_id` — the purge delete (A6.1).
- `expires_at` — the cleanup job's expired-rows delete; mirrors `ix_account_action_tokens_expires_at`.
- `consumed_at` — the cleanup job's consumed-rows delete; mirrors `ix_account_action_tokens_used_at`.

`token_hash` needs no separate index — `.unique()` provides one, and the consume `UPDATE` keys on it.

### Expected generated DDL

```sql
CREATE TABLE `magic_link_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`user_id` int,
	`expires_at` datetime(3) NOT NULL,
	`consumed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_link_tokens_token_hash_unique` UNIQUE(`token_hash`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `magic_link_tokens_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_email` ON `magic_link_tokens` (`email`);
--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_user_id` ON `magic_link_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_expires_at` ON `magic_link_tokens` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `ix_magic_link_tokens_consumed_at` ON `magic_link_tokens` (`consumed_at`);
```

### Migration plan

1. Write `apps/api/src/db/schema/magic-link-tokens.ts`; add the re-export to `apps/api/src/db/schema/index.ts`.
2. From `apps/api/`, run `pnpm exec drizzle-kit generate`. This produces the three-file atomic unit — `migrations/0007_<name>.sql`, the `meta/_journal.json` entry, and `meta/0007_snapshot.json`. **Never hand-write any of the three** (the `0003` `is_tombstone` incident is the standing precedent: an unlisted `.sql` is invisible to `drizzle-orm/migrator.js`, which iterates `journal.entries` exclusively).
3. **Mandatory second run** — `pnpm exec drizzle-kit generate` again, immediately. It **must** print `No schema changes`. Anything else means the snapshot is stale and step 2 is incomplete. The captured output of this second run goes in the 10e-1 close-out.
4. Verify the journal grew by exactly one entry (`idx: 7`, `tag: "0007_..."`) and that a `meta/0007_snapshot.json` exists.

**Additive-only: satisfied.** One new table, no DROP, no RENAME, no type change on an in-use column. No two-deploy sequence needed. Old code running against the migrated schema simply ignores a table it does not know about — which is precisely the property the additive-only rule buys, and it is what makes 10e-1 safe to land well before 10e-3a mounts a route that reads the table.

**One-DDL-statement-per-file: this is a rule collision, and I am flagging it rather than deciding it.** The standing rule says one DDL per migration file. `drizzle-kit generate` emits **six** statements for a single new table (CREATE TABLE, ADD CONSTRAINT for the FK, four CREATE INDEXes), and there is no supported way to make it emit one. The repo has no precedent: `0000` is the whole schema, `0001`–`0003` are single `ALTER`/`CREATE INDEX` statements, `0004`–`0006` are single DROPs. **My recommendation is to accept the six-statement file as one logical unit and record it as a named, reasoned deviation**, on this argument: the rule's stated rationale is that a half-applied `ALTER` on an **in-use** table leaves ambiguous state with no rollback. A half-applied `CREATE TABLE` on a table that **no deployed code reads** is unambiguous — the table either exists or does not, a re-run completes the indexes, and between 10e-1 and 10e-3a nothing queries it. The alternative (forcing six migrations via the SC-3 barrel-index trick, adding one index per generate) buys nothing here and adds five journal entries. **Open question O2** — this needs a channel ruling because it is a documented standing rule, and I do not treat "the tool makes it awkward" as authority to relax one.

---

## A8 — Sub-commit split

Adjusted from the skeleton. Three changes, each with a reason.

| # | content | `db.transaction()` boundary? | adds/edits INTEGRATION cases? | cadence obligation |
|---|---|---|---|---|
| **10e-0** | FIND-S2 deterministic fix (`lib/email.ts` `sendEmailBackground` returns the promise; `email.test.ts:75-79` awaits it). Postmark deliverability run-sheet (A9) executed **operator-side** — no commit content. | no | no | none |
| **10e-1** | Schema + migration + `lib/magic-link-lib.ts` (token mint/hash/normalize/expiry, no routes) + **the entire A6 consequence chain**: purge, data-export exclusions, `OWNED_TABLES`, `DECLARED_TABLES` + the three prose counts, cleanup-job extension. | **YES** — `purgeUserAccountRows` runs inside `db.transaction()` at both call sites | **YES** — new `magic_link_tokens` case in `account-deletion.integration.test.ts` | **INTEGRATION run required**, exit code captured, reconciled against **795 / 3 / 0** |
| **10e-2** | `POST /api/auth/magic-link/request` — three-limit rate limiting via `createCustomRateLimiter`, zod schema (10e-R4 scope), supersession, awaited send, uniform response, `auth.magic_link.requested` audit. New template in `email-templates.ts`. | no | probably not | none, unless an INTEGRATION rate-limit case is added |
| **10e-3a** | `POST /api/auth/magic-link/verify` — atomic single-statement consume, link-by-verified-email, user creation, reactivate-as-fresh replication (10e-R3), TOTP gate handoff, session issuance. **Plus the A3 `setSessionCookie` extraction across all five call sites.** | no (by design — see below) | **YES** | **INTEGRATION run required** |
| **10e-3b** | **NEW — OIDC callback email adoption.** Resolves Finding **F2**: the callback's not-found-by-external-id branch must look up by email before inserting, or a magic-link-first user's first Google sign-in 500s on `users_email_unique`. | no | **YES** (the duplicate-email path needs the real unique constraint) | **INTEGRATION run required** |
| **10e-4** | Frontend: LoginPage email path, `/auth/magic` landing page + route, `authApi` methods, `AuthContext` wiring, contract fixture regeneration. | no | no | none |
| **10e-close** | Docs (`docs/modules/phase4-10e.md` lineage already persisted at 10e-1 per the persist-first rule; this adds the close-out), CLAUDE.md, final baselines, deploy, **on-box cleanup-schedule activation proof** (A6.7). | no | no | final INTEGRATION reconciliation |

**Change 1 — 10e-3 split into 10e-3a / 10e-3b.** The OIDC-callback adoption is a change to the working production login path, and it needs to be reviewable without the magic-link verify handler's diff around it. Sequencing note: within the branch the order is a review-ergonomics choice, because the whole module deploys once at 10e-close. **But if any partial deploy occurs, 10e-3b must not lag 10e-3a** — the window between them is a window in which a magic-link-first user's Google sign-in returns a 500.

**Change 2 — the `setSessionCookie` extraction is named as part of 10e-3a**, not left implicit (A3, subject to **O1**).

**Change 3 — 10e-0's Postmark run-sheet is a gate on 10e-2, not merely an early task.** Writing the request endpoint before knowing whether mail is deliverable risks building against an unverified dependency; and the run-sheet's DNS steps have propagation latency measured in tens of minutes.

**On 10e-3a and `db.transaction()`:** the design deliberately does **not** wrap the consume. The single-statement `UPDATE ... WHERE consumed_at IS NULL` autocommits, making the consume globally visible the instant it succeeds — the strongest available anti-double-click property. Wrapping consume + user-creation in a transaction would hold the row lock across the user INSERT, which is correct but strictly weaker on visibility and longer on lock hold. **The cadence obligation still fires for 10e-3a** because the rule is "touches a `db.transaction()` boundary **or** adds/edits integration cases," and it adds them.

**Baseline predictions, stated as DELTAS.** Per the derive-don't-carry rule, absolutes are re-derived at execution against the then-current measured baseline; carrying an absolute across intervening commits is how the B4-1b-R13 figure went stale.

- 10e-0: API hermetic **+0** (the FIND-S2 test is edited in place, not added). Files **+0**.
- 10e-1: API hermetic **+ ~6–8** (token lib), files **+1**; INTEGRATION **+1**.
- 10e-2: API hermetic **+ ~10–14** (rate limits ×3, zod shape, supersession, uniform response, send-failure branch), files **+1**.
- 10e-3a: API hermetic **+ ~12–16**, files **+1**; INTEGRATION **+3–4** (double-click, supersession, reactivation, dup-email recovery).
- 10e-3b: API hermetic **+ ~3–4** (into `auth.callback.test.ts`); INTEGRATION **+1–2**.
- 10e-4: frontend **+ ~8–10**, files **+1–2**; contract fixture **64 → 66** (two new `authApi` methods).
- Both `tsc --noEmit` stay at **0** throughout, exit **0** on every gate.

---

## A9 — Postmark deliverability verification run-sheet (operator-side)

Execute before 10e-2 is written. Nothing here is a commit. Every command block opens with a Step 0 prompt-confirmation.

---

### Step 1 — Confirm which from-address production actually uses

This is the value the code sends as `From:` (`lib/email.ts:80`, `env.mailFromAddress`, `env.ts:84`). Everything downstream verifies *this* domain, not an assumed one.

```
# Step 0 — CONFIRM PROMPT. You must be on the SERVER as deploy.
# If this prints anything other than "deploy" and the production hostname, STOP.
whoami && hostname
```

```
# Read MAIL_FROM_ADDRESS from the encrypted prod secrets, without dumping the rest.
cd ~/statera && sops -d --output-type dotenv secrets/.env.prod.sops.yaml | grep '^MAIL_FROM_ADDRESS='
```

**Record the value verbatim.** Every later step that says "read from Step 1" means this string. If it is still `noreply@example.com` (the `env.ts:84` default), STOP — the variable was never set, and no amount of DNS work will help.

---

### Step 2 — Postmark: sender signature / domain verification

```
# Step 0 — CONFIRM PROMPT. This step is BROWSER-ONLY, on your LAPTOP.
# No shell command. If you are looking at a server prompt, stop and switch windows.
```

1. Sign in at `https://account.postmarkapp.com`.
2. Open **Sender Signatures** → **Domains**. Confirm `staterafinance.app` is listed.
3. Record its status: `Verified` / `Pending`. If the domain is absent, add it (**Add Domain** → `staterafinance.app`) and continue — the DNS records you need are shown on the next screen.
4. Open the domain's detail page. Record, verbatim, three things you will need in Step 3:
   - the **DKIM** record: its host (of the form `<selector>._domainkey.staterafinance.app`) and its value;
   - the **Return-Path** record: its host (typically `pm-bounces.staterafinance.app`) and its CNAME target (`pm.mtasv.net`);
   - whether Postmark shows **"Return-Path verified"**.
5. Note whether the account banner says the account is **pending approval** or restricted to a limited recipient list. A brand-new Postmark account is approval-gated; an unapproved account will deliver to your own verified addresses in Step 6 and then silently fail for real users at announcement. If it is pending, request approval now — it is not instant.

---

### Step 3 — Cloudflare DNS: add the records without clobbering email routing

```
# Step 0 — CONFIRM PROMPT. This step is BROWSER-ONLY, on your LAPTOP.
```

**Read this before touching anything.** Cloudflare already runs **inbound** Email Routing for `privacy@staterafinance.app`. That means the zone already contains Cloudflare's routing **MX** records at the apex and, in most Email Routing setups, an apex **SPF TXT** record of the form `v=spf1 include:_spf.mx.cloudflare.net ~all`. Inbound and outbound must coexist:

- **MX records: do not touch them.** Postmark is outbound-only and needs no MX record. Deleting or reordering the Cloudflare routing MX records breaks `privacy@staterafinance.app` — the address published in the Privacy Policy (`PrivacyPolicyPage.tsx:31`).
- **SPF: there must be exactly ONE apex TXT record beginning `v=spf1`.** Two SPF records is a `permerror`, and a `permerror` fails SPF for *both* systems, not just the new one. Adding a second `v=spf1` TXT record is the single most likely way to break this zone.

Which SPF action is correct depends on Step 2's Return-Path finding:

- **If Postmark shows a custom Return-Path (`pm-bounces.staterafinance.app` → `pm.mtasv.net`) and you add that CNAME:** SPF is evaluated against the *Return-Path subdomain*, not the apex. **Do not modify the apex SPF record at all.** This is the preferred configuration.
- **If you are not using a custom Return-Path:** the apex SPF must gain `include:spf.mtasv.net`, by **editing the existing record in place** — never adding a second one. The edited value would read `v=spf1 include:_spf.mx.cloudflare.net include:spf.mtasv.net ~all` (preserve whatever includes are already present; add, do not replace).

Now:

1. Cloudflare dashboard → `staterafinance.app` → **DNS** → **Records**.
2. Add the **DKIM** record exactly as Postmark showed it in Step 2.4. **Set proxy status to DNS only (grey cloud)** — TXT and CNAME records used for mail authentication must not be proxied.
3. Add the **Return-Path CNAME** exactly as shown in Step 2.4, **DNS only (grey cloud)**.
4. Do **not** add or edit any MX record.
5. Apply the SPF decision above.
6. **DMARC:** look for a TXT record at host `_dmarc`. If absent, add one:
   - Name: `_dmarc`
   - Type: `TXT`
   - Content: `v=DMARC1; p=none; rua=mailto:privacy@staterafinance.app`

   `p=none` is deliberate: the requirement is to *know* the policy, not to enforce one. `p=none` publishes a policy and requests aggregate reports without risking legitimate mail during launch. **Record whatever policy ends up published**, whether you added it or found it.

---

### Step 4 — Verify the DNS from outside Cloudflare

```
# Step 0 — CONFIRM PROMPT. You must be on your LAPTOP, not the server.
# If this prints "deploy", stop and switch windows.
whoami && hostname
```

Wait at least 5 minutes after Step 3, then:

```
dig +short TXT staterafinance.app
dig +short TXT _dmarc.staterafinance.app
dig +short MX staterafinance.app
dig +short CNAME pm-bounces.staterafinance.app
```

and, substituting the DKIM host recorded in Step 2.4:

```
# Replace <selector> with the selector Postmark showed you in Step 2.4.
dig +short TXT <selector>._domainkey.staterafinance.app
dig +short CNAME <selector>._domainkey.staterafinance.app
```

(Postmark issues DKIM as either a TXT or a CNAME depending on account age — run both; exactly one returns a value.)

**PASS conditions, each checked explicitly:**
- `TXT staterafinance.app` returns **exactly one** string starting `v=spf1`. Two is a failure — go back to Step 3.
- `TXT _dmarc...` returns one `v=DMARC1;` string. Record the `p=` value.
- `MX staterafinance.app` still returns the Cloudflare Email Routing hosts, unchanged from before Step 3.
- The DKIM lookup returns a value (not empty).
- The Return-Path CNAME resolves to `pm.mtasv.net`, if you configured one.

**Then return to Postmark** (browser, laptop) and confirm the domain page now shows **DKIM verified** and, if applicable, **Return-Path verified**. Postmark's own check is the authority — `dig` returning a record proves publication, not that Postmark accepts it.

---

### Step 5 — Confirm the message stream is transactional

```
# Step 0 — CONFIRM PROMPT. This step is BROWSER-ONLY, on your LAPTOP.
```

The code hardcodes `MessageStream: "outbound"` (`lib/email.ts:84`), which is Postmark's **default transactional stream** — broadcast is a separate, explicitly-created stream. So the code side is already pinned; what needs checking is the server side:

1. Postmark → the server used by production → **Message Streams**.
2. Confirm a stream with ID **`outbound`** exists and its type is **Transactional**.
3. Record its name and type. If no stream with ID `outbound` exists, STOP — every send from production is failing, including budget alerts, and that is a live defect independent of 10e.

---

### Step 6 — Delivered end-to-end test, with headers captured

```
# Step 0 — CONFIRM PROMPT. This step is BROWSER-ONLY, on your LAPTOP.
```

You need two destinations: **one Gmail address** and **one non-Gmail address** (Outlook.com, iCloud, Proton, or a work domain — anything not Google).

1. Postmark → your server → **Send a test email** (or the domain page's test-send).
2. `From:` must be the **exact value from Step 1** — not a different address on the same domain. If Postmark will not let you send from that address, the sender signature for it is not confirmed; fix that before continuing.
3. Send to the Gmail address. Send again to the non-Gmail address.

**For each of the two inboxes, record three things:**

**(a) Placement.** Inbox, Promotions/Updates tab, or Spam. Note it exactly. "It arrived" without placement is not a result — a magic link in Spam is a broken login path.

**(b) The authentication headers.** This is what converts operator attestation into evidence.
   - *Gmail:* open the message → the ⋮ menu → **Show original**. The top panel shows `SPF`, `DKIM`, `DMARC` with pass/fail. Below it, find the `Authentication-Results:` header line.
   - *Non-Gmail:* use that client's "view source" / "show original" / "view message details" and find the same `Authentication-Results:` header.

   **Copy the full `Authentication-Results:` line verbatim** into the execution record. PASS requires **`dkim=pass`**, **`spf=pass`**, and **`dmarc=pass`**. A `dmarc=fail` alongside two passes means an alignment problem (the SPF/DKIM domain does not match the `From:` domain) — that is a real failure even though two of three look green.

**(c) The rendered `From:`** as the recipient sees it — the display name and address.

**Do not record "delivered" as a summary.** Paste the header lines. The 8f4 lesson is explicit: operator attestation is the weakest evidence class, and a "clean" claim must carry at least one captured artifact.

---

### Step 7 — Execution record

Write the results — Steps 1–6, including both verbatim `Authentication-Results:` lines, the DMARC policy, the message-stream name, and the Postmark account approval state — into the 10e-0 close-out. If any PASS condition failed, 10e-2 does not start.

---

## A10 — Privacy Policy check

Read: `apps/web/src/components/pages/legal/PrivacyPolicyPage.tsx` (244 lines, `LAST_UPDATED = "6 July 2026"`, `:17`). **Finding reported; no copy drafted or changed — legal copy is operator-owned.**

**(a) Storing an email address before an account exists — NOT COVERED.**

`PrivacyPolicyPage.tsx:49-53`:

> **Account data:** your name and email address as provided by your sign-in provider (Google), and your security settings (whether two-factor authentication is enabled).

The clause is not merely silent on user-supplied email — it makes a **positive attribution** that becomes inaccurate: it says the email comes *from Google*. Under magic-link the email is typed by the user, and it is stored *before* any account exists (the `magic_link_tokens` sign-up row, `user_id = NULL`). Two distinct gaps follow:

1. the collection is misattributed for magic-link users;
2. there is no disclosure at all of **holding a non-user's email address**, and no retention statement for it. That second gap is the sharper one — §7 (`:170-179`) discloses retention for *account* data and backups, and §8 (`:191-208`) frames export and deletion as things an account holder does. A person who typed their address and never clicked the link has no account, so nothing in §7 or §8 describes what happens to their data or how they would ask about it.

§3 (`:87-91`) — "**No passwords.** Statera has no password database. You sign in through your identity provider; we never see or store a password." — remains **true** under 10e (no password column, ever), but "your identity provider" becomes an incomplete description of the sign-in mechanism.

**(b) Transactional email on the sign-up path — PARTIALLY COVERED, weakly.**

`PrivacyPolicyPage.tsx:139-142`:

> **Postmark** — delivers emails we send you (such as budget alerts).

"such as" is non-exhaustive, so this is not *false*. But a sign-in email is categorically different from a notification: it is a **credential in transit**, sent to an address that may not correspond to any account, and it is the mechanism by which account access is granted. Listing it only under an open-ended "such as" understates it.

Two adjacent sections a copy revision should be checked against:

- §9 Cookies and sessions (`:215-220`): "short-lived cookies used during sign-in and account deletion." A magic-link sign-in for a **TOTP-enabled** user does issue `statera_pending_2fa` — so this clause happens to remain accurate. Recorded because it would have been easy to assume otherwise.
- §5 (`:144-147`) Sentry — "configured to scrub personal data before sending" — is now accurate in production as of Task B / B2. Unaffected by 10e; noted only to confirm I checked it while I was in the file.

**Recorded, not proposed:** three sites would move in a copy revision — §2's account-data bullet, §5's Postmark line, and either §7 or a new subsection for pre-account email retention. The `LAST_UPDATED` constant (`:17`) moves with them. That is operator work. The two testid-pinned commitment slots (`commitment-statement-files` at `:108`, `commitment-backup-retention` at `:170`) are untouched by 10e.

---

# Findings — premises the tree contradicted

Stated as contradictions, not smoothed over.

**F1 — A1's STOP condition does not fire, but for a reason worth naming.** `users.email` has `CONSTRAINT users_email_unique UNIQUE(email)` (`0000:31`). Additionally, the collation `utf8mb4_0900_ai_ci` makes that uniqueness **case- and accent-insensitive**, so the constraint is stronger than "unique on the exact bytes." Link-by-verified-email is well-defined. Not a contradiction of the prompt — a strengthening of its premise.

**F2 — MAJOR. The channel's `auth_provider` design point is only half true, and the other half is a 500.** The channel's position: *"a Google-provisioned user who later signs in by mail keeps `auth_provider='google'`. The column stops meaning 'how this user authenticates' and starts meaning 'how this user was first created.' Record it, do not fix it."*

That reading is correct in the direction it names. **It is wrong in the reverse direction, and the reverse direction is not a semantic nuance — it is an unhandled crash.** The OIDC callback looks up by `(auth_provider, external_id)` (`auth.ts:208-212`), never by email. So for a user created by magic link (`auth_provider='email'`) who later clicks *Continue with Google*:

1. the lookup misses — no row has `('google', <google sub>)`;
2. control enters the **new-user** branch (`auth.ts:218-235`) and executes `db.insert(users).values({ authProvider: 'google', externalId, email, ... })`;
3. `email` already exists on the magic-link row → MySQL `ER_DUP_ENTRY` on `users_email_unique`;
4. nothing catches it. It propagates to `app.onError` (`app.ts:65-77`), which returns a **500 JSON body** — into a browser mid-OAuth-redirect, so the user sees raw JSON, not a page.

This is not exotic. Under 10e-R2 + 10e-R6, magic-link is the *acquisition* path; a meaningful share of early users will sign up by mail and later click the Google button, because it is the more prominent affordance on the login page. **10e cannot ship without handling it** — hence sub-commit **10e-3b**.

The fix is a lookup-then-adopt in the not-found branch: before inserting, `SELECT ... WHERE email = <normalized claim email>`; if a row exists, adopt it (set `auth_provider='google'`, `external_id=<sub>`) rather than insert. The composite unique is satisfied because no other row holds `('google', sub)`.

**And that adoption changes the semantic line the channel asked me to record.** After adoption, `auth_provider` is neither "how this user authenticates" nor "how this user was first created" — a magic-link-first user who adopts Google reads `'google'` despite having been created by mail. The accurate line is: **`auth_provider` + `external_id` name the OIDC identity currently bound to this account, if one has ever been used; otherwise they name the email-only identity.** I recommend recording *that* in Key architectural decisions, not the channel's phrasing. I agree with the channel that an `auth_identities` table is out of scope and should stay out.

**F3 — The schema sketch's `bigint` columns cannot be created.** The channel's table specifies `id bigint` and `user_id bigint NULL, FK → users`. `users.id` is `int` (`0000:17`); MySQL requires matching types for a foreign key, so a `bigint user_id` FK fails at migrate time. Both columns must be `int`, matching `account_action_tokens` (`account-action-tokens.ts:15-18`). Corrected in A7.

**F4 — The schema sketch omits that `external_id` is NOT NULL and uniquely constrained.** `external_id varchar(255) NOT NULL` with `UNIQUE(auth_provider, external_id)` (`0000:20`, `:32`) means a magic-link-first user cannot be created without a synthesized, per-user-unique value. The sketch says nothing about the `users`-row shape for a magic-link signup at all. Addressed in A1(c).

**F5 — A4's rate-limit premise is CONFIRMED, and its consequence is launch-blocking if ignored.** `keyGenerator` returns `rl:${session?.userId ?? "anon"}:${c.req.path}` (`rate-limit.ts:66-69`). On an unauthenticated route every caller on earth shares one bucket per path. `createRateLimiter` is therefore unusable for both 10e routes; `createCustomRateLimiter` (`rate-limit.ts:120-147`) with explicit keys is mandatory, per the `client-errors.ts` precedent.

**F-pre1 (pre-existing, reported not fixed).** `POST /api/auth/2fa/verify` uses `createRateLimiter(5, 60)` unauthenticated (`auth.ts:616`), so it carries exactly the shared-bucket property F5 describes: **5 requests per minute globally** across all users on that path. Its own comment at `:612-613` acknowledges the anonymous key without naming the global-collapse consequence. This is not 10e's to fix — but 10e multiplies the traffic reaching it (every TOTP-enabled magic-link login lands there), so its reachability materially increases. Queued as its own item; do not bundle.

**F6 — A5's FIND-S2 premise is confirmed exactly, and the fix has a constraint the prompt did not state.** `sendEmail` **returns `false`, it does not throw**, on missing API key, missing from-address, or Postmark exception (`email.ts:66-91`). The "await the send, honest error on hard failure" design point must branch on `=== false`; a `try/catch` around it would catch nothing and report success on every failure. Separately, `env.isDev` short-circuits to a log file and returns `true` (`email.ts:61-64`) — local development never sends mail, and the link must be read from `logs/email_dev.log`.

**F7 — The OIDC callback emits no `login.success`.** The no-TOTP happy path (`auth.ts:348-364`) writes only a fire-and-forget `lastLoginAt` update; `login.success` is emitted solely by `/2fa/verify` (`:747`). "Audit parity with OIDC" is therefore a lower bar than it sounds, and a magic-link path that *does* emit `login.success` would be **more** audited than Google sign-in, not equal to it. I propose emitting it anyway (a sign-in with no audit row is a gap, not a standard to match) and recording the resulting asymmetry rather than propagating the gap. Fixing the OIDC side is out of scope.

**F8 — `restore-repurge-lib.ts`'s `OWNED_TABLES` has no assertion behind it.** Of the five A6 sites, four go red if missed (`toHaveLength(14)`, the exclusions `.length` + deep-equal, the drill's both-directions table comparison). `OWNED_TABLES` (`restore-repurge-lib.ts:22-33`) is pinned by nothing — a missed entry is silent, and it is only observable during a disaster-recovery drill, i.e. the worst possible time. This is the same "no guard behind it" shape as FIND-B4-3. I propose adding the hermetic assertion described in A6.3 as part of 10e-1.

**F9 — TOTP QR labels use `external_id`, not email (pre-existing).** `generateTotpQrDataUri(secret, c.var.session.externalId)` (`auth.ts:498`) passes `externalId` into `authenticator.keyuri(email, ISSUER, secret)` (`totp-lib.ts:50-53`), whose first parameter is *named* `email`. For Google users the label is the numeric Google `sub`; under 10e a magic-link user's label would be a UUID. Both are user-hostile in an authenticator app, and 10e makes it differently weird rather than worse. **Recorded, not fixed** — changing it alters the TOTP account label for existing enrolled users, which is a migration concern, not a 10e concern.

**F10 — CLAUDE.md's contract-fixture count is stale.** The 10c-3 entry records "fixture 73→75"; the committed `apps/web/contract/frontend-calls.json` currently holds **64** entries. Later removals (10b-1, 9.5c, design-5.5) moved it and the line was never re-derived. Not a defect — a stale absolute, the exact class the derive-don't-carry rule names. 10e-4's prediction is stated as a delta (**+2**) against a figure re-measured at execution.

**F11 — the one-DDL-per-file rule collides with `drizzle-kit generate` for a new table.** Six statements, no supported way to split. No precedent in the repo. See **O2**.

**Premises that held, confirmed rather than assumed:** 10e-R1's threat model (nothing in the tree observes a GET-consume, so a scanner-burned token would be invisible — confirmed by the absence of any such instrumentation); the channel's atomic-consume design (a single `UPDATE ... WHERE consumed_at IS NULL` needs no transaction, and MySQL's `affectedRows` is the correct branch signal); "zero change to `/2fa/verify`" (it reads `authProvider`/`externalId`/`sessionVersion` from the DB at `auth.ts:651-663` and mints the session from those, so it works unchanged for a magic-link user); "zero change to `createSessionToken`" (its four-field `SessionData` is fully satisfiable by a magic-link user); and "no CSP change expected" (a same-origin `POST` from `/auth/magic` needs nothing beyond `connect-src 'self'`, so `deploy/Caddyfile` should not move and **8F4-R6 continues to wait**).

**On the channel's "no enumeration asymmetry by construction" claim:** it holds, but only if the response shape is *literally identical*, and there is one way to break it that is easy to walk into. The request endpoint must return one fixed envelope — `{ ok: true, data: { sent: true }, error: null, meta: {} }` — regardless of whether the email resolved to a user. A well-meaning "We've sent you a sign-in link" vs "We've sent you a link to create your account" distinction in the **HTTP response** (as opposed to in the *mail body*, where it is fine and desirable) reintroduces the oracle in one line. Worth pinning with a test that asserts byte-identical responses for a known and an unknown email.

**On uniform verify failure:** I recommend **HTTP 400** with a single code `MAGIC_LINK_INVALID` for all three cases (expired / consumed / never-existed), not 410. 410 *Gone* semantically asserts the resource once existed — which is a distinguishing signal for a never-existed token, and a semantic lie besides. 400 says nothing.

---

# Open questions requiring a channel ruling before implementation

**O1 — `setSessionCookie` extraction scope (A3).** Extract and convert all five call sites (four existing + the new one), or add the helper for the new site only and leave four hand-typed copies? I recommend **all five**; it is a zero-behaviour-change refactor provable by the existing auth tests staying green untouched, and the alternative is strictly worse than either extreme. But it touches the working production OIDC path, which the channel asked to leave alone, so I will not decide it.

**O2 — one-DDL-statement-per-file vs `drizzle-kit generate` (A7, F11).** `generate` emits six statements for one new table and offers no way to split them. I recommend accepting the six-statement file as one logical unit with a named, reasoned deviation (a half-applied `CREATE TABLE` on a table no deployed code reads is unambiguous and re-runnable, unlike the half-applied `ALTER` the rule was written against). The alternative — six migrations via the SC-3 barrel-index trick — buys nothing and adds five journal entries. A standing rule is not mine to relax.

**O3 — `login.success` on the magic-link path (F7).** The OIDC no-TOTP path emits no positive login audit event. Should magic-link emit `login.success` (more audited than Google sign-in, asymmetry recorded), or match the gap for parity? I recommend **emitting it** — a sign-in with no audit row is a gap to avoid propagating, not a standard to match.

**O4 — the audit vocabulary.** The channel's inclination is to reuse `login.*` with a distinguishing field rather than mint a parallel family. I agree and propose: `login.magic_link.requested`, `login.magic_link.consumed`, `login.magic_link.failed`, plus `login.pending_2fa` reused verbatim for the TOTP handoff and `account.reactivated` reused verbatim for the 10e-R3 reactivation. Confirmed from source: `GET /api/auth/profile/security-events` filters `event_type LIKE 'profile.%'` (`auth.ts:1098`), so **every one of these choices leaves that endpoint's output byte-identical** — and it must not be "fixed" to include login events without frontend coordination. Ruling requested on the exact strings, since they become part of the audit record permanently.

**O5 — Privacy Policy copy (A10).** Three sites need operator copy work before announcement: §2's account-data bullet (misattributes the email to Google), §5's Postmark line (understates a sign-in credential as "such as budget alerts"), and a retention statement for **pre-account** email addresses — the orphan class that §7 and §8 do not describe because their subject is an account holder. Not mine to draft. Ruling requested on whether the copy revision rides in 10e-close or lands as its own operator commit.

---

**Attribution.** Everything traceable to operator direction in this report derives from **"10e charter rulings, 2026-08-08"** (10e-R1 through 10e-R6), the only ruling block in force for this module. Every other judgement above — the UUID `external_id`, `auth_provider='email'`, `varchar(64)` over `char(64)`, `int` over `bigint`, the returned-promise FIND-S2 fix, extending `cleanup-account-tokens` rather than adding a fifth job, the 10e-3a/3b split, HTTP 400 over 410, and the recommendations attached to O1–O5 — is an **implementation choice**, labelled as such. No `AskUserQuestion` selection was made in this session.

---
---

# APPENDED VERBATIM — review-channel approval block

**"10e Phase A approval, 2026-08-08"** — reproduced as received. Markdown list markers were added where
the source enumerated items whose markers did not survive transmission; no words were changed.

---

## 10e-R7 — Phase A APPROVED, with the conditions in R9–R17

The report reconciles. Every A-item carries pasted source; the two premise-checks I asked to be falsifiable (A1 unique index, A4 anon bucket) were tested against the tree and reported in opposite directions, which is what a real check looks like. Persist the approved Phase A to docs/modules/phase4-10e.md as 10e's first commit, before any implementation, per the persist-first rule. The persisted document is the report as submitted, plus this ruling block appended verbatim.

All baseline figures in the report are DELTAS and are approved as deltas only. No absolute in the report (779, 795/3/0, 185/39, fixture 64) may be carried into a close-out. Each is re-derived at execution against the then-current measured baseline, per derive-don't-carry. The report's own F10 is the demonstration.

## 10e-R8 — Three channel findings WITHDRAWN on the record

All three are mine, all three were caught by reading the code.

1. The bigint schema sketch is WITHDRAWN (F3). users.id is int; a bigint FK cannot be created. int throughout, matching account_action_tokens.
2. The external_id nullability speculation is WITHDRAWN (F4). I asked whether the composite unique tolerates a NULL external_id. The column is NOT NULL with no default, so the question was malformed — a magic-link-first user must supply a per-user-unique value. crypto.randomUUID() with auth_provider = 'email' is APPROVED as the implementer's choice, on the implementer's reasoning (keeping PII out of an export-excluded column is the property that justified excluding it).
3. "Record the auth_provider drift, do not fix it" is WITHDRAWN as stated (F2). It was correct in the Google→email direction and wrong in the email→Google direction, where it is not a semantic nuance but an unhandled ER_DUP_ENTRY reaching app.onError as raw JSON mid-OAuth-redirect. The implementer's replacement line is ADOPTED verbatim: auth_provider + external_id name the OIDC identity currently bound to this account, if one has ever been used; otherwise they name the email-only identity. That line goes in Key architectural decisions. The auth_identities table stays out of scope — agreed on both sides.

## 10e-R9 — O1 RULED: extract all five, as its own commit, and give it a guard it does not have

Extract setSessionCookie + SESSION_COOKIE + SESSION_MAX_AGE_SECONDS to middleware/auth.ts and convert all five call sites (the four existing plus 10e's new one). The half-measure is refused for the reason given.

It lands as its own sub-commit, 10e-3a-EXTRACT, immediately preceding the verify endpoint — not folded into 10e-3a. A pure mechanical refactor of the production login path must be reviewable and revertable without a feature diff wrapped around it.

Conditions, because "the tests stay green" is not verification here. The report itself establishes that no test asserts httpOnly, secure, sameSite, maxAge or path on any of the four sites — so a extraction that silently drops an option is invisible to the entire suite. That makes tests-green a non-observer, and the standing rule says an observation window must be able to observe.

- (a) The close-out shows the five option sets before and after, as diff hunks, not prose.
- (b) A grep proving zero remaining setCookie(c, "statera_session" sites, with the matched-file list printed (not only the empty result).
- (c) A new hermetic test asserting the emitted Set-Cookie attributes on at least one route — HttpOnly, Secure, SameSite=Lax, Max-Age=2592000, Path=/ — proven able to fail by deleting one option and capturing the red. This is the whole justification for touching the OIDC path at all: the refactor is approved because it leaves the codebase with a guard it currently lacks, not merely because it deduplicates.
- (d) The four existing auth test files stay green and untouched — git diff --stat on them shows zero.

## 10e-R10 — O2 RULED: permanent carve-out, not a one-off exception, plus a recorded recovery procedure

The six-statement new-table migration is APPROVED, and the one-DDL-per-file standing rule is amended with a permanent, named carve-out rather than a this-module-only waiver:

Carve-out (10e, 2026-08-08): a single new table together with its own primary key, unique constraints, foreign keys and indexes is ONE DDL unit for the purposes of this rule, provided no deployed code reads the table at the time the migration runs. The rule's rationale is ambiguous partial state on an in-use object; a partially-created table that nothing queries is unambiguous. This does not relax the rule for any ALTER on an existing table, which remains one statement per file.

Reason for making it permanent rather than a one-off: every future new table hits this identically, drizzle-kit generate offers no way to split, and a standing rule that requires a fresh exception every module is a rule that gets quietly ignored. The scoped-deviation precedent (SC ruling (a)) was correct there because the DROP sequence genuinely was module-specific; this is not.

Condition — the report's re-runnability argument is half right and the gap must be closed in writing. drizzle emits no IF NOT EXISTS, and drizzle-orm/migrator.js records the journal entry only on success, so a mid-file failure leaves the table created, the entry unrecorded, and the next migrate failing on CREATE TABLE ... already exists — which aborts the deploy. That is recoverable but it is manual, and it must not be discovered live. The 10e-1 close-out records the recovery procedure verbatim:

```sql
-- Recovery for a partially-applied 0007. Safe ONLY because no deployed code
-- reads this table between 10e-1 and 10e-3a.
DROP TABLE `magic_link_tokens`;
-- then re-run the deploy; migrate reapplies 0007 from a clean state.
```

The safety precondition ("no deployed code reads it") is guaranteed by the sub-commit ordering, and the close-out must say so rather than leave it implicit.

## 10e-R11 — O3 + O4 RULED together: the vocabulary answers both

Three new strings, two reused verbatim:

| event | when |
|---|---|
| login.magic_link.requested | on accepted request, before the send |
| login.magic_link.success | on successful consume, no-TOTP path — session issued |
| login.magic_link.failed | invalid / expired / consumed / superseded |
| login.pending_2fa | reused verbatim — TOTP handoff |
| account.reactivated | reused verbatim — 10e-R3 reactivation |

login.magic_link.success is the answer to O3, in preference to a bare login.success. The implementer's recommendation (emit a positive event; do not propagate the OIDC gap) is ACCEPTED, but the specific string is changed. A bare login.success would need a detail field to stay distinguishable from the /2fa/verify emission, and no such field is established in auditSecurityEvent's signature in the report — I will not rule on a capability that has not been shown. A distinct string is self-distinguishing, depends on nothing unverified, and does not manufacture a false symmetry with a Google path that emits nothing at all.

BLOCKING sub-condition — no email address in any event payload. security_events rows are included in the GDPR data export and are purged by userId. A login.magic_link.requested row for an unknown email carries userId = NULL, so it is neither exported nor purgeable — putting the address in it would create a second orphan-email store, outside the cleanup job's reach and outside the deletion path, which is precisely the class the schema's own orphan-class comment exists to bound. The requested event records userId when known, IP, and user-agent. Never the address.

Confirmed and carried: GET /api/auth/profile/security-events filters event_type LIKE 'profile.%', so every string above leaves that endpoint byte-identical. It is not to be "fixed" to include login events without frontend coordination.

## 10e-R12 — O5 RULED: policy copy is its own operator commit, and it gates the DEPLOY

The three sites (§2 account-data bullet, §5 Postmark line, and a retention statement for the pre-account orphan class) are operator-drafted, in a standalone commit, not folded into 10e-close. It gates the deploy, not 10e-close's code: the moment magic-link is live, a policy saying the email comes from Google is inaccurate, and there is no lawyer-review gate behind it to catch that (waived by operator ruling, recorded).

LAST_UPDATED moves with the copy. The two testid-pinned commitment slots stay untouched. The implementer does not draft this copy; the implementer's job is to confirm at 10e-close that the commit exists and rides the deploy.

## 10e-R13 — F2 ACCEPTED as a finding, with two conditions on 10e-3b

The sub-commit split into 10e-3a / 10e-3b is APPROVED, and F2 is the reason the split is right.

Condition (a) — adoption requires a verified email claim. The lookup-then-adopt must not bind an existing account to an OIDC identity on the strength of an unverified email claim. Require email_verified === true in the claims before adopting; absent or false, do not adopt — fail closed with an explicit error rather than either inserting (which 500s) or binding (which is an account-takeover primitive). Google sets it, so this is a no-op today; the codebase is provider-agnostic by architectural decision, and the day a second provider is added is the day this becomes load-bearing. 10e-3b must report what the callback currently does with email_verified, since A2 does not show it.

Condition (b) — the second ER_DUP_ENTRY path is in 10e-3b's scope. The report found the not-found branch. It did not name the existing-active branch's unguarded email refresh (db.update(users).set({ email, ... }), A2), which hits users_email_unique identically if a Google user's provider-side email changes to an address already held by another Statera user. That path predates 10e — but 10e materially enlarges it, because magic-link creates users keyed on arbitrary user-supplied addresses rather than only on addresses Google issued. 10e-3b either handles it in the same lookup-and-branch structure, or scopes it out with reasoning stated in the close-out. Silently fixing one of two identical crash paths is not acceptable.

Recorded, not owed: adoption rewrites external_id while sessions carrying the old value remain valid. This is harmless because requireAuth validates via the Redis sv deny-list and does not re-check external_id — confirmed in the report's "premises that held." It is recorded so a future reader does not assume the JWT's externalId is authoritative.

## 10e-R14 — Uniform failure, and the supersession footgun is solved in copy, not in schema

HTTP 400 + a single code MAGIC_LINK_INVALID for expired, consumed, superseded and never-existed. The implementer's rejection of 410 Gone is ACCEPTED and its reasoning adopted: 410 asserts the resource once existed, which is itself the distinguishing signal the uniformity exists to suppress. The uppercase code matches the auth family (PENDING_2FA_GONE, ACCOUNT_INACTIVE).

The tension R2 creates, and its resolution. Supersession means a user who requests twice and clicks the first mail gets a failure — the single most common magic-link support case. Naming "superseded" in the response would fix the UX and reintroduce a distinction; adding a superseded_at column to distinguish it would grow the schema for a copy problem.

Ruled: no schema change, no response distinction, and the frontend copy enumerates every cause in one non-distinguishing string. Something of the shape: "This sign-in link is no longer valid. Links expire after 15 minutes, and requesting a new link replaces any earlier one. Request a fresh link below." One message, true in all four cases, tells the user exactly what to do, and leaks nothing. The /auth/magic page must render this with the request form directly beneath it — a dead end with no recovery affordance is the actual failure.

Pin it with a test asserting byte-identical responses for a known and an unknown email on the request endpoint, and byte-identical failure envelopes across the four verify cases. The implementer's own warning is right: a well-meant "we've sent you a sign-in link" vs "...a link to create your account" split in the HTTP response reintroduces the oracle in one line. In the mail body the distinction is fine and wanted.

## 10e-R15 — 10e-0 is RESCOPED: it proves domain authentication, not end-to-end delivery

The A9 run-sheet is APPROVED as written — the SPF single-record warning, the MX no-touch instruction, the p=none rationale, the Postmark-approval-state check, and the requirement to paste verbatim Authentication-Results: lines are all correct, and the account-approval check in particular is the kind of thing that fails silently at announcement.

But the run-sheet as scoped is at risk of being an observation window pointed slightly off-target. Step 6 sends through the Postmark UI composer. That proves DKIM/SPF/DMARC alignment for the domain. It does not prove that env.postmarkApiKey in production sops is that server's token, that env.mailFromAddress is a confirmed sender signature for the key in use, or that the MessageStream: "outbound" hardcoded at email.ts:84 resolves on that server. Those are exactly the seams that produce a green verification and a dead feature — the F1 shape.

Ruled:

1. 10e-0 is renamed and rescoped to "domain authentication proof." Its close-out states in its own words what it does and does not establish. Do not read POSTMARK_API_KEY, in whole or in part, out of sops for comparison — the 8c key-disclosure incident is the standing precedent, and no diagnostic is worth that.
2. A production end-to-end send proof is added to 10e-close, and it is an ANNOUNCEMENT GATE. After deploy: request a magic link on production against a real address, then confirm (i) the message appears in Postmark Activity for the production server — proving the production key and stream — and (ii) it arrives, with placement recorded and the Authentication-Results: line captured. Attestation that "the link worked" is the weakest evidence class and does not discharge this; the Activity entry and the header line are the artifacts.
3. 10e-0 remains a gate on 10e-2 as the report proposed. DNS propagation latency alone justifies the ordering.

## 10e-R16 — 10e-2's rate-limit tests are residue-immune BY CONSTRUCTION, designed in now

The report marks 10e-2 "probably no INTEGRATION cases." That underestimates it. Three new limiters on real Redis under INTEGRATION is the exact configuration that produced TODO(integration-rate-limit-test-isolation) — closed, reopened, widened, and finally closed durably at Task B / B1 — and inheriting that whole arc again would be avoidable rework.

Because 10e owns its key generators, the residue-immune option is available from the start and is REQUIRED: every rate-limit test uses a unique-per-run key (unique email, unique X-Real-IP), the routes/client-errors.integration.test.ts precedent. Not describe.skipIf(INTEGRATION), which retains the hermetic-only coverage gap the M1 fix had to settle for. The global-ceiling limiter, which by definition has a fixed key, is the one exception — for it, state the isolation approach explicitly in the 10e-2 proposal rather than discovering it in a red run.

10e-2 therefore does carry an INTEGRATION obligation. Assume it will, plan the run, capture the exit code.

## 10e-R17 — F8's guard, and the queue

F8 is ACCEPTED and the guard is required in 10e-1. OWNED_TABLES being the one site in the A6 chain with nothing behind it — silent when missed, observable only during a disaster-recovery drill — is the FIND-B4-3 shape exactly. Add the hermetic assertion pinning OWNED_TABLES against the purge's delete list, encoding the documented security_events difference rather than asserting equality, and prove it able to fail by removing one entry and capturing the red. An unproven guard is a claim.

The it title "is exactly the seven documented exclusions, in order" moves to eight. Prose inside an assertion name is exactly where stale numbers hide.

Recorded to the queue, none opened, none owed here:

- F-pre1 — /api/auth/2fa/verify runs createRateLimiter(5, 60) unauthenticated: 5/min globally, all users, one bucket. Pre-existing; 10e materially increases its reachability. Its own cycle, do not bundle.
- F7 — the OIDC no-TOTP path emits no positive login audit event at all. Its own cycle.
- F9 — TOTP QR labels use external_id; under 10e a magic-link user's label is a UUID. Changing it alters labels for enrolled users, so it is a migration concern. Recorded, not fixed.
- ix_users_email — redundant non-unique index on a column already uniquely constrained. Harmless, pre-existing, not 10e's.
- The PID-named test sink collision risk if email.test.ts is ever split. Recorded against a future split.
- Unchanged and still carried: EMITTED, the dashboard_metrics:* queue item, snapshot non-money type holes, FIND-B4-3, 8F4-R4, 8F4-R6 (still awaiting a Caddyfile-changing deploy — 10e is confirmed not to be it), RL-C1, the e2e disposition, the Sentry project rename, Tier 2 source maps (UNCHARTERED), and the "byte-identical" deploy-record tidy owed on the next CLAUDE.md-touching commit.

## Approved without amendment

Recorded so the implementer knows these were read and are settled, not merely unremarked: crypto.randomUUID() + auth_provider='email' (A1c); varchar(64) over char(64); all four indexes with their stated justifications; omitting request_ip/user_agent on the implementer's stronger argument, which is adopted over mine — security_events already records both on a surface that is exported, purged and age-bounded, none of which is true of an export-excluded table holding user_id = NULL rows; the returned-promise FIND-S2 fix, including the void → Promise<void> widening argument and the === false branch requirement it exposes; extending cleanup-account-tokens rather than adding a fifth job, on the four-new-things-that-can-be-committed-and-never-activated argument; the extended log line as the on-box discriminator, paired with the worker_task_runs query as an independent instrument; the orphan-class schema comment; the 24h/7d retention windows reused verbatim; and the no-transaction consume.

---
---

# Implementation deltas the approval block imposes on the Phase A report

Recorded here so the implementer does not have to reconcile the report against the ruling block by
reading both. **The ruling block above is authoritative wherever it and the report differ.** Nothing in
this section is new judgement — it is a pointer index into the two documents above.

| report said | ruling | authority |
|---|---|---|
| A8: `setSessionCookie` extraction folded into 10e-3a | its OWN sub-commit **10e-3a-EXTRACT**, immediately preceding 10e-3a, with conditions (a)–(d) | 10e-R9 |
| A7/O2: six-statement migration as a module-scoped deviation | **permanent named carve-out** amending the one-DDL-per-file standing rule; plus the `DROP TABLE` recovery procedure recorded verbatim in the 10e-1 close-out | 10e-R10 |
| O4: `login.magic_link.consumed` | **`login.magic_link.success`**; `.requested` and `.failed` unchanged; **BLOCKING: no email address in any event payload** | 10e-R11 |
| O5: ruling requested on placement | operator-drafted **standalone commit**; gates the **DEPLOY**, not 10e-close's code; implementer confirms at close that it exists and rides the deploy | 10e-R12 |
| 10e-3b: lookup-then-adopt | plus **(a)** `email_verified === true` required before adopting, fail closed otherwise, and report what the callback does with `email_verified` today; **(b)** the existing-active branch's unguarded email refresh is in scope — handle it or scope it out with reasoning | 10e-R13 |
| A8: 10e-2 "probably no INTEGRATION cases" | 10e-2 **does** carry an INTEGRATION obligation; every rate-limit test **residue-immune by construction** (unique-per-run email + `X-Real-IP`), NOT `describe.skipIf`; the fixed-key global ceiling states its isolation approach in the 10e-2 proposal | 10e-R16 |
| A9/10e-0: "deliverability verification" | rescoped to **"domain authentication proof"**, stating what it does and does not establish; **never read `POSTMARK_API_KEY` out of sops**; a production end-to-end send proof moves to 10e-close as an **ANNOUNCEMENT GATE** | 10e-R15 |
| A6.3/F8: guard proposed | guard **required** in 10e-1, and **proven able to fail** by removing one entry and capturing the red | 10e-R17 |
| A6.2: `it` title "seven … exclusions" | moves to **eight** | 10e-R17 |
| F2 replacement line | goes in **Key architectural decisions**, adopted verbatim | 10e-R8 |
| verify failure copy | one non-distinguishing string naming all four causes, rendered on `/auth/magic` **with the request form directly beneath it**; byte-identical-response tests on both endpoints | 10e-R14 |

---
---

# ERRATA

Corrections to the report above, appended as the work proceeded. **The original text is never
edited** — the error and its correction both stay visible, per the standing culture that
withdrawals are recorded rather than silently revised. Each entry names the sub-commit that
found it and the date.

## E1 — A5's `sendEmailBackground` caller claim is FALSE (found 10e-0 §c; recorded 10e-1, 2026-08-08)

**What A5 said.** In the FIND-S2 fix rationale ("The signature change is safe"), A5 wrote:

> every existing call site (`grep`: `budget-alerts-lib.ts`, and the module's own tests) ignores
> return values today

**What the tree says.** `sendEmailBackground` has **ZERO production callers.** Its only
invocation anywhere in `apps/api/src` is its own test:

```
apps/api/src/lib/email.test.ts:5:import { sendEmail, sendEmailBackground } from "./email"
apps/api/src/lib/email.test.ts:75:    await sendEmailBackground("bg@example.com", "Bg subject", "<p>bg</p>", "bg")
apps/api/src/lib/email.ts:112:export function sendEmailBackground(
```

The live email path does not pass through it at all. It is
`worker/jobs/budget-alerts-job.ts:160` → `sendTemplatedEmail` (`lib/email-templates.ts:63`) →
`sendEmail` (`lib/email-templates.ts:70`). Note also that the file A5 named — `budget-alerts-lib.ts`
— sends no email; the sending job is `worker/jobs/budget-alerts-job.ts`. **The claim is therefore
wrong twice over: wrong function, wrong file.**

**What this does and does not change.**

- It does **not** weaken the 10e-0 fix. The `void` → `Promise<void>` widening is *more* obviously
  safe with zero production callers than with one, and the fix was verified in both directions
  (race mechanically reproduced against the pre-fix code; fixed test shown able to fail) rather
  than resting on this claim.
- It **does** correct the record on what `sendEmailBackground` currently is: **dead production
  code with a live test**. 10e-2 is its first real caller, if the request endpoint uses it —
  which is now a decision to make explicitly rather than an existing pattern to follow. Recorded
  here so 10e-2 does not inherit "there is precedent for calling this" from a sentence that was
  never true.
- **Class:** an assertion about the tree, stated with a `grep:` prefix that implied it had been
  run, which the tree contradicts. The same shape as the standing rule's instance set — a search
  reported as evidence without the matched-file list printed. Had A5 pasted the match list, the
  absence of any non-test caller would have been visible in the paste.
