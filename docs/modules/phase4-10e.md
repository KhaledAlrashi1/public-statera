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

---
---

# RULING-SET COMPLETENESS — read before citing this file as the ruling record (2026-08-15)

This document's ruling blocks run **10e-R7 … 10e-R17** and stop there. That is not the module's full ruling set, and the gap is recorded rather than papered over.

- **R1–R6** are the charter rulings, referenced in the header and reproduced only in summary.
- **R5 is absent entirely, and R18–R35 appear in no artifact.** Recorded as **UNACCOUNTED-FOR** (10e-R50): the channel cannot distinguish *never issued* from *issued and never persisted*, and asserting either would be a claim without evidence.
- **R36–R101 were issued after this file was persisted and are on disk nowhere.** A verbatim backfill is **OWED**. Per **10e-R102** it is **blocked on source availability**, not effort — the verbatim text survives only in the predecessor conversations — and it must **NOT** be reconstructed from CLAUDE.md prose, close-out reports, or summaries, because a reconstructed ruling block is checkable-and-wrong, which 10e-R71 rates as worse than an uncheckable one.

Until the backfill lands, a citation of the form "per 10e-Rnn" for nn > 17 resolves to no artifact in this repository. **Cite it anyway**, with its number, date and title, so the gap stays visible instead of being routed around.

## AMENDMENT — 2026-08-20, under 10e-R170 (persistence commit)

The ranges above are superseded as follows. **The rule that a citation carries number, date AND title
(10e-R143) is unchanged and now applies to a smaller gap.**

- **10e-R140 … 10e-R170 are now PERSISTED**, verbatim, in the appended section at the end of this
  file. They no longer resolve to nothing, and citations of them can be checked.
- **10e-R147 — the gap is EXPLAINED and CLOSED (10e-R171, 2026-08-19).** ~~UNACCOUNTED-FOR~~. The
  original entry is struck rather than deleted, because the reasoning that produced it was sound and
  the record of a corrected inference is worth more than a tidy line. It read: *"No block relayed in
  the 10e-3b conversation contains it. Recorded on the 10e-R50 precedent rather than assumed skipped:
  never issued and issued and never relayed are not distinguishable from here, and asserting either
  would be a claim without evidence."* The channel supplied the third possibility neither disjunct
  covered: **it was issued, and relayed, as PROSE — never in block form.** A channel authoring
  defect, not a lost artifact and not a persistence failure. Nothing was lost. R147 is now written in
  block form in its numbered position above, with its provenance stated and not backdated.
- **R140–R173 are PERSISTED** (extended from R140–R170 by the 10e-RULINGS-PERSIST-2 commit).
- **10e-R103, 10e-R131 and 10e-R139 JOIN R36–R101 as issued-but-unpersisted** (10e-R143, 2026-08-19,
  "citations to unpersisted rulings carry number, date AND title"). They were cited during 10e-3a and
  10e-3a-CORRECTIONS and resolve to no artifact here. R103 in particular is load-bearing — it is the
  authority under which both test gates were skipped on `3e3357a` — which is exactly why a bare
  number is insufficient for it.
- **The backfill of R36–R101 remains OWED and BLOCKED on source availability** (10e-R102), now
  extended to R103, R131, R139 and, if it was ever issued, R147. Do **NOT** reconstruct any of them
  from CLAUDE.md prose, close-out reports or summaries: a reconstructed ruling block is
  checkable-and-wrong, which 10e-R71 rates as worse than an uncheckable one.

**Correction that travels with R140, never folded into it (10e-R148):** every occurrence of the SHA
`9c1b2e8` inside 10e-R140 denotes `3e3357a`. The adjacency marker is placed beside R140 in the
appended section; R140's own text is unedited.

## AMENDMENT — 2026-08-21, under 10e-R187(d) (10e-4 proposal commit)

- **10e-R174 … 10e-R187 are now PERSISTED**, verbatim, in the two appended sections at the end of
  this file (`^10e-R<n> — `, Format A). The persisted set is therefore **R7–R17, R140–R173 and
  R174–R187**. Fourteen rulings, not seven: 10e-R187(d) extended 10e-R180(d)'s original scope after
  the second ruling block was issued.
