# Phase 4 — Zod Adoption B2 — Approved Phase A + Rulings

**Module:** `TODO(phase4-zod-adoption)` B2, Module 10d.
**Persisted:** 2026-07-18, as B2's FIRST commit action (persist-first discipline), before any implementation.
**Base:** `origin/main` = `88a157f` + the docs-only phase-4 close commit ahead of it.
**Baseline (post-scope-narrowing):** hermetic `pnpm --filter statera-api test` = **634 passed / 16 skipped / 49 files**, exit 0; `tsc --noEmit` = 0 errors.

This file is the surviving source of truth for the B2 partition, its rulings, and the money-route disposition. It supersedes any relayed-in-conversation memory of B2 scope. The originally-parked B2 partition (scoped over debt-accounts/savings-goals) is VOID — those routers were deleted end-to-end in phase4 scope-narrowing (removal `0f27745` + DROPs `88a157f`, operator-verified).

---

## 1. Approved Phase A proposal (as ruled)

### 1.1 Surviving surface — evidence (B2-R5, cured + ACCEPTED 2026-07-18)

**Debt/savings residual (routes tree):** `grep -rniE "debt|savings" apps/api/src/routes/` returned 16 hits; the non-comment filter `... | grep -vE ':[0-9]+:\s*(//|\*|/\*)'` returned **exit 1, zero output** — every hit is a comment line. Individual accounting: `aggregation.ts:23,24,670,671,1052` (5, R8/R9 removal-doc comments); `aggregation.test.ts:113,745,746,747,748,825,853,924,947,1318` (10, fixture removal-doc comments); `auth.ts:899` (1, `has_debt_choice` write-path-removed comment). **No import, router object, `.route()`, lib reference, or call site.**

**All 13 app.ts mounts accounted for:**

| # | Line | Mount | Disposition |
|---|---|---|---|
| 1 | 37 | `/` healthRouter | Residual, **no input** — 3 liveness GETs, each `(c)=>c.json(...)`, zero `c.req.*` reads |
| 2 | 40 | `/api/auth` authRouter | **B3** (auth) |
| 3 | 43 | `/api/categories` | B0 done (create/remap) + param/list OUT |
| 4 | 44 | `/api/merchants` | B0 done (create/patch/remap) + param/list OUT |
| 5 | 45 | `/api/transactions` transactionsRouter | B2-2/B2-3 IN + money OUT (B2-R8) |
| 6 | 46 | `/api/transactions` uploadRouter | OUT (multipart / tolerant) |
| 7 | 47 | `/api/memorized-transactions` | B2-3 IN (bulk-delete) + rest OUT |
| 8 | 48 | `/api/budgets` | B1 done |
| 9 | 49 | `/api/transaction-suggestions` | OUT (tolerant) |
| 10 | 50 | `/api/analytics` aggregationRouter | B0 done (r5/r6/r7) + B2-1 IN + tolerant OUT |
| 11 | 51 | `/api/analytics` intelligenceRouter | B2-1 IN (recurring-patterns) + no-input OUT |
| 12 | 52 | `/api/notifications` | B1 done |
| 13 | 53 | `/api/account` accountRouter | **B3** (account, auth-adjacent) |

### 1.2 Approved B2 partition — three sub-commits, order B2-1 → B2-2 → B2-3

**Inclusion test:** accepts input; currently hand-rolls a rejecting shape check with a stable 400 message; converted layer is not money-bearing; not auth/account; not tolerant-by-design/non-rejecting; JSON or query (not multipart). Adjacent money/business/normalization + post-DB checks stay hand-rolled (Decision 2); order-sensitive pre-DB rejecting checks modeled with `superRefine` + early return (B1 D1 pattern) and ordering tested.

**B2-1 — analytics "month" family + intelligence `days`** (mirrors B0 r5/r6/r7; lowest risk)
- aggregation GET `/safe-to-spend`, `/account-overview`, `/weekly-digest`, `/dashboard-bundle` — shared `month`: empty/absent → default (stays hand-rolled), present-malformed → zod reject `"month must be in YYYY-MM format"` (**no period**).
- intelligence GET `/recurring-patterns` — `days` 30–365, default 90, reject `"days must be between 30 and 365"`.

