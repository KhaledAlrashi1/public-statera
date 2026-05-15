# CLAUDE.md — public-statera

This file is read by Claude Code at the start of every session. Keep it accurate and up to date.

## Project identity
- **Name:** public-statera
- **What it is:** a personal finance dashboard for Kuwait (KWD currency, KW locale)
- **Monorepo:** `apps/web` (Vite + React 19 + TypeScript + Tailwind) and `apps/api` (Hono + TypeScript + Drizzle + MySQL 8)
- **Origin:** ported from a private Flask + PostgreSQL version. This repo is the Node/TypeScript public version.

## Stack

**Frontend (`apps/web`)**
- Vite 6, React 19, TypeScript 5.7, Tailwind v4
- Radix UI, shadcn/ui conventions (CVA, clsx, tailwind-merge), Lucide icons
- TanStack Query v5, React Router v7, Recharts v2, TanStack Virtual v3
- Vitest + Testing Library (unit), Playwright (E2E)

**Backend (`apps/api`)**
- Hono, Node.js LTS, TypeScript
- Drizzle ORM, MySQL 8 (utf8mb4, utf8mb4_0900_ai_ci, DATETIME(3))
- BullMQ + Redis 7 for background jobs
- Postmark for email, Sentry for errors
- openid-client for OAuth (Google as initial provider; provider-agnostic)
- Vitest

**Tooling**
- pnpm workspaces
- Docker Compose for local dev and prod

## Migration status — Phase 3 in progress

**Completed modules:**
- 1a Sentry initialization
- 1b Postmark email service (sendEmail + sendEmailBackground only; sendTemplatedEmail deferred to first caller)
- 1c BullMQ worker scaffold (ping job only)
- 2a Categories
- 2b Merchants
- 3a Transactions (CRUD, queries, bulk, import-batch; exports deferred)
- 3b Memorized transactions
- 4a Budgets
- 4b Debt accounts (calculator + routes)
- 4c Savings goals (projection lib + routes)
- 5a-1 Dashboard snapshot lib
- 5a-2 Analytics cache layer (circuit breaker, Redis helpers, withAnalyticsTimeout)
- 5a-3 Dashboard snapshots rebuild job
- 4d Transaction suggestions
- 5b-1 Aggregation pre-work (analytics-helpers, payday-lib, income-lib; cache busts wired to all write routes)
- 5b-2 Pure aggregation routes (R1 spend-by-category, R2 spend-by-month, R5 expense-breakdown, R6 expense-merchant-trend, R7 budget-metrics)
- 5b-3a Cached routes (R3 dashboard-metrics, R4 account-overview)
- 5b-3b Safe-to-spend route (R9) with F1-F5 fixtures
- 5b-3c Weekly-digest (R10) + dashboard-bundle (R8)
- 5c Intelligence/detection routes (algorithmic; fixture-based equivalence tests) — R11 income-pattern, R12 recurring-patterns, R13 snapshot
- 6a Cleanup jobs (cleanup-account-tokens, cleanup-security-data, cleanup-product-events, cleanup-memorized-transactions)
- 6b Product-events lib (recordEvent, recordEventOnce, recordEventDaily, hasEvent, hasEventBetween; consolidates savings-goals/budgets local copies; wires app_opened on dashboard_metrics)
- 6c Budget alerts + email templates (email-templates lib, budget-alerts-lib, check-budget-alerts BullMQ job, send-budget-alert-email job, send-goal-milestone-email job, GET /api/notifications/budget-alerts, POST /api/notifications/budget-alerts/dismiss, R8 budget_alerts.items wired, goal milestone email dispatch in savings-goals deposit)
- 6d Activation report job (activation-reporting-lib with buildActivationReport, generate-activation-report BullMQ job with atomic write-to-tmp+rename, signup_completed event wired in auth callback, 3 env vars: ACTIVATION_REPORT_INTERVAL_HOURS/DAYS/PATH)
- 7a TOTP enable/disable (totp-lib with otplib/bcryptjs/qrcode, POST /api/auth/2fa/setup + confirm + disable; sv claim added to JWT; sv deny-list revocation via Redis sv_revoked:{userId}:{sv} keys; session cookie re-issued on disable)
- 7b TOTP verify-on-login (statera_pending_2fa short-lived JWT cookie; OIDC callback gates on totpEnabled → redirect /auth/2fa-verify; POST /api/auth/2fa/verify handles TOTP + backup-code; Redis pending_2fa_failures:{userId} counter with 5-min TTL; PENDING_2FA_MAX_FAILURES=3; BACKUP_CODES_LOW warning ≤2 remaining; auditSecurityEvent helper writing to security_events; login.pending_2fa / login.success / login.2fa.failed events)
- 7c Revoke-all sessions + security events (POST /api/auth/sessions/revoke-all: bumps sessionVersion in DB + writes sv_revoked deny-list key with 30-day TTL + re-issues caller cookie with newSv + sessions.revoke_all audit event; GET /api/auth/profile/security-events: offset-based pagination, limit default 20 max 50, filter event_type LIKE 'profile.%' matching Flask exactly, +00:00 timestamp format)
- 7.5 Account deletion (GET /api/auth/delete-reauth → OIDC re-auth with prompt=login; statera_delete_intent JWT cookie Path=/api/account Max-Age=900; DELETE /api/account: verifies intent cookie + isActive, BullMQ async job (delete-account-data, jobId dedup) with sync transaction fallback Sentry-tracked; GET /api/account/deletion-status/:taskToken: encrypted status token; purgeUserAccountRows: tombstone-first then 13 table deletes then soft-delete; is_tombstone column on security_events migration 0003; hashEmail SHA-256 no-salt; 2FA re-verification: if totpEnabled, callback issues statera_pending_2fa with deleteIntent=true → /2fa/verify issues delete-intent cookie instead of session)
- **TODO(module-7-smoke):** Module 7 + 7.5 must be smoke-tested against the running Docker stack before Module 8 deployment work begins. This is a precondition for Module 8 kickoff.