- **THIS FILE CARRIES RULING BLOCKS IN TWO HEADER FORMATS, and a single-format sweep is not evidence
  of absence (10e-R183, 2026-08-21, "FINDING 2 is ACCEPTED and INDEPENDENTLY VERIFIED. 10e-R180(e)
  is AMENDED").** Format **A** is a bare `^10e-R<n> — ` and covers **R140–R187**. Format **B** is a
  markdown heading `^## 10e-R<n> — ` and covers **R7–R17**. A Format-A sweep reports **10e-R14
  absent**, and R14 is the ruling governing 10e-4's verify-failure copy. Before checking whether a
  ruling is persisted here, **enumerate the formats, run each, and state which matched** — the
  header format is an assumption the instrument shares with the file, which is 10e-R168 on a third
  surface.
- **R103, R131, R139 and R36–R101 are unchanged** — still issued-but-unpersisted, still OWED and
  BLOCKED on source availability (10e-R102), still not to be reconstructed.
- **10e-R149 is PERSISTED and was misfiled once** (10e-R185, 2026-08-21, "FINDING 5's map is
  ACCEPTED with ONE CORRECTION"). It sits at `:1572`, Format A, inside the R148…R152 block. It is
  the permanent licence for skipping both test gates on a docs-only commit; cite **10e-R149,
  2026-08-19**, never 10e-R144, and do not re-run its premise measurement.
- **10e-R179's staleness claim about the contract-fixture absolute is WITHDRAWN** (10e-R182,
  2026-08-21, "FINDING 1 is ACCEPTED and it FALSIFIES THE CHANNEL"). A8's `64 → 66` at `:913` is
  CURRENT: the fixture measured 64 entries at `c6103c5`. R179's *obligation* — derive the absolute
  at execution and state the movement as a delta — stands unchanged.

## AMENDMENT — 2026-08-21, under 10e-R203(c) + 10e-R204(d) (10e-4 boundary persistence commit)

- **10e-R188 … 10e-R204 are now PERSISTED**, verbatim, in the four appended sections at the end
  of this file (Format A). The persisted set is therefore **R7–R17 (Format B)** and
  **R140–R204 (Format A)** — 65 Format-A blocks, contiguous, no gaps.
- **This persistence deliberately rides the 10e-4 BOUNDARY, not 10e-close** (10e-R203(c)). 10e-R202
  had assigned it to 10e-close; the conversation boundary falls between the two, and rulings living
  only in a conversation across a handoff is **the R36–R101 gap forming prospectively**. The
  persist-first standing rule says the record is written BEFORE the boundary.
- **The set's COUNT moved three times and each figure was correct when written** — R202 fifteen,
  R203(d) sixteen, R204(d) seventeen. A count describing the set it belongs to is falsified by any
  addition to that set (10e-R118, interval collapsed to zero). The committed figure was **derived
  from the blocks actually held at commit time** and reconciled against 204 − 188 + 1 = 17, not
  carried from any of the three.
- **10e-R196 … 10e-R202 were NEVER DELIVERED when first issued** (10e-R204(b)). The block was
  pasted backward into the channel instead of forward, so the channel received its own output and
  recorded it as an echo under 10e-R203(a) — a disposition now WITHDRAWN, with the withdrawal
  placed beside R203(a) rather than folded into it. The gap ran a full cycle and closed only
  because the implementer's BLOCKED report **enumerated which numbers it held** rather than
  reconstructing the missing seven. Non-delivery and supersession markers travel beside the
  affected blocks; their text is unedited (10e-R148 precedent).
- **R103, R131, R139 and R36–R101 are unchanged** — still issued-but-unpersisted, still OWED and
  BLOCKED on source availability (10e-R102), still not to be reconstructed.

## AMENDMENT — 2026-08-22, under 10e-R240 (ruling-recovery persistence commit)

- **10e-R205 … 10e-R209 and 10e-R237 … 10e-R241 are now PERSISTED**, verbatim, in the appended
  section at the end of this file (Format A). The persisted set is therefore **R7–R17 (Format B,
  11 blocks)** and **R140–R209 + R237–R241 (Format A, 75 blocks)**. The 75 was **derived at commit
  time** from the blocks actually present and reconciled two ways — 65 + 10 = 75 and
  (209 − 140 + 1) + 5 = 75 — not carried from 10e-R240(d), because a count describing the set it
  belongs to is falsified by any addition to that set (10e-R118).
- **PROVENANCE — R205–R209 were RECOVERED, not held (10e-R238, 2026-08-22).** They were issued in
  the predecessor conversation and crossed the 10e-4 → 10e-close session boundary in an
  implementer's context only. **They were lost.** The successor implementer reported NOT-HELD for
  five of five, enumerated the total absence, and **refused to reconstruct them** from the
  subject-matter references present in its own prompt. The channel then read them verbatim out of
  the predecessor conversation *"Module state and deployment gates documentation"*
  (`c0b7cd9b-8d4e-4f64-8f5a-cb89b35d6043`), turns 15 and 17 — the message in which the channel
  originally authored them. **Recovered from the author's own emission; NOT reconstructed from
  prose, CLAUDE.md, close-out reports or summaries.** Their line counts closed **three ways**: the
  channel's enumeration and the predecessor's hold confirmation both gave 54, 26, 14, 47, 43, and
  the mechanical enumeration at commit time agreed with both.
- **10e-R210 … 10e-R236 ARE NOT MISSING AND ARE NOT OWED.** They were procedural — prompts,
  acceptances and reconciliations consumed within the predecessor session — and were recorded as
  not owed persistence at the 10e-close handoff. This is written down deliberately: without it,
  twenty-seven numbers become **UNACCOUNTED-FOR** by default the first time anyone runs a
  contiguity check, and the record could not then distinguish a deliberate omission from the
  R36–R101 mechanism.
- **FORMAT A IS NO LONGER CONTIGUOUS, AND THAT IS BY DESIGN.** The shape is **140 … 209
  contiguous**, then a **deliberate gap at 210 … 236**, then **237 … 241 contiguous**. A future
  presence check must **not** read that gap as loss.
- **NO RULING CROSSES A SESSION BOUNDARY IN AN IMPLEMENTER'S CONTEXT (10e-R239, 2026-08-22).** The
  hold attestation is **retired as an evidence class**: it attests to a STATE at an instant, never
  to a property that survives, and unlike a stale figure its expiry leaves **no trace** — nothing
  to re-derive, nothing that stops agreeing with anything. The medium for a ruling that must
  survive a boundary is **disk**, and the persistence commit is written **before** the boundary.
  R209 is the control that proves it: of the five blocks issued after `3e4645c`, R209 alone
  travelled verbatim **inside the handoff prompt**, and R209 alone needed no recovery.
- **R103, R131, R139 and R36–R101 are unchanged** — still issued-but-unpersisted, still OWED,
  still not to be reconstructed. **Their BLOCKED status is under review (10e-R241, 2026-08-22):**
  10e-R102's premise was **ACCESS, not existence**, and it has now been falsified once for
  in-project conversations by this very recovery. That is a **HYPOTHESIS with one supporting
  observation**, scoped to its **own cycle** — it is **not** a licence to reconstruct anything,
  and it was **not** acted on here.

## AMENDMENT — 2026-08-22, under 10e-R250(b) + 10e-R252 §2 (10e-close ruling-persistence commit)

- **10e-R242 … 10e-R252 are now PERSISTED**, verbatim, in the appended section at the end of
  this file (Format A). The persisted set is therefore **R7–R17 (Format B, 11 blocks)** and
  **R140–R209 + R237–R252 (Format A, 86 blocks)**. The 86 was **derived at commit time** from
  the blocks actually present and reconciled two ways — 75 + 11 = 86 and
  (209 − 140 + 1) + (252 − 237 + 1) = 70 + 16 = 86 (10e-R118).
- **PROVENANCE — RELAYED, and one of them RELAYED LATE.** All eleven arrived as text in the
  review channel; this is a different class from R205–R209, which were **RECOVERED** after being
  lost across a session boundary (10e-R238). **10e-R243 was authored 2026-08-22, emitted without
  the relay marking, and never delivered when first issued** — authored, self-contained, correct
  and invisible to the relay. It was relayed under **10e-R251** only after the implementer's
  enumeration of its held set reported a gap at 243. Its text is persisted **unedited**: clause
  (f) still reads "OWED, UNCHANGED" for Items 1 and 2, which 10e-R244 closed the same day, and
  under 10e-R78 a historical record is not rewritten to agree with what happened next — the
  correction travels adjacent, in 10e-R251.
- **THE 242 … 252 RUN IS CONTIGUOUS. There is no second deliberate gap** (10e-R251). Format A's
  shape is now: **140 … 209 contiguous**, the **deliberate gap at 210 … 236**, then
  **237 … 252 contiguous**.
- **ENUMERATION IS THE ONLY INSTRUMENT THAT HAS EVER DETECTED THE RELAY-FAULT CLASS** (10e-R251).
  Three faults in this module were found by an implementer enumerating which ruling numbers it
  held, and by nothing else: R196–R202 (pasted backward, never delivered), R205–R209 (lost across
  a session boundary), and R243 (emitted unmarked). None was detectable from either end alone —
  the author's record shows a block written, the implementer's shows a block absent, and no
  message contradicts either.
- **AN UNANCHORED GREP FOR A RULING NUMBER NO LONGER RETURNS THE BLOCK COUNT** (10e-R242,
  10e-R244). Each persisted ruling now appears at least **twice** — once in its `^10e-R<n> — `
  Format-A header and once in its `## Review-channel ruling block — 10e-R<n>` section heading.
  Anchored presence checks are unaffected. An unanchored one is measuring something else, which
  is 10e-R171's family.
- **R103, R131, R139 and R36–R101 are unchanged** — still issued-but-unpersisted, still OWED,
  still not to be reconstructed. 10e-R241's recovery hypothesis is **not** acted on here.

---
---

# APPENDED RULING BLOCKS — 10e-R140 … 10e-R170 (persisted 2026-08-20 under 10e-R170)

Pasted from the review channel **verbatim**, not reconstructed and not summarized, per
10e-R102 and 10e-R143. The original text of each block is unedited; the only additions are
the section headers and the adjacency marker under 10e-R140 required by 10e-R148.

**10e-R147 is ABSENT.** No block received in this conversation contains it. Recorded as
**UNACCOUNTED-FOR** on the 10e-R50 precedent: the channel cannot distinguish *never issued*
from *issued and never relayed*, and asserting either would be a claim without evidence.

---

## Review-channel ruling block — 10e-R140 … 10e-R146, 2026-08-19

10e-R140 — 10e-3a-CORRECTIONS (9c1b2e8) is ACCEPTED. Its content reconciles; its evidence does not, in four named ways.

> **ADJACENCY MARKER (10e-R148, 2026-08-19) — travels beside 10e-R140, never folded into it.**
> Every occurrence of `9c1b2e8` in 10e-R140 denotes **`3e3357a`**. The SHA `9c1b2e8` never
> existed in this repository (`git cat-file -t` → `fatal: Not a valid object name`, rc=128;
> zero reflog hits); it entered the record through the relayed 10e-3a-CORRECTIONS close-out,
> was carried into 10e-R140 as an identifier, and was never round-tripped against the
> repository by anyone. Correspondence to `3e3357a` was established by CONTENT — its
> `git show --stat` matched the relayed stat block (`CLAUDE.md | 5 ++++-`,
> `docs/modules/phase4-10e-3a-proposal.md | 16 ++++++++++++++++`, `2 files changed,
> 20 insertions(+), 1 deletion(-)`) — which is the only way it could now be established.
> **Class:** a SHA that appears only inside a relayed report and is never round-tripped
> against the repository is a LABEL, not an identifier. Second instance this module.

The channel verified the content independently against the attached copies of CLAUDE.md and the proposal: lines 436/437/438 are R135, R137a, R137b in ruled order; the 16-line insertion sits after C3's "Tension reported" block with the original untouched; line 114 carries R136's closure and R138's two notes. The commit is right. But every one of those checks was performed channel-side against a snapshot whose correspondence to 9c1b2e8 is itself unattested — the report supplied none of it. The four defects:

(a) "The proposal hunk is printed verbatim above" — it was not. The relayed report contains one verbatim block, the --stat. A report may not describe evidence the channel never received; the relay boundary is where evidence exists or does not.
(b) The CLAUDE.md hunks were given as headers only. See R141.
(c) grep -c '10e-R135' CLAUDE.md returning 0 at the start of the commit is a past-tense, uncaptured, now-unrepeatable claim — the operator-attestation class. Not remediable; recorded and not held against the commit. The post-state was observable and was not captured; Step 0 closes it.
(d) (no output = clean). An annotation substituted for the distinguishing observation. Instance, not a new rule.

(a) and (d) are recorded. (b) and (c) are remediated by Step 0 above.

10e-R141 — a diff header proves the SHAPE of a change, not its CONTENT. New standing rule.

@@ -435,0 +436,3 @@ establishes that exactly three lines were inserted at that point and nothing above them moved. That is real and load-bearing, and the report was right to read it that way. It does not establish that those three lines are R135, R137a and R137b, and it does not establish their order — which is the property R139 ruled on. The report wrote that +3 "confirms" the identity and order of the three rules. It confirms neither.

This is 10e-R135 one level up: a positive control on a compound instrument proves the pattern fired, not that any particular alternative did. A hunk header is a structural instrument; identity and order need a content instrument. When a ruling names which lines and in what order, the closing evidence is a grep -n returning them with ascending line numbers, not a header.

Add to CLAUDE.md's standing rules, one line, riding the 10e-3b docs half: A diff header proves the shape of a change, not its content (10e-R141, earned 10e-3a-CORRECTIONS, 2026-08-19). Where a ruling names specific lines or their order, close with grep -n output, not a hunk header.

10e-R142 — a manifest of N ruled items closes with N presence assertions. New standing rule.

R135 was owed to 10e-3a's docs half and was not shipped. It was caught a commit later, and the report is exact about why: R139 named the final order, and printing the whole list in file order surfaced an absence that nobody had checked for. That is luck with a good shape, not a control. Reading a finished list and finding it plausible is not a presence check — the omitted item is precisely the one not on the list you are reading.

Ruled: when a ruling block assigns N items to a docs commit, the close-out carries N presence assertions, one per item, captured — a single grep -n per ruled identifier, or one grep with an alternation whose match count is stated and compared against N. The check is per item, and it is run before the commit, not after.

Add to CLAUDE.md's standing rules, one line, riding the 10e-3b docs half: A docs manifest of N ruled items closes with N per-item presence assertions (10e-R142, earned 10e-3a-CORRECTIONS, 2026-08-19). Reading the finished list is not a presence check; the missing item is the one not on the list.

10e-R143 — citations to unpersisted rulings carry number, date AND title. BLOCKING for the 10e-3b proposal and its close-out.

The close-out cited "R103 §4's scoped disposition" and "R139 named the final order." Both resolve to no artifact in this repository, and neither appears in this conversation's channel record. That is expected and is not the defect — phase4-10e.md's completeness note anticipates exactly this and instructs that such rulings be cited anyway, with number, date and title, so the gap stays visible instead of being routed around. The report supplied numbers only.

The requirement is not bookkeeping. R103 §4 is the authority under which both test gates were skipped on 9c1b2e8. A number alone gives a later reader nothing to search for and no way to tell a real citation from a misremembered one. Every citation of a ruling above 10e-R17 in the 10e-3b proposal and close-out carries its number, its date, and its title. If you hold the number but not the date or title, say so in those words rather than emitting a bare number.

This is a new instance of the 10e-R102 class and is recorded as such: R103, R131 and R139 join R36–R101 as issued-but-unpersisted. The backfill remains OWED and BLOCKED on source availability. Do not reconstruct any of them from prose, close-outs or summaries.

10e-R144 — the docs-only gate disposition is RATIFIED on independent grounds; R137's reconciliation is ACCEPTED; the gate-direction inversion gets one durable line.

(a) Skipping the hermetic and INTEGRATION gates on a commit touching only CLAUDE.md and docs/modules/ is correct, and the channel ratifies it on its own reasoning rather than by inheriting a citation it cannot check. The single premise the reasoning rests on — that nothing under apps/ reads those paths — is measured once at Step 0 and then never again.

(b) R137's skipped-delta reconciliation is accepted, and the self-analysis is better than the prediction it corrects. Hermetic skipped 25 → 31 from six INTEGRATION-gated cases (I1–I5 per 10e-R126 plus the real per-IP case per 10e-R108/R121); INTEGRATION skipped 8 → 10 from the two hermetic-only cases in the skipIf(INTEGRATION) describe. Both halves are consistent with the ruling record and with the two-mode cross-check 856 + 31 − 10 = 877. The report's own verdict — that the +1 was not a near-miss on +6 but a figure computed about a different column — is the correct reading and is exactly what 10e-R137b was written to produce.

(c) The root error was an inverted model of which gate skips in which direction, and that model is load-bearing for the cross-check instrument. One line to CLAUDE.md, riding the 10e-3b docs half, stating both idioms and the column each lands in: describe.skipIf(!INTEGRATION) runs only under INTEGRATION and therefore lands in the hermetic skipped column; describe.skipIf(INTEGRATION) is hermetic-only and lands in the INTEGRATION skipped column. Attribute to 10e-R144, 2026-08-19.

10e-R145 — 10e-3b's scope. Five items, and the fifth is a question the channel is asking, not a premise it is supplying.

10e-R13(a) — the email_verified === true gate before adopting, failing closed. R13(a) also requires you to report what the callback does with email_verified today, since A2 does not show it. From source, pasted, with the matched-line list from an enumeration of email_verified across the callback and the claims-handling path.
10e-R13(b) — the existing-active branch's unguarded email refresh, db.update(users).set({ email, … }), which hits users_email_unique identically to the not-found branch. Handle it in the same lookup-and-branch structure, or scope it out with reasoning. R13(b)'s closing sentence governs: silently fixing one of two identical crash paths is not acceptable.
The lookup-then-adopt itself — F2's not-found branch, which is the substance of the sub-step.

10e-R132's carried coverage gap — the OIDC callback's TOTP branch has no route-level test coverage; auth.callback.test.ts is reported to set totpEnabled: false at both of its only two sites. 10e-3b modifies that callback, so it closes the gap. Establish the gap by measurement, with the matched-line list printed, rather than inheriting it from this prompt or from EXTRACT-2's finding. If the enumeration contradicts the claim, that is a finding and it outranks the prompt. Note the asymmetry the channel is trading on: 10e-3a's hermetic case 10 already gives the magic-link TOTP handoff the route-level coverage the OIDC handoff has never had.
A channel question, unmeasured, which you may falsify. 10e-R122 ruled that verify's adopt is the mirror image of 10e-3b's adopt and needs a mirror-image gate — the arrow ran 3b → 3a. The channel now asks whether it runs back. R13(a) gates on the claim being verified. R122(b) gates on the match being exact. Those are different guards, and R13(a) does not imply R122(b). If the OIDC adopt performs its lookup with an ai_ci comparison, then a provider account with a verified josé@x.com whose lookup finds a stored jose@x.com would adopt across an accent boundary with email_verified === true satisfied — R13(a) held and R122's exposure open, in the opposite direction from the T0–T2 race.

The channel has not measured this and is not asserting it. Establish first, from source and against the live dev DB with a discriminating control, exactly as 10e-R122(a) required of the verify side: (i) what comparison the OIDC adopt lookup actually performs, pasted from source; (ii) whether that comparison is accent-insensitive in this schema, measured, with an _as_cs control returning the discriminating value. Then state whether R122(b)'s exact-adoption rule applies here, and if it does, propose the guard. If either premise falsifies, report the falsification and propose nothing — a falsified premise is a better outcome than a guard built on a bad one.

Explicitly out of scope, do not bundle: 10e-R129 (cross-family token presentation — three token families signing with one secret and no family-distinguishing claim, and specifically whether verifyDeleteIntentToken accepts a statera_pending_2fa token). It is a HYPOTHESIS, unmeasured, with its own cycle post-10e. Also out of scope: 10e-4 frontend work, the operator-drafted privacy copy (10e-R12), and anything belonging to 10e-close.

10e-R146 — form of the deliverable, and the stop.

(a) Proposal only. Stop when the proposal is delivered. No implementation, no apps/ writes, no commits beyond (b). Nothing is authorized past the proposal and the Step 0 block.

(b) If the proposal is too large to relay in chat, commit it docs-only as docs/modules/phase4-10e-3b-proposal.md with its approval status on its face in a header — STATUS: PROPOSED, NOT APPROVED — before review, per 10e-R105. The three docs lines from R141, R142 and R144(c) ride that commit. If it is small enough to relay, relay it and the three lines wait for the 10e-3b docs half.

(c) Every enumeration is falsifiable: matched-file and matched-line lists printed, including the ones that came back inconvenient. Every claim about current behaviour carries pasted source. An assertion in a document is not a measurement.

(d) The predicted test-count delta is derived from an explicit case list with the row-vs-test distinction explicit (10e-R126, 2026-08-15) — a count the reader has to reconcile against rows is the defect that ruling names. State which gate idiom each new case uses and therefore which skipped column it lands in, per R144(c).

(e) Every guard proposed is proposed together with how it will be proven able to fail, in both directions, and every failure-injection test asserts the specific expected error, not merely that something failed.

(f) INTEGRATION-gated describes live in a dedicated *.integration.test.ts file. If the proposal adds any external resource, the Caddyfile CSP change rides the same commit.

(g) State the baselines you will re-derive at execution rather than restating these: hermetic 856 / 31 / 60 files exit 0, INTEGRATION 877 / 10 / 0 exit 0, cross-check 856 + 31 − 10 = 877, tsc 0, frontend 185 / 39 carried unverified by design. Re-derive every absolute at execution time. Carry nothing.

(h) Do not write "two independent instruments" (10e-R134). The counts are demonstrated non-discriminating in both directions; the Errors grep is demonstrated capable of firing; its independence from the exit code is undemonstrated and is a bounded unknown owed to 10e-close.

---

## Review-channel ruling block — 10e-R147, 2026-08-19

**Provenance, stated plainly and not backdated (10e-R171, 2026-08-19, "R147's absence is EXPLAINED
and CLOSED. It was never a block."):** this ruling was **issued as prose** on 2026-08-19, in a reply
to the operator under the heading "Postmark approval — ruling block". It was numbered and dated but
**never written in block form**, which is why the 10e-R170 sweep of R140–R170 found no header for it
and why 10e-RULINGS-PERSIST recorded it as UNACCOUNTED-FOR. That was a **channel authoring defect,
not a lost artifact**. It is rendered in block form the same date under 10e-R171 and persisted here
on 2026-08-20. It was **not** a block before that, and nothing in this file should be read as
implying otherwise.

10e-R147 — Postmark account approval has CLEARED. The 10e-R15 announcement gate loses its external dependency; the send proof does not go with it.

Postmark account approval CLEARED 2026-08-19, recorded on operator attestation. The 10e-R15 announcement gate loses its external dependency and becomes schedulable. Approval clearing does not discharge the production end-to-end send proof — request a magic link on production against a real address, confirm the message appears in Postmark Activity for the production server, confirm arrival, paste the Authentication-Results: lines verbatim. The standing prohibition on reading POSTMARK_API_KEY out of sops for comparison is unchanged, and the 2026-08-14 rotation precedent stands: screenshot configuration screens, never code samples. R43 sits in the blocked-backfill range and must not be reconstructed to attach this to.

---

## Review-channel ruling block — 10e-R148 … 10e-R152, 2026-08-19

Both STOP conditions are correctly raised. Both are channel errors, not implementer errors. Neither halts 10e-3b once this block lands.

10e-R148 — 3e3357a IS the target. 9c1b2e8 never existed and was a channel transcription artifact.

git cat-file -t 9c1b2e8 rc=128 with zero reflog hits settles it: the SHA is absent, not renamed, not amended-away. It entered the record through the relayed 10e-3a-CORRECTIONS close-out, was carried into 10e-R140 as an identifier, and was never round-tripped against the repository by anyone. Refusing to proceed against it was the correct call and is exactly what the instruction was written for.

10e-R140 is not rewritten. It stands as issued, with this correction adjacent: every occurrence of 9c1b2e8 in 10e-R140 denotes 3e3357a, corrected 2026-08-19 under 10e-R148. When R140 is persisted, the correction is persisted adjacent to it, never folded into it.

One command closes the correspondence, and it is the last Step 0 item:

git show --stat 3e3357a

Compare it against the stat block the earlier close-out relayed — CLAUDE.md | 5 ++++-, docs/modules/phase4-10e-3a-proposal.md | 16 ++++++++++++++++, 2 files changed, 20 insertions(+), 1 deletion(-). If it matches, correspondence is established by content, which is the only way it can now be established, and the label question closes. If it does not match, STOP and report.

Recorded as a class, because it is the second instance this module: a SHA that appears only inside a relayed report and is never round-tripped against the repository is a label, not an identifier. The channel treated one as the other in R140 and built a disposition on it. The content of that disposition survives — the three-grep discharge below is what actually carried it — but the identifier did not.

10e-R149 — R144(a)'s instrument was MIS-SPECIFIED BY THE CHANNEL. Re-specified; the premise HOLDS; licensing attaches to the new instrument.

The premise is does anything under apps/ read CLAUDE.md or docs/. I specified a mention-count and predicted 0. Those are different questions, and 12 is the correct answer to the one I asked. Reporting the literal result and refusing to reinterpret it into the expected answer is right; reinterpreting would have been narrating, and the report says so in the correct words.

Re-specified instrument, which you already ran: read-idiom (readFile*/fs./import() intersected with doc-path (.md/docs//CLAUDE). Result: 8 hits, all in vendored apps/web/node_modules/.ignored/@types/node/*.d.ts, zero in project source.

That zero is discriminating, and here is why it survives 10e-R135 — the compound is an intersection, and each limb is independently demonstrated capable of firing in scope:

the read-idiom limb fires 49 times under apps/ (your positive control);
the path limb fires 12 times in apps/ project source — the mis-specified mention-count is what proves it, so the failed measurement is what makes its replacement discriminating;
and the compound itself fires 8 times, in vendored code. An instrument that returns zero in scope after firing 8 times out of scope is not silent, it is negative.

The 12 mentions are characterized and dismissed on their content, not on convenience: 11 comment lines and 1 string literal in a test assertion message (money-wire-shape.test.ts:428). A comment is not an executable input, and an assertion message is a label on a failure, not a read — neither would change behaviour if the referenced file changed.

Ruled: R144(a)'s premise HOLDS. The docs-only gate disposition is licensed permanently and this measurement is not repeated. The licence attaches to the read-shaped instrument named here, not to the mention-count, and any future citation of it cites 10e-R149, 2026-08-19, not R144.

10e-R150 — A PREDICTED VALUE THAT EQUALS THE INSTRUMENT'S FAILURE OUTPUT IS NOT AN OBSERVATION. New standing rule, earned here.

--include=*.ts unquoted under zsh glob-expanded, hit nomatch, and errored the whole command; grep never ran; wc -l then printed 0 on empty input. I had predicted 0 and paired that prediction with a permanent licensing decision. So the prompt specified an instrument whose failure output was byte-identical to its predicted success output, and attached an irreversible consequence to the value both produce. Quoting the globs flipped it 0 → 12. Had the first zero been accepted, the docs-only gate would now be permanently licensed on the strength of a command that did not execute.

The standing observer rule ("an empty result is not an observation until its two causes are distinguished") would have caught it — but only after the fact, and only because the error message happened to print directly above. That is not a control, that is adjacency.

Ruled, and this is the generalisable content: before pairing a predicted value with a consequential decision, check whether the instrument's null or failure output equals the prediction. If it does, the instrument cannot distinguish success from non-execution and must be re-specified — invert the prediction, add a positive control in the same block, or capture the return code separately. Zero is the canonical dangerous prediction, because it is what most broken pipelines emit.

Add to CLAUDE.md's standing rules, one line, riding the 10e-3b docs half: A predicted value that equals the instrument's failure output is not an observation (10e-R150, earned 10e-3b Step 0, 2026-08-19). Zero is the canonical dangerous prediction. Re-specify, or pair with a positive control in the same block.

10e-R151 — command blocks are written for the shell Step 0 names. Channel obligation.

rc=${PIPESTATUS[0]} printed empty: PIPESTATUS is bash; zsh names it pipestatus and 1-indexes. The return code was never captured, so the distinction the wc-form existed to make was not made — the second bash-ism in one block, in a session whose first line correctly reported zsh. Step 0's shell-context confirmation is load-bearing and the channel wrote past its own answer.

Standing, from here: glob-bearing arguments are always quoted (--include='*.ts'); return codes are captured with an explicit $? on a line after a non-piped command, never via a shell-specific pipe array; and where a construct differs across bash and zsh, the block uses the neutral form or names the shell it targets. Your tempfile-plus-explicit-$?-plus-byte-count repair is the correct pattern and is adopted.

10e-R152 — Step 0 is DISCHARGED apart from R148's one command. 10e-3b proceeds, unchanged.

Discharged: HEAD 3e3357a (per R148), unshipped count 13 rc=0, tree clean at 0 lines / 0 bytes / rc=0 with a 3-line positive control distinguishing clean from did-not-run, and R140(b)/(c)'s post-state presence-and-order proof — 436/437/438, ascending, ruled order, re-run as three separate greps with a negative control (10e-R137c → 0, rc=1) rather than accepted from the three-way alternation. That is 10e-R135 applied to the channel's own command form, unprompted, and it is the standard.

Run R148's git show --stat 3e3357a, report it, and then proceed directly into the 10e-3b proposal under 10e-R145 (five items) and 10e-R146 (form and the hard stop), both unchanged. Your two flags are correct and are confirmed: R145 item 5 is a channel question to be falsified by measurement against the live dev DB with an _as_cs control, not a premise to build on; and "number held, date/title not held" is the required honest form under 10e-R143 wherever that is the true state.

Three docs lines now ride the 10e-3b docs half rather than two: 10e-R141, 10e-R142, 10e-R144(c), plus 10e-R150 above — four. Per 10e-R142 that closes with four per-item presence assertions, one grep each, run before the commit.

---

## Review-channel ruling block — 10e-R153 … 10e-R159, 2026-08-19

10e-R153 — the proposal is ruled from its SUMMARY. Departure named, scope of the ruling bounded.

f59efc2 is committed with status on its face per 10e-R146(b) and was not relayed. The channel has no repository access, so every ruling below rests on your summary and on the persisted record — not on the artifact. This is a departure from artifact-based review and is recorded as one, not absorbed. Its practical consequence: nothing below ratifies proposal text the channel has not read. Where a ruling appears to approve a section, it approves the shape reported, and a divergence between the summary and f59efc2 resolves in favour of the artifact and comes back to the channel.

Three things must be relayed in chat before implementation. All are small.

§1.5 verbatim — the three audit strings and the reason-literal set. See R159.
The callback's existing failure-redirect forms — every non-success exit from GET /callback today, with its target and any query param, as an enumeration with matched lines printed. Needed for R158.
§0.2's scope statement as you will restate it after R154.

10e-R154 — F-3b-1 is ACCEPTED and §0.2 is CONFIRMED: the third crash path is IN SCOPE. And the reactivate branch owes one more report.

R13(b) named two paths and closed with the sentence that decides this: silently fixing one of two identical crash paths is not acceptable. That sentence does not depend on the number two. You found a third — auth.ts:228-237, the reactivate branch's set() writing email exactly as unguarded — and applying R13(b)'s own reasoning to R13(b) is the correct move. Fixing two of three would reproduce the defect the ruling exists to prevent, one instance further along.

All three paths are in scope. Handle them in one lookup-and-branch structure, or scope any of them out with reasoning in the close-out — the same disposition R13(b) offered for the path it named now extends to the path it did not.

Declining to widen your own scope by assertion and asking instead was right, and it is the standard: a finding that enlarges the implementer's mandate is a request, never a self-grant.

One further report owed on that branch, and it is load-bearing. Your design routes an adopted soft-deleted row into reactivate-as-fresh. On the magic-link side, F-3a-3 ruled that sessionVersion is read as-is and never re-bumped — the purge already bumped it at 10d-0a, and a re-bump issues a token the sv_revoked key does not cover, silently widening the revocation window. State from source what the OIDC reactivate branch does with sessionVersion today, and whether F-3a-3's ruling applies to it unchanged. If the two branches disagree, that is a finding and it outranks the design.

10e-R155 — F-3b-2 is ACCEPTED, and the retention is LOAD-BEARING, not a defect. Recorded and queued; do not fix it in 10e-3b.

purgeUserAccountRows's terminal soft-delete never clearing users.email is what makes every one of these ER_DUP_ENTRY paths reachable in practice rather than theoretically, and establishing that is what turns R13(b) from a hypothesis into a defect. That is the finding's value.

But the retention is not an oversight to be corrected. Clearing users.email on soft-delete would break reactivation — both 10e-R3's magic-link reactivation and the OIDC reactivate branch find the soft-deleted row by email. Clear it and the row becomes unreachable, and soft deletion becomes hard deletion by accident. So the tension is designed in: the retention that enables reactivation is the same retention that keeps the unique-constraint slot occupied.

Ruled: recorded, queued, not opened. It is not 10e-3b's, it is not 10e's, and it must not be bundled. 10e-3b's obligation is to handle the collision, which is what the three-path scope already does. Note in the proposal that the collision is reachable because of this, so a later reader does not read the guard as defensive-only.

One item routes to the operator, not to you: whether the Privacy Policy's account-deletion language is accurate given that a deleted account retains its email address. Flagged to the channel, not yours to draft or assess.

10e-R156 — F-3b-3 ACCEPTED as a falsification. F-3b-4 CONFIRMED and AMENDED: both sides normalize, and the claim is gated at the boundary.

(a) R145 item 5's premise (i) is falsified and the falsification is the right report. There is no OIDC adopt lookup because the callback resolves on (auth_provider, external_id) and never on email — the email lookup is what 10e-3b creates. Reporting that, rather than pasting the composite lookup as though it answered the question, is exactly what 10e-R122(a) required of the verify side and it is why that clause exists. The channel's question was mis-posed as measurement; it is a design question and F-3b-4 answers it.

(b) F-3b-4 is confirmed, and the channel accepts the correction that it is stronger than posed. On the magic-link side R82/R83's zod gate meant the compared token email was already ASCII-normalized — R122 leaned on that to bound its own exposure. Here claims.email reaches the comparison with no zod, no normalization, and only an if (!email) presence check. The mitigation R122 assumed is absent. R13(a)'s line about a second provider applies verbatim to the match gate beside the verification gate, and noticing that the same sentence governs both is the finding.

(c) AMENDMENT, and it is not cosmetic. R122(b)'s form was normalizeEmail(foundUser.email) === tokenRow.email, correct there only because the right-hand side was already normalized. Mirrored naively here, the right-hand side is a raw provider claim, and a claim of Khaled@Gmail.com against a stored khaled@gmail.com would fail the exact comparison and refuse a legitimate adoption. That converts a security gate into a denial-of-adoption bug, and it would present as a rare, unreproducible sign-in failure.

Ruled: normalize both sides — normalizeEmail(found.email) === normalizeEmail(claims.email). The lookup stays ai_ci (an exact lookup reintroduces the F2 crash for a stored case-variant, per R82/R83) and the adoption decision becomes exact. Those are different things and the code says so in a comment, as R122(b) already requires.

(d) Additionally: gate claims.email at the callback boundary — parse and normalize it before it reaches any comparison or write, fail closed if it does not parse. This is defence-in-depth restoring the mitigation R122 assumed, not the primary gate; the primary gate is (c)'s exact comparison, and (d) must not be argued as a substitute for it. Like R13(a) it is a no-op against Google today, which is the point.

(e) The refusal is terminal. No INSERT fallthrough, no fallback to create-new — inserting on refusal is the F2 crash on a new path, exactly as on the verify side.

(f) Both gates proven able to fail, in both directions, red captured, per 10e-R17. The (c) pin must include a case that would go red under the naive mirror — a case-differing claim against a stored address, asserting adoption succeeds — or the amendment is untested.

10e-R157 — F-3b-5 ACCEPTED. 10e-R132's characterization is CORRECTED. The coverage obligation is bounded to the branches 10e-3b modifies.

R132 recorded that auth.callback.test.ts sets totpEnabled: false at both of its only two sites. The file holds one describe, one it. R132's claim was a channel-side description that was never round-tripped against the tree — the same class as 9c1b2e8 under R148, and the second instance this module. Corrected on the record; R132's operative obligation stands unchanged, and the correction makes it larger, not smaller.

Also recorded, as an instance of the R135/R141 family rather than a new rule: four files matched a /callback grep purely on an oauthRedirectUri string in an env mock. A grep for a route path matches configuration as readily as coverage. An enumeration of what tests exercise route X is not a match count — the matches are inspected and classified, and the classification is printed.

Ruled: 10e-3b brings route-level coverage to the branches it modifies — all three. The pre-existing untested surface of GET /callback beyond those branches is queued, not opened; 10e-3b is not a callback test-coverage module and must not become one.

10e-R158 — §1.4: the REDIRECT is APPROVED. The distinguishing literal oidc_adopt_refused is REJECTED.

The mechanism is right and there is a stronger argument for it than the one you made. The callback is reached by a top-level browser navigation from Google. A bare JSON body in that context is not a weak response, it is a dead end — the user lands on a raw JSON page with no rendered copy and no route back. The success path already redirects; the failure path must too. /login already rendering param-driven copy (?deleted=1, 10c-3) makes it cheap, and that copy riding 10e-4 rather than being bundled is correct sequencing.

The distinguishing param is refused, and for the reason R122(c) already ruled one artifact over. ?error=oidc_adopt_refused is an account-existence oracle. An attacker who controls a Google account at jose@x.com and receives a refusal distinguishable from the callback's other failures has learned that a Statera account exists at an accent-variant of that address. That is the same signal the uniform 400 exists to suppress on the verify side, arriving through a query parameter instead of a response body. R14's uniformity and R122(c)'s byte-identical envelope are not properties of the magic-link endpoint; they are properties of the adoption decision, and it now has two front doors.

Ruled: the refusal redirects to the callback's existing generic OIDC failure target with its existing param, byte-identical to at least one other failure cause. No new literal, no new copy, no new frontend branch. This is why R153 item 2 must be relayed — the channel cannot name the target it is requiring you to reuse, and will confirm against your enumeration.

Recorded, not fixed: a legitimate owner of the ASCII address who cannot adopt now receives a generic error with no path forward. That is the identical user-facing consequence R122(d) recorded on the verify side — same root, same user, post-announcement. Cite 10e-R85 and do not bundle. This ruling does not enlarge it; it makes the failure a clean refusal instead of a silent takeover.

10e-R159 — §1.5 is DEFERRED, not refused. Two reasons, and the second is yours.

First, the channel has not seen the strings. R11 makes them permanent in the audit record; ruling on permanent literals from a count is not review.

Second and decisive: §0.2's answer changes §1.5. A four-literal closed set was proposed against a two-path scope. R154 confirms three paths, R156(c)/(d) adds a boundary-gate refusal, and R158 changes what the refusal does. Any set ruled now would be superseded by the rulings above it in this same block.

Restate §1.5 after R154–R158 land and relay it verbatim in chat — it is a few lines. It will be ruled against R11's established shape: the login.* family reused rather than a parallel family minted; login.pending_2fa reused verbatim on any TOTP handoff; account.reactivated reused verbatim on reactivation; the reason set closed and enumerated in code, because the enumeration is what makes the BLOCKING no-address-in-payload scan checkable rather than a promise; and the whole-payload JSON.stringify scan across every branch, not key-absence.

Arithmetic, accepted and now stale. Your deltas reconcile: hermetic 868 / 34, INTEGRATION 892 / 10, cross-check 868 + 34 − 10 = 892, and +15 INTEGRATION is 877 + 12 + 3. The gate direction is applied correctly — describe.skipIf(!INTEGRATION) landing in the hermetic skipped column is R144(c) used as intended, and rows-equal-tests with no it.each closes R126's row-vs-test distinction by construction. All of it is superseded by R154 and R156 and must be re-derived from the revised case list. Every absolute re-derived at execution; carry nothing.

Sequence. Relay R153's three items. Ruling block on §1.5 and §1.4's target follows. Then implement. Nothing beyond the relay is authorized.

---

## Review-channel ruling block — 10e-R160 … 10e-R164, 2026-08-19

10e-R160 — R154's sessionVersion report is ACCEPTED. The branches agree; no finding. Direction recorded.

auth.ts:218-221 reads existing.sessionVersion as-is with the reasoning in a comment, magic-link.ts:612 carries the same, and the re-bump pattern returns 0 in both ranges against a positive control finding all four genuine bump sites (account-deletion.ts:128, auth.ts:536, auth.ts:739). Zero-with-a-firing-control is a negative observation, not a silence.

The direction note is the useful part and is recorded: F-3a-3's reasoning originated in the OIDC branch at 10d-0a and magic-link ported it. The channel had it backwards in R154 — the report was framed as asking whether a magic-link ruling extends to OIDC, when OIDC is where it came from. Routing an adopted soft-deleted row into that branch therefore inherits correct handling by construction rather than by a decision, which is a stronger position than the design claimed for itself.

10e-R161 — F-3b-6 is ACCEPTED. R158's referent clause is AMENDED. All three options are declined; co-route :163 and :170 only.

The finding is correct and it defeats the ruling as written: there is no existing failure redirect, no existing failure param, no frontend branch to receive one. The observation that closes off the easy repair is the sharper half — if the refusal becomes the only redirecting failure, the redirect is itself the oracle and the anonymity set has one member. The clause is load-bearing exactly as you read it. Requesting rather than taking is again correct.

Ruled: co-route :163 (token-exchange failure) and :170 (no email in claims) to a bare /login, together with the adoption refusal. :134, :148 and :257 are excluded. Reasons, because two of them are the channel's and you should be able to falsify them:

Why not :134/:148 — and this is the argument neither of us made. Those are the state-cookie failures, and their dominant real-world cause is blocked or expired cookies. Redirect a cookie-blocked user to /login and they sign in, hit the callback, fail identically, and land back on /login — a silent redirect loop with no diagnostic. The current JSON at :134 names the cause in words ("login session expired or cookies blocked") and is genuinely more useful than the page you would send them to. Option (B) and option (C) both create that loop. R158's dead-end rationale does not apply identically to all five, which is where (C)'s reasoning breaks: a JSON dead-end is worse than a redirect only when the redirect leads somewhere the user can act.

Why not :257. It is the delete-reauth flow — a 403 on a session mismatch, whose neighbours redirect to /auth/2fa-verify?intent=delete and /delete-account/confirm. It is not on the surface 10e-3b modifies, and routing it to /login is a semantic change to a different flow. Out of scope under 10e-R157's bound. It stays JSON, and the anonymity set does not need it.

Why :163 and :170 are sufficient. The anonymity set only has to contain causes that are plausible at the attacker's own phase. An attacker running the accent-variant adoption has a valid state cookie and knows it. What they cannot distinguish is what happened after the redirect back: token exchange failed, the claims carried no email, or the adoption was refused. All three are post-state-validation, all three are indistinguishable from outside, and :170 in particular is a genuine alternative explanation an attacker can themselves induce by stripping the email scope. A set of three at the correct phase beats a set of five spanning phases the attacker can rule out.

Target: bare /login, no param. Your reasoning is adopted verbatim and is the right instinct — a param with one value carries no information but invites a second value, and that is precisely how an oracle gets reintroduced by a later well-meaning commit. It also means LoginPage.tsx is untouched, no frontend branch is added, and nothing bundles into 10e-4.

Pin it. A hermetic case asserting the refusal's response is byte-identical to at least one co-routed cause — same status, same Location, no distinguishing header. Proven able to fail: adding a param to one of them must redden it.

Recorded, not fixed. Legitimate users hitting :163/:170 lose a diagnostic string and land on an unexplained login page. That is a real regression, accepted deliberately. A non-distinguishing "sign-in didn't complete" message is a 10e-4 copy question in R14's shape — one string naming every cause — and any mechanism for rendering it must not introduce a distinguishing param. Queued, not opened, and the constraint travels with the queue item.

10e-R162 — §1.5: account.provider_linked APPROVED. login.failed reuse APPROVED. login.email_refresh_skipped is RENAMED. Reason set APPROVED with one guard.

(a) account.provider_linked — approved verbatim. The reasoning is right on both halves: account.* is where structural changes to the account live (account.reactivated, account.delete_reauth.*), and binding a new identity is that shape rather than a login outcome. Omitting "oidc" is correct — the codebase is provider-agnostic by architectural decision and the string is permanent under R11.

(b) login.failed reuse — approved, and the tension you declined to resolve by preference resolves on evidence. R11's inclination was to reuse the login.* family with a distinguishing field rather than mint a parallel one; reusing an event that already carries details: { reason } at auth.ts:623 is the purest available form of that, not a compromise. The asymmetry with magic-link has a cause and is not drift: magic-link minted login.magic_link.failed because that router had no generic failure event; this one does. There is a second argument you did not make and it is decisive — R11 recorded that GET /api/auth/profile/security-events filters event_type LIKE 'profile.%', so every one of these choices must leave that endpoint byte-identical. Reusing an existing login.* string guarantees it; minting login.oidc.failed would too, but reuse guarantees it without adding a string to the permanent vocabulary.

Two conditions. (i) Enumerate every existing emitter of login.failed with matched lines printed, and confirm each carries details.reason. If any emits without one, the shape is not established and this ruling reopens. (ii) Record the asymmetry in CLAUDE.md at the 10e-3b docs half, in one line, so a later reader does not read magic-link's sub-family and OIDC's reason-literal as inconsistency: magic-link minted login.magic_link.failed because its router had no generic failure event; OIDC reuses login.failed because it does (10e-R162, 2026-08-19).

(c) login.email_refresh_skipped → account.email_refresh_skipped. Apply your own rule from (a) consistently. The login it rides succeeded; the event describes the account's email state, not a login outcome. Under login.* it would also be the only login.* event on a successful OIDC login, since F7 records that the OIDC no-TOTP path emits no positive login event at all — which makes the misfiling actively misleading to anyone reading the family. Rename it. If there is a reason the channel is missing, say so rather than complying — this is a permanent string and I would rather be argued out of it now.

(d) Reason set approved, with one guard. inexact_email_match is shared by value with 10e-3a's VERIFY_FAIL_REASONS, defined twice in two as const arrays. A rename in one site diverges silently from the other, and the audit trail then reports two different literals for one decision class — the silent-rot shape. Pin it: a hermetic assertion that the two literals are byte-identical across the two sets. A comment would rot; an assertion goes red. delete_reauth_context is accepted as reported — the channel has not read §1's gate 3 and is not ratifying its substance, only its place in the closed set.

(e) R11 BLOCKING scan — approved, and the exclusion you added is a finding in its own right. Excluding the other user's id from account.email_refresh_skipped is correct and the channel had not asked for it: a colliding row's user id is a cross-account identifier, and an audit payload that pairs "this address collided" with "with this user" reconstructs the association the address-scan exists to prevent. Whole-payload JSON.stringify over every captured insert across every branch, key-absence insufficient. Recorded as an implementer finding, not a channel ruling.

10e-R163 — §0.2's restatement is RATIFIED. Three paths, none scoped out.

auth.ts:191 (INSERT), :228-237 (reactivate set()), :262-267 (existing-active refresh) — adoption plus duplicate-key translation covering path 1, collision pre-check covering paths 2 and 3 uniformly. Citations carry number, date and title as R143 requires. The F-3b-2 note is correctly placed and correctly bounded.

10e-R164 — implementation is AUTHORIZED. Conditions.

Implement 10e-3b as proposed, amended by R154, R156, R157, R161, R162. Re-derive every absolute from the revised case list at execution; carry nothing — the §3 arithmetic is stale and R159 already said so. Every new guard proven able to fail in both directions with red captured, including R156(c)'s case-differing-claim adoption case and R161's byte-identity pin. Failure-injection asserts the specific expected error. The close-out names any departure from a standing ruling as a departure, and reports login.failed emitter enumeration under R162(b)(i) before the events land.

---

## Review-channel ruling block — 10e-R165 … 10e-R170, 2026-08-19

10e-R165 — the measured figures are ACCEPTED. The DECOMPOSITION is not; it does not close, and an enumeration is owed.

Everything measured reconciles. Hermetic 872/34 across 61 files (51 passed | 10 skipped), INTEGRATION 896/10 across 61, cross-check 872 + 34 − 10 = 896, totals 906 both modes, tsc 0, Errors/Unhandled 0 with rc captured on its own line per R151. Deltas +16/+3/+1 and +19 are consistent with the 10e-3a baseline (856/31/60, 877/10) and with +19 − +16 = 3 being exactly the three describe.skipIf(!INTEGRATION) cases landing in the hermetic skipped column. The file count moves 9 → 10 skipped-under-hermetic, consistent with the new file being wholly INTEGRATION-gated. The unshipped absolute of 15 reconciles as 13 at 3e3357a plus f59efc2 plus this; the 13 → anchor is stale but the derived absolute is what governs and it holds.

The decomposition 12 − 1 + 5 = 16 does not close, because the gate-3 case can be read into two buckets. It is subtracted as proposed-but-unwritten, then reported as written and proven able to fail. If it was written before the measurement it is present in the 16, and either it re-enters inside the five ruling-added — in which case the −1 and one of the +5 are the same test, and saying so is what makes the arithmetic legible — or it does not, and the figure should be 17. A decomposition that admits two readings is not a reconciliation; it is a number that happens to land.

This matters precisely because the incident was a success. R137b's whole value is that the mismatched digit is readable, and the omission it exposed — a literal in the closed reason set with nothing exercising it — is exactly the defect class it exists to catch. An unreadable decomposition retires the instrument at the moment it proved itself.

Owed as a report, not a commit: the five ruling-added cases enumerated by name with the ruling that added each, and one sentence stating which bucket the gate-3 case occupies. If it turns out to be 17, say so.

10e-R166 — the fourth site's FIX is RATIFIED. The SELF-GRANT is a departure. duplicate_email_race on that path is REJECTED.

(a) The fix is right. The adopt UPDATE rewrites (auth_provider, external_id), itself UNIQUE, and reaching it with a colliding value means the binding appeared between the top-of-callback lookup and the update — a genuine race, and an uncaught 500 before this. Leaving it while fixing three others would reproduce R154's objection one instance further along. Ratified on its merits.

(b) The self-grant is a departure and is recorded as one. R154's standing rule — a finding that enlarges the implementer's mandate is a request, never a self-grant — is the rule you cited while departing from it. Naming it as a departure is the required behaviour and was done. The rule stands unamended: the correct move was the one made twice already in this module, at F-3b-1 and at option (C). The pattern to watch is that the departure was licensed by an argument from a previous ruling's reasoning; that is how self-grants get justified, and it is why the rule is procedural rather than substantive.

(c) The literal is REJECTED, and this is the item that must not ship. duplicate_email_race names an email collision. This path is an (auth_provider, external_id) collision — no email is involved in the constraint, the comparison, or the cause. Under R11 the string is permanent in the audit record, and the record would then assert "email" about an event with no email in it. "The literal names a class" is the right instinct and the wrong class: the shared class is duplicate-key race, not duplicate email.

Mint a sixth literal — duplicate_identity_race or equivalent — for the (auth_provider, external_id) path. duplicate_email_race stays on the users_email_unique paths. This is cheap now and impossible later: the string is permanent once emitted in production, and 10e-3b has not deployed, which is the only reason this is a correction rather than a permanent defect. It lands in 10e-3b-CORRECTIONS per R170.

10e-R167 — departure 2 is RATIFIED. The R161 byte-identity pin's COUNTERPART must be :163, and if it is :170 the pin is degenerate.

Merging :170 into the boundary gate is accepted: an absent claim is a claim that fails to parse, both land on bare /login as R161 requires, and the anonymity set is preserved at three. Auditing it as claim_unparseable adds no attacker-visible signal, since audit rows are server-side.

But the merge changes what the pin can prove, and your own instrument finding is one surface short of it. You found that a mutation inside failCallback reddened five tests and left the pin green, because refusal and its counterpart both flow through that helper. The same reasoning applies to the pin's subject: if the pin asserts refusal ≡ :170, and :170 is now the boundary gate that refusal also routes through, then byte-identity holds by construction and the pin proves nothing about the anonymity set. It would be green against code that distinguished refusal from every genuinely independent cause.

The anonymity set's load-bearing member is :163, the token-exchange failure — a different code path reaching /login by a different route. Report which exit the pin's counterpart is. If :163, state it and the pin stands. If :170, re-point it at :163 in 10e-3b-CORRECTIONS and re-prove it able to fail with a mutation that distinguishes only the refusal.

10e-R168 — AN INSTRUMENT THAT SHARES A MECHANISM WITH WHAT IT MEASURES CANNOT DETECT A FAULT IN THAT MECHANISM. New standing rule, earned three times in this close-out.

Three findings, one shape, and you found all three:

The mutation that moved both sides. A pin on a relation between two values is not tested by a mutation that moves both — the relation survives. It needs a mutation that breaks the relation. Your words, adopted.
The verification query that shared the collation. eq(users.email, claimed) in the integration assertion is itself ai_ci, so the assertion "no row holds the claimed address" was written in the same accent-insensitive semantics as the widening it existed to detect, and failed against correct code. Rewriting it to assert the victim is the sole holder is the right repair.
The fabricated ER_DUP_ENTRY. Hermetic tests construct the error they then assert the predicate matches, so they would pass identically against a wrong predicate. The real-MySQL probe — code === "ER_DUP_ENTRY", errno 1062, guard returns true, tripwire silent — is what makes the predicate a measurement instead of a restatement.

This is the same family as R135, R141 and R150, and it is the general case all three are instances of. It also sharpens the live bounded unknown at R134: the Errors grep's independence from the exit code is undemonstrated, and this rule names why that gap matters rather than leaving it as bookkeeping. Cite R168 alongside R134 in the 10e-close record.

Add to CLAUDE.md's standing rules, one line, riding 10e-3b-CORRECTIONS: An instrument that shares a mechanism with what it measures cannot detect a fault in that mechanism (10e-R168, earned 10e-3b, 2026-08-19). Applies to mutations that move both sides of a relation, to verification queries executed under the semantics being tested, and to tests that fabricate the condition their predicate matches.

10e-R169 — departures 3 and 4 RATIFIED, two conditions.

(a) Siting the R162(d) parity pin in magic-link.test.ts is accepted; the assertion is location-independent, and avoiding a forced edit to the enumerating rate-limit factory is consistent with the Option B choice at R36. Condition: a one-line comment at the ADOPT_FAIL_REASONS definition naming the file the pin lives in. A pin nobody can find from the thing it protects is a pin that gets deleted as orphaned — the commit-without-activation shape.

(b) The bounded poll is accepted; auditSecurityEvent is fire-and-forget by design and a synchronous assertion would be flaky in both directions. Condition: state whether the poll was proven able to fail by removing the emit — a poll whose timeout path passes silently is not an assertion. If that was not captured, capture it. makeDb left byte-intact with the 10d-0b test passing unchanged is noted and correct.

10e-R170 — 10e-3b is ACCEPTED, subject to 10e-3b-CORRECTIONS. Then the persistence commit. Then this conversation closes.

The guard verification is complete and is the standard: six guards, red captured in both directions, file restored diff-identical after each, and the naive-mirror mutation reddening exactly the case-variant adoption case that R156(c) predicted — a prediction made by the channel and falsified-or-confirmed by measurement rather than by agreement. R162(b)(i) discharged before the events landed, with the raw grep of 2 classified down to one production emitter at auth.ts:623 carrying details.reason, the other a comment quoting Flask source. Classification-not-count, per R157.

Two commits, in this order, then stop.

Commit 1 — 10e-3b-CORRECTIONS: the sixth reason literal per R166(c); the pin re-point per R167 if it is degenerate; R169(a)'s comment; R169(b)'s capture if owed; R168's standing rule line at CLAUDE.md continuing 439–442. Per R142 it closes with one presence assertion per item, run before the commit. Gates: the corrections touch apps/ and a reason literal, so both suites run — this is not a docs-only disposition. Re-derive every absolute; the literal rename should move no counts, and if it moves any, R137b applies.

Commit 2 — 10e-RULINGS-PERSIST (docs-only): rulings 10e-R140 through 10e-R170, verbatim, appended to docs/modules/phase4-10e.md. Pasted from the channel, not reconstructed, not summarized. R148's correction to R140 travels adjacent to R140, never folded into it. Update the RULING-SET COMPLETENESS note to record that R140–R170 are now persisted and that R103, R131 and R139 join R36–R101 as issued-but-unpersisted per R143.

Stop after commit 2 and report both. Nothing else is authorized: not the deploy, not 10e-4, not the R12 privacy copy, not 10e-close. R129 remains out of scope and unmeasured.

---

## Review-channel ruling block — 10e-R171 … 10e-R173, 2026-08-19

10e-R171 — R147's absence is EXPLAINED and CLOSED. It was never a block. The instrument finding is ratified and generalized.

R147 was issued in this channel on 2026-08-19 as prose in a reply to the operator, under the heading "Postmark approval — ruling block," recording that account approval had cleared. It was numbered and dated but never written in block form, and R170 then swept R140–R170 as a range without checking that every number in the range had a block. So the gap is a channel authoring defect, not a persistence failure and not a missing artifact. Nothing is lost.

Its content, restated for the record and persisted with this block: Postmark account approval CLEARED 2026-08-19, recorded on operator attestation. The 10e-R15 announcement gate loses its external dependency and becomes schedulable. Approval clearing does not discharge the production end-to-end send proof — request a magic link on production against a real address, confirm the message appears in Postmark Activity for the production server, confirm arrival, paste the Authentication-Results: lines verbatim. The standing prohibition on reading POSTMARK_API_KEY out of sops for comparison is unchanged, and the 2026-08-14 rotation precedent stands: screenshot configuration screens, never code samples. R43 sits in the blocked-backfill range and must not be reconstructed to attach this to.

The instrument finding is the valuable half and is ratified. A plain substring search for 10e-R147 reports it present — twice — because both hits are records of its own absence. A search for a thing finds the discussion of its absence. The block-header pattern ^10e-R<n> —  is the discriminating instrument, and it is discriminating because it tests the property that actually matters (a block exists) rather than the property that correlates with it (the string occurs).

This is 10e-R168 one surface over: a presence check written as a substring search shares its mechanism — string occurrence — with the thing that defeats it, namely prose that mentions the identifier. It is also the R142 rider-(b) class again, third instance this module. Add to CLAUDE.md's standing rules, one line, riding the corrections commit named in R173: A presence check must test the property, not a string that correlates with it (10e-R171, earned 10e-RULINGS-PERSIST, 2026-08-19). A substring search for an identifier is satisfied by prose recording its absence; check for the structure the identifier should head.

Channel obligation, adopted: a ruling issued as prose is not a ruling block. From here the channel emits every numbered ruling in block form under ^10e-R<n> — , and any range citation is checked header-by-header against that pattern before it is swept.

10e-R172 — R165's owed report is ACCEPTED. 12 + 4 = 16 closes, and the fourth entry is the better finding.

The gate-3 case occupies the 12 bucket — proposed and written, written late — and the earlier 12 − 1 + 5 double-counted it. That is the correct reading and it is the one the channel named. The decomposition now admits one reading.

The fourth row is worth more than the arithmetic it repairs. The INSERT duplicate-race translation was in your proposal's §1.2 prose and absent from your own 12-row table — so the table under-counted the proposal it summarized, and labelling it as your own under-count rather than folding it into "ruling-added" is the attributional discipline working in the direction that costs you something. Recorded: a case list and the prose it summarizes are two artifacts, and the count is derived from the table — which makes the table a claim about the prose, verifiable against it, not a restatement of it. Consistent with the standing rule that frontend type annotations are claims to verify against the backend serializer; same shape, different surface.

Strictly, then: 12 table + 3 ruling-added (R156(d), R161, R162(d)) + 1 table under-count = 16. Closed.

10e-R173 — 10e-3b is CLOSED. Both commits ACCEPTED. One corrections item, then this conversation ends.

4f71494 verifies: tsc 0 at 0 bytes; hermetic 873 / 34 / 61 exit 0, Errors 0; INTEGRATION 897 / 10 / 0 exit 0, Errors 0; cross-check 873 + 34 − 10 = 897. The rename moved no counts as R170 predicted and the +1 is the new case exercising the sixth literal — a prediction stated in advance and met, which is the form R137b exists to make readable. Unshipped 17 reconciles as 15 plus two.

R166(c) is discharged with more than was asked: minting duplicate_identity_race was required, renaming isDuplicateEmailError → isDuplicateKeyError was not, and it is right for the identical reason — the predicate matches a key class, not an email class, and a name asserting otherwise is the same defect one layer down. Giving the new literal its own exercising case, unprompted, applies the gate-3 lesson to the commit that repairs it.

R167 is discharged and the report is the standard. The pin was degenerate: the counterpart was the merged :170 boundary gate routing through refuseAdoption, the same helper as the refusal, so byte-identity held by construction. Re-pointing at :163 via a throw flag is right, and making independence checkable — the refusal audits, :163 does not, so a non-empty/empty split proves two different code paths produced the two responses — is better than the ruling required. R161 asked for byte-identity; you added a positive demonstration that the two responses have independent origins, which is precisely the R134 gap (independence undemonstrated) closed on a smaller surface. That the reasoning transferred without being told to transfer is the point.

bc12b14 is accepted: R140–R170 verbatim in five blocks, R148's correction beside R140 as a block-quoted marker with R140's text unedited, completeness note amended with R103 flagged as load-bearing since it authorised skipping both gates on 3e3357a.

One commit remains before the boundary — 10e-RULINGS-PERSIST-2, docs-only:

R171's standing rule line at CLAUDE.md, continuing 446.
Rulings 10e-R171, 10e-R172, 10e-R173 appended verbatim to docs/modules/phase4-10e.md, in block form under ^10e-R<n> — .
10e-R147 written in block form and persisted in its numbered position, with the content restated in R171 above, and a one-line note that it was issued as prose on 2026-08-19 and rendered as a block on the same date. Do not backdate it and do not present it as having been a block.
The completeness note amended: R140–R173 persisted, R147's gap explained and closed, R103/R131/R139 unchanged as issued-but-unpersisted.

Per R142 it closes with one presence assertion per item, run before the commit — and per R171 the R147 assertion uses the block-header pattern, not a substring search. Docs-only under R149's licence. Report the commit and stop; the next prompt comes from the successor conversation.

---

## Review-channel ruling block — 10e-R174 … 10e-R180, 2026-08-21

**Provenance, stated and not backdated (10e-R171 precedent):** these seven rulings were issued as
the opening prompt of the 10e-4 successor conversation on 2026-08-21, each already in block form
under `10e-R<n> — `. They are pasted here verbatim. 10e-R174 carries its own provenance note about
having been prose before that point; that note is R174's own text and is not edited here.

10e-R174 — the predecessor's handoff block miscounted its own session, in two directions. 2026-08-21.

Provenance, stated plainly and not backdated (10e-R171 precedent, 2026-08-19, "R147's absence is EXPLAINED and CLOSED. It was never a block."): this ruling was issued as prose inside the successor-conversation opening prompt on 2026-08-21. It was numbered and dated but not written in block form. It is rendered in block form here on the same date. It was not a block before that, and nothing should be read as implying otherwise.

The predecessor's close-out reported "three commits this session" and then listed four SHAs, and the true figure is five — the list omitted f59efc2, the 10e-3b proposal, which was also that session's. The derived absolute is what governs and it holds: 18 − 13 = 5.

This is the self-falsifying-structural-figure class (10e-R118) — a number describing the artifact it sits inside, falsified by the artifact — and it landed in a handoff block, the one place a wrong number propagates to a session that cannot check it. Derive-don't-carry applies to session inventories exactly as it does to test baselines.

Recorded alongside it, NOT a rule: c6103c5's negative control used ^10e-R174 —  → 0 / rc=1, and issuing R174 expires it. A negative control drawn from the next unused identifier has a shelf life measured in one ruling; draw controls from a permanently-unreachable identifier instead (Step 0.8). Left as a record rather than promoted, per the predecessor's own classification. If it recurs, it becomes a rule.

10e-R175 — 10e-4's scope. Five lineage items, two carried copy obligations, one explicit non-bundle list.

From the persisted A8 row, which you read from the file and not from this prompt: LoginPage email path, /auth/magic landing page + route, authApi methods, AuthContext wiring, contract fixture regeneration. A8 records 10e-4 as carrying no db.transaction() boundary and no INTEGRATION cases, therefore no cadence obligation — CONFIRM that against what you actually propose rather than inheriting it, and if any INTEGRATION case is added the obligation fires and is planned, not discovered.

Two obligations travel INTO this sub-commit and are in scope:

(a) 10e-R14's verify-failure copy [persisted, docs/modules/phase4-10e.md]. One non-distinguishing string naming every cause — expired, consumed, superseded, never-existed — rendered on /auth/magic WITH THE REQUEST FORM DIRECTLY BENEATH IT. R14's own words: a dead end with no recovery affordance is the actual failure. The known/unknown-address split must not reappear anywhere the client can observe it; the request endpoint already returns one fixed 200 envelope, so the frontend cannot distinguish, and a test must pin that it does not try.

(b) 10e-R161's queued copy obligation [persisted, same file]. Legitimate users hitting the callback's :163 token-exchange failure or the merged :170 boundary gate now land on a bare /login with no diagnostic — a real regression accepted deliberately. A non-distinguishing "sign-in didn't complete" message in R14's shape, one string naming every cause, is the remedy, and R161 queued it rather than opening it. It is opened here as a DECISION REQUESTED, not as a mandate: propose a disposition (implement, or scope out with reasoning) and, if you propose implementing it, propose the rendering mechanism. The constraint travels with the item and is BLOCKING: no mechanism may introduce a distinguishing parameter. R161's reasoning is the standard — a param with one value carries no information but invites a second, and that is precisely how an oracle is reintroduced by a later well-meaning commit. A mechanism you cannot defend against that argument is not a candidate.

Explicitly out of scope, do NOT bundle:
- 10e-R129 [number held, date/title not held] — cross-family token presentation; three token families signing with one secret and no family-distinguishing claim, specifically whether verifyDeleteIntentToken accepts a statera_pending_2fa token. HYPOTHESIS, unmeasured, own cycle post-10e.
- The operator-drafted Privacy Policy copy commit (10e-R12) [persisted]. You do not draft it. Your only job on it arrives at 10e-close: confirm the commit exists and rides the deploy.
- Anything belonging to 10e-close: the public-API-contract entries owed under 10e-R124, the bounded-unknown record on the Errors instrument (10e-R134 + 10e-R168), queue reconciliation, the production end-to-end send proof (10e-R15 / 10e-R147).
- 10e-R85 / 10e-R72 [numbers held, date/title not held] — the non-ASCII local-part user who can neither hold an accent-variant account nor sign in by mail. Same root, same user, post-announcement, own cycle.

10e-R176 — what is MEASURED before anything is designed. Ten items, every enumeration falsifiable.

Every claim about current behaviour carries pasted source and a matched-line list, including the enumerations that come back inconvenient (10e-R146(c) precedent). An assertion in a document is not a measurement. Where an item below states an expectation, that expectation is the channel's hypothesis and your measurement outranks it — a falsified premise reported is a better outcome than a design built on a good-looking one.

1. The landing route's server-side contract. Read apps/api/src/routes/magic-link.ts AT HEAD and paste: the verify endpoint's success envelope, its TOTP-handoff envelope, its failure envelope and status, and the exact link the request endpoint mails. 10e-R124 [persisted] ruled the two success shapes a PUBLIC API CONTRACT. Frontend type annotations are claims to verify against the backend serializer, never the other way round — so the frontend types you propose are derived from that pasted source, and you state that they were.

2. LoginPage as it stands. Locate it by enumeration, not by remembered path. Print every useSearchParams / searchParams read in the file with matched lines. The channel's expectation is exactly one — searchParams.get("deleted") === "1", from 10c-3. If there are more, or fewer, that is a finding.

3. The router table. Print every route in App.tsx with matched lines, and state for each of /auth/magic's neighbours whether it sits inside or outside ProtectedRoute. /delete-account/confirm is the existing outside-ProtectedRoute precedent (10c-3). State where /auth/magic must sit and why — a landing page that bounces an unauthenticated clicker to /login is a broken magic link.

4. The two post-verify destinations, confirmed to exist. is_new_user === true routes to /welcome?source=signup, matching the OIDC callback's target (10e-R124). The TOTP handoff routes to /auth/2fa-verify. Confirm both routes exist and print what each expects on arrival — TwoFactorVerifyPage reads an ?intent=delete param (10c-3), so state whether it tolerates arrival with no param at all, from source.

5. The TOTP handoff's mechanism gap, which is NOT the OIDC one. The OIDC callback sets the pending cookie and redirects server-side. Verify is XHR, so the pending cookie arrives on an XHR response and the SPA must navigate itself. State how, and state what happens if the navigation is interrupted — the pending cookie's TTL is 300s (middleware/pending-2fa.ts).

6. AuthContext. Enumerate what it exposes, with matched lines: how session state is established after the OIDC path lands, what resetAuthState() does, and whether a /me refetch is required after verify or happens by construction. State which.

7. StrictMode and the double-mount. grep for StrictMode in apps/web/src/main.tsx and print the result. A verify-on-mount effect that fires twice consumes the token on the first call and shows the R14 failure copy to a user who just succeeded — the server's atomic consume (10e-3a) protects the server, not the client. State whether StrictMode is on, and propose the guard with how it will be proven able to fail.

8. The token's exposure surface, and its disposition. The raw token arrives in the URL query string. State, from measurement rather than assumption: whether it persists in the address bar and browser history after verification, whether any Referer can carry it off the page, and what you propose to do about it. A history.replaceState scrub is the obvious candidate; propose whatever you can defend, and state the residual.

9. CSP. The Phase A record states the premise "no CSP change expected — a same-origin POST from /auth/magic needs nothing beyond connect-src 'self', so deploy/Caddyfile should not move." That is a PREDICTION, and the standing rule is that any NEW external resource — font host, image or CDN origin, third-party script, cross-origin connect target — adds its deploy/Caddyfile entry in the SAME commit that introduces it. There is no Report-Only safety net; a missed directive is a production breakage that works silently in dev. Enumerate what 10e-4 introduces and state the conclusion as yours, measured. If anything external appears, the Caddyfile change rides the same commit.

10. The shared-form question. Both LoginPage and /auth/magic need a request form (R14 requires the form directly beneath the failure copy). State whether you propose one component used twice or two, and give the reason. The no-renames constraint (R178) binds the answer.

10e-R177 — the copy is RULED, not shipped. Exact strings in the proposal, verbatim.

R14 gave a shape, not a pin — "Something of the shape: 'This sign-in link is no longer valid. Links expire after 15 minutes, and requesting a new link replaces any earlier one. Request a fresh link below.'" That is a specification of the property, not approved copy.

Every user-facing string 10e-4 introduces is quoted VERBATIM in the proposal and is ruled before it ships. That includes: the verify-failure string, the request-submitted confirmation string, any validation string on the email field, and — if you propose opening it — R161's "sign-in didn't complete" string. None of them ships unruled.

Two properties are BLOCKING on the failure string and each needs a test that goes red: (a) it is true in all four failure causes and names them without distinguishing which occurred; (b) the request form is rendered beneath it on the same view, not on a page the user has to navigate to.

One property is BLOCKING on the request-submitted string: it is byte-identical for a known and an unknown address. R14's warning is the specific one to defend against — a well-meant "we've sent you a sign-in link" versus "…a link to create your account" reintroduces the account-existence oracle in one line. In the mail body the distinction is fine and wanted; in anything the client renders it is not.

10e-R178 — the constraints that travel with frontend work. Named, so none is rediscovered in a red run.

Three named regression files stay green AND untouched (design-5.4, confirmed 2026-07-13): components/layout/AppShell.test.tsx, components/pages/legal/PrivacyPolicyPage.test.tsx, components/pages/legal/TermsPage.test.tsx. Untouched means git diff --stat empty for those paths, demonstrated, not asserted.

The design-track standing constraints apply to this commit in full: no renames of files, exports or components; logical properties only — no physical ml-/mr-/pl-/pr- additions, the Phase 6 RTL sweep depends on it; components/ui/* stays direction-free; the 5.3 FAB topology and its pinned strings are untouchable; the two legal data-testids (commitment-backup-retention, commitment-statement-files) are pinned.

"No test impact expected" is a PREDICTION, not an allowance. Any red test, and any forced selector or class edit to an existing test, surfacing during implementation is a NAMED forced edit requiring explicit approval before it ships (5.3 precedent). Name it in the proposal if you foresee it; name it in a stop-and-ask if you meet it.

10e-R179 — baselines. What you re-derive, what is stale, what you do not restate.

State these as the figures you will re-derive at execution rather than restating them as results. Every absolute is re-derived at execution against the then-current measured baseline. Carry nothing.

- API hermetic 873 passed / 34 skipped / 61 files, exit 0 — measured at 4f71494, carried across two docs-only commits under 10e-R149's licence [number held, date/title not held].
- INTEGRATION 897 / 10 / 0, exit 0 — same measurement point.
- The two-mode cross-check 873 + 34 − 10 = 897 is the load-bearing instrument.
- tsc 0.
- Frontend 185 / 39 — CARRIED UNVERIFIED BY DESIGN, and that stops here. Step 0.5 measures it. The proposal's frontend delta is stated against the MEASURED figure, never against this one.
- The contract fixture absolute in A8 (64 → 66) is STALE. Step 0.7 derives the real one.

The predicted test-count delta is derived from an EXPLICIT case list with the row-vs-test distinction explicit (10e-R126 [persisted, docs/modules/phase4-10e-3a-proposal.md]) — a count the reader has to reconcile against rows is the defect that ruling names. A case list and the prose it summarizes are two artifacts, and the count is derived from the table, which makes the table a claim about the prose and verifiable against it (10e-R172 [persisted]). State which gate idiom each new case uses and therefore which skipped column it lands in (10e-R144(c) [persisted]).

A baseline figure that misses its prediction is INVESTIGATED before it is absorbed (10e-R137b). A predicted count that comes in wrong is a question, not a datum — including in the skipped and file columns, where a single digit was once the only signal an overwrite produced.

Do NOT write "two independent instruments" (10e-R134 [number held, date/title not held] + 10e-R168 [persisted]). The counts are demonstrated non-discriminating in both directions; the Errors grep is demonstrated capable of firing; its independence from the exit code is UNDEMONSTRATED and is a bounded unknown owed to 10e-close.

10e-R180 — form of the deliverable, and the stop.

(a) Step 0 first, delivered on its own, then STOP. The proposal follows only after the Step 0 report is acknowledged.

(b) Proposal only. Stop when the proposal is delivered. No file under apps/ is written. No commit beyond (c).

(c) If the proposal is too large to relay comfortably in chat — it probably is — commit it docs-only as docs/modules/phase4-10e-4-proposal.md with its approval status on its face in a header: STATUS: PROPOSED, NOT APPROVED. Docs-only means docs-only: git diff --stat shows nothing outside docs/.

(d) That same commit PERSISTS this ruling block verbatim — 10e-R174 through 10e-R180 — appended to docs/modules/phase4-10e.md in block form under ^10e-R<n> — , and amends the RULING-SET COMPLETENESS note to say so. Reason, and it is the whole reason: a ruling that exists only in a prompt is one relay away from becoming R36–R101. The persist-first standing rule points the same way. If you do not make a docs-only proposal commit, the persistence rides 10e-4's docs half instead and you say so explicitly.

(e) Per 10e-R142 [persisted] the persistence closes with ONE PRESENCE ASSERTION PER RULING, run BEFORE the commit — seven items, seven assertions. Per 10e-R171 [persisted] each uses the BLOCK-HEADER pattern ^10e-R<n> —  and not a substring search: a substring search for an identifier is satisfied by prose recording its absence, which is how a sweep once reported R147 present, twice, both hits being records of its own absence. Each assertion carries the ^10e-R0 —  negative control from Step 0.8, with its match count and rc printed. Never sweep the range R174…R180 without checking header-by-header that every number in it heads a block.

(f) Every enumeration is falsifiable: matched-file and matched-line lists printed, including the ones that came back inconvenient.

(g) Every guard proposed is proposed together with how it will be proven able to fail, IN BOTH DIRECTIONS, with the red to be captured. Every failure-injection test asserts the SPECIFIC expected error, not merely that something failed.

(h) An instrument that shares a mechanism with what it measures cannot detect a fault in that mechanism (10e-R168 [persisted]). This bites hard on frontend work: a test that mocks the api function it is meant to be checking the wire shape of is the FIND-S5 / TODO(module-9-network-mocking) class, and the suite is already on record as having been structurally incapable of catching a live production crash. For every assertion about the wire, state what it actually observes and what it does not.

(i) Any INTEGRATION-gated describe lives in a dedicated *.integration.test.ts file with no module-level db/redis mocks. If the proposal adds any external resource, the deploy/Caddyfile CSP change rides the same commit.

(j) Capture and relay are two separate acts (10e-R112 [number held, date/title not held]). A report that POINTS at a captured result — "printed above", "the output shows" — transmits a pointer the reader cannot resolve. The result is IN the report. If it is too long, paste the discriminating portion and name what was elided and why.

(k) Any claim of the form "per your ruling / approved / operator condition" cites the specific review-channel block by number, date and title. Operator selections made in-session are "operator selection (in-session) — pending review-channel ratification" until ratified in the channel.

Sequence, so nothing is ambiguous: Step 0 report → STOP → proposal (relayed, or committed docs-only per (c)+(d)) → STOP. Implementation is not authorized by this prompt.

---

## Review-channel ruling block — 10e-R181 … 10e-R187, 2026-08-21

10e-R181 — Step 0 is ACCEPTED. Four instruments ratified, one bounded unknown extended.

Every handoff figure is confirmed against the repository: HEAD c6103c5, 18 ahead, origin/main 1d95398, tree clean, all five SHAs round-tripped against subject lines. The R174 arithmetic was checked rather than accepted — 13 + 5 = 18, and 3e3357a..HEAD is exactly the five-commit list — which is the correct instinct on a ruling whose subject is a miscount. Verifying the ruling that tells you a number was wrong is not redundant; it is the only reading of R174 that is not itself a carry.

Four instrument results are ratified as improvements on what was asked:

(a) The Errors pattern was attributed PER ALTERNATIVE rather than rested on a whole-pattern control (10e-R135 [number held, date/title not held]). All three alternatives fire; the negative control does not. That the anchor binds only the first alternative is what makes the other two live, and it is the corrected form of the exact defect R135 was earned on — where two of three alternatives were dead and the instrument worked for a reason other than the one believed. Recorded as reproduced-correctly on a second surface.

(b) The synthetic-control caveat is ACCEPTED and is the better half of (a). Feeding the pattern a hand-written "Errors 1 error" proves the pattern matches that string; it does not prove vitest's frontend reporter emits it. State it that way in the proposal and in the close-out. This EXTENDS the 10e-R134 [number held, date/title not held] bounded unknown to the frontend instrument rather than duplicating it: the API-side gap is independence from the exit code, the frontend-side gap adds shape-fidelity of the reporter's output. Both go in the 10e-close bounded-unknown record, cited alongside 10e-R168 [persisted, docs/modules/phase4-10e.md:1774]. Do not write "two independent instruments."

(c) The tsconfig exclusion was upgraded from a CONFIG READ to a PROGRAM-MEMBERSHIP observation via tsc --noEmit --listFiles, and the zero is discriminating because 81 non-test src files appear in the same listing while 39 test files exist on disk and none appears. Reading the config would have established what the config says; the listing establishes what the compiler built. This is the standing observer discipline applied without being told to apply it. FIND-B4-3 is CONFIRMED on evidence, not inherited.

(d) The fixture count was derived three ways (node, grep, python3) and the four-step history reconciles arithmetically at every hop: 77 − 4 = 73, + 2 = 75, − 12 = 63, + 1 = 64. A count that closes against its own history is a reconstruction, not a subtraction (10e-R113 [number held, date/title not held]).

The measured frontend baseline is 185 / 39, exit 0, tsc 0 at 0 bytes. It AGREES with the carried figure — same disposition as B4-2-R8, where the carried frontend figure was also accurate and the measurement is what established it rather than the agreement excusing it. It stops being carried here.

10e-R182 — FINDING 1 is ACCEPTED and it FALSIFIES THE CHANNEL. 10e-R179's staleness claim is WITHDRAWN. The derive obligation STANDS.

The measurement governs: the fixture holds 64 entries at HEAD, which is exactly A8's stated "from" figure at phase4-10e.md:913. My 10e-R179 asserted that absolute was STALE. It is not. The assertion is withdrawn on the record rather than quietly dropped.

The diagnosis of my own error is the useful part, and it is not the one I would have guessed. I derived ~76 by taking CLAUDE.md's "fixture 73→75" and adding T1-1's +1. That line is a HISTORICAL RECORD of 10c-3, not a live index (10e-R78 [persisted, CLAUDE.md standing rules]), and reading a current value off it silently omitted SC-1/2's −12. R78 is normally invoked to stop a historical record being EDITED to match the present; this is its mirror image — a historical record READ as though it described the present. Your framing of it as the mirror image is correct and is adopted.

Note what this is NOT. It is not derive-don't-carry catching a figure that went stale across an interval: A8's 64 was measured correctly at 10e-1 and the fixture has not moved since, so the four movements all predate A8. My failure was in the DERIVATION, not in a carry — I derived, but from a document ABOUT the artifact instead of from the artifact. Re-deriving from apps/web/contract/frontend-calls.json is what caught it, and nothing else would have.

Durable line, riding 10e-4's docs half, one line in CLAUDE.md's standing rules:

  A figure is derived from the ARTIFACT it describes, never from a document about the artifact (10e-R182, earned 10e-4 Step 0, 2026-08-21). The mirror image of [[10e-R78]]: that rule stops a historical record being edited to match the present, this one stops a historical record being read as if it described the present. A module-status line recording "fixture 73→75" is a true claim about one commit and a false claim about HEAD, and the arithmetic performed on it inherits every movement it omits. Re-deriving is not sufficient — re-derive FROM THE FILE.

Separation of remedy from diagnosis, per the 10e-R136 precedent [number held, date/title not held]: 10e-R179's staleness ASSERTION is withdrawn; its OBLIGATION — derive the fixture absolute at execution and state 10e-4's movement as a delta — stands unchanged. A remedy can be right while the reasoning offered for it is wrong, and the two are separated so the remedy is not withdrawn along with it.

10e-R183 — FINDING 2 is ACCEPTED and INDEPENDENTLY VERIFIED. 10e-R180(e) is AMENDED.

Verified in the channel against the artifact rather than taken on the report's word:

  ^10e-R[0-9]+ —        → 34 matches, numbers 140…173, contiguous, no gaps, no duplicates
  ^## 10e-R[0-9]+ —     → 11 matches, numbers 7…17, contiguous
  ^(## )?10e-R14 —      → phase4-10e.md:1268, Format B

So a Format-A sweep reports 10e-R14 ABSENT, and R14 is the ruling that governs 10e-4's failure copy. The finding holds exactly as reported.

This is 10e-R171 [persisted, :1808] one turn further, and your reading of the mechanism is right: R171 fixed substring-vs-header, and the residual is header-vs-header-in-another-format. It is therefore 10e-R168 [persisted, :1774] on its own terms — the instrument shares an assumption, the header format, with the thing that defeats it. Third surface, same rule, which is why it gets a line rather than another rule.

10e-R180(e) is AMENDED, in two directions:

  (i) The presence assertions for rulings THIS commit appends stay in Format A. That is correct and not a concession — the appended-section convention is Format A, the assertions test the blocks as written, and each carries the matching-format ^10e-R0 —  control. Unchanged.
  (ii) Any check for a ruling NOT appended by this commit runs BOTH formats and states which format matched. A single-format check that comes back empty is not evidence of absence; it is evidence about one format. Running both and attributing the match is preferred over a single alternation pattern ^(## )?10e-R<n> — , because an alternation is a compound instrument and would need per-alternative attribution under 10e-R135 anyway — two runs are cheaper than one run plus its attribution.

Durable line, riding 10e-4's docs half, one line in CLAUDE.md's standing rules, continuing the 10e-R171 entry:

  A header-pattern presence check is FORMAT-SPECIFIC, and the format is an assumption it shares with the file (10e-R183, earned 10e-4 Step 0, 2026-08-21). docs/modules/phase4-10e.md carries ruling blocks in two formats — bare ^10e-R<n> —  for R140…R173 and ^## 10e-R<n> —  for R7…R17 — so a single-format sweep reports R14 absent. [[10e-R171]] replaced a substring check with a header check; this says the header check inherits one assumption of its own. Enumerate the formats present in the file before checking, run each, and say which matched.

10e-R184 — FINDINGS 3 and 4 are RATIFIED. No new rule; both are existing rules firing. The zsh form is named.

Finding 3 — the pattern relaxed for extraction convenience stopped being the pattern under test, returned 40 numbers spanning 102–147, and manufactured 36 missing entries and three duplicates. Correctly classified: rider (b) of the standing observer rule, false-positive direction. The part worth keeping is that the wrong answer LOOKED LIKE A SERIOUS FINDING ABOUT THE FILE rather than a defect in the instrument — which is the whole reason rider (b) says a search can be wrong in both directions and neither error is visible in its output. Reporting it rather than silently correcting it is the standard.

Finding 4 — 10e-R150 [persisted, :1588] firing again, unaltered in shape: the instrument's failure output was 0, five times, and 0 was a value that could have been believed. Correctly identified that the adjacent error lines are not a control. The specific form is NAMED here so it does not recur, since 10e-R151 [persisted, :1598] named glob quoting and this is a different zsh trap on the same seam:

  Under zsh, "$c:apps/web/…" — an unbraced parameter followed by a colon — is parsed as a modifier expansion, and :a is the absolute-path modifier. Write "${c}:apps/web/…". The brace is not stylistic; without it the shell silently answers a different question.

10e-R151's obligation is extended accordingly: command blocks are written for zsh, which means quoted globs AND braced parameters before any colon. Both belong to the proposal's command blocks.

Neither finding mints a rule. Two existing rules fired and were named correctly; adding a third line for each would cheapen the set.

10e-R185 — FINDING 5's map is ACCEPTED with ONE CORRECTION, and the corrected entry is the one that governs the next commit.

10e-R149 is PERSISTED, not number-held. phase4-10e.md:1572, Format A, inside the R148…R152 block — and therefore inside the 140…173 range your own Step 0.8 derived as contiguous with no gaps. The map contradicts the range check that sits four paragraphs above it in the same report. Recorded plainly because a map built "from both formats, not from prose" misfiling a number that its own completeness check covers is the failure mode maps exist to prevent, and because R149 is not a neutral entry to misfile.

What R149 rules, quoted so the proposal does not need to re-open the question:

  "Ruled: R144(a)'s premise HOLDS. The docs-only gate disposition is licensed permanently and this measurement is not repeated. The licence attaches to the read-shaped instrument named here, not to the mention-count, and any future citation of it cites 10e-R149, 2026-08-19, not R144."

Consequence, ruled: the docs-only proposal commit authorized by 10e-R180(c) SKIPS both test gates under 10e-R149, permanently licensed, and the premise measurement is NOT re-run. Do not re-measure it; do not cite 10e-R144 for it; cite 10e-R149, 2026-08-19, "R144(a)'s instrument was MIS-SPECIFIED BY THE CHANNEL." Had R149 stayed misfiled as number-held, the likely outcomes were re-running a permanently-settled measurement or citing an unpersisted number for a licence that is in fact checkable — the first wastes a cycle, the second degrades the citation record.

The rest of the map is confirmed against the artifacts and is correct: R7–R17 Format B, R121–R126 in phase4-10e-3a-proposal.md (verified: six blocks, Format A, no others), R140–R173 Format A, and phase4-10e-3b-proposal.md carrying ZERO ruling blocks in either format (verified, rc=1) — which is exactly why this prompt directed you to read 10e-3b's amendments from the persisted rulings rather than that file's text.

10e-R186 — FIND-B4-3 is not a Step 0 curiosity, it is a DESIGN CONSTRAINT on 10e-4. Disposition REQUESTED.

Your 0.6 measurement establishes that 10e-4's own test files will be outside the type program: 39 test files on disk, 0 in the program. So every frontend test file this sub-commit adds can carry a type error, a wrong-shaped fixture, or a wire-shape literal of the wrong primitive type, and CI stays green. That is not a caveat to note in a close-out; it is a fact about the sub-commit whose entire job is to consume a new API contract.

The specific exposure, stated so it can be designed against rather than merely disclosed: 10e-3a's verify endpoint returns two success shapes and one failure shape, ruled a PUBLIC API CONTRACT under 10e-R124 [persisted, phase4-10e-3a-proposal.md]. A test fixture in a new frontend test file asserting is_new_user or pending_2fa at the wrong type is precisely the FIND-S5(b) artifact — a live false-premise fixture asserting a wire shape that does not exist — and it survived B4-2's compile-time assertions for exactly this reason.

Propose a disposition. The channel is not choosing for you, and the options are not equal:

  (a) Accept the gap, and state what carries the weight instead.
  (b) Put the type claim somewhere the program reaches. The existing precedent is src/contract/money-wire-shape.assert.ts — a non-test .ts file that IS in the program and whose assertions are checked by the CI tsc gate. Your 0.6 listing already establishes whether that file is among the 81; say so.
  (c) Something else you can defend.

Whichever you propose, the reasoning engages with this: the frontend types you declare for the verify response are CLAIMS TO VERIFY AGAINST THE BACKEND SERIALIZER, and the serializer is apps/api/src/routes/magic-link.ts at HEAD, pasted per 10e-R176 item 1. A claim that no gate checks is a comment.

10e-R187 — the proposal is AUTHORIZED. Conditions, and the stop.

Proceed to the 10e-4 proposal under 10e-R175 … 10e-R180 as amended by this block. Nothing in R175, R176, R177 or R178 is changed. R179 is amended by R182 (staleness claim withdrawn, obligation intact). R180(d) and (e) are amended as follows:

  (d) The docs-only proposal commit persists 10e-R174 through 10e-R187 verbatim — FOURTEEN rulings, not seven — appended to docs/modules/phase4-10e.md in Format A under ^10e-R<n> — , and amends the RULING-SET COMPLETENESS note to say so. The two durable lines from R182 and R183 ride 10e-4's DOCS HALF, not the proposal commit, since they are standing rules earned by work this module has not yet done.
  (e) FOURTEEN presence assertions, one per ruling, run BEFORE the commit, in Format A, each carrying the ^10e-R0 —  control with its match count and rc printed. State the format each assertion tests, per R183(ii). Never sweep R174…R187 as a range without checking header-by-header that every number in it heads a block.
  Gates: skipped under 10e-R149, 2026-08-19, permanently licensed, premise not re-measured.

Command blocks are written for zsh: quoted globs (10e-R151) and braced parameters before any colon (10e-R184). Every claim about current behaviour carries pasted source and a matched-line list, including the ones that come back inconvenient. Every guard is proposed together with how it will be proven able to fail IN BOTH DIRECTIONS. Every enumeration that falsifies something in this prompt is a finding and outranks the prompt — Step 0 produced two, and both improved the ruling record.

Deliver the proposal. Then STOP. Implementation is not authorized.

---

## Review-channel ruling block — 10e-R188 … 10e-R195, 2026-08-21

10e-R188 — aa91b61 is ACCEPTED. The persistence verifies. Two findings are the commit's real output.

Checked in the channel against docs/modules/phase4-10e.md, not taken on the report's word:
Format A was 34 blocks numbered 140…173 at c6103c5; the report claims 48 numbered 140…187.
34 + 14 = 48 and 187 − 140 + 1 = 48, both closing on the same figure by different routes.
The fourteen assertion line numbers are strictly ascending and their spacing is consistent
with a 250-line growth that also carries the completeness-note amendment. Format B unchanged
at 11 is the R183(ii) discipline applied — you stated the format each assertion tested and
ran the matching-format control, so the Format-A result is a claim about Format A rather
than a claim about the file.

Unshipped 18 → 19, re-derived. Docs-only proven by exclusion before the commit rather than
asserted after. Gates skipped under 10e-R149 and cited as R149, not R144 — R185 discharged.
The R182/R183 durable lines correctly held back for 10e-4's docs half.

M-1 and M-2 are the commit's most valuable content and neither was asked for. Both are
ruled below.

10e-R189 — M-1 ACCEPTED. The contract does NOT change. §4's narrowing is what closes it, and 10e-close gains a documentation obligation.

The finding is real and 10e-R124 [persisted, phase4-10e-3a-proposal.md] did not address it:
that ruling settled what the two shapes ARE and said nothing about how a client tells them
apart. Two 200s with ok: true, discriminated only by which key is present in data, is a
consumer trap, and your failure trace is exactly right — if (data.is_new_user) reads
undefined on the handoff, falls through falsy, and routes a sessionless user into the app
while a 300 s pending cookie expires unused.

The contract does not change. R124's minimality reasoning stands and is strengthened, not
weakened, by this finding: the defect is not in the shapes, it is in the absence of a stated
discrimination rule, and adding a discriminant field would treat a documentation problem as
a schema problem. Your §4 disposition already supplies the mechanism.

Two conditions, both red-provable:

  (i) pending_2fa is tested FIRST, and that ordering is pinned by a case that goes red when
      the branches are swapped. Ordering asserted in prose rots; ordering asserted by a
      failing test does not.
  (ii) The narrowing is EXHAUSTIVE and its default THROWS. A response carrying neither key,
       or both, must not fall through to any success path. Prove it with a fixture omitting
       both — a narrowing whose default is "assume success" is the M-1 defect relocated one
       layer down.

Documentation obligation, owed to 10e-close alongside the R124 entry: the public-API-contract
entry states the DISCRIMINATION RULE, not only the two shapes. A contract that documents two
responses without saying how to tell them apart hands the next consumer the identical defect,
and the next consumer will not have M-1 in front of them.

10e-R190 — M-2 ACCEPTED. This is the 9.4 defect class, caught before it shipped. Two conditions.

The mechanism is correct and the asymmetry is the part worth keeping: OIDC works because a
full-document redirect reboots the SPA with the cookie already present, and magic-link's
client-side navigate() does not remount the provider whose mount-only effect already ran and
set user = null. So the OIDC path's correctness is not evidence about this path — it is the
EXTRACT-2 finding's shape on a different surface, where greenness on one path says nothing
about a path that was never entered.

Left unfound this ships as a route that returns 200, sets a valid cookie, and bounces the
user to /login — which is 9.4 almost exactly (route correct, frontend reads undefined,
ProtectedRoute bounces), and 9.4 survived a Module 7 smoke test that validated /me as HTTP
200. An operator smoke of "the link worked" would not have caught this either.

  (i) The test asserts the POST-CONDITION, not the call. Asserting that refreshUser was
      invoked proves an invocation; it does not prove the user ends up authenticated, and a
      spy that resolves to nothing satisfies it. Assert where the user lands and that auth
      state is populated. Proven able to fail by removing the await.
  (ii) The ORDERING is pinned: refreshUser resolves BEFORE navigate. Reversed, the
       destination mounts with user still null and bounces, then the refetch resolves onto
       /login — a failure indistinguishable from having no refetch at all. Two different
       bugs with one symptom is exactly the case that needs its own red.

10e-R191 — §3: five strings APPROVED as written, C-1 APPROVED WITH ONE AMENDMENT, C-3 owes one statement. C-6's separation is APPROVED with an enumeration condition.

C-2, C-4, C-5, C-7 approved verbatim. C-2 in particular does real work — "has an account —
or is ready to have one" tells an unknown-address user what clicking will do without telling
THIS user which they are, and it is true in both branches because 10e-2 sends for both under
one template. Approved as written.

C-1 — AMENDED, one clause. R177(a) made "true in all four causes" BLOCKING, and "no longer
valid" is not true of a token that never existed: "no longer" is a temporal claim meaning
not now, though formerly. That is the precise assertion 10e-R14 [persisted,
docs/modules/phase4-10e.md:1268, Format B] refused 410 Gone for — "410 asserts the resource
once existed, which is itself the distinguishing signal the uniformity exists to suppress."
Rejecting the status code and then making the same assertion in the copy would restore in
prose what the status code was chosen to avoid. Uniformity is NOT breached (one string, four
causes, no information carried), so this is an accuracy defect against the property I made
blocking, not a security one — and it costs one word:

  This sign-in link isn't valid.
  Links expire after 15 minutes, are single-use, and requesting a new link replaces any
  earlier one. Request a fresh link below.

Everything else in C-1 stands, and the addition of "single-use" is RATIFIED as an
improvement on the channel's own specification: R14's sketch named expiry and supersession
and never named the consumed cause, so the sketch failed the property the same ruling
imposed. Finding the channel's illustrative string incomplete against the channel's own
blocking requirement is the right kind of reading.

C-3 — one statement owed before it ships, not a rejection. State which validation states
"Enter your email address." covers, and whether client-side validation replicates the
server's zod .email() predicate. If it does, that is a SECOND site emitting the claim
10e-R85 [number held, date/title not held] already records as false about a non-ASCII local
part — the user is told their address is invalid when it is not. Naming it as a second site
is sufficient; do not fix R85 here, and do not enlarge it silently.

C-6 — the separation is APPROVED and the reasoning is right. R14's uniformity binds the four
TOKEN causes, which the server collapses into one 400 body before the client sees anything;
transport and server-health say nothing about a token's state or an account's existence, and
folding them together would make C-1 false for causes it names — which R177(a) forbids.

Condition, because a two-branch client split is only exhaustive if the server's response set
is: ENUMERATE every response the verify handler can emit, with status codes, from source,
and state which branch each falls into. A third response the enumeration did not anticipate
lands in whichever branch the code happens to route it to, and that routing was never a
decision. This is the R135 discipline on a client instrument — a compound split needs each
alternative attributed, not the split as a whole shown to work.

10e-R192 — §4: disposition (c) APPROVED. The decline of (b) is RATIFIED, and the argument is better than the option it declines.

You were right and the channel was wrong to call (b) the obvious one. Authoring both the
type and the AssertEqual pin from the same paste makes them agree BY CONSTRUCTION — a
counterpart reaching its result by the same path as the thing it checks, which is 10e-R167
[persisted, :1766] retired one commit ago and 10e-R168 [persisted, :1774] in general form.
B4-2 escapes only because its right-hand side is GENERATED FROM A RUNTIME CAPTURE, and that
property does not transfer to a hand-authored assertion. The precedent is the capture, not
the assert file. Recorded so a future reader does not cite money-wire-shape.assert.ts as
licence for an authored pin.

(c) approved. Runtime narrowing is the stronger answer for the reason you give: it is not a
type claim, so the tsconfig exclusion cannot reach it, and it INVERTS FIND-S5(b) — a
wrong-shaped fixture throws instead of quietly passing, so the defect surfaces as a red test
rather than as a green one asserting a wire shape that does not exist. Moving a guard from a
layer that does not reach test files into one that does is the correct response to a
measured gap.

The residual you state — nothing verifies the declared shape against the RUNNING server
pre-deploy — is accepted as stated and gets a home rather than a mention: it goes into the
10e-close bounded-unknown record alongside 10e-R134 [number held, date/title not held],
10e-R168, and R181(b)'s frontend synthetic-control gap. Four entries, one record. The
closer you name (extending B4-1's capture beyond money leaves) is correctly identified as a
chartered cycle — widening the money predicate and relaxing the NULL fail-loud guard are
blocking-clause changes under TB-R13 and are not a small improvement made in passing.

10e-R193 — §5: the SPLIT is ACCEPTED. The recovery half is discharged, with one correction to its framing. The acknowledgement half is QUEUED, and the surviving mechanism is RECORDED so it is not re-derived.

The split is a real analytical contribution — R161 [persisted, :1702] treated the item as one
thing and it is two.

Correction to the framing, because it matters for what remains open. R161's stated concern
was that legitimate users "lose a diagnostic string and land on an unexplained login page" —
that is the ACKNOWLEDGEMENT half. The dead-end-with-no-recovery-affordance concern is R14's,
about /auth/magic. So what 10e-4 discharges structurally is not R161's stated concern; it is
the HARM that concern was about. A user whose Google token exchange failed now has a second
sign-in path that does not involve the failing dependency, which is a genuine mitigation
arriving for free, with zero information carried and zero parameter. Accepted on that
ground, stated accurately.

The acknowledgement half is QUEUED, not ruled into 10e-4. Your commit-hygiene reasoning is
adopted: the flash-cookie mechanism would make 10e-4 touch the OIDC callback, and A8 Change 1
split 10e-3b out precisely so that callback is reviewable without a frontend diff around it.
Reversing that at 10e-4 would undo the split's purpose one sub-commit later.

What the queue item now carries, and this is why the analysis was worth doing: three
mechanisms are ELIMINATED WITH REASONS, and one SURVIVES.

  - single-valued param — eliminated by R161's own argument.
  - redirect to /auth/magic — eliminated twice over: it reuses C-1 for a cause C-1 is false
    about, AND a distinguishing DESTINATION is the same oracle as a distinguishing param.
    That second half is yours and the channel had not seen it; R161 ruled on params and the
    reasoning generalises to any observable that varies with cause.
  - unconditional message — eliminated; it lies to ordinary visitors.
  - value-less server-set flash cookie — SURVIVES the constraint. Presence means "sign-in
    did not complete", no cause encoded, anonymity set of three matching the redirect's own.
    Deferred on scope, NOT on soundness, and the record says so.

The item goes to 10e-close's queue reconciliation with the constraint travelling attached,
per R161. A queue item carrying a worked elimination is worth more than one carrying an open
question, and the next cycle starts from the surviving candidate instead of re-deriving four.

10e-R194 — §6 case 2 / §9 G-1: the byte-identity form is DEGENERATE BY CONSTRUCTION and must NOT be written. RE-POINTED.

You asked the right question and the answer is the one you suspected. The server returns ONE
FIXED 200 ENVELOPE built at a single site outside every branch (10e-2), so the frontend
receives identical input for a known and an unknown address. A frontend pin asserting the two
renders are byte-identical therefore feeds one code path the same input twice and holds by
construction — it would stay GREEN against a component that branched on a response field the
server never varies. That is R167's degenerate counterpart exactly, and this time it is not
repairable by re-pointing at a sibling cause: there is no independent path on this side to
point at.

Re-pointed. The frontend pins INDEPENDENCE FROM THE RESPONSE BODY, not identity across two
inputs:

  - Assert the rendered request-submitted text is byte-equal to the C-2 literal.
  - Prove able to fail with a mutation that makes the component read ANY field of the
    response into the rendered string. That mutation breaks the relation the pin is on;
    feeding two identical responses does not.

The cross-address byte-identity property lives on the SERVER, where the two branches are
genuinely distinct code, and it is already pinned there by 10e-2's fixed-envelope and
mail-identical cases. It is CITED at 10e-close, not re-pinned here. Two pins on one property
at two layers, one of them vacuous, is worse than one real pin plus a citation — the vacuous
one reads as coverage.

State in the proposal file which of the two properties case 2 now tests, so the case list and
this ruling do not diverge.

10e-R195 — §7's delta APPROVED. §8 RATIFIED. Four conditions, then IMPLEMENTATION IS AUTHORIZED.

§7 — +20 tests / +2 files approved against A8's +8–10 / +1–2. Files land inside the range;
tests overshoot and the accounting closes: 3 (R177's blocking properties, cases 2/9/10) +
3 (§4's disposition, 17–19) + 4 (post-A8 measurements, 11–14) = 10 ruling-and-measurement
additions, leaving 10 as the A8 base at the top of its own range. Same shape as 10e-3b's
+16-against-+12, which 10e-R172 [persisted, :1820] closed by decomposition — A8 was written
2026-08-08, before R156(d), R161, R162(d), R177 and R186 existed, and a prediction cannot
anticipate rulings issued after it. Declared in advance rather than discovered at close is
what 10e-R137b [number held, date/title not held] exists to produce. The +20 remains a
PREDICTION: a miss at execution is a question, not a datum, including in the file column.

R126 [persisted, phase4-10e-3a-proposal.md] is satisfied by construction — 20 it, one row
one test, no loops, no skipIf, and apps/web has no INTEGRATION mode so no case lands in any
skipped column. The NONE INTEGRATION obligation is confirmed against what is proposed rather
than inherited from A8, which is what R175 asked.

§8 RATIFIED, and it is the preferred direction of the R178 rule. LoginPage.test.tsx:24's
getByRole("heading", { name: /sign in/i }) throws on multiple matches, so a natural "Sign in
with email" heading would have reddened a test 10e-4 never set out to touch. Avoiding it by
choosing a label and a button is better than naming a forced edit and shipping it — R178 says
a forced edit needs approval, and needing none is the superior outcome. RECORDED, not fixed:
that query is now a latent constraint on any future copy near it, since it asserts a
uniqueness it does not mean to assert. To 10e-close's queue, one line, no cycle attached.

Also RECORDED, in 10e-4's own entry and NOT by editing the design-5.4e entry (10e-R78): the
font self-host is what makes the Referer exposure same-origin-only. Had the Google Fonts
<link> survived, every magic-link click would have sent a live single-use credential in a
Referer header to fonts.googleapis.com before any application code ran, and no replaceState
could have prevented it. A narrowing chosen for visitor-IP privacy paying off in a
credential-leak threat model it was not chosen for is worth the record — it is evidence for
the standing enforcing-CSP rule, not a new rule.

Conditions, all four before or at the close-out:

  (a) TOKEN SCRUB TIMING. Rule: the URL scrub happens BEFORE the verify request is sent,
      with the token held in memory. Reason, and your measurement outranks it if it is
      wrong: scrub-after leaves a live window in which a reload re-sends a token the
      in-flight request is consuming, so the reloaded page shows C-1 to a user who
      succeeded, with the session cookie's fate depending on which request landed first.
      Scrub-before closes that window, and a reload after it lands on /auth/magic with no
      token — which renders C-1 with the request form beneath it, a recoverable state R14
      already designed for. State what a browser BACK navigation onto the scrubbed URL
      renders, in one line.
  (b) DESIGN-TRACK CONSTRAINTS, stated with the enumeration that establishes each, not
      asserted: no physical-direction utility added (ml-/mr-/pl-/pr-), no file, export or
      component renamed, components/ui/* untouched. "Not mentioned" is not "satisfied."
  (c) THE THREE NAMED REGRESSION FILES green AND byte-untouched, demonstrated with an empty
      git diff --stat over those paths, not with the claim that they are on no path edited.
  (d) Every guard proven able to fail IN BOTH DIRECTIONS with the red captured, and every
      capture IN the report rather than pointed at (10e-R112). If a mutation cannot redden
      a pin, report that — your §9 commitment to do so is the correct standing disposition
      and is ratified.

Implementation of 10e-4 is AUTHORIZED, amended by R189, R190, R191, R192, R193, R194 and the
four conditions above. Re-derive every absolute at execution against the then-current
measured baseline; carry nothing. Do not write "two independent instruments." The close-out
carries the three mandatory sections: verbatim test tail including the Test Files line with
its captured exit code, verbatim tsc output with its exit code, and the baseline hunk itself
rather than a prose restatement.

---

## Review-channel ruling block — 10e-R196 … 10e-R202, 2026-08-21

> **NON-DELIVERY MARKER (10e-R204(b), 2026-08-21) — travels beside this block, never folded
> into it.** This block was issued on 2026-08-21 and **never reached the implementer**. It was
> pasted BACKWARD into the channel instead of forward, so it was consumed at the relay: the
> channel received its own output as input and recorded it under 10e-R203(a) as an
> "identical-text echo, no answer owed." That disposition is WITHDRAWN by 10e-R204(b). The
> block below is the **re-relayed verbatim text**, unedited, and it is what is persisted. The
> gap was one full cycle wide and was closed only because the implementer's BLOCKED report
> enumerated which numbers it held.

10e-R196 — fcc721e is ACCEPTED, subject to the assertions owed under R201. Verification reconciles on every axis.

Three mandatory sections present and in form: verbatim tails carrying the Test Files line
with captured exit codes, verbatim tsc at 0 bytes both packages, and the baseline hunk
itself rather than a prose restatement.

Frontend 185 / 39 → 209 / 41, exit 0, Errors-instrument 0. API hermetic 873 / 34 / 61
byte-identical to R179's baseline, exit 0. Both tsc 0. No apps/api/** path in the stat.
Unshipped 19 → 20, re-derived.

The +24 / +2 delta is INVESTIGATED, not absorbed. Files landed on prediction; tests missed by
4 and the miss is reconciled two independent ways — per-file (6 + 12 + 5 + 1 = 24) and
against the totals (209 − 185 = 24), which agree. The four extras each trace to a ruling
issued AFTER the proposal or a measurement one of those rulings forced: R191's C-3 turned a
two-way split three-way, R190(ii) added the ordering pin, R191's C-6 enumeration produced the
empty-?token= case, R189(i) added the both-keys branch-order pin. 20 + 4 = 24, and every
addition is attributable to a specific ruling by number.

Recorded as a PATTERN now that it has held three times, strengthening 10e-R172 [persisted,
docs/modules/phase4-10e.md:1820] rather than minting anything: a test-count prediction in a
proposal is a prediction ABOUT THE PROPOSAL, and the ruling block issued on that proposal
necessarily invalidates it. 10e-3b overshot +12 by 4 and closed as 12 + 3 + 1; 10e-4 overshot
+20 by 4 and closes as 20 + 4. The reconcilable form is "proposal base + ruling-added," and
the miss is a property of the propose→rule→implement sequence, not a defect in the
prediction. What 10e-R137b [number held, date/title not held] requires is that the miss
become a question — it did, twice running, and both times the answer was in the ruling
record rather than in the code.

Running the API suite under NO obligation, because the contract fixture crossed the package
boundary, is RATIFIED and is the better instinct. A8's cadence table is keyed on what a
commit TOUCHES — db.transaction() boundaries, integration cases — which is path-shaped. This
dependency is DATA-shaped: no apps/api file changed, and an apps/api test reads a file that
moved. A path-keyed obligation table cannot see that, and the correct response is the one you
took rather than a rule amendment. Recorded so the next data-dependency crossing is
recognised rather than re-derived.

Two items the close-out did not claim and that reconcile in the channel's favour, stated so
they are on the record rather than left as luck:

  (i) The baseline hunk's offset moved 553 → 556, i.e. three net lines inserted above it.
      That is CONSISTENT with the 10e-4 module-status entry plus the two durable lines from
      R182 and R183 riding this docs half per R187(d) — one plus two. Consistent, not proven;
      R201 asks for the assertion that settles it.
  (ii) The two-mode cross-check (873 + 34 − 10 = 897) was NOT exercised this cycle, correctly,
       since 10e-4 carried no INTEGRATION obligation. Consequence, stated because it is now
       load-bearing: the INTEGRATION absolute 897 / 10 / 0 has been carried across FOUR
       commits since its measurement at 4f71494. Hermetic agreeing byte-for-byte is strong
       evidence apps/api is unchanged, but it is not a measurement of INTEGRATION, and the
       10-skipped figure is an INTEGRATION-mode observation that no hermetic run produces.
       It is re-derived at 10e-close's final reconciliation, never carried into it.

10e-R197 — M11 is the finding of this sub-commit, and it defeated BOTH conditions I wrote to prevent it. New standing rule.

A mock whose body is synchronous cannot detect a missing await. `void refreshUser()` followed
immediately by `navigate(...)` found auth state already populated, because the mock set it
before the very next statement ran. So the post-condition pin (R190(i)) and the ordering pin
(R190(ii)) would BOTH have stayed green against code that never awaits — the two conditions
were jointly insufficient, and the sufficiency condition was a third thing neither of them
named.

This is 10e-R168 [persisted, :1774] in its purest form yet: the instrument shares a TIMING
assumption with the thing it measures. Every previous instance shared a mechanism visible in
the instrument's own text — a collation, a helper, a fabricated error object. This one shares
an assumption that appears nowhere in the assertion and nowhere in the mutation; it lives in
the mock's body, which reads as setup rather than as instrument. That is why it needs its own
line rather than a citation.

Recorded against the channel, not only the implementer: R190 asked for the two pins that
matter and both were correct. Naming what a pin must ASSERT does not establish that the
harness can OBSERVE it, and I did not ask. The asymmetry is the familiar one — the defect is
invisible from inside a green suite.

Durable line, riding 10e-close, one line in CLAUDE.md's standing rules:

  A test that pins ASYNC ORDERING must mock the async dependency with a REAL scheduling
  boundary (10e-R197, earned 10e-4, 2026-08-21). A mock whose body runs synchronously
  resolves before the next statement, so `void f(); g()` is indistinguishable from
  `await f(); g()` and BOTH a post-condition pin and an ordering pin stay green against code
  that never awaits. [[10e-R168]]'s sharpest instance: the shared assumption is TIMING, and
  it lives in the mock body — setup, not assertion — so it appears in neither the pin nor
  the mutation. Give the mock a setTimeout (or equivalent) boundary and comment WHY it is
  load-bearing, or a later tidy will delete it as gratuitous.

The repair is ratified: same mutation now reddens 6 cases including both pins, and the mock
carries the comment. Comment included unprompted, which is what stops the boundary being
removed as noise by someone who does not know it is the instrument.

10e-R198 — M3 is RATIFIED as a falsification of your own control. New standing rule on mutations as instruments. The third finding is recorded without one.

You predicted the err.message mutation would redden case 12 alone and thereby prove case 12
carries its own weight. It reddened two, because case 11 also asserts
toContain(INVALID_TITLE). The mutation does not discriminate, and the discriminating one —
appending to the body, which case 11's container-level toContain survives — was found and
run (1 failed / 11 passed).

This is a distinct instrument class from every prior instance. 10e-R135 [number held,
date/title not held] governs SEARCH patterns: a positive control on a compound proves the
pattern fired, not that any alternative did. The same logic governs MUTATIONS and had not
been stated: a mutation that reddens N cases proves the SET is sensitive to it, not that any
particular member carries weight. Given this project verifies almost everything by mutation,
the gap was worth closing.

Durable line, riding 10e-close, one line in CLAUDE.md's standing rules:

  A mutation attributes sensitivity to the SET it reddens, never to a member (10e-R198,
  earned 10e-4, 2026-08-21). "This mutation proves case N carries its own weight" holds only
  if case N is the ONLY case it reddens; a mutation reddening several proves they are
  collectively sensitive and leaves each individually UNPROVEN. To attribute weight to one
  case, find the mutation its neighbours SURVIVE — the neighbours' green is the attribution,
  and it is the half that is easy to omit because it looks like nothing happened. Mutation
  counterpart to [[10e-R135]]; same logic, different instrument.

The third finding — grepping for a per-test ✓ returns 0 whether the case passed or not,
because vitest prints no per-test ✓ for a failing file — is the standing observer rule
firing, not a new one. Non-discriminating in both worlds, and correctly replaced by the
exhaustive × list plus the pass count. No line; the rule already covers it and inflating the
set cheapens it.

10e-R199 — C-3's self-falsification is ACCEPTED and is the right kind of correction. Two bounds named, and 10e-R85's queue item gains a second site.

You wrote that client-side validation deliberately does not replicate zod's .email(), then
measured and found the opposite: `<input type="email">` applies HTML5 constraint validation
and `validity.typeMismatch === true` for a non-ASCII local part. Correcting the component's
comment to say the opposite of what you had written, rather than leaving a comment that reads
plausibly and is false, is the standard — a false comment is a pointer to a capability that
does not exist, which is the defect 10e-R124 [persisted, phase4-10e-3a-proposal.md] was
partly written about.

Two bounds, neither of which changes the disposition:

  (i) The measurement is against jsdom 26.1.0, which is what runs the tests. The claim it
      supports is about PRODUCTION browsers. The constraint firing transfers — it is
      specified behaviour, implemented by every target browser — but the MESSAGE STRING does
      not: jsdom reports no user-visible message, and real browsers each emit their own.
      So "the constraint fires" is measured; "the user sees string X" is not, and no
      instrument in this repository can observe it.
  (ii) R85 is NOT enlarged, and your reasoning is right: the server refuses that user anyway,
       so the capability is unchanged. What IS new is that the refusal now has TWO voices,
       and the second is a platform-supplied, unruled, non-localizable string in an app that
       is bilingual by design. 10e-R177 made every user-facing string ruled-before-ship, and
       this one ships without being ruled because the platform emits it — a real exception to
       a rule I wrote, found by measurement rather than by argument.

To 10e-close's queue, attached to the existing 10e-R85 / 10e-R72 item [numbers held,
date/title not held], not opened here: that cycle now inherits a second site with a
platform-supplied message and the localization consequence. One line, no cycle attached to
10e-4.

10e-R200 — the TODO marker: the refusal to self-grant is RATIFIED. Removal is AUTHORIZED as a named rider on 10e-close.

Leaving TODO(module-10e-4-token-in-url) standing rather than deleting it was correct. The
behaviour is discharged and the marker is stale, but removing it edits apps/api and would
falsify the frontend-only property this commit's stat demonstrates — and doing it unasked is
the self-grant 10e-R166(b) [persisted, :1756] recorded once, applied here PREEMPTIVELY rather
than after the fact, which is the improvement.

Ruled, so it is not left to judgement a second time: the removal RIDES 10e-close, named in
its commit body as a discharged-TODO removal, with a grep -n showing the marker present
before and absent after. It does NOT ride the operator-drafted Privacy Policy commit —
10e-R12 [persisted, :1252] keeps that commit operator-authored and single-purpose.

Stating the cost — that until removal a grep for the marker finds a discharged item — is what
makes the deferral a decision rather than an omission.

10e-R201 — OWED before 10e-close. Three assertion sets, reported first, committed only on divergence.

None of these is a defect; each is an assertion the close-out did not carry for a ruling that
named specific content. 10e-R141 [persisted, :1472] governs: where a ruling names specific
text, close with grep -n output, not a hunk header. 10e-R142 [persisted, :1480] governs the
count: N ruled items close with N per-item presence assertions.

  (a) SEVEN string assertions, C-1 … C-7 as SHIPPED, one grep -n per string. C-1 must appear
      in its R191-AMENDED form — "This sign-in link isn't valid." The amendment turned on one
      word, and one word is exactly what a hunk header cannot settle. If any string diverges
      from what R191 approved, that is a corrections commit; if all seven match, it is a
      report and nothing more.
  (b) The C-6 RESPONSE ENUMERATION from source, which R191 made a condition and which the
      close-out references only through the case it produced. Every response the verify
      handler can emit, with status codes, and which of the two client branches each falls
      into. A two-branch split is exhaustive only if the server's response set is, and the
      empty-?token= case proves the enumeration found something — which is precisely why the
      enumeration itself is the artifact, not the case it happened to yield.
  (c) TWO presence assertions that the R182 and R183 durable lines landed in CLAUDE.md per
      R187(d). The baseline hunk's 553 → 556 offset is consistent with them plus the
      module-status entry, but consistency is not presence, and the omitted item is precisely
      the one not on the list you are reading.

Report all three in the channel. No commit unless (a) diverges.

10e-R202 — 10e-4 is CLOSED. The remaining sequence, and what 10e-close carries.

10e-4 was the last code sub-commit. Remaining: the operator-drafted Privacy Policy copy commit
(10e-R12, gates the DEPLOY, not 10e-close's code — your only job on it is confirming at
10e-close that the commit exists and rides the deploy) → deploy → 10e-close → the production
end-to-end send proof (10e-R15 [persisted, :1278] / 10e-R147 [persisted, :1548]), which is the
ANNOUNCEMENT gate and is not discharged by attestation.

10e-close carries, and this list is the reconciliation target rather than a summary:

  - Public API contracts: the two verify shapes AND the DISCRIMINATION RULE (10e-R124,
    10e-R189). Two shapes without a stated discrimination rule hands the next consumer M-1.
  - The BOUNDED-UNKNOWN record, FOUR entries: the Errors grep's undemonstrated independence
    from the exit code (10e-R134 + 10e-R168); the frontend control's synthetic provenance
    (R181(b)); and nothing verifying the declared shape against the running server pre-deploy
    (R192). Do not write "two independent instruments."
  - INTEGRATION re-derived, not carried (R196(ii)). Final two-mode cross-check exercised.
  - Frontend baseline re-derived from 209 / 41.
  - The on-box cleanup-schedule activation proof (A6.7) — the magic_expired_deleted= /
    magic_consumed_deleted= log shape is the discriminator, and it is pinned by a hermetic
    assertion precisely so it is checkable on the box.
  - QUEUE RECONCILIATION: 10e-R129 (own cycle, post-10e, do not bundle); 10e-R85 / R72 with
    R199's second site; 10e-R161's acknowledgement half with three eliminated mechanisms and
    one survivor; LoginPage.test.tsx:24's getByRole heading constraint; R200's TODO rider;
    R155's soft-delete email retention.
  - PERSISTENCE: 10e-R188 … 10e-R202 appended verbatim to docs/modules/phase4-10e.md in
    Format A under ^10e-R<n> —  — FIFTEEN rulings — with fifteen presence assertions run
    before the commit, the ^10e-R0 —  control, and the format stated per 10e-R183(ii).
    Checkable prediction, stated in advance: Format A goes 48 → 63 blocks, numbered
    140 … 202, contiguous. 202 − 140 + 1 = 63 and 48 + 15 = 63 agree, so a miss is a
    question. Format B stays 11. Check header-by-header; never sweep the range.
  - The R197 and R198 durable lines ride this commit.

Deliver R201's three reports. Then the 10e-close prompt comes from the channel.

> **SUPERSESSION MARKER (10e-R203(c) + 10e-R204(d)) — travels beside 10e-R202's final
> PERSISTENCE bullet, never folded into it.** R202 assigned the persistence to 10e-close and
> predicted Format A 48 → 63 for FIFTEEN rulings. **10e-R203(c) moved the persistence AHEAD of
> the 10e-4 conversation boundary** — because the boundary falls between 10e-4 and 10e-close,
> and fifteen rulings living only in a conversation across a handoff is the R36–R101 gap
> forming prospectively. **10e-R204(d) then moved the count twice more**, to SEVENTEEN
> (R188…R204), with the final prediction Format A 48 → 65. Each figure was correct when
> written; a count describing the set it belongs to is falsified by any addition to that set.
> R202's text above is unedited, per the 10e-R148 precedent.

---

## Review-channel ruling block — 10e-R203, 2026-08-21

> **WITHDRAWAL MARKER (10e-R204(b), 2026-08-21) — travels beside 10e-R203(a), never folded
> into it.** **10e-R203(a) is WITHDRAWN.** It recorded the R196–R202 arrival as "an
> identical-text echo, second occurrence, no answer owed, closed." That disposition was wrong:
> the block had been pasted BACKWARD into the channel rather than forward to the implementer,
> so the channel was receiving its OWN OUTPUT, which is positive evidence of NON-DELIVERY
> rather than of duplication. R203(a) stands below as issued; this marker is the correction.

10e-R203 — 10e-R202's persistence assignment is AMENDED. Persistence moves AHEAD of the conversation boundary. The relay event is recorded.

(a) Relay event, recorded and closed. The 10e-R196 … 10e-R202 block was returned to the
channel verbatim rather than a report. Per 10e-R115 [number held, date/title not held] a
duplicate arrival is relay-layer until proven otherwise and only the operator sees both
sides; per 10e-R119 the dangerous variant is a number arriving twice with DIFFERENT text,
and this is not that — the text is byte-identical to what the channel issued. No ruling
numbers are issued for it, no answer is owed on it, and R201's three reports remain the
outstanding item. Second occurrence this conversation; both were identical-text echoes.

(b) The defect, and it is the channel's. 10e-R202 assigned the persistence of 10e-R188 …
10e-R202 to 10e-close. The conversation boundary falls BETWEEN here and 10e-close — the
operator's standing pattern is a new conversation per module or major sub-commit boundary,
and 10e-4 is closed. So R202 as written leaves FIFTEEN rulings living only in conversation
across a handoff.

That is the R36–R101 gap forming, prospectively and in full view. Those rulings are OWED,
BLOCKED on source availability, and must not be reconstructed — because the verbatim text
survives only in conversations that ended. R202 would have reproduced the identical
condition by the identical mechanism: rulings issued, relied upon, never written down, and
then a conversation closes. The persist-first standing rule exists for exactly this and
says the record is written BEFORE the boundary, not after it.

(c) AMENDED. The persistence of 10e-R188 … 10e-R203 rides a DOCS-ONLY COMMIT AT THE 10e-4
BOUNDARY, before this conversation closes. It does not ride 10e-close.

Moving with it, for the same reason — a standing rule that exists only in a conversation is
worse than one in a file, because a reader who does not know it exists cannot look for it:

  - The 10e-R197 durable line (async-ordering mocks need a real scheduling boundary).
  - The 10e-R198 durable line (a mutation attributes sensitivity to the SET, not a member).

Both were assigned to 10e-close by their own blocks; both are earned by work already
committed at fcc721e, so there is nothing to wait for.

(d) The commit's shape:

  - Docs-only. Prove it by exclusion BEFORE committing, not after.
  - Gates skipped under 10e-R149, 2026-08-19, "R144(a)'s instrument was MIS-SPECIFIED BY
    THE CHANNEL" — permanently licensed, premise not re-measured, not cited as R144.
  - 10e-R188 … 10e-R203 appended verbatim to docs/modules/phase4-10e.md in Format A under
    ^10e-R<n> — . SIXTEEN rulings, not fifteen — R202's figure was correct when written and
    this block moves it.
  - SIXTEEN presence assertions, one per ruling, run before the commit, Format A, each with
    the ^10e-R0 —  control and the format stated per 10e-R183(ii).
  - The RULING-SET COMPLETENESS note amended to record R188–R203 persisted.
  - The two durable lines into CLAUDE.md's standing rules.

Checkable prediction, stated in advance so a miss is a question: Format A goes 48 → 64
blocks, numbered 140 … 203, contiguous, no gaps, no duplicates. 203 − 140 + 1 = 64 and
48 + 16 = 64 agree by different routes. Format B stays 11. Check header-by-header; never
sweep the range.

(e) Sequence, and it is strict:

  1. R201's three reports, delivered in the channel. Nothing is committed on them unless
     (a) diverges.
  2. If R201(a) diverges — any of C-1 … C-7 not matching what R191 approved — the
     corrections commit lands FIRST and belongs to this conversation, which holds the
     reasoning behind the C-1 amendment.
  3. Then this persistence commit.
  4. Then the boundary.

(f) What does NOT move. Everything else in 10e-R202's list stays at 10e-close: the public
API contract entries with the discrimination rule, the four-entry bounded-unknown record,
the INTEGRATION re-derivation, the frontend baseline re-derivation, the on-box
cleanup-schedule activation proof, and the queue reconciliation. Those are close-out work
and belong there. Only the ruling record and the two standing-rule lines move forward,
because only they are damaged by a conversation ending.

Deliver R201's three reports. Then this commit. Then stop; the next prompt comes from the
successor conversation.

---

## Review-channel ruling block — 10e-R204, 2026-08-21

10e-R204 — the BLOCKED report is ACCEPTED IN FULL and it FALSIFIES 10e-R203(a). The relay fault is diagnosed. New standing rule.

(a) The refusal was correct and is ratified without qualification. Nine of sixteen held, seven
absent, and the two available wrong moves were both refused: reconstructing R196–R202 from
R203's summaries, which 10e-R102 forbids and 10e-R71 rates as worse than an uncheckable
block; and committing 9 while the completeness note claimed 16, which is the same defect at a
smaller number. Reporting before acting, because acting would mean fabricating, is the
standing discipline working exactly as intended. The disk-state measurement — Format A 48,
140…187, contiguous, nothing ≥ 188, control 0/rc=1 — establishes the starting point is not in
question, which is what makes the blocked report actionable rather than merely an objection.

(b) 10e-R203(a) is WITHDRAWN. It recorded the R196–R202 arrival as "an identical-text echo,
second occurrence, no answer owed, closed." That disposition was wrong, and the correction
travels adjacent to R203(a) rather than folded into it (10e-R148 precedent [persisted,
:1558]): when R203 is persisted, R203(a) stands as issued with this withdrawal beside it.

The diagnosis, which your report supplies the missing half of. You have issued a report at
every turn and never an echo. The channel received its own R196–R202 text as input. Both
accounts are true simultaneously under exactly one hypothesis: the block was pasted BACKWARD
into the channel instead of FORWARD to you, so it was consumed at the relay and never
delivered. Your paste-buffer / message-selection reading is the correct one, and it explains
both events in this conversation — the earlier Step 0 duplicate was your report re-pasted to
the channel, this one was the channel's own output re-pasted to the channel.

(c) The rule I got wrong, and it is worth more than the incident. 10e-R115's duplicate-arrival
disposition assumes a duplicate arriving at its RECIPIENT. What arrived here was the channel's
own OUTPUT returning to its AUTHOR, and those are not the same event: a duplicate at the
recipient means the message was delivered twice, while output returning to its author is
POSITIVE EVIDENCE OF NON-DELIVERY. I classified the second as the first because both satisfy
"text identical to something already in this conversation" — an instrument that shares its
mechanism, text identity, with the thing that defeats it. 10e-R168 [persisted, :1774] again,
on the relay seam this time, and the cost was seven rulings undelivered for a full cycle while
both ends believed the channel had answered.

Durable line, riding the persistence commit, one line in CLAUDE.md's standing rules:

  A block returning to its AUTHOR is evidence of NON-DELIVERY, not of duplication
  (10e-R204, earned 10e-4 boundary, 2026-08-21). [[10e-R115]]'s re-relay disposition governs
  a duplicate arriving at its RECIPIENT; the channel receiving its OWN output back is the
  opposite signal — the message was consumed at the relay and never reached the far end.
  Text identity cannot distinguish them, so AUTHORSHIP is the discriminator: on receiving
  text this end authored, treat the original as UNDELIVERED, re-relay it verbatim, and do
  not record it as an echo. Only the author can recognise it, which is why the obligation
  sits with the author and not the operator.

(d) The persistence set MOVES AGAIN, and the count is DERIVED AT COMMIT TIME, not carried.
The set is now 10e-R188 … 10e-R204 — SEVENTEEN rulings. R202 said fifteen, R203(d) said
sixteen, this says seventeen, and each figure was correct when written: a count describing the
set it belongs to is falsified by any addition to that set, which is 10e-R118 [number held,
date/title not held] with the interval collapsed to zero.

So do not trust seventeen either. DERIVE the count from the blocks you actually hold in the
relay at commit time, state the derivation, and reconcile it against the arithmetic below. If
they disagree, that is a question and it stops the commit.

Checkable prediction, stated in advance, closing two ways: Format A 48 → 65 blocks, numbered
140 … 204, contiguous, no gaps, no duplicates. 204 − 140 + 1 = 65 and 48 + 17 = 65 agree by
different routes. Format B stays 11. SEVENTEEN presence assertions, Format A, each with the
^10e-R0 —  control and the format stated per 10e-R183(ii). Check header-by-header; never
sweep the range.

(e) Everything else in R203 stands unchanged: persistence rides a docs-only commit at the
10e-4 boundary and not 10e-close; the R197 and R198 durable lines move with it, joined now by
this one; gates skipped under 10e-R149, 2026-08-19, "R144(a)'s instrument was MIS-SPECIFIED
BY THE CHANNEL"; docs-only proven by exclusion before committing; the completeness note
amended to record R188–R204 persisted.

Sequence, unchanged from R203(e) and now unblocked: R201's three reports → the C-1…C-7
corrections commit FIRST if R201(a) diverges → the persistence commit → stop at the boundary.

---

# APPENDED RULING BLOCKS — 10e-R205 … 10e-R209, 10e-R237 … 10e-R241 (persisted 2026-08-22 under 10e-R240)

Pasted from the review channel **verbatim**, not reconstructed and not summarized, per 10e-R102
and 10e-R143. The original text of each block is unedited; the only additions are the section
headers. **R205–R209 were RECOVERED rather than held** — see the 2026-08-22 amendment to the
RULING-SET COMPLETENESS note above for their provenance (10e-R238).

**Note the deliberate gap: 10e-R210 … 10e-R236 are NOT persisted here and are NOT owed.** They
were procedural — prompts, acceptances and reconciliations consumed within the predecessor
session. A contiguity check across this file must not read that gap as loss (10e-R240(c)).

---

## Review-channel ruling block — 10e-R205, 2026-08-21

10e-R205 — R201(a) is DISCHARGED. All seven match; no corrections commit. Two findings, one of them the channel's.

C-1 carries the R191 amendment — "isn't valid" — and the six remaining strings match what R191
approved. Seven grep -n results, one per string, which is what 10e-R141 [persisted,
docs/modules/phase4-10e.md:1472] requires where a ruling names specific text.

(a) The defective absence check, self-reported, is RATIFIED as a finding. Grepping the
component for "is no longer valid" returned rc=0 on line 49 — the COMMENT explaining why the
amendment was made. That is 10e-R171 [persisted, :1808] exactly: a search for a thing finds
the discussion of the thing. Reporting the defective instrument alongside its replacement,
rather than only the replacement, is the standard — the comment-stripping form is the
discriminating one, and its rc=1 means something only because the un-stripped form's rc=0
was shown first.

Worth naming as the generalisation, since it is the second surface: R171 said a presence
check must test the property, not a string that correlates with it. The ABSENCE case is the
same rule inverted — an absence check over a file containing prose ABOUT the absent string is
satisfied by the prose, and the fix is the same shape: strip the layer that discusses the
code before checking the code. No new line; R171 covers it and inflating the set cheapens it.

(b) FINDING, and it is mine rather than yours. Your positive control surfaced that "is no
longer valid" lives at magic-link.ts:391 — THE SERVER'S OWN 400 BODY. Your characterization,
"none of which is our copy," is correct about ownership and leaves the substantive point
unstated: the server string carries the exact temporal assertion R191 removed from C-1.

R191 amended C-1 because "no longer" means not now, though formerly — the assertion 10e-R14
[persisted, :1268] refused 410 Gone for, since it claims the token once existed. That
reasoning does not stop at the client boundary. The server emits the identical claim, to any
caller reading the response directly, and it is false in the never-existed case for the same
reason it was false in C-1.

Bounded honestly, because it is small: it is UNIFORM across all four causes, so it is no
oracle; no client renders it (M3's mutations established that rendering err.message reddens);
and no consumer keys on it, since readErrorCode reads `code`. It is an accuracy defect in a
public error string, not a security one.

The cause is mine. R191 ruled on §3, which was frontend copy, and I did not ask whether the
server said the same thing. That makes this the 10e-R13(b) [persisted, :1258] shape — its
closing sentence, "silently fixing one of two identical crash paths is not acceptable," on a
string rather than a crash. Fixing one site and leaving its twin is the pattern that ruling
exists to stop.

NOT opened in 10e-4, which is closed, and it does not gate the deploy. To 10e-close, with the
paste owed first: quote magic-link.ts:391 VERBATIM in the channel, and the disposition is ruled
then, not now — R177's rule that user-facing strings are ruled before they ship applies to a
replacement as much as to an original. 10e-close already touches apps/api under R200's TODO
rider, so if it is changed it rides there as a second named rider, never folded in silently.

(c) Recorded, and it strengthens an existing entry rather than adding one:
MagicLinkPage.test.tsx:71 is a fixture standing in for the server, carrying the server's
string. Nothing checks it against the server. That is R192's bounded-unknown entry — nothing
verifies the declared shape against the running server pre-deploy — now with a CONCRETE
INSTANCE rather than a general statement. Cite the instance in the 10e-close record; a
bounded unknown with a named example is checkable in a way a general one is not.

---

## Review-channel ruling block — 10e-R206, 2026-08-21

10e-R206 — R201(b) is DISCHARGED. The §12.5 self-correction is ACCEPTED, and 10e-R78 governs what happens to it.

The enumeration is complete in the form the condition required: nine response classes, each
with source, status, code and client branch, derived from source rather than from the case it
produced. That distinction was the whole point of making the enumeration the artifact.

The self-correction is right and its DISPOSITION matters more than the arithmetic. Your
committed §12.5 wrote "failVerify ×5"; derived, it is 4 call sites and 5 reasons, with :485
passing no known reason and the classifying SELECT resolving it to one of three, so not_found
is reachable from two sites. Conflating reasons with call sites is the error, correctly named.

10e-R78 [persisted, CLAUDE.md standing rules] governs: phase4-10e-4-proposal.md is a
HISTORICAL RECORD — a proposal as submitted — and must NOT be edited to match the present.
The correction travels ADJACENT, which is what reporting it here and persisting it with this
block accomplishes. Do not touch §12.5. A future reader finding "×5" in the proposal and this
correction in the ruling record has the full picture; one finding a silently-corrected
proposal has neither the error nor the fact that it was caught.

The load-bearing half of the enumeration is the DEFAULT ARM, and it is stated in exactly the
right form: the split is exhaustive because its default is C-6 and precisely one response
reaches C-1. #8 and #9 carry no `code` at all, so readErrorCode returns undefined and they
fall to the default correctly rather than by accident. Your own sentence is the argument — a
split whose default were C-1 would describe a 500 as a spent link — and it generalises: when
a client splits on a server's response set, the default arm must be the one that is merely
UNHELPFUL when wrong, never the one that makes a specific false claim. An unanticipated tenth
response now lands in C-6 and says something true.

---

## Review-channel ruling block — 10e-R207, 2026-08-21

10e-R207 — R201(c) is DISCHARGED on PRESENCE. R196(i) is SETTLED. One cosmetic check deferred, not owed.

CLAUDE.md:435 (R182) and :450 (R183), one match each, rc=0, with a negative control on a line
never written. R196(i)'s 553 → 556 offset moves from CONSISTENT to SETTLED: two durable lines
plus the 10e-4 module-status entry, three lines, arithmetic closed by an assertion rather than
by plausibility. That is the distinction R201(c) existed to force, and consistency-is-not-
presence held — the offset would have been equally consistent with three lines of anything.

What was established is PRESENCE, which is what the condition asked for. PLACEMENT was not,
and R183's own text says it continues the 10e-R171 entry. If it did not land adjacent to
R171, a standing rule sits away from its family and is harder to find — the shape of the
session-cookie helper-index omission, where a live index naming two of three siblings is
worse than naming none. Cosmetic, one line, and NOT owed as a separate report: fold the
observation into 10e-close's docs pass, and if it is misplaced, move it there.

---

## Review-channel ruling block — 10e-R208, 2026-08-21

10e-R208 — 3e4645c is ACCEPTED. The primary prediction MET, two ways. ONE COROBORATING FIGURE DOES NOT CLOSE, and it is owed before the boundary.

Accepted on the primary instrument. Format A 48 → 65, numbered 140 … 204, contiguous, no
gaps, no duplicates, with the two routes agreeing — 204 − 140 + 1 = 65 and 48 + 17 = 65.
Format B unchanged at 11. Seventeen presence assertions, Format A stated per R183(ii), each
with the ^10e-R0 —  control at 0 / rc=1. The count DERIVED at commit time and reconciled
against the range rather than carried, which is R204(d) applied as written. Docs-only proven
by exclusion WITH a positive control — removing docs/ from the allowlist yielding one row is
what makes the rc=1 an observation rather than an empty result. Gates skipped under 10e-R149,
2026-08-19, cited correctly. Three markers adjacent, never folded in, with R202's text
unedited including its superseded 48 → 63.

The figure that does not close. The report carries two line-count claims and they disagree
by 24:

  - the diffstat: 2 files changed, 703 insertions(+), NO deletions clause, of which 3 are
    CLAUDE.md — so 700 insertions into phase4-10e.md, and with zero deletions the file grew
    by 700;
  - the reconstruction: 2095 + 676 = 2771, a growth of 676.

700 − 676 = 24. Both figures describe the same commit and only one can be right.

This is a QUESTION, not a defect (10e-R137b [number held, date/title not held]), and it is
bounded on both sides. It does not touch the block count, which closed two independent ways
and is the instrument that matters; 676 was offered as CORROBORATION under 10e-R113
[number held, date/title not held], which asks that a count claim be verified by
reconstruction rather than subtraction. A reconstruction that disagrees with the diff it
reconstructs is precisely the case R113 exists to surface — the arithmetic is the cheap half,
and the reproduced content is the observation.

The likeliest innocent reading, which you are free to falsify: 676 is the appended
RULING-BLOCK lines alone, excluding the completeness-note amendment and the adjacency
markers, i.e. a COMPONENT reported as the TOTAL. If so, say which lines the 676 covers and
which 24 it omits, and the figure becomes true about a named thing instead of false about the
file.

OWED before the boundary, and it is one command plus one sentence:

  git show --stat 3e4645c          (or the equivalent) — insertions and deletions per file
  wc -l on docs/modules/phase4-10e.md at 3e4645c and at 3e4645c^

Report the four numbers and state which claim was wrong and why. No commit unless the
enumeration shows something committed that should not have been — and nothing in the report
suggests it does. If the growth is 700, the persisted line count is 2795 or 2796, and a
figure stated in the channel is corrected in the channel; nothing on disk moves.

Everything else about 3e4645c stands ACCEPTED. Deliver the four numbers. Then the boundary.

---

## Review-channel ruling block — 10e-R209, 2026-08-21

10e-R209 — R208 is DISCHARGED. The reconstruction closes and the mechanism is not the one the channel guessed. New standing rule.

The four numbers settle it: 700 insertions, 0 deletions, 2095 → 2795. The diffstat was right
and the reconstruction was wrong. Corrected in the channel; nothing on disk moves.

What makes this closed rather than merely explained is the reconstruction, not the
arithmetic. 700 − 676 = 24 raised the question and is equally satisfied by any 24-line
discrepancy anywhere; deleting lines 1457–1480 from the committed file and reproducing 2771
exactly is what identifies WHICH 24, and no other 24-line change could produce that result.
10e-R113 [number held, date/title not held] working as specified: the count is arithmetic,
the reproduced content is the observation.

The channel's innocent reading was WRONG and the refinement is the finding. I proposed a
component mis-summed as a total. It was not: 2771 was a CORRECT measurement of a REAL
INTERMEDIATE STATE, taken after the append and before the completeness-note edit. Nothing
was mis-added. The referent moved out from under a correct number.

That is a distinct class and it is why this gets a line rather than a citation. 10e-R118
[number held, date/title not held] is the interval collapsed to ZERO — the write that states
the figure is the write that falsifies it. Derive-don't-carry spans CYCLES — a figure stated
in one and read in a later one. This sits between them: a real interval WITHIN one commit's
construction, opened by the author's own measurement and closed by the author's own
subsequent edit. Re-deriving at execution does not help, because the measurement WAS at
execution; it was simply not at the last one.

Durable line, riding 10e-close, one line in CLAUDE.md's standing rules:

  A figure measured MID-CONSTRUCTION describes the state it was measured in, not the commit
  (10e-R209, earned 10e-4 boundary, 2026-08-21). Between a measurement and the commit it is
  reported about there is a window, and any write into that window falsifies the figure
  without touching it. Distinct from [[10e-R118]], where the interval is zero, and from
  derive-don't-carry, where it spans cycles: here the author measures correctly, edits, then
  reports the earlier measurement as describing the finished artifact. Re-derive after the
  LAST edit, not after the largest one — the small trailing edit is the one that gets
  forgotten, precisely because it does not feel like the work.

Both figures are now true about named things: 676 is the ruling-block append, 24 is the
completeness-note amendment, 700 = 676 + 24 is the file's growth, 703 = 700 + 3 is the
diffstat. The block count is untouched by any of it — it closed two independent ways and
remains 65, 140…204, contiguous. Reporting the defective figure's mechanism rather than only
its correction is what makes it a finding instead of an erratum.

3e4645c is ACCEPTED without residue. 10e-4 is CLOSED.

---

## Review-channel ruling block — 10e-R237, 2026-08-22

10e-R237 — R205(b) DISPOSITION RULED: the server error string CHANGES. Named rider on 10e-close. No second deploy owed.

apps/api/src/routes/magic-link.ts:391 emits error: "This sign-in link is no longer valid."
inside MAGIC_LINK_INVALID_BODY (:388-393), whose code field is "MAGIC_LINK_INVALID" (:392).
It carries the exact temporal assertion 10e-R191 removed from the client string C-1. "No
longer" claims the token once existed, which is what 10e-R14 refused 410 Gone for. In the
not_found case it is simply false.

Bounded honestly. It is UNIFORM across all FIVE causes — not_found, expired,
consumed_or_superseded, inexact_email_match, user_missing, the closed set at :373-379 — so
it is no oracle. The record said four; five is the derived figure and 10e-close carries five.
One envelope constant, one emit site (:441). No production client renders it; its only
apps/web occurrence is a test fixture at MagicLinkPage.test.tsx:71, and sibling tests at
:157/:164 pass "alpha" and "omega" under the same code, pinning the component's behaviour as
message-independent. No consumer keys on it: MagicLinkPage.tsx:104 branches on
err.code === "MAGIC_LINK_INVALID", and server and client literals were verified
byte-identical, 18 characters, by extraction and od -c dump behind a working negative
control. An accuracy defect in a public error string, not a security one.

It changes for the same reason R191 changed C-1. Leaving it is silently fixing one of two
identical paths, which is 10e-R13(b)'s shape on a string rather than a crash. This is the
channel's own miss: R191 ruled on frontend copy and did not ask whether the server said the
same thing.

REPLACEMENT: "This sign-in link is not valid." Uniformity preserved, no temporal claim, no
oracle. It reddens the hermetic assertion at magic-link.test.ts:529, which pins the old
text; that test updates in the SAME commit. R177's rule that user-facing strings are ruled
before they ship applies to a replacement as much as to an original, and this is that ruling.

NO SECOND DEPLOY IS OWED. The string is rendered by no client and keyed on by no consumer.
It ships whenever the next deploy happens. Do not schedule one for it.

---

## Review-channel ruling block — 10e-R238, 2026-08-22

10e-R238 — R205 … R209 are RECOVERED VERBATIM. Provenance stated. Your NOT-HELD report is RATIFIED, and so is your absence report at Step 0.0.

The five blocks above are not reconstructions and not retypings. They were read directly out
of the predecessor channel conversation "Module state and deployment gates documentation"
(id c0b7cd9b-8d4e-4f64-8f5a-cb89b35d6043), turns 15 and 17, using the channel's own
conversation-search and read tools. The source is the message in which this channel ORIGINALLY
AUTHORED them. That is the strongest provenance available for an unpersisted block — better
than an implementer's held copy, because it is the author's own emission rather than a
transported copy of it.

Two independent routes agree on the line counts. The channel enumerated them from the
recovered text: 54, 26, 14, 47, 43. The predecessor's hold-confirmation report, carried
forward in the 10e-close opening prompt, gave the same five figures. Neither route is
mechanical, so your enumeration under R240 is the third and it is the one that closes them.

RATIFIED, and it is the standard: you returned NOT-HELD for five of five, enumerated the
total absence rather than reporting a vague loss, and refused to reconstruct from the
subject-matter references scattered through the Step 0 prompt — which named R205's lettered
sub-parts, R207's subject, and the persistence prediction. Every one of those was a
reconstruction surface. Declining all of them is 10e-R71 and 10e-R102 applied correctly under
pressure, and it is the second cycle running in which an implementer's refusal to reconstruct
is what made recovery possible rather than a fabricated ratification.

ALSO RATIFIED, Step 0.0. You reported the shell prompt string as NOT OBSERVABLE rather than
substituting something for it. Correct, and it falsifies a channel obligation rather than
your execution. "Every operator command block opens with a Step 0 prompt-confirmation line"
was written for an interactive shell that renders a prompt. Your bash tool is
non-interactive and renders none. The obligation's PROPERTY is shell identity, shell version
and working directory; the prompt string was a CORRELATE of it. That is 10e-R171 firing on
the channel's own standing rule, which is the third surface for R171 and the reason it does
not get a new line. RESTATED, standing: a Step 0 shell-context confirmation reports $0, the
shell version and pwd. A prompt string is reported if observable and recorded as absent if
not; its absence discharges nothing and blocks nothing.

---

## Review-channel ruling block — 10e-R239, 2026-08-22

10e-R239 — THE HOLD ATTESTATION IS RETIRED AS AN EVIDENCE CLASS. New standing rule.

The predecessor did everything the protocol asked. It named the exposure explicitly rather
than hiding it. It obtained a hold confirmation in the strongest available form — first line,
final line, and enumerated line counts for all five blocks. It independently re-counted three
of them in the channel and matched exactly. It wrote the recovery path into the successor
prompt in advance. Every one of those acts was correct.

The blocks were still lost within roughly twenty-four hours, and nothing in the record looked
any different the moment before the loss was discovered than it had the moment after the
attestation was taken.

That is the finding, and it is not about diligence. A hold confirmation attests to a STATE at
an instant. Persistence to disk establishes a PROPERTY that survives. The two read alike in a
report — both come back as "confirmed, enumerated, matched" — and they are different kinds of
thing. Worse, a stale FIGURE at least leaves a trace: a count that no longer matches its
artifact can be caught by re-deriving it. A stale HOLD leaves no trace at all. There is
nothing to re-derive, nothing that stops agreeing with anything, and no way to distinguish a
live hold from a dead one except by asking — which means the loss is invisible until the
moment it blocks work.

STANDING, and it retires a practice this module used four times:

  An attestation about VOLATILE STATE is falsified by time alone, and its expiry leaves no
  trace (10e-R239, earned 10e-close, 2026-08-22). A hold confirmation is evidence that a
  session held text WHEN ASKED, never that it holds it now. It has no shelf life and, unlike
  a stale figure, no tell. Therefore: NO RULING CROSSES A SESSION BOUNDARY IN AN
  IMPLEMENTER'S CONTEXT. The medium for a ruling that must survive a boundary is disk, and
  the persistence commit is written BEFORE the boundary rather than scheduled after it. Where
  persistence genuinely cannot precede the boundary, the ruling's verbatim text travels
  INSIDE the handoff prompt — as R209's did, which is exactly why R209 was the one block that
  never needed recovering.

Note what that last clause records. Of the five blocks issued after 3e4645c, R209 was carried
in the handoff prompt verbatim and R205–R208 were not. R209 survived the boundary intact in
the operator's hands. The other four did not. The predecessor had the correct mechanism
available, used it for one block, and used an attestation for the other four. The experiment
was run and it returned a clean result.

---

## Review-channel ruling block — 10e-R240, 2026-08-22

10e-R240 — THE PERSISTENCE COMMIT. Ten blocks, docs-only, one file. Confirm by enumeration first. Nothing else is touched.

This commit exists to move ten ruling blocks out of volatile context onto disk. It does that
and nothing else. Every other 10e-close obligation — the Public API contract entry, the
bounded-unknown record, the R200 TODO rider, R237's string change, R207's line move, R209's
durable CLAUDE.md line, and all baseline re-derivation — stays where it is and is NOT started
here. Narrowing this commit to one file is deliberate: the failure being repaired is a
persistence failure, and the repair should not acquire dependencies that could delay it.

(a) CONFIRM BEFORE ANYTHING ELSE. For each of 205, 206, 207, 208, 209, 237, 238, 239, 240,
241, report exactly one of:

    HELD-VERBATIM — followed by that block's first line verbatim, its final line verbatim,
      and its line count BY ENUMERATION, not by eye.
    DID-NOT-ARRIVE — nothing else.

    GATE: proceed to (b) only if all TEN report HELD-VERBATIM. If any reports
    DID-NOT-ARRIVE, report BLOCKED, enumerate which arrived, COMMIT NOTHING, and stop. Do not
    reconstruct a missing block from this prompt, from CLAUDE.md, from
    docs/modules/phase4-10e.md, from a close-out report, or from any summary.

    If any number arrives TWICE with DIFFERENT text, report the divergence and act on
    NEITHER. Picking one manufactures a ratification out of a transport failure.

(b) THE COMMIT. Docs-only, and prove it by exclusion BEFORE committing, with a positive
control — an exclusion sweep returning nothing is the same output as a sweep that did not
run. Gates skipped under 10e-R149, 2026-08-19, "R144(a)'s instrument was MIS-SPECIFIED BY THE
CHANNEL" — permanently licensed, premise not re-measured, never cited as R144.

    ONE FILE: docs/modules/phase4-10e.md. Not CLAUDE.md. Not any source file.

    Append all ten blocks verbatim in Format A under ^10e-R<n> — , in ascending numeric
    order, then amend the RULING-SET COMPLETENESS note per (c).

(c) THE COMPLETENESS-NOTE AMENDMENT, and one clause of it is load-bearing:

    - 10e-R205 … 10e-R209, 10e-R237 … 10e-R241 are now PERSISTED. State the PROVENANCE of
      R205–R209: recovered from the predecessor channel conversation under 10e-R238, not
      reconstructed.
    - 10e-R210 … 10e-R236 ARE NOT MISSING AND ARE NOT OWED. They were procedural — prompts,
      acceptances and reconciliations consumed within the predecessor session — and were
      recorded as not owed persistence at the 10e-close handoff. Write this down. If it is
      not written down, twenty-seven numbers become UNACCOUNTED-FOR by default the first time
      anyone runs a contiguity check, and the record cannot then distinguish deliberate
      omission from the R36–R101 mechanism. This clause is the entire reason the note is
      amended in the same commit rather than later.
    - FORMAT A IS NO LONGER CONTIGUOUS AND THAT IS BY DESIGN. State the shape explicitly:
      140 … 209 contiguous, then a deliberate gap at 210–236, then 237 … 241 contiguous.
      A future presence check must not read that gap as loss.
    - R103, R131, R139 and R36–R101 are unchanged — still issued-but-unpersisted, still OWED,
      still not to be reconstructed. Their BLOCKED status is under review per 10e-R241; do
      not act on that here.

(d) CHECKABLE PREDICTION, stated in advance so a miss becomes a question. Format A 65 → 75.
    Two routes, and they must agree: 65 + 10 = 75, and (209 − 140 + 1) + 5 = 70 + 5 = 75.
    Format B unchanged at 11. TEN presence assertions, one per ruling, run BEFORE the commit,
    Format A stated per 10e-R183(ii), each with the ^10e-R0 —  control expected at 0 / rc=1.

    DERIVE the final count at commit time from the blocks actually present and reconcile it
    against the range; do NOT carry 75 from this block. A count describing the set it belongs
    to is falsified by any addition to that set (10e-R118).

(e) THE LINE COUNT IS MEASURED AFTER THE LAST EDIT, NOT THE LARGEST ONE. This commit makes
    two writes to one file: the block append and the completeness-note amendment. That is
    precisely the construction window 10e-R209 was earned on, and R209 is in the payload.
    Measure wc -l after BOTH edits, immediately before committing, and reconcile it against
    the diffstat. If the two disagree, reconstruct which lines account for the difference and
    report that — do not report the arithmetic alone.

(f) DO NOT MEASURE R207's LINE NUMBERS IN THIS COMMIT. R207 names CLAUDE.md:450 for the R183
    standing-rule line. That figure is already known stale by at least one later commit, and
    10e-close's docs pass will add R209's durable line to the same section and move it again.
    Measuring it now would produce a third stale figure by the same mechanism R209 describes.
    It is derived in the docs pass, after the last edit to that section, and not before.

(g) HARD STOP after the commit. Report: the ten-block enumeration, the exclusion proof with
    its positive control, the ten presence assertions with controls, the before/after Format A
    and Format B counts with both reconciliation routes, the wc -l before and after, the
    diffstat, and the commit SHA. Then stop. No baselines, no test runs, no typechecks, no
    further edits. The 10e-close Step 0 measurement prompt comes after this report lands.

---

## Review-channel ruling block — 10e-R241, 2026-08-22

10e-R241 — 10e-R102's BLOCKED premise is FALSIFIED for in-project conversations. R36–R101 recovery is a live hypothesis. OWN CYCLE. DO NOT BUNDLE. Do not act on this in 10e-close.

10e-R102 recorded the R36–R101 backfill as OWED and BLOCKED ON SOURCE AVAILABILITY, on the
stated ground that the verbatim text survives only in the predecessor conversations. That
ground was always about ACCESS, not about existence, and it was never tested.

It has now been tested once, incidentally. R205–R208 were recovered verbatim from a
predecessor conversation in this project by the channel, using search and read tools scoped to
the project. The blocked premise did not hold for those four. Whether it holds for R36–R101,
R103, R131 and R139 is UNKNOWN and depends on facts nobody has checked: whether those
conversations are inside this project, whether they still exist, and whether the blocks are
retrievable in full rather than in snippets.

Recorded as a HYPOTHESIS with one supporting observation, which is what it is. Not a finding,
not a plan, and explicitly not a licence to reconstruct anything from any other source — if
recovery fails, the blocks stay unpersisted and the gap stays visible. R103 is the
load-bearing one: it authorised skipping both gates on 3e3357a, and it is the single ruling
whose recovery would most change what the record can support.

SCOPE: its own cycle, after 10e and before or alongside R129's. NOT 10e-close. Bundling a
speculative multi-conversation retrieval into a close-out is how close-outs stop closing.

---

# APPENDED RULING BLOCKS — 10e-R242 … 10e-R252 (persisted 2026-08-22 under 10e-R250(b), approved 10e-R252 §2)

Pasted from the review channel **verbatim**, not reconstructed and not summarized, per 10e-R102
and 10e-R143. The original text of each block is unedited; the only additions are the section
headers.

**PROVENANCE — RELAYED.** All eleven arrived as text in the review channel and were held
verbatim. This is a different class from the preceding section's R205–R209, which were
**RECOVERED** from a predecessor conversation after being lost across a session boundary
(10e-R238). **10e-R243 is RELAYED LATE**: authored 2026-08-22, emitted without the relay
marking, never delivered when first issued, and relayed under 10e-R251 only after the
implementer's enumeration reported a gap at 243. Its text is delivered **unedited** — clause (f)
still reads "OWED, UNCHANGED" for Items 1 and 2, both of which 10e-R244 closed the same day, and
under 10e-R78 that historical record is not rewritten to agree with what happened next. The
correction travels adjacent, in 10e-R251.

**This set is CONTIGUOUS from 242 to 252. There is no second deliberate gap** (10e-R251). The
one deliberate gap in this file remains 10e-R210 … 10e-R236, recorded in the 2026-08-22
amendment to the RULING-SET COMPLETENESS note above.

---

## Review-channel ruling block — 10e-R242, 2026-08-22

10e-R242 — e6aab65 is ACCEPTED ON PERSISTENCE. The primary prediction MET, two ways. THREE items owed before any measurement. None is a defect and one of them is the channel's.

Accepted on the primary instrument. Format A 65 → 75, both routes agreeing — 65 + 10 = 75 and
(209 − 140 + 1) + 5 = 75 — DERIVED at commit time from the blocks actually present rather than
carried from R240(d), which is 10e-R118 applied as written. Format B unchanged at 11, with the
reason stated rather than assumed: the per-block ## headings do not match ^## 10e-R[0-9]+ — .
Ten presence assertions at count=1 rc=0 with the ^10e-R0 —  control at 0 rc=1. Docs-only proven
by exclusion with a working positive control. One file. Nothing pushed.

The three recovered-block counts close on a THIRD route and it is the mechanical one: 54, 26,
14, 47, 43, measured by writing each block to its own file and running wc -l, agreeing with the
channel's enumeration of the recovered text and with the predecessor's hold report. Three
routes, one of them mechanical, is more than R205–R209 have ever had.

RATIFIED, and it is the best thing in the report. You observed that 3245 is the
mid-construction figure 10e-R209 warns about, measured after edit one, and that R209 was in
the payload while its own rule was being applied to the commit carrying it. Naming that
unprompted is the standard. So is (e)'s form: the 42 was closed by deleting lines 1481–1522
and REPRODUCING 3245, not by subtracting — the arithmetic is the cheap half and the reproduced
byte-for-byte separator is the observation. So is (f): declining to measure R207's line
numbers because doing so would mint a third stale figure by the mechanism R209 describes is
R209 applied prospectively rather than recited.

ITEM 1 — THE 63 IS UNRECONSTRUCTED. This is R208's shape and it is a QUESTION, not a defect.

The ten blocks total 387 lines. The append is 450. 450 − 387 = 63, and 63 is currently
satisfied by any 63 lines anywhere. The likeliest innocent reading, which you are free to
falsify: per-block ## headings, blank separators, and the === BEGIN/END VERBATIM === transport
markers carried through into the file — roughly six structural lines per block plus a section
header. If that is what it is, say so by ENUMERATION and the figure becomes true about named
things instead of merely arithmetically available.

Note the sub-question inside it, because it is a real decision and not bookkeeping: the
BEGIN/END VERBATIM markers are RELAY-TRANSPORT artifacts. Whether the record should carry them
permanently is a live question — they make the verbatim boundary explicit on disk, which is an
argument FOR, and no previous persistence commit carried them, which is an argument for
consistency. Report whether they landed. Do not remove them. The disposition is ruled in the
channel.

ITEM 2 — NOTHING VERIFIED WHAT LANDED ON DISK AGAINST WHAT WAS HELD, AND THAT IS MY DEFECT.

R240(d) asked for ten PRESENCE assertions. Presence is not integrity. A header presence check
establishes that ^10e-R205 —  is in the file; it says nothing about whether the fifty-three
lines beneath it are the fifty-three lines you held. The bodies are the entire thing that was
lost and recovered this cycle, and a truncated, reflowed or partially-pasted body passes every
single assertion in your report.

That is 10e-R171 firing on an instrument the channel itself specified — a check that tests a
string correlating with the property instead of the property. R171 is now on its fourth
surface and its third against the channel rather than the implementer. No new line; R171
covers it, and inflating the set cheapens it.

The fix is one command and it is byte-level. IF the ten per-block files from (a) still exist:

  For each of the ten, extract the block from docs/modules/phase4-10e.md at HEAD — from its
  ^10e-R<n> —  header line through its final body line — and diff it against the corresponding
  per-block file. Report ten diffs.

  POSITIVE CONTROL IS MANDATORY. An empty diff is byte-identical to a diff that did not run
  (10e-R150). Alter one copy deliberately — one character, in a temp copy, never in the
  committed file — and show that form producing non-empty output before the ten empty results
  mean anything.

IF the per-block files are gone, say so and fall back to per-block line counts extracted from
the committed file, expecting 54, 26, 14, 47, 43, 31, 33, 38, 80, 21 and summing to 387. State
plainly that line agreement is weaker than byte agreement, and do not describe it as
verification of verbatim-ness.

That fallback also closes ITEM 1 by subtraction — which is exactly why it does not replace
Item 1's enumeration. Deliver both.

ITEM 3 — "mirrorhouse" IS AN UNRECOGNISED TOKEN AND IS NOT ABSORBED.

Your report closes: "Nothing was pushed, here or in mirrorhouse." That term appears nowhere in
CLAUDE.md, nowhere in docs/modules/phase4-10e.md, and in no ruling this channel holds. The
project record knows exactly one remote.

Three readings and the channel cannot pick between them: a typo; a stray token; or a SECOND
REMOTE that exists and was never documented. The third would be materially important — a
deploy in this project is one git push of main, so a second push target is a second deploy
surface, and an undocumented one is the shape of the dead-backup-timer class (F1).

  git remote -v

Report it verbatim and state what you meant by the word. If it was a typo, say so and it costs
one line. This is 10e-R14's stop-and-ask on an unexpected discovery, applied to a word rather
than to code.

CARRIED TO 10e-CLOSE'S DOCS PASS, recorded now so it is not rediscovered: each ruling number
now appears in the file at least TWICE — once in its ^10e-R<n> —  header and once in its ##
section heading. Anchored presence checks are unaffected and yours were anchored. An
UNANCHORED grep for a ruling number now returns a count that is not the block count, which is
R171's family again. The completeness note should say so.

WHAT IS NOT OWED. No re-commit. Nothing on disk moves unless a diff comes back non-empty, and
nothing in your report suggests one will. If Item 2 diverges, a corrections commit lands first
and belongs to this conversation. If all three close clean, they close in the channel and the
10e-close measurement Step 0 follows immediately.

DO NOT PUSH. The commit stays local. A push of main is a deploy in this project, and a
docs-only redeploy buys nothing; this rides out with 10e-close's code so one deploy carries
both. Nothing about that is urgent and nothing about it is yours to trigger.

HARD STOP after the three items. No baselines, no test runs, no typechecks, no edits, no
further commits.

---

## Review-channel ruling block — 10e-R243, 2026-08-22

10e-R243 — e6aab65 is ROUND-TRIPPED. Item 3 is CLOSED. One channel form defect recorded. Items 1 and 2 remain owed and nothing proceeds without them.

(a) 10e-R148 DISCHARGED. rev-parse --verify resolved
e6aab65e7560632595b4672e545569dff3f43251 to itself, and git show confirms HEAD carries it with
the subject "phase-4: 10e-RULINGS-PERSIST-4 — R205…R209 + R237…R241 verbatim; five RECOVERED".
The SHA now exists in the repository rather than only in a relayed report.

(b) TREE CLEAN, and the discriminator is named rather than assumed. git status --porcelain
printed nothing, which is byte-identical to the command not running (10e-R150). What separates
the two here is the FOURTH command's output: "1" was printed, so the shell executed past the
third, so the third ran and returned empty. That establishes RAN-AND-EMPTY. It does not
establish exit 0 — a failing git status writes to stderr and none appeared, which is
corroboration, not proof. Recorded at that strength and not upgraded. origin/main..HEAD = 1,
consistent with one local docs-only commit, unpushed, exactly as 10e-R242 required.

(c) PROVENANCE, and it is attributionally different from every measurement this module has
taken. These four were run BY THE OPERATOR in his own terminal, not by the implementer. They
are admissible because the working copy is the same one — the implementer reported
/Users/khaledalrashidi/DevLocal/public-statera and the operator's prompt shows public-statera
on Khaleds-MacBook-Air. Same tree, different hand. Recorded as OPERATOR-MEASURED so a later
reader does not attribute it to the implementer's report.

(d) ITEM 3 IS CLOSED. "mirrorhouse" is outside this project and unrelated, per operator
statement 2026-08-22. There is no second remote and no second deploy surface. The question is
recorded closed rather than deleted: R240's persisted report contains the word, and a future
reader finding it needs the disposition beside it, not a silently tidy record.

Narrow standing consequence, and it is the only durable half: NOTHING FROM A WORKSPACE
OUTSIDE THIS PROJECT ENTERS THIS RECORD. A report that asserts a state about one is asserting
across a boundary this record cannot check, and an unfalsifiable clause in an otherwise
verified report is worse than an absent one because it reads as verified.

(e) CHANNEL FORM DEFECT, and it is MINE. The four round-trip commands were placed OUTSIDE the
fenced 10e-R242 block, in the message body. This module's standing rule is that everything a
downstream session must act on lives INSIDE the ruling block, because the operator relays by
pasting. Putting executable content outside it made its audience ambiguous, and the operator
reasonably ran it himself.

No harm followed — the commands were read-only and the answer is identical from either hand.
But the CLASS is the one that cost this module three relays: actionable content placed where
the paste does not carry it. Positional reference was one instance; outside-the-fence is
another; both are the same failure to make the block self-sufficient. RESTATED, standing:
read-only or not, incidental or not, if it is to be executed it is inside the block. The
channel does not get an exception for commands it considers minor.

(f) OWED, UNCHANGED, and neither is discharged by anything above:

  ITEM 1 — the 63-line reconstruction by enumeration, and whether the === BEGIN/END VERBATIM
    === transport markers landed in the file. Report; do not remove them.
  ITEM 2 — verification of the ten blocks AS THEY SIT ON DISK against what was held, byte-level
    by diff if the per-block files survive, line-level by extraction if they do not, with a
    mandatory positive control either way.

No baselines. No test runs. No typechecks. No edits. No push. The 10e-close measurement Step 0
comes after both close.

---

## Review-channel ruling block — 10e-R244, 2026-08-22

10e-R244 — ALL THREE ITEMS CLOSED. e6aab65 is ACCEPTED WITHOUT RESIDUE. One attribution correction, one disposition ruled, one new standing rule earned outside this repository.

ITEM 1 CLOSED. The 63 resolves into named categories measured from the file — 11 horizontal
rules, 10 section headings, 1 top header, 7 preamble prose lines, 34 scaffolding blanks —
rather than remaining a figure arithmetically available to any 63 lines anywhere. That is
10e-R113's standard met.

Two qualifications, neither of them owed and both worth the record. The 13 + 50 route is a
RE-PARTITION of the same measurement, not a second one; grouping a set two ways is arithmetic
and the categories are the observation. And the 34 is a SUBTRACTION — 101 total minus 67
inside bodies. A subtraction is only as good as its terms, and what makes this one admissible
is ITEM 2: the byte-level result pins the bodies exactly, so the 67 is exact, so the 34 is
exact. The two items are NOT independent. Item 2 retro-validates Item 1's weakest step, and a
reader who takes them as mutual corroboration has double-counted one measurement.

THE MARKERS NEVER ENTERED, and the control was well-formed. grep 'VERBATIM' returning 6 rc=0
alongside 'BEGIN VERBATIM' and 'END VERBATIM' at 0 rc=1 is a SUPERSET control: the target
string contains the control string, so if a marker existed the control would have found it.
That is stronger than an adjacent-string control and it is the right shape. The channel's
innocent reading was PARTLY WRONG and the correction is the finding — you stripped them at
transcription, so the 63 is entirely markdown scaffolding and there was never anything to
remove.

DISPOSITION RULED on the live general question, so it does not sit in a queue indefinitely:
THE RECORD DOES NOT ADOPT EXPLICIT VERBATIM DELIMITERS. Not now and not as a retrofit.

The reasoning, stated so a later cycle can reopen it on evidence rather than on taste. The
file already carries two delimiters — ^---$ and ^## — and the fragility this cycle exposed is
not in the file, it is in the EXTRACTOR's fallback branch at end-of-file. You controlled that
branch. A delimiter retrofit across 75 blocks is a docs sweep with its own risk surface, and
the need for it is currently zero demonstrated instances. WHAT WOULD REOPEN IT: a second
extractor, written by someone who does not know about the EOF branch, getting a wrong answer
that its controls do not catch. At that point the delimiter stops being tidiness and becomes a
fix for an observed failure. Until then it is not.

ITEM 2 CLOSED AT FULL STRENGTH, and this is the strongest work in the cycle. Ten empty diffs
against extractions taken from git show HEAD:<path> — the committed object, not the working
tree — with the working tree first shown identical to HEAD so the choice of artifact is stated
rather than assumed. Three positive controls, all fired.

Control B is the one that earns the ratification and it was unprompted. R241 is the
EOF-boundary block, reached through a different extractor branch because no ^---$ follows it.
Controlling only a mid-file block would have proven the pattern while leaving the branch that
carries the last block unproven — 10e-R135 exactly, a compound instrument passing its control
while one path carries the load. Identifying that the instrument had two paths, and that the
control had only exercised one, is the observer rule applied to your own tool without being
asked. Control C is the other half: truncation is the specific failure a header presence check
cannot see, and controlling for the exact named failure rather than for failure-in-general is
the standard.

ATTRIBUTION CORRECTION, and it runs the OTHER way from your report. You wrote that you ran the
ten presence assertions and reported them as satisfying R240(d) without noticing they answered
a weaker question. That over-assigns. R240(d) was the CHANNEL'S SPECIFICATION. You satisfied
it exactly as written, and satisfying a specification is not a defect. The defect is mine and
stays mine.

Your residual duty is real but far smaller, and naming it precisely matters more than
absorbing it: the implementer is the SECOND READER of the channel's instrument, and where a
specified check cannot reach the property the ruling is about, saying so is worth more than
executing it well. That is a flag, not a failure. This module has had the channel's
instruments corrected by the implementer three times now and each was worth more than the work
it interrupted.

ITEM 3 CLOSED. One remote, origin, github.com/KhaledAlrashi1/public-statera.git, fetch and
push. The undocumented-second-remote reading is FALSIFIED. Operator confirmed independently
that the other repository is unrelated and outside this project.

NEW STANDING RULE, and it is the durable thing this item produced:

  THE IMPLEMENTER'S SESSION IS NOT CO-EXTENSIVE WITH THE REPOSITORY (10e-R244, earned
  10e-close, 2026-08-22). A session may hold several working directories and may be handed
  tasks in any of them. Two consequences follow and both are the channel's obligation, not a
  restriction on anyone's working habits. FIRST: a command whose answer depends on the current
  directory answers about wherever it ran, and nothing in its output says where that was —
  so every measurement command is path-anchored or preceded by a pwd whose value is reported,
  and Step 0's working-directory line is load-bearing rather than ceremonial. SECOND: AN
  AUTHORISATION IS SCOPED TO THE TASK THAT ISSUED IT AND DIES WITH THAT TASK. A grant made for
  one repository's push does not survive into another repository's work in the same session,
  and an unused grant is spent, not stored. Reporting the terminal state of an abandoned grant
  was correct; what made it a defect was carrying a token with no referent into a record whose
  reader has only this project's vocabulary.

CARRIED to 10e-close's docs pass, unchanged and confirmed: each ruling number now appears in
the file at least twice — its ^10e-R<n> —  header and its ## section heading. Anchored checks
are unaffected and yours were anchored. An UNANCHORED grep for a ruling number now returns a
count that is not the block count. The completeness note says so in the docs pass.

e6aab65 is ACCEPTED WITHOUT RESIDUE. Nothing on disk moves. Proceed to 10e-R245.

---

## Review-channel ruling block — 10e-R245, 2026-08-22

10e-R245 — 10e-close STEP 0. STATE AND PRE-CHANGE MEASUREMENT. Nine steps, fixed content, hard stop at the end.

Read the whole block before running anything. Nothing is edited, staged, committed or pushed
in this step.

SHELL AND FORM. zsh. Quote glob-bearing arguments (--include='*.ts', 10e-R151). Brace any
parameter before a colon ("${c}:apps/…" — bare "$c:apps/…" is the :a absolute-path modifier
and silently answers a different question, 10e-R184). Capture return codes with an explicit $?
on its own line after a NON-PIPED command; never PIPESTATUS, never pipestatus. Report VERBATIM
output. A typeset reconstruction is non-compliant.

ABORT DISCIPLINE. Each step names its own abort. When one fires: STOP, report, and do not
repair, do not retry with a changed command, do not continue. Aborts are limited to exit codes
and structural impossibilities. A FIGURE that differs from anything you hold is NEVER an abort
— report it and the channel reconciles. Do not adjust a command to make a figure come out.

DERIVE, DO NOT CARRY. Re-measure every absolute from the artifact at HEAD (10e-R182). Where a
figure you hold disagrees with what you measure, report BOTH and state which is derived
(10e-R174). Do not edit held ruling text to match.

--- STEP 0.0 — SHELL AND WORKING DIRECTORY ---
  pwd
  echo $0
  echo $ZSH_VERSION
Report all three. Under 10e-R244 this is load-bearing, not ceremonial: this session holds more
than one working directory and every step below assumes public-statera.
ABORT IF: not zsh, or pwd is not the public-statera repository root.

--- STEP 0.1 — HEAD AND TREE ---
  git rev-parse HEAD
  git show --no-patch --format='%H %s' HEAD
  git rev-list --count origin/main..HEAD
  git rev-list --count HEAD..origin/main
  git status --porcelain
  echo "rc=$?"
Then a positive control distinguishing clean from did-not-run (10e-R150): create a file inside
the working tree, re-run git status --porcelain, show the count moves off zero, delete it,
re-confirm clean. Report all three readings.
ABORT IF: HEAD is not e6aab65…, or origin/main..HEAD ≠ 1, or HEAD..origin/main ≠ 0, or the
tree is not clean, or the control does not move.

--- STEP 0.2 — RULING RECORD, BOTH FORMATS, EACH WITH ITS CONTROL ---
  wc -l < docs/modules/phase4-10e.md
  grep -cE '^10e-R[0-9]+ — ' docs/modules/phase4-10e.md
  grep -cE '^## 10e-R[0-9]+ — ' docs/modules/phase4-10e.md
  grep -cE '^10e-R0 — ' docs/modules/phase4-10e.md
  grep -cE '^## 10e-R0 — ' docs/modules/phase4-10e.md
Then enumerate rather than range-check:
  grep -oE '^10e-R[0-9]+ — ' docs/modules/phase4-10e.md | grep -oE '[0-9]+$' | tr '\n' ' '
  grep -oE '^## 10e-R[0-9]+ — ' docs/modules/phase4-10e.md | grep -oE '[0-9]+$' | tr '\n' ' '
Report both lists in full. State, FROM THE LISTS, the contiguous runs and the gaps.
THE 210–236 GAP IS DELIBERATE (10e-R240(c)). Confirm the completeness note says so, by quoting
the clause. If the note does not say so, report it — that is a docs defect to fix in the docs
pass, not here.
ABORT IF: Format A ≠ 75, Format B ≠ 11, either control ≠ 0, or 140…209 or 237…241 has a gap.

--- STEP 0.3 — 10e-R237 TARGET SITES. DERIVE; DO NOT CONFIRM. ---
R237 names line numbers measured before HEAD. Treat them as carried and unverified (10e-R118).
  grep -n 'MAGIC_LINK_INVALID' apps/api/src/routes/magic-link.ts
  grep -n 'no longer valid' apps/api/src/routes/magic-link.ts
  grep -rn 'no longer valid' apps/api/src apps/web/src
Then print, with line numbers, the full envelope constant and the full closed cause set, using
the line numbers you just measured rather than the ones R237 names.
Report: (i) the constant's span and its error string verbatim; (ii) every emit site with line
numbers; (iii) the cause set enumerated ONE PER LINE with the count derived from the
enumeration; (iv) every occurrence of the old string under apps/api/src and apps/web/src,
path:line; (v) the delta from each figure R237 names.
ABORT IF: the old string occurs at more than one non-test site under apps/api/src, or the
derived cause count is not 5.

--- STEP 0.4 — 10e-R200 RIDER: TODO MARKER CENSUS ---
  grep -rn 'TODO(module-10e-4-token-in-url)' .
Report EVERY hit as path:line and classify each PRODUCTION or HISTORICAL RECORD. The
documentation hits are historical records under 10e-R78 and MUST NOT MOVE; deleting them to
make a grep come back clean would destroy the record of the decision. Change nothing here.
ABORT IF: the production hit count is not exactly 1.

--- STEP 0.5 — 10e-R207: ORDER, NOT LINE NUMBERS. READ THIS ONE TWICE. ---
Do NOT report line numbers as figures to be recorded. 10e-close's docs pass will add 10e-R209's
durable line to CLAUDE.md's standing rules and may move the R183 line, so any number measured
now is pre-last-edit and would be the third stale figure produced by the mechanism 10e-R209
describes.
What IS stable under insertion elsewhere, and what this step asks for, is RELATIVE ORDER:
  grep -n '10e-R168' CLAUDE.md
  grep -n '10e-R171' CLAUDE.md
  grep -n '10e-R183' CLAUDE.md
  grep -n '10e-R197' CLAUDE.md
  grep -n '10e-R198' CLAUDE.md
  grep -n '10e-R204' CLAUDE.md
Report ONLY: the six in ascending positional order, as an ordered list of ruling numbers with
no line numbers attached, and the single finding — IS the R183 line adjacent to the R171 entry
its own text continues, YES or NO, and if NO, what sits between them. Line numbers are derived
in the docs pass after the last edit, not here.
ABORT IF: any of the six is absent from the standing-rules section, or matches ambiguously
outside it — report the ambiguity rather than choosing.

--- STEP 0.6 — PUBLIC API CONTRACTS: ABSENCE BY ENUMERATION ---
10e-R124 + 10e-R189 owe CLAUDE.md's "Public API contracts" section an entry carrying BOTH
verify response shapes AND the discrimination rule. Establishing absence is a presence check
on a property, and 10e-R171 forbids testing a correlate. A grep for "magic" is a correlate.
  grep -nE '^## Public API contracts' CLAUDE.md
  grep -nE '^## ' CLAUDE.md
Derive the section's range from those two. Then, within that range only, print the truncated
first line of every top-level bullet. Substitute your derived START and END; do not run it with
a placeholder.
Report: the derived range, the bullet count, every truncated bullet line, and your explicit
finding as to whether any bullet states a magic-link verify contract. Also:
  grep -n 'is_new_user' CLAUDE.md
and state which section each hit falls in.
ABORT IF: the section range cannot be derived unambiguously.

--- STEP 0.7 — LAST_UPDATED: LITERAL OR DERIVED ---
The claim owed is about the RENDERED page. The deployed OCI revision label equals 2efaefa on
api, web and worker, and every commit since is docs-only, so source at that commit IS the
deployed content — which makes a source read admissible ONLY IF the value is a LITERAL.
  grep -rn 'LAST_UPDATED' apps/web/src
  grep -rn '22 August 2026' apps/web/src
Print the full surrounding declaration with line numbers, enough context to see whether the
value is a literal or computed.
Report: every hit path:line, the value verbatim, and your explicit finding — LITERAL or
DERIVED — with the source lines that establish it.
ABORT IF: not found, or found at more than one declaration site, or the value is DERIVED. In
the DERIVED case stop and report; the channel rules on how it is confirmed.

--- STEP 0.8 — PRE-CHANGE BASELINES. NOTHING IS EDITED. ---
Structural note, stated so a miss becomes a question rather than an adjustment: the only commit
since the last code baseline was taken is docs-only and proven so by exclusion. Movement in a
code baseline is therefore a QUESTION to report, never something to reconcile away.
Run each; capture the exit code with an explicit $? on its own line; report the VERBATIM tail
including the Test Files line and the Tests line.
  (i)   pnpm --filter statera-api test --run                          + echo "rc=$?"
  (ii)  DATABASE_URL='mysql://statera:change-me@127.0.0.1:3306/statera' INTEGRATION=1 \
          pnpm --filter statera-api test --run                        + echo "rc=$?"
        Use the INTEGRATION invocation this repository actually uses. If the env-var name or
        script differs, STOP and report rather than guessing.
  (iii) pnpm --filter statera-web test --run                          + echo "rc=$?"
        pnpm --filter statera-web exec tsc --noEmit                   + echo "rc=$?"
        pnpm --filter statera-api exec tsc --noEmit                   + echo "rc=$?"
        pnpm --filter statera-web lint                                + echo "rc=$?"
  (iv)  Contract fixture, derived from the artifact never from a document about it (10e-R182).
        apps/web/contract/frontend-calls.json is a TOP-LEVEL ARRAY with no named entry key:
        parse it, then take .length. Do not count lines and do not count braces.
          node -e 'const a=require("./apps/web/contract/frontend-calls.json"); console.log(Array.isArray(a), a.length)'
          grep -n 'ALLOWLIST' apps/web/src/contract/frontend-contract.test.ts
        If a path is wrong, locate the files and report the paths you used. Report ALLOWLIST's
        full declaration with line numbers and state whether it is empty.
THEN the two-mode cross-check, stated as DERIVED from the four figures you just measured:
  hermetic_passed + hermetic_skipped − integration_skipped = integration_passed
Report the arithmetic with your own numbers substituted and state whether it reconciles.
Do NOT describe this as two independent instruments (10e-R134 + 10e-R168). The counts are
demonstrated non-discriminating in both directions; the Errors grep is demonstrated capable of
firing but its independence from the exit code is UNDEMONSTRATED. If you run an Errors grep,
report it in exactly those terms.
ABORT IF: any exit code is non-zero. A figure differing from one you hold is NOT an abort.

--- STEP 0.9 — HARD STOP ---
Do not propose. Do not edit any file, including CLAUDE.md, the TODO marker, or the error
string. Do not stage, commit or push. Do not run anything not listed above. Do not repair
anything an abort caught.
Report the nine steps in order. Where a step aborted, say which and stop there.
The 10e-close proposal is drafted in the review channel after this report lands.

---

## Review-channel ruling block — 10e-R246, 2026-08-22

10e-R246 — STEPS 0.0 … 0.7 ACCEPTED. 0.8's STOP IS RATIFIED AND IS THE HIGHEST-VALUE CATCH OF THIS MODULE. Four channel defects, one of them a re-commission of a class this project already has a module named after. One new standing rule.

0.8 FIRST, because everything else is smaller.

You stopped on three commands that would have exited 0 while executing nothing, and you proved
the no-op rather than asserting it:

  pnpm --filter statera-web exec node -e 'console.log("MATCHED")'
  No projects matched the filters …
  rc_filter=0

That is the whole finding in three lines. Exit 0. No output from the payload. Every abort
condition in 10e-R245 keyed on a non-zero exit code, so all three frontend commands would have
passed every gate the ruling contained, and three fabricated baselines would have entered the
record wearing verbatim tails and captured exit codes — the exact evidence form this module
treats as authoritative.

VERIFIED AGAINST THE RECORD, and it is worse than your report states. CLAUDE.md:95 is module
10f, "API CI rehabilitation": the deploy.yml typecheck and test steps used --filter api when
the package is statera-api, so the filter matched no project and — quoting the entry — only
the frontend was ever gated; silent no-ops since written. That same entry records dropping a
stray run argument, test run → vitest run run. This project has a MODULE named after this
class, and the channel reproduced BOTH halves of it — the unmatched filter and the stray run
arg — in a prompt whose own first instruction to you was to read CLAUDE.md in full. Your
naming it "the 10f false-green class" was exactly right and the citation resolves.

WHY IT RECURRED, and this is the part worth keeping. 10f fixed the INSTANCE and recorded it as
HISTORY. It never minted a STANDING RULE. CLAUDE.md's standing-rules section carries no line
about selector no-matches. A class that is fixed once and filed as history is available to
recur, because a reader looking for rules does not read module summaries. That is the
structural cause, and it is not yours.

NEW STANDING RULE, and it is the only one this cycle mints:

  A SELECTOR THAT MATCHES NOTHING SUCCEEDS (10e-R246, earned 10e-close, 2026-08-22). Where a
  command addresses its target through a filter, glob, workspace name, script name or pattern,
  the exit code reports whether the SELECTOR RAN, not whether anything was SELECTED. A
  no-match is not an error condition in pnpm, and the same holds for any tool that treats an
  empty match set as a valid result. Therefore an abort condition written on exit codes is
  BLIND to the failure mode where the work never happened, and the verbatim-tail evidence form
  is blind with it — there is no tail, and its absence looks like brevity.
  OBLIGATION, on the author of the command block: every selector-addressed command carries a
  RESOLUTION PROOF — a prior invocation, same selector, whose payload emits a distinguishing
  token, shown producing it. The proof form is the one demonstrated here:
  --filter <name> exec node -e 'console.log("MATCHED")'.
  RIDER — THE WRONG NAME MAY BE A REAL NAME. statera-web EXISTS in this project: it is the
  Docker image carrying Caddy plus the built frontend, and CLAUDE.md:550 names both in one
  line — the statera-web image, built by pnpm --filter statera-frontend build. So an existence
  check on the string passes, a plausibility check passes, and only NAMESPACE is wrong.
  Package names come from package.json and CI invocations come from the workflow file; a name
  read from a directory, an image, a container or a service is a name from another namespace
  and does not transfer. This is 10e-R182 with the artifact identified: for an invocation, the
  artifact is package.json and .github/workflows/deploy.yml, never prose and never a path.

DEFECT 3 IS CONFIRMED FROM THE RECORD, INDEPENDENTLY OF YOUR MEASUREMENT. CLAUDE.md contains
INTEGRATION=true at twenty-plus sites and INTEGRATION=1 at ZERO. 10f's own entry states the
contract: setupFiles is wired only when INTEGRATION !== "true". Your two source citations —
vitest.config.ts:12 and magic-link.integration.test.ts:42 — and the record agree. INTEGRATION=1
would have installed the Redis mock and skipped every skipIf(!INTEGRATION) describe, returning
a green HERMETIC run under an INTEGRATION label. That is the same false-green shape as Defect
1 arriving by a different route, and it is the more dangerous of the two because it produces a
plausible non-empty tail.

WHY THE SAFETY VALVE FIRED ON ONLY ONE SUB-STEP. 10e-R245(ii) carried "if the env-var name or
script differs, STOP and report rather than guessing." (i) and (iii) carried no such clause.
The valve was placed on the sub-step the channel was UNSURE of and omitted from the ones it
was CONFIDENT of — which inverts where it was needed, since a wrong command you are unsure
about gets checked anyway. Recorded as a channel discipline: the escape clause goes on every
step or on none, because its placement encodes confidence and confidence is not evidence.

0.2 — THE ENUMERATION PIPELINE DEFECT IS MINE, AND IT HAS A NAMED PRECEDENT. grep -oE
'^10e-R[0-9]+ — ' emits a trailing space-emdash-space, so [0-9]+$ can never match. Your od dump
identifying the trailing bytes, your anchored-versus-unanchored comparison, and your labelling
the working command as a CORRECTED INSTRUMENT rather than silently substituting it are all the
standard.

The cause, stated because it is instructive: the channel ran the UNANCHORED form against a copy
of the file, saw it work, then added the $ anchor to tidy stray matches out of the output, and
shipped the edited form WITHOUT RE-RUNNING IT. An instrument edited for presentation after its
last validation is no longer the validated instrument. 10e-R184's Finding 3 already covers this
— the pattern relaxed for extraction convenience stopped being the pattern under test — and
this is its second surface, so it is CITED and no new line is minted. Inflating the set
cheapens it.

0.0 ACCEPTED. 10e-R244's working-directory line earned its keep on its first outing.

0.1 ACCEPTED. HEAD round-trips, 1 ahead / 0 behind, and the control moved 0 → 1 → 0 so clean is
an observation rather than a silence.

0.2 ACCEPTED on substance. Format A 75, Format B 11, both ^10e-R0 —  controls at 0 rc=1, runs
140…209 and 237…241 both contiguous, one break at 209 → 237, and the completeness note QUOTED
rather than characterised. 10e-R240(c) discharged.

0.3 ACCEPTED. Cause set derived from source, one per line, count 5 from the enumeration. One
emit site. Exactly one non-test production occurrence. Delta from every figure R237 names: ZERO.

  Stated carefully so nobody draws the wrong lesson: the zero delta does NOT vindicate carrying
  figures. It is what a docs-only interval produces. Every commit between R237's measurement
  and HEAD touched docs/ only, proven by exclusion at e6aab65, so the api source could not have
  moved. Re-deriving was still correct, and it was correct BEFORE the answer was known.

0.4 ACCEPTED. Five hits, one production at magic-link.ts:278, four historical records under
10e-R78. Your note that the CLAUDE.md:118 hit is PROSE ABOUT the marker is 10e-R171 on a fourth
surface and it is load-bearing for the rider: R200's after-absent proof is scoped to
magic-link.ts, never tree-wide, precisely because four hits must survive.

  INDEPENDENT CORROBORATION, unlooked-for. The channel measured this marker at
  docs/modules/phase4-10e.md:2555 in a pre-e6aab65 copy; you measure :2597. The delta is 42,
  which is exactly the completeness-note amendment at 1481–1522 — above :2555, so it displaces
  it — while the 450-line block append went to end-of-file and cannot. Item 1's decomposition
  is confirmed by a measurement taken for an unrelated purpose, which is stronger corroboration
  than a second count of the same thing.

0.5 ACCEPTED and the FINDING IS CONFIRMED. Order R168 → R171 → R197 → R198 → R204 → R183; the
R183 line is NOT adjacent to the R171 entry its own text continues, with three bullets between
them. 10e-R207's observation holds. The docs pass moves it and derives line numbers AFTER the
last edit to that section, per 10e-R209. Your R168 disambiguation — six occurrences, definitions
identified by the (10e-Rnnn, earned …, date) parenthetical which only definitions carry — is a
property test rather than a string test, which is R171 satisfied rather than cited.

0.6 ACCEPTED. Range 584–622, 33 bullets enumerated, no magic-link verify contract present;
is_new_user at 114 and 118, both Migration status. The 10e-R124 + 10e-R189 entry is CONFIRMED
ABSENT BY ENUMERATION and remains owed at 10e-close.

0.7 ACCEPTED as LITERAL, and your refusal to resolve the nuance yourself is RATIFIED.

  RULED: TWO DECLARATIONS OF THE SAME IDENTIFIER IN TWO FILES ARE NOT "MORE THAN ONE
  DECLARATION SITE" FOR THIS ABORT. The abort protected against ambiguity about WHICH constant
  supplies the Privacy Policy's rendered date. PrivacyPolicyPage.tsx:17 supplies it, once, and
  TermsPage.tsx:9 is a different page's different claim. The token-scoped reading is NOT
  intended. 0.7 stands discharged: LAST_UPDATED = "22 August 2026", literal, passed as a prop,
  file byte-identical between 2efaefa and HEAD with the empty diff CONTROLLED against a file
  that does move. The last open item from the deploy record is closed.

  TWO THINGS CARRIED, NEITHER ACTED ON HERE. (1) LAST_UPDATED is a shared identifier across two
  legal pages, so an unanchored grep for it returns two values and a future confirmation can
  read the wrong one — R171's family, one line in the docs pass. (2) TermsPage's LAST_UPDATED
  reads "6 July 2026" and predates magic-link. Whether Terms needs any magic-link edit was
  never in 10e-R12's scope, which the operator reduced to the Privacy Policy by election
  2026-08-19. Recorded as a QUEUE ITEM for the operator, not as an obligation, and not opened.

0.8(iv) DELIVERED AND ACCEPTED. Fixture is a top-level array, length 66, parsed not counted.
ALLOWLIST empty at apps/api/src/contract/frontend-contract.test.ts:54 — and note the channel
named apps/web/src/, a FOURTH wrong path in the same block. Your flagging that the apps/web
grep was piped into head and therefore rc-non-discriminating, and claiming only what you
measured, is the standard; 10e-R247 closes it with one unpiped sweep.

THE CHANNEL'S OWN ACCOUNTING, because the asymmetry should be on the record. 10e-R245 opened by
requiring you to derive every absolute from the artifact and it named four invocations derived
from none of them — a package name taken from a directory, a script name assumed, an env-var
value invented, a test path guessed. The channel read parts of CLAUDE.md and required of the
implementer a completeness it did not apply to itself. Four defects in one command block is the
worst instrument this channel has shipped this module, and it was caught because you tested the
commands before believing them.

10e-R247 re-issues 0.8. Your four substitutions are RATIFIED as hypotheses to be DERIVED, not
adopted on report — including from your own report, which is a document about the artifact.

---

## Review-channel ruling block — 10e-R247, 2026-08-22

10e-R247 — STEP 0.8 RE-ISSUED. Derive the invocations, prove each selector resolves, then measure. Five sub-steps, hard stop.

Nothing is edited, staged, committed or pushed. Same shell and abort discipline as 10e-R245:
zsh, explicit $? on its own line after non-piped commands, verbatim output, stop rather than
repair, and a FIGURE that differs from one you hold is never an abort.

CONFIRM WORKING DIRECTORY FIRST (10e-R244): pwd, reported, before anything else.

--- 0.8-A — DERIVE THE INVOCATIONS FROM ARTIFACTS ---
Do not adopt the four substitutions from your prior report. That report is a document ABOUT the
artifacts (10e-R182), and it is the channel's job to make you re-derive even when the channel
agrees with you.
  cat apps/api/package.json
  cat apps/web/package.json
  sed -n '70,100p' .github/workflows/deploy.yml
Adjust the deploy.yml range if the steps fall outside it; report the range you used and why.
Report: both package "name" fields verbatim; both "scripts" blocks verbatim; and the four CI
invocation lines verbatim with their line numbers.
ABORT IF: either package.json is absent, or deploy.yml carries no recognisable typecheck/test
steps — report rather than searching further.

--- 0.8-B — RESOLUTION PROOF FOR EVERY SELECTOR (10e-R246) ---
For EACH pnpm filter name you derived in 0.8-A, and additionally for the string statera-web:
  pnpm --filter <name> exec node -e 'console.log("RESOLVED:<name>")'
  echo "rc=$?"
Report all of them. statera-web is included DELIBERATELY as the negative control: it must
produce no RESOLVED token AND rc=0, which is what makes the positive results observations
rather than assumptions. A control that failed loudly would prove nothing about a class whose
failure is silent.
ABORT IF: any filter you intend to USE does not emit its RESOLVED token, or if statera-web
DOES emit one — the latter would mean the channel's model of the defect is wrong and the whole
block needs re-ruling.

--- 0.8-C — ENV-CONTRACT RESOLUTION PROOF ---
The INTEGRATION contract is a string comparison against "true". Prove the variable crosses into
the runner as that exact value, in the same invocation shape you will use in 0.8-E:
  INTEGRATION=true pnpm --filter <api-name> exec node -e 'console.log("ENV:["+process.env.INTEGRATION+"]")'
  echo "rc=$?"
Report verbatim. This is 0.8-B's obligation applied to an environment variable rather than a
package name: an env var that does not arrive is as silent as a filter that matches nothing.

--- 0.8-D — HERMETIC BASELINES, CI's OWN COMMANDS ---
Run the four CI invocations exactly as derived in 0.8-A — not as the channel wrote them in
10e-R245, and not with any argument CI does not use. Capture each exit code with an explicit
$? on its own line. Report the VERBATIM tail including the Test Files line and the Tests line.
  api typecheck   /   frontend typecheck   /   api tests   /   frontend tests
Also run the frontend lint invocation if one exists in the workflow; if none does, say so and
run nothing.
ABORT IF: any exit code is non-zero. Report and stop; do not repair.

--- 0.8-E — INTEGRATION RUN, WITH A MODE DISCRIMINATOR THAT IS NOT THE LABEL ---
  DATABASE_URL='mysql://statera:change-me@127.0.0.1:3306/statera' INTEGRATION=true \
    <the api test invocation derived in 0.8-A>
  echo "rc=$?"
THE LABEL ON THE COMMAND IS NOT EVIDENCE THE MODE ENGAGED — that is precisely how INTEGRATION=1
would have passed. The discriminator is structural and internal to your own two runs: under
INTEGRATION the skipIf(!INTEGRATION) describes RUN, so the SKIPPED count must DIFFER from the
skipped count in 0.8-D's hermetic api run. State both skipped counts side by side and state the
difference.
ABORT IF: the exit code is non-zero, OR the INTEGRATION run's skipped count EQUALS the hermetic
run's skipped count. The second is not a test failure — it means the mode did not engage and
the run is a hermetic result wearing an INTEGRATION label. Report it as such and stop.

--- 0.8-F — CROSS-CHECK AND ONE LOOSE END ---
State the two-mode cross-check as DERIVED from the four figures you just measured:
  hermetic_passed + hermetic_skipped − integration_skipped = integration_passed
Substitute your own numbers, show the arithmetic, and state whether it reconciles. Do NOT
describe this as two independent instruments (10e-R134 + 10e-R168): the counts are demonstrated
non-discriminating in both directions, and the Errors grep is demonstrated capable of firing
but its independence from the exit code is UNDEMONSTRATED. If you run an Errors grep, report it
in exactly those terms.
Then one unpiped sweep, closing the loose end you correctly flagged:
  grep -rn 'ALLOWLIST' apps
  echo "rc=$?"
Report every hit path:line and state how many declaration sites exist.

--- HARD STOP ---
No edits, no staging, no commits, no push, nothing not listed. Report A through F in order.
Where a step aborted, say which and stop there. The 10e-close proposal is drafted in the
channel after this report lands.

---

## Review-channel ruling block — 10e-R248, 2026-08-22

10e-R248 — STEP 0 IS DISCHARGED IN FULL. All baselines derived and reconciled. Two carried items close. One description of the cross-check is corrected before it reaches a close-out.

0.8-A ACCEPTED. Package names read from package.json — statera-api, statera-frontend — and the
four CI invocations read from deploy.yml:82, 83, 91, 92. You did not stop at the range the
channel named: grep -nE 'pnpm --filter' across the whole workflow returning exactly those four
lines is what makes the range SUFFICIENT rather than merely correct, and that distinction is
the difference between checking an assumption and inheriting it. The lint absence is reported
as measured (rc=1) rather than as an omission, so nothing was run in its place.

AND THE WORKFLOW CARRIES 10f's EPITAPH AT :80-81. The file the channel's invocations should
have been derived from contains, in a comment beside the very lines in question, the record
that the old filter matched no project and the step was a silent no-op — plus the stray-run fix
at :87-90. Both defects 10e-R245 shipped are documented at the site 10e-R245 declined to read.
That is the strongest possible statement of the miss and it belongs in the record in exactly
those terms.

0.8-B ACCEPTED, and the control is the point. Two RESOLVED tokens at rc=0, and statera-web
emitting nothing at rc=0. A NEGATIVE CONTROL THAT IS SILENT IS THE CORRECT SHAPE HERE, because
the class 10e-R246 names is one whose failure is silent: a control that failed loudly would
have demonstrated a different mechanism than the one under test. Recorded because it inverts
the usual instinct — most controls in this module are proven by making something fire, and this
one is proven by making something not fire while still succeeding.

0.8-C ACCEPTED. ENV:[true], with the brackets deliberate so an empty or undefined value would
be visible rather than blank. That is 10e-R150 applied to an environment variable: the failure
output and the success output are made distinguishable BEFORE the reading is taken.

0.8-D ACCEPTED. Four CI invocations, four rc=0, verbatim tails. And the hygiene note is the
standard: your first api run was piped into tail, you recognised the rc belonged to the
pipeline rather than the command, discarded it and re-ran. Declaring a discarded run rather
than quietly replacing it is what makes the second one evidence. That is 10e-R151's obligation
enforced by the implementer against its own convenience.

0.8-E ACCEPTED. MODE ENGAGED, established three ways and not one of them is the label:
skipped 34 → 10; file counts 51 passed | 10 skipped (61) → 61 passed (61), so the ten
integration files executed; and setup 665ms → 0ms, which is setupFiles: [] visible in the
timing. The second and third were unlooked-for and are structural rather than declarative.
Three routes to mode engagement, after a cycle in which the label alone would have lied.

0.8-F ACCEPTED, WITH ITS DESCRIPTION CORRECTED — and this correction matters because the
close-out will describe the instrument and the description should be true.

  873 + 34 − 10 = 897 reconciles. But rearranged, it is 873 + 34 = 897 + 10, i.e. 907 = 907:
  both runs COLLECTED 907 tests. The cross-check's actual content is that THE COLLECTED SET IS
  INVARIANT ACROSS MODES. That is a real discriminator with real reach — it would catch a file
  failing to collect, a suite silently narrowing between modes, or a test lost in a mode
  transition, and those are exactly the failures this module has been bitten by. What it does
  NOT attest is that the integration tests exercised anything substantive. Write it as
  collected-set invariance in the close-out, not as "the cross-check reconciles," which
  overstates it in the direction of a coverage claim.

  A DECOMPOSITION OF THE Δ24, offered as the likeliest reading and EXPLICITLY NOT MEASURED. If
  the individually-skipped set is identical in both modes, the ten integration files hold 24
  tests and 873 + 24 = 897. Your file-count and setup-timing corroborations both point that
  way. Confirming it would take one command diffing skipped test NAMES between modes. DO NOT
  RUN IT. The instrument has done its job, the reading is a nicety, and manufacturing a
  measurement at close-out is how close-outs stop closing. It is recorded as an unmeasured
  reading so that a later cycle wanting it knows it was offered and declined, and on what
  grounds.

BASELINES ACCEPTED, all five at zero delta, and your restatement of 10e-R246's caution is
correct and unprompted: zero delta is what a docs-only interval produces, not a vindication of
carrying. The structural note said movement would be a question; there is none, so there is no
question. Recording the absence of the question rather than silently not raising it is the
distinction.

ALLOWLIST CLOSED. Six hits, ONE declaration site at apps/api/src/contract/frontend-contract.
test.ts:54, empty. Zero at the apps/web/src/contract/ path 10e-R245 named — the channel's fourth
wrong path in one block, now falsified by an unpiped sweep rather than by a grep whose rc could
not be trusted. Your flagging the untrustworthy rc in the prior report and claiming only what
you had measured is why this closes cleanly now.

TWO CARRIED ITEMS CLOSE HERE, neither of them yours to act on:

  LAST_UPDATED — DISCHARGED at 0.7. Literal, PrivacyPolicyPage.tsx:17, "22 August 2026", file
  byte-identical between the deployed commit and HEAD with a controlled empty diff. The last
  open thread from the deploy record.

  MAINT_ACCOUNT_TOKENS_INTERVAL_MINUTES — DISCHARGED, by a stronger instrument than the one
  owed. The obligation was to confirm no sops override. The deploy record already carries a
  better observation: fired IDs 900,000 ms apart on the RUNNING worker — fifteen minutes,
  measured on the deployed configuration rather than inferred from a config file. With b136fe6
  correcting the cutoff to 24 hours, the published "within about a day" is accurate. DO NOT
  OPEN SOPS FOR THIS; a measurement of the running system dominates a read of its inputs, and
  the 8c key-disclosure precedent says do not open a secret store for a question already
  answered.

STEP 0 IS DISCHARGED. Proceed to 10e-R249 and 10e-R250.

---

## Review-channel ruling block — 10e-R249, 2026-08-22

10e-R249 — OPERATOR ELECTION: the server string matches C-1 BYTE-FOR-BYTE. 10e-R237's REPLACEMENT clause is AMENDED. R237's text is NOT edited; this correction travels adjacent.

ATTRIBUTION, stated first because it is not the channel's decision. OPERATOR ELECTION,
2026-08-22, on a question the channel raised and recommended on. 10e-R237 ruled the server
string CHANGES and specified "This sign-in link is not valid." — expanded. C-1 as shipped is
contracted. R237's own justification is a PARITY argument: it changes "for the same reason
R191 changed C-1," and leaving it would be "silently fixing one of two identical paths." A
replacement that does not restore parity does not complete that argument. The operator elected
parity. The channel recommended it; the operator ruled it.

AMENDMENT: the replacement is C-1's shipped bytes, whatever they are.

THIS RULING DOES NOT SPECIFY THE STRING AS TEXT, AND THAT IS DELIBERATE. A string typed into a
ruling block is a document about the artifact, and 10e-R182 forbids deriving a figure from one.
Parity that is byte-identity cannot be established by copying from a prompt. DERIVE C-1 FROM
THE FRONTEND SOURCE AT HEAD AND USE THOSE BYTES.

NAMED HAZARD, and it is the reason this ruling exists in this form rather than as one line:
THE APOSTROPHE. U+0027 APOSTROPHE and U+2019 RIGHT SINGLE QUOTATION MARK render nearly
identically in most fonts and are different bytes. A visual comparison, a copy through a
rendered surface, or a retype cannot distinguish them, and a mismatch would leave two strings
that LOOK identical and are not — which is worse than the current state, because the present
divergence is at least visible. 10e-R237 itself established the code literal's identity by
od -c dump rather than by eye; the same instrument governs here and for the same reason.

OBLIGATIONS on the implementing commit:

  (a) Extract C-1 from the frontend source at HEAD. Report its path:line and its od -c dump.
  (b) After the edit, od -c dump the server literal at magic-link.ts. Show the two dumps
      byte-identical.
  (c) BEHIND A WORKING NEGATIVE CONTROL. Two empty diffs, or two dumps a reader must compare by
      eye, are not evidence. Demonstrate the comparison form producing a NON-match on a
      deliberately altered copy — one byte, in a temp copy, never in a tracked file — before
      the match means anything. 10e-R150: the success output and the failure output must be
      distinguishable before either is read.

  (d) THE R78 CLASSIFICATION STEP RUNS BEFORE ANY EDIT. Step 0.3 measured FOUR occurrences of
      the old string and they are not the same kind of thing:

        apps/api/src/routes/magic-link.ts:391        — PRODUCTION. Changes. Ruled.
        apps/api/src/routes/magic-link.test.ts:529   — pins the old text; R237 already ruled it
                                                       updates in the SAME commit.
        apps/web/.../MagicLinkPage.test.tsx:71       — the fixture standing in for the server.
                                                       NOT RULED. See below.
        apps/web/.../MagicLinkPage.tsx:49            — the COMMENT explaining why R191 amended
                                                       C-1 (established at 10e-R205(a)).
                                                       NOT RULED. See below.

      CLASSIFY ALL FOUR under 10e-R78 — live index versus historical record — and PROPOSE a
      disposition for the two unruled ones WITH REASONING. Do not edit either until the channel
      rules. All mentions are classified before any are edited; that is the R78 step and it
      exists because the classification is the decision.

      The channel's view, offered so you can falsify it rather than infer it. :71 is arguably a
      LIVE INDEX — it is a hand-maintained copy of the server's string, and if the server moves
      and the fixture does not, the fixture carries a string the server never emits, which
      converts 10e-R192/R205(c)'s bounded unknown from theoretical to demonstrated. Note that
      updating it does NOT close that bounded unknown: nothing checks the fixture against the
      server either way, and the entry must not be written as if it did. :49 is arguably a
      HISTORICAL RECORD — a comment explaining a past amendment, where editing it to match the
      present would destroy the explanation. Both readings are contestable and neither is
      ruled. Argue them.

  (e) UNIFORMITY IS PRESERVED. The replacement remains one envelope constant, one emit site,
      uniform across all five causes. It is no oracle, before or after. Re-derive that at
      implementation rather than carrying it from here.

NO SECOND DEPLOY IS OWED, unchanged from 10e-R237. The string is rendered by no client and
keyed on by no consumer. It ships whenever the next deploy happens. Do not schedule one.

---

## Review-channel ruling block — 10e-R250, 2026-08-22

10e-R250 — DRAFT THE 10e-close PROPOSAL. Draft only. No commit, no edit, hard stop.

Propose; do not implement. The proposal is reviewed in the channel and approved before anything
is written. If any item below cannot be done as described, say so IN the proposal rather than
adapting silently — a proposal that reports an obstacle is worth more than one that routes
around it.

(a) COMMIT SPLIT, ruled as a constraint rather than a plan. A commit touching apps/api DOES NOT
    CARRY THE DOCS PASS. Mixing forfeits 10e-R149's permanent licence to skip both gates on a
    docs-only commit and makes the code diff unreviewable behind a several-hundred-line docs
    diff. Within that constraint the ordering, and whether the docs work is one commit or two,
    is yours to propose with reasoning.

(b) THE FIRST COMMIT IS DOCS-ONLY AND PERSISTS THE OUTSTANDING RULING SET. 10e-R239 says
    rulings do not live in conversations, and the set outstanding right now lives in one. DERIVE
    the set at proposal time — it runs from 10e-R242 upward and it will have grown by then;
    state it as a derived list with its endpoints, never as a count carried from this block
    (10e-R118). Precedent: aa91b61 was a proposal commit that also persisted R174–R187.

(c) THE CODE COMMIT, two riders, EACH NAMED IN THE COMMIT BODY, never folded in silently:
      (i)  10e-R200 — remove TODO(module-10e-4-token-in-url) at apps/api/src/routes/magic-link.
           ts:278. Before-present / after-absent ON THAT PATH ONLY. The four documentation hits
           are historical records under 10e-R78 and MUST NOT MOVE; a tree-wide clean grep would
           mean the record of the decision had been destroyed.
      (ii) 10e-R237 as AMENDED by 10e-R249 — the server error string, its od -c parity proof
           behind a negative control, the R78 classification of all four occurrences, and
           magic-link.test.ts:529 in the same commit.

(d) THE DOCS PASS:
      - CLAUDE.md standing rules: the durable lines from 10e-R209, 10e-R239, 10e-R244 and
        10e-R246 including R246's namespace rider. FOUR, and derive that count from the blocks
        rather than from this list.
      - The 10e-R207 move: relocate the R183 line adjacent to the R171 entry its own text
        continues. Line numbers derived AFTER the last edit to that section, never before
        (10e-R209).
      - CLAUDE.md "Public API contracts": the 10e-R124 + 10e-R189 entry. BOTH verify response
        shapes AND THE DISCRIMINATION RULE. Both are 200 with ok:true, distinguished only by
        which key is present in data; a consumer writing if (data.is_new_user) reads undefined
        on the handoff and routes a sessionless user into the app. An entry with two shapes and
        no discrimination rule hands the next consumer that defect and does not discharge R124.
      - Completeness-note additions: each ruling number now appears in the file at least twice,
        so an unanchored grep returns a count that is not the block count; and the R242-upward
        persistence.
      - The Migration status entry closing 10e.

(e) THE BOUNDED-UNKNOWN RECORD, FOUR ENTRIES: the Errors grep's undemonstrated independence
    from the exit code (R134 + R168); the frontend control's synthetic provenance (R181(b));
    nothing verifying the declared shape against the running server pre-deploy (R192), whose
    concrete instance is MagicLinkPage.test.tsx:71 (R205(c)) — and that entry NARROWS but does
    not close, because sibling tests at :157/:164 pass "alpha" and "omega" under the same code,
    which is affirmative evidence the component is message-independent; what survives is that
    the field the client branches on is `code`, not `error`. The fourth entry is yours to
    identify from the record and to state; if you conclude there are three rather than four,
    say so and argue it rather than padding to the number.

(f) QUEUE RECONCILIATION, NINE ITEMS, none of them opened here. Five carried: 10e-R129 (own
    cycle, DO NOT BUNDLE); R85/R72 with R199's second site; R161's acknowledgement half with its
    one surviving mechanism, deferred on SCOPE not soundness; LoginPage.test.tsx:24's
    getByRole("heading", { name: /sign in/i }) as a latent constraint on future copy; R155's
    soft-delete email retention. Four new, ALL DO-NOT-BUNDLE: the argument-recording mock;
    account_action_tokens as a dead table; §7's "anonymous" / "one-way hash" characterisation
    against an unsalted SHA-256 plus ip_address and user_agent; and §5's Postmark line, declined
    2026-08-19 as weak-but-true when magic-link was not live. SEPARATELY SCOPED, not part of the
    nine: 10e-R241's R36–R101 recovery hypothesis, and the TermsPage LAST_UPDATED question,
    which is the operator's and is not an obligation.

(g) FORM. Checkable predictions stated IN ADVANCE so a miss becomes a question rather than an
    adjustment. Per-item presence assertions with the ^10e-R0 —  control and the format stated
    (10e-R142, 10e-R183(ii)). Explicit abort conditions on every step, with the escape clause on
    EVERY step or none — 10e-R246 recorded that placing it only where the author feels unsure
    inverts where it is needed. Selector-addressed commands carry resolution proofs (10e-R246).
    The three mandatory close-out verbatim sections.

(h) HARD STOP. Draft and stop. Nothing edited, staged, committed or pushed. Report the proposal
    in full and wait.

---

## Review-channel ruling block — 10e-R251, 2026-08-22

10e-R251 — 10e-R243 WAS AUTHORED AND NEVER DELIVERED. It is SUBSTANTIVE, not procedural. Relayed verbatim in this message. The cause is the channel's emission form, and it produced a defect the channel's own ledger could not see.

DISPOSITION: NOT procedural-and-not-owed. R210–R236 were consumed within a session and left
nothing a later reader needs. R243 is not that. It carries the 10e-R148 round-trip discharge
for e6aab65, the ran-and-empty discriminator for an empty git status, the mirrorhouse closure
with its standing consequence about workspaces outside this project, an attribution class
(OPERATOR-MEASURED) that had no precedent in this module, and clause (e). It is persisted with
the rest.

ITS TEXT IS DELIVERED UNEDITED. Clause (f) names Items 1 and 2 as owed; both were closed by
10e-R244 on the same day. That is a HISTORICAL RECORD under 10e-R78 and is not edited to match
the present — the correction travels adjacent, which is what this paragraph is. A reader
finding "(f) OWED, UNCHANGED" needs the closure beside it, not a block silently rewritten to
agree with what happened next.

THE CAUSE, stated plainly because it is the channel's. R243 was emitted inside a code fence
but WITHOUT the paste-ready heading and rulers this channel puts on everything the operator is
meant to relay. The same message closed by asking whether R242 had reached you. The operator
answered about R242 — correctly — and R243 carried no marking identifying it as a thing to
send. It was authored, self-contained, correct, and invisible to the relay.

THE SYMMETRY IS THE FINDING AND IT SHOULD NOT BE SMOOTHED OVER. Clause (e) of R243 is the
channel recording a form defect for placing actionable content OUTSIDE the fenced block. R243
was then lost to the adjacent defect: correctly fenced, incorrectly unmarked. The block
diagnosing the class was destroyed by the class.

WHAT THE CHANNEL'S LEDGER COULD NOT SEE. This channel asserted the outstanding set as "R242
through R247" three separate times. It had no evidence for R243's membership — only the memory
of having written it. 10e-R204 established that a block returning to its AUTHOR is evidence of
non-delivery. This is the complementary case and it is worse, because nothing returns at all:
the author's record shows a block written, the implementer's shows a block absent, and no
message in either direction contradicts either. Only enumeration crosses the gap.

DETECTION. This was caught by the implementer enumerating its held set and reporting a gap at
243 — the 10e-R240(a) form. That is the THIRD relay fault in this module found by
enumeration-of-held-numbers and by nothing else: R196–R202, R205–R209, and now R243.
Enumeration is not a formality in this project; it is the only instrument that has ever
detected this class.

STANDING, and it is a CHANNEL obligation, not a CLAUDE.md standing-rules line — the same
disposition 10e-R238's restatement received:

  SINGLE EMISSION FORM. Every ruling block leaves this channel under the relay marking, with
  no exception for short blocks, incidental blocks, acknowledgements, or blocks the channel
  judges minor. A block emitted outside the marking is authored, correct, self-contained and
  UNDELIVERED, and neither end can see it.
  LEDGER CLAUSE: the channel's statement of the outstanding unpersisted set is a claim about
  DELIVERY, not about authorship. It is DERIVED from the implementer's most recent enumeration
  of what it holds, never from the channel's memory of what it wrote. Where the two disagree,
  the implementer's enumeration governs and the difference is a delivery fault to be diagnosed,
  never a discrepancy to be reconciled away.

CONSEQUENCE FOR COMMIT 1: the outstanding set is CONTIGUOUS from 242 upward. There is no second
deliberate gap. Do not write one into the completeness note.

---

## Review-channel ruling block — 10e-R252, 2026-08-22

10e-R252 — THE 10e-close PROPOSAL IS APPROVED. Both R78 dispositions ratified. The fourth bounded-unknown accepted. ONE independence overclaim corrected. ONE addition to commit 2.

§1 THE THREE-COMMIT SPLIT IS APPROVED, and the reasoning is ratified rather than merely the
shape. Persistence first because it is the repair and must not queue behind a commit that could
hit an obstacle — which is the failure this whole sequence exists to fix, and which just
recurred at R243 while the proposal was being written. Docs pass last because its
Migration-status entry describes commit 2 and should carry its SHA. And the refusal to fold 1
into 3 is right for the reason given: they differ IN KIND. Commit 1 is a verbatim paste under
R149's licence and reviewable as one act; commit 3 is authored prose and reviewable as another.
Folding them would make a several-hundred-line paste and a set of judgement calls share a
single diff.

§2 COMMIT 1 APPROVED. Re-derive the prediction at commit time; do not carry any figure from the
proposal, which was written before R243 and R251 and R252 existed and whose contingent branch is
now moot. The SHAPE, which is what to assert: Format A runs 140 … 209, then the DELIBERATE gap
at 210 … 236, then 237 … <top> CONTIGUOUS WITH NO SECOND GAP. Reconcile the count two ways —
previous total plus blocks appended, and (209 − 140 + 1) + (top − 237 + 1) — and state both.
Format B unchanged. Provenance in the completeness note is RELAYED, and R243's is RELAYED
LATE — distinct from R205–R209's RECOVERED, and the distinction is worth the four words.

§3 COMMIT 2 APPROVED. BOTH R78 DISPOSITIONS ARE RATIFIED, and the arguments are what earn it.

  :71 UPDATE, as a LIVE INDEX. The distinction that carries it is correct: invalidLinkError()
  is an active test INPUT, not a record of a decision, and a hand-maintained copy of the
  server's string left stale becomes a fixture asserting a wire shape the server never emits.
  The FIND-S5(b) citation resolves and the precedent is apt — a false-premise fixture is a
  defect while it passes. Your safety argument is checked and stands: :157/:164 pass
  "alpha"/"omega" under the same code and :170 asserts against the imported INVALID_TITLE, so
  no assertion depends on the fixture's text.

  AND THE SENTENCE THAT MAKES IT RATIFIABLE RATHER THAN MERELY CORRECT: updating :71 does NOT
  close the R192/R205(c) bounded unknown, because nothing checks the fixture against the server
  in either direction and hand-updating is the same hand-maintenance that produced the
  divergence. Stating the limit of your own repair, unprompted, is the standard. Carry that
  sentence into the bounded-unknown entry verbatim; an entry that reads as if the update closed
  something would be worse than no update.

  :49 DO NOT TOUCH, as a HISTORICAL RECORD. Correct, and for the stated reason: the comment's
  entire content IS the contrast between the two wordings, so deleting the rejected wording
  destroys the explanation. It also remains TRUE after the change — it describes C-1 and claims
  nothing about the server. Your commit-body note that a grep for the old string still returns
  this comment, and that this is correct rather than residue, is required and not optional.

  YOUR REJECTION OF THE ADJACENT STATUS NOTE IS RATIFIED AND PROMOTED. "R78 adjacency is
  reserved for CORRECTIONS, not status updates" is a real distinction this module had not
  articulated. A correction beside a historical record tells a reader the record is wrong about
  something; a status update beside it tells the reader nothing they cannot get from the ruling
  record, while diluting the signal that adjacency carries. Recorded as the disposition, minted
  as no new rule — it is 10e-R78's own boundary made explicit.

  ADDED TO COMMIT 2, and it is the one thing the proposal is missing. RUN THE FINAL TWO-MODE
  CROSS-CHECK AFTER COMMIT 2, not before. Your INTEGRATION-not-owed argument is correct AS AN
  ARGUMENT ABOUT THIS COMMIT — no db.transaction() boundary, no integration case added or
  edited — and it is not the obligation. 10e-close separately owes the FINAL cross-check
  exercised at the module's end state, and the 0.8-E baseline was measured at e6aab65, before
  commit 2 exists. One run. State it per 10e-R248 as COLLECTED-SET INVARIANCE — that both modes
  collect the same total — and not as a coverage claim.

  PREDICTIONS ACCEPTED AS STATED, all deltas zero, with 873/34/61 unchanged because :529 is
  edited in place. A miss is a question, not an adjustment.

§4 COMMIT 3 APPROVED. FOUR durable CLAUDE.md lines — R209, R239, R244, R246 with its namespace
rider — and your derivation is right on both exclusions: R238's "RESTATED, standing" is a
channel obligation rather than a CLAUDE.md rule, and R238 explicitly declines a new line for
R171. FOR THE AVOIDANCE OF A FIFTH: 10e-R243(e) and 10e-R251 are likewise CHANNEL OBLIGATIONS
and take no CLAUDE.md line. The count is four. Derive it from the blocks anyway.

§5 THE FOURTH BOUNDED-UNKNOWN IS ACCEPTED, and your rejection reasoning is the better half —
"a bounded-unknown entry should name what the evidence CANNOT REACH," so a measured zero is a
coverage gap for the queue and not an unknown. That sentence is the definition this record has
been operating on without stating.

  ONE CORRECTION, INSIDE THAT ENTRY. You wrote that mode engagement was established "three
  structurally independent ways." It was established two ways, observed at three granularities.
  The skipped-test count (34 → 10) and the file count (51 passed | 10 skipped → 61 passed) are
  the SAME MECHANISM — the skipIf(!INTEGRATION) branch — read at two levels; if that branch
  failed to flip, both readings move together and neither could detect it. The setup timing
  (665ms → 0ms) is the genuinely separate one: it reflects the setupFiles: [] branch, a
  different conditional. Two mechanisms, three readings.

  This is 10e-R134 + 10e-R168 firing on the implementer's own claim, in the same cycle the
  channel required you to apply it to the Errors grep. It changes nothing about the conclusion —
  mode engaged, and two independent mechanisms agreeing is strong — and it changes the sentence.
  Write two, not three.

§6 QUEUE APPROVED. Nine items, none opened. R241 and the TermsPage question correctly held
separate and outside the nine.

§7 FORM APPROVED as stated.

PROCEED. Commit 1, then commit 2, then commit 3, reporting after EACH rather than at the end —
three reports, three channel reviews. Do not batch the three commits behind one report; the
first is the repair and the channel wants it confirmed landed before code moves. Hard stop
after commit 1's report.
