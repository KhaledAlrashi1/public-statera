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

**Remaining modules (in order):**
- 5b Aggregation routes (depends on 5a)
- 5c Intelligence/detection routes (algorithmic; fixture-based equivalence tests required)
- Module 6: Maintenance jobs (non-bank-sync Celery beat jobs → BullMQ)
- Module 7: TOTP 2FA

**Deferred indefinitely:**
- Bank sync (CBK Open Banking dependency; replaced future scope: bank statement PDF parsing for Kuwaiti banks)
- Exports (3c)
- Budget alerts
- sendTemplatedEmail (until first caller module)
- transaction-template-suggestions (feature-flagged off in Flask; do not port)

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
- **Fire-and-forget writes** (audit, tracking, cache bust): try/catch + Sentry, never block the main response.
- **Deviations from Flask:** flag in the proposal *before* implementing, not in the summary after. Add a "Deliberate deviations from Flask" comment block at the top of files where deviations exist.
- **TODO format:** `// TODO(module-X-name):` for grep-able deferred work.
- **Update this file:** at the end of every module commit, update the "Migration status" section above to reflect the new state. This is part of the commit, not a follow-up.

## Key architectural decisions (do not revisit)

- **Auth:** provider-agnostic OIDC via openid-client; Google as initial provider. Users table has `(auth_provider, external_id)` composite unique. No password column.
- **DB:** MySQL 8, utf8mb4, utf8mb4_0900_ai_ci collation, DATETIME(3) for timestamps, DATE for transaction dates.
- **Money types:** DECIMAL(10,3) or DECIMAL(12,3) for KWD; DECIMAL(6,3) for APR.
- **Bank sync deferred:** do not port `bank_consents`, consent receipts, `DataAccessLog`, or bank-sync Celery jobs. Schema tables remain from Phase 2.
- **Snapshot strategy:** Option B — rebuild only users with `last_login_at` within `SNAPSHOT_REBUILD_WINDOW_DAYS` (default 14). NULL `last_login_at` users included only if `created_at` is also within the window.
- **BullMQ concurrency:** Option B — p-limit with configurable concurrency, default 5 (`SNAPSHOT_REBUILD_CONCURRENCY`).
- **Per-user budget vs MySQL timeout:** per-user budget = `analyticsComputeTimeoutSeconds + 2` so the two error modes are distinguishable in Sentry.
- **Template emails deferred:** when adding, use a separate `email-templates.ts` module; preserve the Flask path-traversal guard (reject template names containing `..`, `/`, or `\`).

## Helpers and patterns to reuse (do not reimplement)

- `lib/name-key.ts` — `buildNameKey`, `forceUniqueNameKey` (use for any text normalization)
- `lib/kd.ts` — `formatKd` (KWD formatting; 3 decimal places)
- `lib/crypto.ts` — AES-256-GCM field encryption with `enc1:` prefix (preserve prefix exactly for future rotation)
- `lib/email.ts` — `sendEmail`, `sendEmailBackground`
- `lib/sentry.ts` — `initSentry`, `sentryBeforeSend`
- `lib/transaction-lib.ts` — `learnTransaction` (canonical; memorized module consumes it, does not duplicate)
- `lib/dashboard-snapshot-lib.ts` — snapshot helpers
- `lib/analytics-cache.ts` — cache layer, `withAnalyticsTimeout`, `getDashboardMetricsWithCache`
- `db/sql-helpers.ts` — `nullsLast` helper
- Rate limit middleware from transactions — reuse for new endpoints
- Worker task tracking from 1c — `markWorkerTaskStarted`, `markWorkerTaskFinished` (call once at batch start/end, not per-user)

## Test conventions

- **Route tests:** Proxy mock pattern (mock Drizzle db), unit-level.
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
