# Phase 4 — Scope Narrowing (SC-1/SC-2/SC-3): approved lineage

**Purpose:** durable on-disk record of the operator/review-channel approvals that
authorize the removal of the debt-accounts and savings-goals features. Persisted
2026-07-16 per the review-channel "persist-first" instruction, so the approved
lineage cannot be lost to context compaction. This file rides the SC-1/2 commit
as part of the module record.

**Partition:**
- **SC-1 + SC-2** = one atomic commit — backend removal + frontend removal + the
  three approved legal-copy strings (SC-legal rider). Deploy 1: code stops
  reading/writing the debt/savings tables.
- **SC-3** = deploy 2 — two one-DDL-per-file `DROP TABLE` migrations
  (`savings_goals`, then `debt_accounts`) + `has_debt_choice` column drop. Held
  until deploy 1 is proven live. Prepared but NOT committed in the SC-1/2 session.

The rulings, amendment, conditions, and legal copy below are relayed **verbatim**
from the review-channel record.

---

## RULINGS (a)–(f) — "phase4-scope-narrowing Phase A: APPROVED with rulings" (2026-07-14)

- **(a) Migration:** Option A (DROP TABLE), TWO-DEPLOY SEQUENCE HONORED. Deploy 1
  = SC-1/2 (code stops reading/writing); deploy 2 = SC-3 (two one-DDL-per-file
  migrations: `savings_goals`, then `debt_accounts`). The additive-only-rule
  deviation is APPROVED for this module only; record it in CLAUDE.md's
  standing-rule note. Do not collapse to one deploy.