**B2-2 — transactions read-query shape** (shape-only, no money)
- GET `/summary` — `month` reject `"month must be in YYYY-MM format."` (**WITH period — distinct string from B2-1; both preserved verbatim**).
- GET `/top-patterns` — `range` enum `30|90|365|all`.
- GET `/search` — ordered multi-field → `superRefine` + early return; ordering tested.
- GET `/by-category` — `category` required → limit → offset; `superRefine`.

**B2-3 — bulk-op body shape** (transactions + memorized)
- transactions POST `/bulk-delete` — `ids` non-empty → ≤200.
- transactions POST `/bulk-update` — `ids` → ≤200 → `changes` non-empty object → unknown-fields; **field resolution stays hand-rolled** (D4).
- memorized POST `/bulk-delete` — `ids` non-empty → ≤200 (distinct `"…entries…"` message preserved).

### 1.3 OUT of B2 (approved as scoped, B2-R2)

- **Money-bearing (hand-rolled by design, Decision 2 — see B2-R8; NO parked partition):** transactions POST `/` (create), PATCH `/:id` (update), POST `/:id/split`, GET `/dup-check`.
- **Tolerant-by-design / non-rejecting (converting = behavior change):** memorized GET `/`, suggestions GET `/`, aggregation GET `/dashboard-metrics`, upload POST `/import-commit` (Flask `.passthrough` — MUST NOT reject).
- **By-necessity / not JSON:** upload POST `/upload-preview` (multipart file).
- **No body / param-only:** aggregation `/spend-by-category`, `/spend-by-month`; intelligence `/income-pattern`, `/snapshot`; categories/merchants GET `/` + DELETE `/:id`; budgets GET `/months`; transactions DELETE `/:id` + `/import-batch/:batch_id`; memorized POST `/:id/pin`.

### 1.4 B3 disposition list (assigned OUT of B2; ruled at B2 close per B2-R7)

- **Auth router (15):** `/login`, `/callback`, `/logout`, `/me`, `/delete-reauth`, `/2fa/setup`, `/2fa/confirm`, `/2fa/disable`, `/2fa/verify`, `/sessions/revoke-all`, `/profile`, `/profile/security-events`, `/profile/update`, `/demo-data`, `/demo-data/clear`.
- **Account router (3, auth-adjacent):** DELETE `/`, GET `/deletion-status/:taskToken`, GET `/data-export`.

### 1.5 Expected deltas (projected from 634 / 16 / 49)

Tests added to existing files, no new files (B1 convention): B2-1 ≈ +5 (`aggregation.test.ts`, `intelligence.test.ts`); B2-2 ≈ +7 (`transactions.test.ts`); B2-3 ≈ +5 (`transactions.test.ts`, `memorized.test.ts`). Projected ≈ **+17 → ~651 passed; files unchanged at 49; skipped unchanged at 16.** Exact numbers reported per sub-commit close-out with the mandatory three sections (verbatim test tail incl. `Test Files N passed (N)` line + exit code; verbatim `tsc --noEmit` + exit code; baseline diff hunk).

### 1.6 Approved deviations (D1–D5, D7 per B2-R3; D6 per B2-R4)

- **D1** — two distinct `month` reject strings preserved verbatim: aggregation family `"month must be in YYYY-MM format"` (no period) vs transactions `/summary` `"month must be in YYYY-MM format."` (period). Separate schemas / message-parameterized factory; identity tested.
- **D2** — optional-`month` default stays hand-rolled; zod validates only present-but-malformed (`if (!month) month = default; else MonthShape.safeParse(month)`).
- **D3** — order-sensitive routes modeled with `superRefine` + early return; ordering tested. **B2-R3 affirms:** any first-fail order a naive schema would reorder is a **named R14 stop-and-ask**, not a silent superRefine workaround.
- **D4** — `/bulk-update` partial conversion: shape layer only; `getOrCreateCategory/Merchant` resolution stays hand-rolled.
- **D5** — distinct bulk-limit messages preserved (`"…200 transactions at once."` vs `"…200 entries at once."`).
- **D6 (B2-R4, APPROVED)** — CLAUDE.md one-line correction of the stale "a future B2 picks them up only if the removal is reversed" line, replacement text as proposed; rides this persist-first docs commit.
- **D7** — no Flask-behavior deviation; byte-identical wire strings + HTTP codes; money/Decimal untouched (no `Number(`/`parseFloat`).

