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

**Remaining modules (in order):**
- 5c Intelligence/detection routes (algorithmic; fixture-based equivalence tests required)
  - 5c-0 Fixture capture infrastructure ✓
  - 5c-1 income-pattern ✓
  - 5c-2 recurring-patterns ✓
  - 5c-3 snapshot
- Module 6: Maintenance jobs (non-bank-sync Celery beat jobs → BullMQ)
- Module 7: TOTP 2FA
- Module 8: Deployment (host selection between Railway/Hetzner/similar, secrets management, TLS, CI/CD, backups, monitoring, staging environment)
- Module 9: Frontend parity verification (apps/web tested against the new Hono API end-to-end before any external sharing)

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
- **Sequential gates are sequential.** When a prompt requires a verification report (e.g., a status check on a previous module) before work on a new module proceeds, deliver the verification report and wait for explicit approval before starting the new work. An approval issued conditionally on a prior report being clean is not standing approval to ship in parallel. If a verification surfaces a problem, the new work pauses until the prior gap is resolved.

## Key architectural decisions (do not revisit)

- **Auth:** provider-agnostic OIDC via openid-client; Google as initial provider. Users table has `(auth_provider, external_id)` composite unique. No password column.
- **DB:** MySQL 8, utf8mb4, utf8mb4_0900_ai_ci collation, DATETIME(3) for timestamps, DATE for transaction dates.
- **Money types:** DECIMAL(10,3) or DECIMAL(12,3) for KWD; DECIMAL(6,3) for APR.
- **Bank sync deferred:** do not port `bank_consents`, consent receipts, `DataAccessLog`, or bank-sync Celery jobs. Schema tables remain from Phase 2.
- **Snapshot strategy:** Option B — rebuild only users with `last_login_at` within `SNAPSHOT_REBUILD_WINDOW_DAYS` (default 14). NULL `last_login_at` users included only if `created_at` is also within the window.
- **BullMQ concurrency:** Option B — p-limit with configurable concurrency, default 5 (`SNAPSHOT_REBUILD_CONCURRENCY`).
- **Per-user budget vs MySQL timeout:** per-user budget = `analyticsComputeTimeoutSeconds + 2` so the two error modes are distinguishable in Sentry.
- **Template emails deferred:** when adding, use a separate `email-templates.ts` module; preserve the Flask path-traversal guard (reject template names containing `..`, `/`, or `\`).
- **Deployment target:** self-controlled environment (Railway, Hetzner, or similar managed/VPS host). To be finalized in Module 8. The repo's Docker Compose configuration is the source of truth for production deploys; the host runs Docker images built from this repo. Manus AI (manus.im) was briefly considered at scaffold stage and removed in commit 13c709a (provider-agnostic OAuth); do not reintroduce platform-specific assumptions for any autonomous-agent hosting platform.

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
- `lib/intelligence-lib.ts` — `buildIncomePatternPayload`, `confidenceFromVariance`, `confidenceFromIntervalVariance`, `classifyRecurringFrequency`, `intervalVarianceRatio`, `classifyRecurringGroup`
- `db/sql-helpers.ts` — `nullsLast` helper
- Rate limit middleware from transactions — reuse for new endpoints
- Worker task tracking from 1c — `markWorkerTaskStarted`, `markWorkerTaskFinished` (call once at batch start/end, not per-user)
- `tools/capture-flask-fixtures.py` — Flask fixture capture tool (subcommands: income-pattern, recurring-patterns, snapshot). Seeds deterministic data into the live PostgreSQL container, calls Flask payload builders, prints JSON, rolls back. Run before implementing each 5c sub-commit to capture expected values for equivalence tests.

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