- **(b) has_debt_choice:** DROP the column in SC-3 (third migration file or folded
  per drizzle convention — implementer's choice, state which). Its export field
  and frontend type are removed in SC-1/2.
- **(c) R13:** option R13-a — remove `total_debt_kd` / `total_savings_kd`. No
  zeroing.
- **(d) R9:** field removal CONFIRMED (no zeroing). Operator acknowledges the
  Safe-to-Spend headline rises. Module 11 queue note: recurring-pattern work
  should evaluate deriving R9 committed obligations from detected recurring
  transactions.
- **(e) Plan page:** collapse to a single Budget view. No vestigial tab bar.
- **(f) SC-1 + SC-2:** ONE ATOMIC COMMIT (backend + frontend removal together).

## AMENDMENT (2026-07-15, "Data disposition: SC-0 gate lifted")

Premise corrected: production debt/savings rows are demo-seeded, not real operator
data. Disposition is DROP, export WAIVED, SC-0 REMOVED from the partition.
Tombstone and retain-orphaned remain REJECTED. Rulings (a)–(f) and conditions
C1–C8 unchanged; C9 added (below).

## CONDITIONS C1–C9 (verbatim)

- **C1.** `restore-repurge-lib.test.ts` cleared by READING its imports/assertions
  for indirect `OWNED_TABLES` consumption (length/snapshot), not by literal grep.
  **[RESOLVED 2026-07-15: imports only `matchTombstonesForRepurge` + `hashEmail`.]**
- **C2.** Grep the FULL `SnapshotResponse` type for remaining number-typed KWD
  fields (CLAUDE.md:506 mandates string). If siblings beyond the two removed
  fields are number-typed, record a fix-forward entry — do NOT fix in this module.
  **[RESOLVED 2026-07-15: all five net_position + nine per-window fields are
  number-typed; fix-forward to be recorded in the SC-1/2 close-out, noting runtime
  values are strings and the types are wrong, not vice versa.]**
- **C3.** Historic `goal_milestone_*` `product_events` rows: accepted as surviving
  until normal retention/account deletion; note this in the close-out.
- **C4.** `ImportDialogs.tsx` demo-copy change is CARVED OUT of SC-2 as a named
  rider, to land only after the design worker's `ImportDialogs` change is
  committed. Do not touch the file in this module. `AppShell.tsx`: re-confirm no
  debt/savings nav entry against the then-current file at impl time; paste grep.
  **[AppShell half RESOLVED 2026-07-15: zero debt/savings/goal hits; re-check
  cheaply at impl since the file is design-worker-dirty.]**
- **C5.** Data-export change per Phase A §2: SECTION REMOVAL, not exclusion.
  `meta.counts` keys removed; `DATA_EXPORT_EXCLUSIONS` untouched.
- **C6.** Queue hygiene per Phase A §6: worker restart noted in the deploy
  addendum; `"send-goal-milestone-email"` removed from the job-name union and
  registry.
- **C7.** Test baselines re-measured and pasted verbatim with exit codes
  (`$? == 0`, no Errors/Unhandled section) per sub-commit; INTEGRATION suite runs
  before the SC-1/2 commit (touches `db.transaction()` surfaces: purge, demo,
  import) and its exit code is recorded.
- **C8.** CLAUDE.md plan per Phase A §10 approved, including: 4b/4c/6c superseded
  annotations (history retained), line-99 B2 clause annotated resolved, contract
  lines 496/498/506/514 edits, deviations-block updates.
- **C9.** Post-removal code must tolerate a LEGACY stored `demo_workspace_manifest`
  carrying the retired snake_case keys `debt_account_ids`/`savings_goal_ids`:
  clear-workspace's manifest-scoped deletes and the import-commit demo-replace
  guard must ignore them without error. Disposition in the SC-1/2 close-out quotes
  the POST-REMOVAL read path and guard.
  **[Key-name addendum RESOLVED 2026-07-16: canonical persisted keys are
  snake_case `debt_account_ids`/`savings_goal_ids` (write `demo-data-lib.ts`
  `manifestToProperties`; read `latestManifest`); camelCase is the in-memory type
  only. C9 itself remains open until the post-removal read path + guard tolerate a
  legacy manifest without error — dispositioned in the close-out.]**

## APPROVED LEGAL COPY (2026-07-15, operator-approved verbatim)

- **`PrivacyPolicyPage.tsx:60`** ("Financial data you enter" list item; line 60
  merges with the surviving line-61 sentence — implementer formats the JSX,
  content as approved):
  > "transactions, categories, merchants, and budgets. Amounts are stored in
  > Kuwaiti dinars exactly as you enter them."
- **`TermsPage.tsx:31-32`** ("What Statera is" paragraph):
  > "…you record your own transactions and budgets, and Statera organizes and
  > summarizes them for you."
- **`TermsPage.tsx:37`** ("not advice" clause):
  > "(including &ldquo;safe to spend&rdquo; figures)"

**NO test-file edits.** _(Relay truncated mid-sentence at "neither
PrivacyPolicyPage.test.tsx nor …"; completed from the 2026-07-16 "begin SC-1/2"
instruction: no test-file edits are required for the legal copy — moot
pre-approval noted in the commit body. Exact trailing wording to be confirmed by
the operator if it matters.)_

---

## Phase A §-references

The conditions cite Phase A §2 (data-export), §6 (queue hygiene), §8 (frontend
removal list), and §10 (CLAUDE.md plan). §10's content is enumerated (via C8); §2
and §6 are fully specified by C5 and C6 respectively.

**§8 — CORRECTION (review-channel R4, 2026-07-16):** the operator confirms Phase A
§8 (the frontend removal list) WAS present in the 2026-07-16 channel relay; this
persisted approvals file was **incomplete relative to the channel record** — the
relay I processed did not carry the §8 block, so it was omitted here and the
SC-1/2 frontend removal was reconstructed from code + rulings (e)/(f) + C4 and the
addendum §8 audit (A1). The earlier "§8's verbatim frontend list was NOT in the
relayed bundle" line is superseded by this correction: §8 was in the channel
record; the omission was a relay/persist gap on my side, not an operator gap.

### §8 VERBATIM (Phase A, from the 2026-07-16 channel relay)

**RESOLVED 2026-07-16 (review-channel R4-ii, option a):** the operator supplied §8
verbatim; the earlier empty-placeholder was a channel-side relay defect, not an
operator omission. Appended below exactly as in the channel record.

```
=== PHASE A §8, VERBATIM (frontend surfaces; governs the C4 carve-out) ===
Delete (files):
- components/pages/budget/GoalsTab.tsx + budget/goals-tab.test.tsx
- components/pages/budget/DebtAccountsSection.tsx
- components/pages/profile/DebtDialog.tsx + profile/DebtDialog.test.tsx
- components/debt/PayoffPlanPanel.tsx
- components/pages/dashboard/debt-summary.test.tsx
- the DebtSummaryCard component rendered at DashboardPage.tsx:856 (locate
  exact file in impl; likely dashboard/ — enumerate in sub-commit checklist)
Edit:
- lib/api.ts — delete debtApi (697-788), goalsApi (795-867), the 5 type
  imports (32-36), and the demo-count reads (1079-1100 keep the demo call but
  drop debt_accounts_created/savings_goals_created/*_cleared per §6 demo
  shape), has_debt_choice handling (1123).
- types/api.ts — delete DebtAccount, DebtAccountSummary, DebtPayoffPlan*,
  SavingsGoal, SavingsGoalProjection (327-390); the R9 fields (138-149); R8
  debt_summary (162); R13 total_debt_kd/total_savings_kd (474-475, per §4);
  demo debt_accounts*/savings_goals* (301-323); has_debt_choice (527); demo
  summary goal_count/goals (16, 28).
- components/pages/BudgetPage.tsx — remove the "goals" tab from the tab
  config (451-457), the <GoalsTab/> render (688), badge text "Goals & Debt"
  (446). [Ruling (e): collapse to a single Budget view.] BudgetPage.test.tsx
  drops the goals-tab assertions.
- components/pages/dashboard/sections.tsx — remove safe-to-spend debt/savings
  breakdown (154-173, 233-259, 360-415), the DebtSummaryCard section
  (469-488), and the SnapshotResponse debt/savings reads.
  safe-to-spend.test.tsx + dashboard-hero.test.tsx change.
- components/pages/dashboard/hooks.ts:101-102 — remove debtSummary.
- components/pages/DashboardPage.tsx — remove debt-summary card wiring
  (79-80, 500-530, 856-857).
- components/layout/CommandPalette.tsx:78, 81 — Plan description "Budgets,
  debt, and savings goals" → "Budgets"; drop debt/goals keywords.
- components/pages/TransactionsPage.tsx:160-228 — remove
  ["debt-accounts-summary"] + ["savings-goals"] invalidations.
- Demo copy: ui/demo-workspace-banner.tsx:31, pages/WorkspaceChoicePage.tsx:87,
  137, transactions/SettingsDialog.tsx:307 — remove debt/goal counts/copy
  (coordinated with the §6 demo-shape change). demo-workspace-banner.test.tsx
  + import-dialogs.test.tsx change. [C4 OVERRIDES: the ImportDialogs.tsx
  demo-copy change is carved out as a named rider — import-dialogs.test.tsx
  edits belonging to that rider move with it.]
- Contract: contract/capture.ts:21-22, 40-41, 127-148 — drop debtApi/goalsApi
  from the exercised set; regenerate contract/frontend-calls.json (11
  debt/savings path entries drop). api.test.ts + error-recovery.test.ts
  debt/savings cases removed.
- Query keys retired: ["debt-accounts", ...], ["debt-accounts-summary"],
  ["savings-goals"], ["auth-profile","debt-onboarding"].
Legal copy: per the approved strings above (operator content-track).
LoginPage.tsx:27 ("aligned with your goals") is generic prose — keep.
Collision flags (design-worker-dirty, do NOT touch): ImportDialogs.tsx
(C4 carve-out); index.css, index.html, DevUiPage.tsx, IncomePage.tsx,
button.tsx, favicon.svg — design-worker, not in blast radius.
--- END §8 ---
```

**Historical note (accuracy of the record):** the C4-carve-out bracket in the §8
text above was superseded in sequence by the 2026-07-16 C4 contingent ruling —
`ImportDialogs.tsx` was verified clean (design-5.4c-2 landed, `53ce85b`), so option
(c) folded the rider into this commit. The §8 text is preserved as approved; the
bracket does not reopen the rider.

**Implementation reconciliation vs §8 (2026-07-16):** all §8 items DONE. Naming
note — §8's "DebtSummaryCard … at DashboardPage.tsx:856 / sections.tsx 469-488" is
the component implemented as `PlanSummaryPanel` (100% debt/savings; deleted, A3/R1).
§8 lines 16/28 ("demo summary goal_count/goals") = `CategoryRemapResult.goal_count`
+ `CategoryDependentCounts.goals` (removed; the backend `routes/categories.ts`
savings-goals coupling behind them was also removed — required for the frontend
contract + SC-3 safety, R2). `LoginPage.tsx:27` "aligned with your goals" kept
untouched per §8. `ImportDialogs.tsx` handled via C4 option (c), not the carve-out.

---

## Addendum — §8 audit dispositions A1–A6 (review-channel, 2026-07-16)

Delivered pre-commit; each item reconciled by the operator (approval block below).

- **A1 (§8 diff):** DONE for the analytics/purge/export/demo/legal surface (first
  pass); MISSED-then-FIXED in the addendum: `TransactionsPage`/`QuickAddContext`/
  `DashboardPage` dead debt/savings query-key invalidations; `WorkspaceChoicePage`
  + `SettingsDialog` demo/reassign copy; `has_debt_choice` (frontend `UserProfile`
  type + api.ts payload); `api.test.ts` + `error-recovery.test.ts` cases. Two
  defects beyond A1's list, surfaced by a residual grep-sweep: **`routes/categories.ts`
  savings-goals coupling** (delete/remap relink + `dependent_counts.goals` /
  `goal_count`; a NEW client-observable contract change — recorded in CLAUDE.md per
  R2) and **`routes/auth.ts` profile GET/POST `has_debt_choice` read+write** (removed
  so the SC-3 column DROP is safe, ruling a).
- **A2 (undefined-render safety):** verified — no missed consumer rendered
  `undefined` (`WorkspaceChoicePage` static text; `SettingsDialog` `>0`-guarded);
  fixed regardless.
- **A3 (PlanSummaryPanel):** deletion STANDS (R1). It was 100% debt/savings content
  (debt-summary KPI group + debt-tracker/savings-goals shortcuts), consumed only by
  `DashboardPage`; nothing non-debt survived, so edit-down was not possible.
- **A4:** the 3 legal copy hunks pasted in the close-out addendum; named-regression
  files (`AppShell.test.tsx`, `legal/PrivacyPolicyPage.test.tsx`,
  `legal/TermsPage.test.tsx`) confirmed untouched (`git status` empty).
- **A5 (C2 fix-forward):** full mistyped set = 12 `SnapshotResponse` fields — 3
  `net_position` (`income_total_kd`/`expense_total_kd`/`net_kd`) + 9
  `SnapshotCashFlowWindow` (`{30d,60d,90d}` × `{income_kd,expense_kd,net_kd}`),
  typed `number`, backend returns 3-decimal strings. Recorded, NOT fixed (C2).
- **A6 (INTEGRATION pre-existence):** PROVEN — clean HEAD (SC-1/2 stashed, Redis
  `FLUSHALL`) reproduced the identical 4 rate-limit/zod failures. Disposition
  approved as `TODO(integration-rate-limit-test-isolation)` (recorded in CLAUDE.md,
  R3); own cycle under 10d.
- **C4/§6:** `ImportDialogs.tsx` was CLEAN (design change landed, `53ce85b`) →
  option (c): demo-copy fixed, optional shim fields removed, `import-dialogs.test.tsx`
  updated; no deferred rider remains.

## Approval block — review-channel, 2026-07-16 (verbatim intent)

"SC-1/2 addendum ACCEPTED — APPROVED TO COMMIT." Rulings: R1 A3 deletion stands;
R2 categories + auth.ts finds approved, categories contract change recorded in C8
CLAUDE.md pass; R3 `TODO(integration-rate-limit-test-isolation)` recorded; R4 this
record-completeness append (§8 verbatim pending operator paste — see marker above).
One atomic `phase-4: SC-1/2` commit; commit body carries the C2 12-field
fix-forward, `TODO(integration-rate-limit-test-isolation)`, the moot legal-test
pre-approval note, the R2 contract-change flag, and the A3 disposition reference.
SC-3 stays HELD (`docs/modules/phase4-sc3-migrations.md`). After commit: DEPLOY 1
per standing rules with the deploy-report addendum (FF topology; `gh run watch`;
`/healthz`+`/readyz` SHA-matched; `origin/main..HEAD` ride-along enumeration with
per-commit CSP dispositions; worker restart C6). SC-3 review begins only after
deploy 1 is proven live.

---

## Deploy record + module closure (2026-07-17)

### Deploy 1 — SC-1/2 code removal (`0f27745`)
GitHub Actions Deploy run **`29546090623` — green** (resolve-sha → test → build-push
→ deploy). Ride-along `origin/main..HEAD` = 3 commits (`0f27745` SC-1/2 + riders
`58d7f79` design-5.5 + `f779df5` design-5.4 deploy record); both riders **CSP-safe**
(design-5.5 all-deletions, no new external URL; f779df5 CLAUDE.md-only). Probes
`/healthz`+`/readyz` SHA-matched to `0f27745`. **Operator smoke PASSED** (dashboard /
Plan single-view / category dependent-counts / demo copy / legal pages); **C6 worker
recreate OBSERVED** (operator `docker ps`, worker at `0f27745`).

### Deploy 2 — SC-3 schema DROPs (`88a157f`, DESTRUCTIVE)
GitHub Actions Deploy run **`29592560536` — green** (`gh run watch --exit-status`
exit 0). Ride-along `origin/main..HEAD` = **1 commit** (`88a157f`, SC-3 only; **no
riders**); **CSP-neutral** (schema/migrations/docs only). Migrate step (verbatim):
`§4 — running migrations` → `statera-migrate-run` container → `Reading config file
'/app/apps/api/drizzle.config.ts'` → `[✓] migrations applied successfully!` — applied
the three pending migrations `0004`→`0005`→`0006` (DB was at `0003` pre-deploy).
Worker recreate (C6): `statera-worker-1 Recreate → Recreated → Started`;
`*** complete — 88a157f… is live`. Probes `/healthz`+`/readyz` SHA-matched to
`88a157f`. S5 (amended, non-gating): no pre-drop backup confirmed; proceeded on the
nightly R2 backup as recovery point. Observation (non-failure): a stale pre-8e
`statera-nginx-1` orphan container was logged; harmless, cleanup opportunity only.

### Operator on-box post-drop verification — PASSED 2026-07-17 (relayed verbatim)
```
SHOW TABLES LIKE 'savings_goals';  → Empty set
SHOW TABLES LIKE 'debt_accounts';  → Empty set
DESCRIBE user_profiles;            → 10 columns, no has_debt_choice
docker compose ps                  → api/web/worker recreated at 88a157f; mysql/redis untouched
```

**MODULE CLOSED 2026-07-17.** Both deploys proven live end-to-end. Two fix-forwards
carried out, each its own future cycle: `TODO(integration-rate-limit-test-isolation)`
(10d) and the C2 `SnapshotResponse` 12-field typed-drift (`TODO(module-9-contract-
validation)`). Two standing rules earned and recorded in CLAUDE.md: persist-first for
multi-session modules; relay/approval blocks must be self-contained.