### 1.7 B2-R6 obligation (carried into B2-1 implementation)

Each B2-1 month route shows an **absent-month → default → 200** case, and recurring-patterns shows **absent-days → default-90 → 200**, evidenced by pasted test names in the B2-1 close-out — proving the D2 split (default stays hand-rolled; zod sees only present-malformed) is a non-regression.

---

## 2. Ruling block — 2026-07-18 conditional approval (B2-R1..R8)

- **B2-R1 (partition + grouping): APPROVED.** Three sub-commits B2-1 → B2-2 → B2-3 in that order.
- **B2-R2 (OUT list): APPROVED as scoped.** Tolerant-by-design routes stay unconverted (import-commit `.passthrough` is a recorded contract that MUST NOT reject); multipart + param-only stay out.
- **B2-R3 (D1–D5, D7): APPROVED as proposed.** D3 stop-and-ask affirmed (named R14 stop, not silent superRefine workaround).
- **B2-R4 (D6): APPROVED.** One-line CLAUDE.md correction rides the persist-first docs commit.
- **B2-R5 (evidence condition): CURED + ACCEPTED 2026-07-18.** Non-comment-filter proof (exit 1, zero output) + individual accounting of all 16 hits + 13-mount table with health proven no-input. Accepted on the auditable filter construction; the close-out verbatim-paste standard is unchanged.
- **B2-R6 (test additions): required** (see §1.7).
- **B2-R7 (B3 timing): NOT ruled now.** B3 disposition ruled at B2 close, per the standing queue. No auth/account conversion work begins.
- **B2-R8 (money-route disposition): see §3 (operator ruling).**

---

## 3. Ruling block — 2026-07-18 B2-R8 money-bearing routes disposition (operator ruling)

**Scope:** the four money-bearing transaction routes excluded from B2 — POST `/` (create), PATCH `/:id` (update), POST `/:id/split`, GET `/dup-check`.

**Ruling (operator, 2026-07-18, review-channel):** OPTION (b) — **CLOSED, no parked partition.** There is no "B2-money" and none is created. These four routes stay hand-rolled under Decision 2 (money/Decimal parsing, business-rule checks, and diagnostic-order-sensitive checks hand-rolled BY DESIGN; string → Decimal → formatKd, never `Number()`/`parseFloat`). Their shape checks are entangled with money handling tightly enough that a byte-identical shape-only extraction buys nothing — affirmed as a **permanent-by-design state, not a deferral.**

**Rationale (recorded):** (i) the prior parked B2 partition rotted into scoping routers later deleted — parked partitions drift; (ii) Module 11 (frictionless logging) will rework the transaction input path (statement parsing, auto-suggest), so any validation shape recorded today for these routes describes a path about to be rebuilt.

**Consequent queue note (rides this commit, alongside D6):** the Module 11 CLAUDE.md entry gains one line — *"Module 11 re-evaluates transaction-input validation (create/update/split/dup-check) as part of its own charter; these routes were affirmed hand-rolled-by-design under Decision 2 at B2 Phase A (B2-R8, 2026-07-18) — any zod adoption there is Module 11 scope, proposed fresh, not inherited from 10d."*

**Terminology guard:** after this ruling, no report may describe these four routes as "pending zod migration," "deferred," or "parked." Correct description: **hand-rolled by design (Decision 2, B2-R8 2026-07-18).**

---

## 4. Unblock sequence (all conditions met 2026-07-18)

1. Persist this bundle as B2's FIRST commit, with the D6 CLAUDE.md correction + the B2-R8 Module 11 queue-note line riding the same commit. ← *this commit*
2. Implement B2-1 (analytics month family + intelligence days), carrying the B2-R6 obligation.
3. B2-2, then B2-3, each with its own close-out per the three-section template.
