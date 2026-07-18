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

> **SUPERSEDED for B2-1 scope by §5 (B2-1 STOP-1 R14 correction, 2026-07-18, Option C).** This originally-approved bullet is retained for the record; the corrected B2-1 scope is in §5.

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

---

## 5. B2-1 STOP-1 (R14) correction — 2026-07-18 (Option C)

Implementation-time verification falsified the approved B2-1 "month family." A named R14 stop was raised, accepted as valid, and ruled Option C. This section supersedes §1.2's B2-1 bullet and corrects the §1b rows below.

### 5(a) Ruling block — 2026-07-18 B2-1 STOP-1 (R14), Option C (verbatim)

> STOP DISPOSITION: R14 stop accepted as valid and correctly raised. The approved B2-1 scope contained an enumeration error (phantom weekly-digest month param) and an under-report (residual hand-rolled date checks inside routes tabled as "B0 DONE").
>
> B2-1 CORRECTED SCOPE (Option C):
> - IN: account-overview month, safe-to-spend month, dashboard-bundle month (required-or-default, no-period string, D2 split: absent → hand-rolled default, present-malformed → zod reject); r5 expense-breakdown month, r7 budget-metrics month (same pattern, same string — added to the existing B0 schemas' routes as the same D2-split mechanism); intelligence recurring-patterns days (unchanged from approval).
> - OUT: weekly-digest — REMOVED from B2-1 as a phantom (no month query param; unconditional currentMonthKey()). Nothing to convert.
> - OUT: r6 expense-merchant-trend until, dashboard-metrics until — optional-present is a distinct validation pattern not modeled in the approved Phase A; converting it here would introduce an unapproved deviation mid-module. NAMED FOLLOW-ON: "aggregation until residuals" is a standing item to be dispositioned at B2 close alongside B3 (convert-as-B2-4 / affirm-hand-rolled / other). It may not be described as parked-by-default or silently dropped.
>
> CONDITION C1 — pattern confirmation before implementing: confirm by pasted verbatim source excerpt that the r5 and r7 month checks follow the same required-or-default shape as the three named month routes (absent → default, present-malformed → 400 no-period string). If either differs in ANY respect (defaulting, string, ordering), that is a new R14 stop, not a silent adaptation.
>
> CONDITION C2 — bundle amendment (precedes implementation): amend the persisted docs/modules/ bundle in one commit recording: (a) this ruling block verbatim; (b) corrected §1b rows for weekly-digest, r5, r6, r7, dashboard-metrics (B0 DONE rows annotated with their residual hand-rolled checks; weekly-digest re-classed NONE for query input); (c) the pasted verbatim MONTH_RE/until enumeration grep with exit code as evidence — the summary that reached the channel is not the record; (d) revised B2-1 test projection from the corrected scope (the approved ~5 is void; state the new per-route case list including the B2-R6 absent→default→200 cases, now also covering r5 and r7, and recurring-patterns absent-days→90).
>
> CONDITION C3 — delta discipline unchanged: close-out reports exact counts from the 634 / 16 / 49 baseline with verbatim test tail + tsc output + exit codes per the three-section template. Projection changes; the evidence standard does not.
>
> SEQUENCE: C1 evidence → C2 amendment commit → implement corrected B2-1 → close-out. B2-2/B2-3 scopes are unaffected by this ruling.

### 5(b) Corrected §1b rows

| Router | Method + Path | Corrected classification |
|---|---|---|
| aggregation | GET `/expense-breakdown` (r5) | **B0 PARTIAL** — `dimension`/`range`/`limit`/`source` on `r5Schema` (B0 done); **`month` residual hand-rolled** (183–187, required-or-default, no-period string). → **B2-1 IN** (month only). |
| aggregation | GET `/expense-merchant-trend` (r6) | **B0 PARTIAL** — `merchant`/`months` on `r6Schema` (B0 done); **`until` residual hand-rolled** (295–296, optional-present). → **B2-1 OUT** (named follow-on "aggregation until residuals"). |
| aggregation | GET `/budget-metrics` (r7) | **B0 PARTIAL** — `range` on `r7Schema` (B0 done); **`month` residual hand-rolled** (356–360, required-or-default, no-period string). → **B2-1 IN** (month only). |
| aggregation | GET `/dashboard-metrics` | HAND — **`until` residual hand-rolled** (496–497, optional-present); `months` is tolerant `parseIntParam`. → **B2-1 OUT** (named follow-on "aggregation until residuals"). |
| aggregation | GET `/weekly-digest` | **NONE for query input** — no `month`/`until` query param; `month = currentMonthKey()` unconditional (977). Phantom. → **B2-1 OUT** (nothing to convert). |

### 5(c) Evidence — enumeration grep (verbatim, with exit codes, captured 2026-07-18)

```
$ grep -nE "MONTH_RE\.test|c\.req\.query\(\"(month|until)\"\)|aggregationRouter\.get" aggregation.ts | grep -vE "^\s*//|const MONTH_RE"
96:aggregationRouter.get("/spend-by-category", requireAuth, async (c) => {
122:aggregationRouter.get("/spend-by-month", requireAuth, async (c) => {
171:aggregationRouter.get("/expense-breakdown", requireAuth, async (c) => {
183:  let month = (c.req.query("month") ?? "").trim()
186:  } else if (!MONTH_RE.test(month)) {
288:aggregationRouter.get("/expense-merchant-trend", requireAuth, async (c) => {
295:  const until = (c.req.query("until") ?? "").trim()
296:  if (until && !MONTH_RE.test(until)) {
349:aggregationRouter.get("/budget-metrics", requireAuth, async (c) => {
356:  let month = (c.req.query("month") ?? "").trim()
359:  } else if (!MONTH_RE.test(month)) {
485:aggregationRouter.get("/dashboard-metrics", requireAuth, searchRateLimit, async (c) => {
496:  const until = (c.req.query("until") ?? "").trim()
497:  if (until && !MONTH_RE.test(until)) {
864:aggregationRouter.get("/account-overview", requireAuth, searchRateLimit, async (c) => {
867:  let month = (c.req.query("month") ?? "").trim()
870:  } else if (!MONTH_RE.test(month)) {
885:aggregationRouter.get("/safe-to-spend", requireAuth, searchRateLimit, async (c) => {
888:  let month = (c.req.query("month") ?? "").trim()
891:  } else if (!MONTH_RE.test(month)) {
965:aggregationRouter.get("/weekly-digest", requireAuth, searchRateLimit, async (c) => {
1075:aggregationRouter.get("/dashboard-bundle", requireAuth, searchRateLimit, async (c) => {
1080:  let month = (c.req.query("month") ?? "").trim()
1083:  } else if (!MONTH_RE.test(month)) {
---grep-exit:0---

$ sed -n '965,1010p' aggregation.ts | grep -nE 'c\.req\.query'
---weekly-digest-query-exit:1 (1 = none)---
```

**C1 confirmation (verbatim r5/r7 month blocks) — both byte-identical to the three named routes:**

```
r5 expense-breakdown (183–187):        r7 budget-metrics (356–360):
  let month = (c.req.query("month") ?? "").trim()      let month = (c.req.query("month") ?? "").trim()
  if (!month) {                                        if (!month) {
    month = currentMonthKey()                            month = currentMonthKey()
  } else if (!MONTH_RE.test(month)) {                  } else if (!MONTH_RE.test(month)) {
    return c.json({ ok:false, ... "month must be in YYYY-MM format", code:"validation_error" }, 400)
  }                                                    }
```

Identical defaulting (`currentMonthKey()`), identical no-period string, identical ordering. In r5/r7 the month check runs AFTER the existing `r5Schema`/`r7Schema` parse — the zod month conversion keeps month as a SEPARATE post-schema `safeParse`, preserving that first-fail order (D3). No difference in any respect → C1 PASS, no new R14 stop.

### 5(d) Revised B2-1 mechanism + test projection (the approved ~5 is void)

**Mechanism.** A single shared `z.string().regex(MONTH_RE, "month must be in YYYY-MM format")` schema replaces the 5 in-scope `else if (!MONTH_RE.test(month))` blocks (account-overview, safe-to-spend, dashboard-bundle, r5, r7) via `zodErrorToEnvelope` → byte-identical `{ ok:false, data:null, error:"month must be in YYYY-MM format", code:"validation_error" }` @ 400. `MONTH_RE` stays (still used by the two out-of-scope `until` sites). The `if (!month) default` branch stays hand-rolled (D2). For `recurring-patterns`: `parseIntParam(c.req.query("days"), 90)` stays hand-rolled (default + non-numeric leniency, D2); only the 30–365 range moves to a zod schema (`.min(30, msg).max(365, msg)`, msg = `"days must be between 30 and 365"`) — preserving current behavior exactly (absent/non-numeric → 90 → 200; out-of-range → 400).

**Per-route test case list (added to existing files; no new files):**
- `aggregation.test.ts` — for account-overview, safe-to-spend, dashboard-bundle, r5 expense-breakdown, r7 budget-metrics: (i) **absent-month → default → 200** (B2-R6, ×5); (ii) present-malformed month → 400 with the exact no-period string (message-identity), at least on a representative subset + one asserting r5/r7 keep their existing schema's first-fail order (bad-schema-field wins over bad-month).
- `intelligence.test.ts` — recurring-patterns: (i) **absent-days → default-90 → 200** (B2-R6); (ii) out-of-range days → 400 `"days must be between 30 and 365"` (message-identity).

**Projection:** ≈ **+8–10 hermetic passes → ~642–644 passed; files unchanged at 49; skipped unchanged at 16.** Exact counts reported in the B2-1 close-out per C3 (verbatim test tail incl. `Test Files N passed (N)`, `tsc --noEmit`, exit codes, baseline diff hunk from 634/16/49).

### 5(e) Named follow-on (recorded, NOT parked-by-default)

**"aggregation until residuals"** — the optional-present `until` checks in r6 expense-merchant-trend (295–296) and dashboard-metrics (496–497) are a distinct validation pattern (optional, no default) not modeled in the approved Phase A. Standing item, dispositioned at B2 close alongside B3: convert-as-B2-4 / affirm-hand-rolled / other. Must not be described as parked-by-default or silently dropped.

---

## 6. B2-1 close-out rulings — 2026-07-18

### 6(a) Ruling block — B2-1-CO (close-out bounce, one cycle) — verbatim

> B2-1-CO-1 (bounce): re-deliver the close-out with the three mandatory sections PASTED VERBATIM INSIDE the close-out document itself: (a) the `pnpm --filter statera-api test` tail including the `Test Files … passed` line and captured exit code; (b) `tsc --noEmit` output + exit code; (c) the baseline diff hunk from commit 0fc0535. "Shown above" / adjacent-context references are non-compliant regardless of whether the content existed in your session — this is the third report referencing evidence not present in the delivered document. STANDING FIX (record in bundle): every report crossing the channel is evaluated as a standalone document; evidence referenced but not embedded is treated as absent.
>
> B2-1-CO-2 (delta reconciliation): include an actual-vs-projection table — the C2-revised per-route case list vs the cases actually added — accounting for all +9 (634→643), each case named, incl. which B2-R6 obligations were met by pre-existing cases (account-overview "default month (no param)", recurring-patterns "count and days meta") vs new ones.
>
> B2-1-CO-3 (C1 evidence pointer): state where the C1 verbatim r5/r7 source excerpts live (bundle section + commit) and embed them in the re-delivered close-out.
>
> B2-1-CO-4 (ratification, conditional): the r5/r7 separate post-schema safeParse is an in-session implementer choice, PENDING RATIFICATION. It is RATIFIED automatically upon B2-1-CO-3's embedded excerpts confirming the existing first-fail order (B0 schema fields before month) is preserved byte-identically. Note for the record: this choice was C1-stage material and should have surfaced pre-implementation; disposition is ratify-on-evidence, not rework.
>
> B2-1-CO-5: no new commits for the re-delivery unless a finding requires one; 0fc0535 stands unless the embedded evidence contradicts the summary. B2-2 remains HELD until this close-out is accepted. The hold-not-auto-continue cadence is affirmed as correct.

### 6(b) STANDING FIX (per B2-1-CO-1)

**Every report crossing the review channel is evaluated as a standalone document; evidence referenced but not embedded is treated as absent.** No "shown above", "captured in session", or adjacent-context pointers substitute for pasting the verbatim evidence (test tail + exit code, tsc + exit code, diff hunk, source excerpts) inside the report itself. Applies to every future close-out and report.

### 6(c) C1 evidence pointer

The C1 verbatim r5/r7 month-block excerpts (pre-implementation, confirming the required-or-default shape) live in **§5(c) of this bundle**, committed in **`5364ed2`** (C2 amendment). The B2-1-CO-3 re-delivered close-out additionally embeds the **post-implementation** r5/r7 handler excerpts (from `0fc0535`) proving `r5Schema`/`r7Schema` parse + early-return runs BEFORE the `MonthFormatSchema.safeParse` — first-fail order preserved → B2-1-CO-4 ratified on evidence.

### 6(d) Delta D-CO-a (recorded, surfaced in re-delivery per the no-new-in-close-out rule)

The C2 §5(d) projection listed "one [case] asserting r5/r7 keep their existing schema's first-fail order (bad-schema-field wins over bad-month)." A dedicated NEW combined-invalid case was **not** added. Ordering preservation is instead established by (i) structural code order — `r5Schema`/`r7Schema` `safeParse` + `if (!parsed.success) return` precedes the month block (embedded post-impl excerpt) — and (ii) the pre-existing B0 r5 multi-invalid case ("dimension=bogus&range=bogus&limit=999999&source=bogus" → dimension message). If an explicit combined bad-dimension+bad-month case is required, it is a small additive test (offered in the close-out).

---

## 7. B2-2 rulings + named follow-ons (2026-07-18)

### 7(a) Ruling — B2-2 pre-implementation plan APPROVED WITH CONDITIONS (verbatim summary)
- **B2-2-P1:** plan APPROVED for all four routes (/summary separate `SummaryMonthSchema`, period string + looser regex preserved; /top-patterns preprocess defaulting on `undefined` only; /by-category superRefine message-controlled ordering; /search checks (1)-(5) superRefine + check (6) hand-rolled post-schema).
- **B2-2-P2 (D-B2-2-a):** APPROVED — /search `date_from>date_to` stays hand-rolled (distinct code `invalid_date_range`, Decision 2, D4-analogous). Required tests: (a) both a schema-layer check AND the range check fail → schema envelope wins (6-is-last); (b) range-only → code `invalid_date_range` byte-identical. **Both delivered** (`B2-2-P2(a)` / `B2-2-P2(b)` cases in `transactions.test.ts`).
- **B2-2-P3:** the /summary regex looseness → recorded as named follow-on **"summary-month-looseness"** (see 7b).
- **B2-2-P4:** absent-vs-empty on /top-patterns pinned by explicit test EACH branch; /by-category non-numeric limit/offset → range message pinned. **All delivered.**

### 7(b) Named follow-ons — disposition at B2 close (none may be silently dropped or silently resolved)
1. **aggregation until residuals** (from §5e) — r6 expense-merchant-trend `until` + dashboard-metrics `until` (optional-present pattern). Disposition: convert-as-B2-4 / affirm-hand-rolled / other.
2. **summary-month-looseness** (B2-2-P3) — `GET /summary` accepts month `"2024-99"` (regex `/^\d{4}-\d{2}$/`, looser than aggregation's `MONTH_RE` which enforces `01–12`). PRESERVED byte-identically in B2-2 (pinned by test `B2-2 (flag-1 summary-month-looseness): accepts loose month '2024-99' → 200`). Disposition at B2 close: fix-as-product-decision (tighten to `MONTH_RE`) / affirm-harmless. May NOT be silently tightened or silently dropped from the ledger.
3. **B3 (auth + account routers)** — the §1.4 list; propose/park/drop at B2 close (B2-R7).