**Module 8 — Deployment (Hetzner CPX31, Helsinki HEL1 — staterafinance.app):**
- 8a Dockerfile hardening + prod Compose (DONE: pinned node:22.11.0-alpine digest, tini PID-1, non-root user node:1000, GIT_SHA build arg + ENV, npm-installed pnpm bypasses corepack key-verification issue, worker service added to prod Compose, one-shot migrate service, mysql:8.0.41 + redis:7.4.2-alpine pinned with digests, /health exposes version)
- 8b Server bootstrap (DONE: deploy/bootstrap.sh — 13-section idempotent script: apt packages (chrony explicitly installed, overrides Debian 12's systemd-timesyncd default), deploy user, Hetzner Volume format+mount with device-path pattern validation, Docker CE + Compose (docker-compose-plugin via apt, tracks Docker engine version automatically), vm.overcommit_memory+swappiness sysctl, fail2ban 24h bantime, UFW, GHCR login guidance, unattended-upgrades with explicit 20auto-upgrades APT::Periodic settings, chrony with 5-min stabilisation warning, SSH hardening + AcceptEnv DEPLOY_SHA, deploy-user SSH verification before root lockout with Hetzner Rescue recovery procedure, age/sops §1 install + §14 key dir; deploy/.env.prod.example; docker-compose.prod.yml volumes → Option A bind-mount; Dockerfile corepack comment; rebuild-from-scratch test passed sha256:bb2ba40f; production server bootstrapped end-to-end 2026-05-15 on CPX31 Helsinki HEL1; two post-commit fixes in daec3d1 — see "Module fix-forwards" below; **TODO(module-8b-§13-rewrite):** §13 SSH verification has a known false-negative — `sudo -u deploy ssh deploy@localhost` fails on fresh server because deploy user has no private key, only operator's pubkey in authorized_keys; script aborts safely before root SSH disabled but doesn't prove operator access works; real verification is "operator SSHes in from laptop" done externally; future fix: rewrite §13 to validate authorized_keys content + sshd PubkeyAuthentication config rather than loopback SSH)
- 8c Secrets management (code committed 468696c — sops v3.9.1 + age v1.2.0 in bootstrap §1; §14 key dir; .sops.yaml two-recipient pattern with placeholder keys; deploy/SECRETS.md; deploy/8c-post-bootstrap.md; .gitattributes sopsdiffer; .gitignore guards; **NOT YET OPERATIONAL on server** — .sops.yaml still has placeholder age public keys, no secrets/.env.prod.sops.yaml on server, post-bootstrap runbook not yet executed, age keypairs not yet generated; next operational step: run deploy/8c-post-bootstrap.md end-to-end)
- 8d CI/CD (code committed 1b53243 + 1bd02f0 fixup — .github/workflows/deploy.yml test→build-push→deploy, concurrency serialized, workflow_dispatch rollback path, all actions SHA-pinned; deploy/deploy.sh — git reset --hard $GIT_SHA, decrypt-once, _rollback() with prev-SHA pull + health check; deploy/DEPLOY.md; bootstrap §12 AcceptEnv DEPLOY_SHA; GHCR namespace typo khaledalrashidi1→khaledalrashi1 fixed in 1bd02f0; **NOT YET END-TO-END TESTED** — deploy pipeline cannot run until 8c is operational on server and CI SSH key + GHCR token are configured in GitHub Actions secrets)
- 8e TLS + reverse proxy (pre-decisions taken: Caddyfile committed to repo at deploy/Caddyfile; CSP Content-Security-Policy-Report-Only first, enforce after ≥1 week of production data; apex architecture — staterafinance.app serves frontend at / and API at /api/*; Caddy replaces nginx in docker-compose.prod.yml; NOT YET STARTED)
- 8f Backups + monitoring + smoke test (R2 off-site, UptimeRobot, restore-tested, deploy-rollback rehearsal; NOT STARTED)
- Module 9: Frontend parity verification (apps/web tested against the new Hono API end-to-end before any external sharing). **Precondition: 8e produces production environment.**

**Deferred indefinitely:**
- Bank sync (CBK Open Banking dependency; replaced future scope: bank statement PDF parsing for Kuwaiti banks)
- Exports (3c)
- sendTemplatedEmail (until first caller module) — now implemented in 6c
- transaction-template-suggestions (feature-flagged off in Flask; do not port)

## Module fix-forwards

Fixes shipped after the original module commit, capturing real-world deployment findings.

**8b — daec3d1** `phase-3: 8b fix Compose install via apt, remove repo clone`
1. **Docker Compose installation changed**: Docker Compose v5+ restructured GitHub Releases assets; the v2.35.1 pinned-binary URL no longer resolves. Replaced with `apt-get install -y docker-compose-plugin`, which tracks the Docker engine version automatically. The `DOCKER_COMPOSE_VERSION` variable and the binary-download block were removed from bootstrap.sh.
2. **Repo clone block removed**: Bootstrap was cloning the repo from a hardcoded GitHub URL that required credentials and referenced a wrong-named repo. Repo checkout is 8d's responsibility (deploy.sh `git reset --hard $GIT_SHA`); bootstrap is self-contained server preparation. Replaced with an explanatory comment.

## Standing rules for every module

- **Propose before implementing.** Show Flask source, propose Hono equivalent, wait for approval.
- **One commit per module** (or sub-commit if large), prefix `phase-3: <module>`.
- **Decimal.js for ALL arithmetic on KWD amounts.** Drizzle decimal returns strings — never pass to `Number()` or use `+` arithmetic. Grep for `Number(`, `parseFloat(`, and `+` near amount fields before each commit.
- **Response envelope:**
  - Success: `{ ok: true, data: <resource>, error: null, meta: {} }`
  - Error: `{ ok: false, data: null, error: <msg>, code: <string> }`
- **Timestamp format:** `date.toISOString().replace(/\.\d{3}Z$/, '+00:00')` — matches Flask's `+00:00` format, no milliseconds.
- **Validation:** Zod via `@hono/zod-validator` on all route inputs. No hand-rolled validation.
- **Auth:** `requireAuth` middleware on every business-logic route. No exceptions.
- **Rate limiting:** Reuse the Redis-backed middleware from transactions; apply to any endpoint Flask rate-limited.
- **Sentry on all swallowed errors.** Never silently ignore.
- **Migrations must be additive and backwards-compatible.** New NULLABLE columns, new tables, new indexes only. NEVER DROP, RENAME, or change the type of in-use columns in a single migration. Destructive changes require a two-deploy sequence: (1) deploy code that tolerates both old and new schema, (2) migrate, (3) deploy code that drops old-schema support. Rationale: MySQL DDL is not transactional; a failed migration may partially apply with no automatic rollback. The CI deploy pipeline aborts before code rollout if drizzle-kit migrate fails, but cannot undo partial DDL. Additive-only migrations make rollback safe: old code running against a migrated schema can ignore new columns it doesn't know about.
- **One DDL statement per migration file.** MySQL DDL is not transactional — multiple ALTER TABLE statements in one file can fail mid-way and leave the schema partially migrated. One DDL operation per file ensures a failure is cleanly "this migration didn't apply" rather than "this migration half-applied." Use IF NOT EXISTS / IF EXISTS guards where applicable for safe re-run.
- **Fire-and-forget writes** (audit, tracking, cache bust): try/catch + Sentry, never block the main response.
- **Deviations from Flask:** flag in the proposal *before* implementing, not in the summary after. Add a "Deliberate deviations from Flask" comment block at the top of files where deviations exist.
- **TODO format:** `// TODO(module-X-name):` for grep-able deferred work.
- **Update this file:** at the end of every module commit, update the "Migration status" section above to reflect the new state. This is part of the commit, not a follow-up.
- **Sequential gates are sequential.** When a prompt requires a verification report (e.g., a status check on a previous module) before work on a new module proceeds, deliver the verification report and wait for explicit approval before starting the new work. An approval issued conditionally on a prior report being clean is not standing approval to ship in parallel. If a verification surfaces a problem, the new work pauses until the prior gap is resolved.

## Key architectural decisions (do not revisit)

- **Auth:** provider-agnostic OIDC via openid-client; Google as initial provider. Users table has `(auth_provider, external_id)` composite unique. No password column.
- **sv deny-list (added in 7a):** `requireAuth` validates session version exclusively via a Redis deny-list key (`sv_revoked:{userId}:{oldSv}`, 30-day TTL matching JWT expiry). Zero DB cost per request. Fail-open on Redis outage (consistent with rate-limiter behavior). Old JWTs without sv claim pass through and expire naturally within 30 days. Revocation writes the deny-list key via `revokeSessionVersion(userId, oldSv)`; also bumps `users.sessionVersion` in DB so new sessions issued after revocation carry the next sv. Do not revert to per-request DB lookup — that was Option 1 and was rejected.
- **statera_pending_2fa (added in 7b, extended in 7.5):** 5-minute HS256-signed JWT cookie carrying `{ userId, pendingAt, deleteIntent? }`. Issued by the OIDC callback when `totpEnabled=true`; real session cookie not issued until `/2fa/verify` succeeds. For delete-reauth flows, `deleteIntent=true` is embedded; on success `/2fa/verify` issues `statera_delete_intent` instead of a new session. Failure counter stored in Redis (`pending_2fa_failures:{userId}`, 5-min TTL, `MULTI/INCR/EXPIRE` pipeline). Max failures = 3; 3rd failure deletes the pending cookie (PENDING_2FA_RESTART). The pending cookie is independent of sv — `/2fa/verify` reads `users.sessionVersion` from DB at verify time.
- **statera_delete_intent (added in 7.5):** 15-minute HS256-signed JWT cookie carrying `{ userId, issuedAt }`. Scoped to `Path=/api/account` so it cannot be sent to unrelated endpoints. Issued by the delete-reauth OIDC callback (no TOTP) or by `/2fa/verify` (with TOTP, deleteIntent=true). `DELETE /api/account` verifies this cookie, checks userId match (anti-replay), then consumes it (deletes immediately). Flask used password + session token; Hono uses OIDC re-auth because there is no password column.
- **Account deletion tombstone (added in 7.5):** `security_events.is_tombstone` boolean column (migration 0003). Tombstone row inserted with `user_id=NULL, is_tombstone=true` BEFORE the purge loop. The purge DELETE for security_events uses `AND is_tombstone=false`, so the tombstone survives. Do not rely on NULL-WHERE semantics alone — the explicit column is the safety guarantee.
- **DB:** MySQL 8, utf8mb4, utf8mb4_0900_ai_ci collation, DATETIME(3) for timestamps, DATE for transaction dates.
- **Money types:** DECIMAL(10,3) or DECIMAL(12,3) for KWD; DECIMAL(6,3) for APR.
- **Bank sync deferred:** do not port `bank_consents`, consent receipts, `DataAccessLog`, or bank-sync Celery jobs. Schema tables remain from Phase 2.
- **Snapshot strategy:** Option B — rebuild only users with `last_login_at` within `SNAPSHOT_REBUILD_WINDOW_DAYS` (default 14). NULL `last_login_at` users included only if `created_at` is also within the window.
- **BullMQ concurrency:** Option B — p-limit with configurable concurrency, default 5 (`SNAPSHOT_REBUILD_CONCURRENCY`).
- **Per-user budget vs MySQL timeout:** per-user budget = `analyticsComputeTimeoutSeconds + 2` so the two error modes are distinguishable in Sentry.
- **Template emails deferred:** when adding, use a separate `email-templates.ts` module; preserve the Flask path-traversal guard (reject template names containing `..`, `/`, or `\`).
- **Production server:** Hetzner CPX31 (3 vCPU AMD, 8GB RAM) in Helsinki HEL1, ~€13.59/mo + IPv4 ~€0.60/mo. CX32 was unavailable in Helsinki at provision time; CPX31 is the AMD equivalent with faster per-core performance. The repo's Docker Compose configuration is the source of truth for production deploys. Manus AI (manus.im) was briefly considered at scaffold stage and removed in commit 13c709a; do not reintroduce platform-specific hosting assumptions.
- **Production domain:** staterafinance.app, registered through Cloudflare Registrar. DNS managed on Cloudflare with proxy disabled (gray cloud) — Caddy handles TLS end-to-end via Let's Encrypt ACME. Do not enable Cloudflare proxy (orange cloud) without reconsidering the TLS chain.
- **Apex architecture (8e, Option B):** staterafinance.app serves both frontend (`/`) and API (`/api/*`) from a single Caddy virtual host. No CORS complexity, same-origin cookies, single TLS cert. The Caddyfile is committed to the repo at `deploy/Caddyfile` and copied to `/etc/caddy/Caddyfile` by the deploy pipeline when it changes.

## Helpers and patterns to reuse (do not reimplement)

- `lib/name-key.ts` — `buildNameKey`, `forceUniqueNameKey` (use for any text normalization)
- `lib/kd.ts` — `formatKd` (KWD formatting; 3 decimal places)
- `lib/crypto.ts` — AES-256-GCM field encryption with `enc1:` prefix (preserve prefix exactly for future rotation)
- `lib/email.ts` — `sendEmail`, `sendEmailBackground`
- `lib/sentry.ts` — `initSentry`, `sentryBeforeSend`
- `lib/transaction-lib.ts` — `learnTransaction` (canonical; memorized module consumes it, does not duplicate)
- `lib/dashboard-snapshot-lib.ts` — snapshot helpers
- `lib/analytics-cache.ts` — cache layer, `withAnalyticsTimeout`, `getDashboardMetricsWithCache`
- `lib/analytics-helpers.ts` — `currentLocalDate`, `currentMonthKey`, `calendarMonthBounds`, `buildMonthWindow`, `ymExpr`, `roundedKd`
- `lib/payday-lib.ts` — `incomeCategoryFilter`, `expenseCategoryFilter`, `currentPayPeriod`
- `lib/income-lib.ts` — `detectMonthlyIncome`, `resolveIncomeForPeriod` (typed `IncomeSource` / `IncomeResolution`)
- `lib/intelligence-lib.ts` — `buildIncomePatternPayload`, `buildRecurringPatternsPayload`, `buildSnapshotPayload`, `confidenceFromVariance`, `confidenceFromIntervalVariance`, `classifyRecurringFrequency`, `intervalVarianceRatio`, `classifyRecurringGroup`
- `db/sql-helpers.ts` — `nullsLast` helper
- Rate limit middleware from transactions — reuse for new endpoints
- Worker task tracking from 1c — `markWorkerTaskStarted`, `markWorkerTaskFinished` (call once at batch start/end, not per-user)
- `tools/capture-flask-fixtures.py` — Flask fixture capture tool (subcommands: income-pattern, recurring-patterns, snapshot). Seeds deterministic data into the live PostgreSQL container, calls Flask payload builders, prints JSON, rolls back. Run before implementing each 5c sub-commit to capture expected values for equivalence tests.
- `routes/route-helpers.ts` — `parseIntParam` (consolidated from aggregation.ts and intelligence.ts local copies in 5c-3)
- `routes/auth.ts` — `auditSecurityEvent(db, eventType, opts)` fire-and-forget helper writing to `security_events` table (use for all auth security events); `verifyDeleteIntentToken(token)` exported for `routes/account.ts`
- `lib/account-deletion.ts` — `hashEmail(email)` SHA-256 (trim+lowercase, no salt), `purgeUserAccountRows(userId, emailHash, ipAddress, userAgent, db)` (tombstone-first, 13-table purge, soft-delete)

## Test conventions

- **Route tests:** Proxy mock pattern (mock Drizzle db), unit-level.
- **Drizzle proxy-mock pattern:** use a flat self-referential proxy where every property access returns either a `then`-resolver (for awaitability) or the same proxy (for chaining). Do NOT use outer/inner alternation — Drizzle chain lengths vary by query (3 for `select().from().where()`, 4+ when joins are present), and alternation only resolves on chains that happen to end on the thenable side. The flat pattern resolves any chain length. See `apps/api/src/lib/income-lib.test.ts` for the canonical example.
- **Lib tests:** fixture-based equivalence against Flask output for any non-trivial calculation. Captured Python output is hardcoded as expected value.
- **Integration tests:** gated on `INTEGRATION=true` env var, run against docker-compose MySQL.
- **Atomicity tests:** required for any route that uses `db.transaction()`. Mock transactions always commit; use real DB to verify rollback behavior.
- **Decimal assertions:** assert string equality on amounts (`expect(tx.amount_kd).toBe("12.500")`), not numeric equality.

## Public API contracts (do not change without coordination)

- Error codes are part of the API: e.g., `PAYMENT_TOO_LOW`, `category_name_exists`, `merchant_name_exists`, `debt_name_conflict`, `goal_inactive`, `goal_fully_funded`, `budget_duplicate_category`. Match Flask exactly.
- Diagnostic check order on the savings-goals deposit endpoint: not_found → inactive → fully_funded → would_exceed → deposit_conflict. Do not reorder.
- POST `/api/budgets` is a full atomic replace for the given month. Frontend must send the complete list of budgets for the month.
- Categories `remap` does not delete the source. Merchants `remap` merges (deletes the source). This asymmetry is documented in code; preserve it.
- Memorized POST/PATCH does name lookup only — does not create categories or merchants. Differs from transactions CRUD intentionally.
- `confidence` stable enum (R11 income-pattern, R12 recurring-patterns): `"high" | "medium" | "low"`. Do not change values.
- `income_source` stable enum (R11, R9, R10 safe-to-spend, weekly-digest): Hono returns `"detected_from_transactions" | "declared_in_profile" | "not_set"`. Flask returns `null` instead of `"not_set"` — this is a documented deviation. **Module 9 must update `apps/web/src/types/api.ts` (lines 138, 176, 265) and `sections.tsx:249` from `null` to `"not_set"` before frontend parity testing.**
- Analytics routes URL prefix: all analytics routes mount at `/api/analytics/*` (Hono) vs Flask's `/api/*` root paths. Module 9 verifies frontend URL parity.
- R12 recurring-patterns feature flag: `ENABLE_RECURRING_PATTERNS=false` returns HTTP 200 with `{ ok: true, data: { patterns: [] }, meta: { count: 0, enabled: false } }`. This is a client-observable behaviour: frontend must handle `enabled: false` in meta without rendering a missing-data error. Do not change the response shape or the HTTP status code.
- R13 snapshot: all KWD amount fields (`income_total_kd`, `expense_total_kd`, `net_kd`, `total_debt_kd`, `total_savings_kd`, and per-window `income_kd`/`expense_kd`/`net_kd`) return as 3-decimal strings (e.g., `"500.000"`). Flask R13 returns floats via `_rounded_number`/`to_display_float`; Hono normalizes to strings via `formatKd` to match the project-wide KWD-as-string convention used by R3/R4/R9/R10/R11/R12. Module 9 frontend types must treat these fields as `string`, not `number`.
- `sv` JWT claim (added in 7a): session version number embedded in the `statera_session` JWT. Module 9 must NOT decode the JWT client-side and rely on `sv`; session management is server-side. If the frontend ever decodes the JWT for UX purposes, add `sv: number` to the JWT type definition in `apps/web/src/types/`. Error code `session_invalidated` (HTTP 401) means the token's sv was explicitly revoked — frontend must clear local state and redirect to login.
- `statera_pending_2fa` cookie (added in 7b): short-lived (5-min) JWT issued by the OIDC callback when `totpEnabled=true`. Carries only `{ userId, pendingAt }`. The real session cookie is NOT issued until POST `/api/auth/2fa/verify` succeeds. Frontend must handle the `/auth/2fa-verify` redirect from the callback. Error codes: `PENDING_2FA_GONE` (HTTP 410) = cookie absent or expired; `PENDING_2FA_RESTART` (HTTP 401) = 3 failures hit, must restart login. `BACKUP_CODES_LOW` warning in `data.warning` when ≤2 backup codes remain after successful backup-code login.
- `GET /api/auth/profile/security-events` (added in 7c): returns only `event_type LIKE 'profile.%'` events — a profile-change audit trail, not a full security log. Login, auth, and session events are written to the table but intentionally excluded. Returns empty until profile-update routes (Module 9) emit `profile.*` events. Pagination: `limit` (default 20, max 50), `offset` (default 0). `has_more` flag in both `data` and `meta`. Do not change the filter to include `login.*` or `sessions.*` without coordinating with the frontend.
- `POST /api/auth/sessions/revoke-all` (added in 7c): bumps `session_version` in DB and writes `sv_revoked:{userId}:{oldSv}` deny-list key (30-day TTL). Re-issues caller's session cookie with `newSv`. Returns `{ session_version: newSv }`. Rate: 10/60s.
- `GET /api/auth/delete-reauth` (added in 7.5): requires auth. Initiates OIDC re-auth with `prompt=login, max_age=0`. State cookie carries `{ deleteIntent: true, userId }`. After callback + optional 2FA, issues `statera_delete_intent` cookie (Path=/api/account, Max-Age=900). Rate: 10/60s.
- `DELETE /api/account` (added in 7.5): requires auth + valid `statera_delete_intent` cookie (must match session userId). Returns `{ deleted: true, task_id: <encrypted-token> }`. The session cookie is cleared on success. Error codes: `DELETE_INTENT_GONE` (410) = cookie absent/expired/mismatched; `ACCOUNT_INACTIVE` (403) = already deleted; `deletion_failed` (500) = sync purge failed. Rate: 10/60s.
- `GET /api/account/deletion-status/:taskToken` (added in 7.5): no auth required; encrypted token proves authorization. Returns `{ status: "complete" | "pending" | "failed", task_id }`. For sync fallback tokens, always returns `complete`. Rate: 10/60s (path-keyed).
- **Module 9 follow-up (GDPR):** Before final release, add a "Download my data" endpoint that returns a JSON summary of all user-owned data (transactions, budgets, debt accounts, savings goals, profile) BEFORE deletion. This is a right-to-know obligation. The endpoint should be at `GET /api/account/data-export` and should be added before account deletion is exposed in the UI.
