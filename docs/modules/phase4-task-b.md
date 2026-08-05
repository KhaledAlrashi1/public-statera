# Phase 4 — TASK B (batched follow-ons)

**Status:** Phase A APPROVED WITH CONDITIONS (review channel, 2026-08-05). B1/B2/B3 proceed to
implementation in that order; **B4 is approved in scope but GATED on a separate addendum (TB-R6)**.
This document is the durable lineage (persist-first standing rule): the ruling block in full, then the
Phase A proposal. **Implement from this file, not from conversation context.**

**Date correction (B2-F2, review-channel ruling 2026-08-05):** Task B artifacts were initially stamped
2026-08-01, inherited in error from the prior cycle's date via the review-channel blocks; corrected to
2026-08-05 by review-channel ruling B2-F2. Recorded as a correction, not silently revised. (The
money-string sweep genuinely closed 2026-08-01 and keeps that date.) **Deliberate LEAVES (reported):**
the PART 1 verbatim ruling reproductions keep their as-issued 2026-08-01 stamps — they are faithful
copies of blocks that were themselves misdated, and changing them would falsify the reproduction; this
note documents the true 2026-08-05 date. The two money-string DASHBOARD-CRASH references inside the
verbatim TB-R2/TB-R5 text ("the 2026-08-01 crash", "the real 2026-08-01 capture") are genuinely
prior-cycle events and stay 2026-08-01.

Scope: four items, one module, four sub-commits.
- **B1** — F-1(b): globalSetup `rl:*` scope-flush (test-only).
- **B2** — FIND-S1: `sentryBeforeSend` does not scrub `message` / `exception`.
- **B3** — FIND-S3: inert self-origin filter (a: DELETE) + componentStack truncation (b: dual budget).
- **B4** — S3: durable wire-shape assertion for money/decimal fields (GATED on addendum).

Baselines at charter time (must be held): frontend **182/38**; API hermetic **750/19/53**;
INTEGRATION clean-start **766/3**; all `tsc --noEmit` = 0. HEAD at charter = `7f271d9`.

---
---

# PART 1 — RULING BLOCK (issued 2026-08-05; the blocks were stamped 2026-08-01 in error — see the Date correction above), reproduced verbatim as issued

TASK B — PHASE A RULING (review channel, 2026-08-01)

VERDICT: Phase A APPROVED with conditions. B1, B2, B3 proceed to
implementation in that order. B4 is APPROVED IN SCOPE but GATED — see
TB-R6; do not begin B4 implementation until the addendum is approved.

Two requirements in the original charter were WRONG and are WITHDRAWN on
the record (TB-R4, TB-R6). Your R14 stops were correct in both cases.

=====================================================================
WITHDRAWALS — charter errors, recorded not deleted
=====================================================================

W1 — B3(a) RED-first-suppression requirement is WITHDRAWN. The charter
required a test that "asserts the reporter error is still suppressed"
and "must fail against current code." That presupposed a suppression-
preserving fix. Your analysis is correct: a synchronous, production-
stacked reporter self-error arriving at a global handler is not
distinguishable from a genuine user error, a module-scoped entry/exit
flag IS the existing reentrant flag, and a flag persisting across the
async send would drop genuine mid-flight errors and regress condition
(iii). The requirement was unsatisfiable by any honest mechanism.
Withdrawn.

W2 — B4 "demonstrated RED" at Phase A is WITHDRAWN. A mechanism that
does not yet exist cannot be driven red without building it, which
PROPOSAL ONLY forbids. The deferral to the B4 implement cycle is
accepted. Same error class as W1: I wrote a red-first clause without
checking it was reachable at the phase I asked for it.

=====================================================================
RATIFICATIONS
=====================================================================

RAT-1 — Q2 (money-field wire-shape assertion as the S3 scope), carried
in the money-string-sweep doc REVISION 1 as an in-session operator
selection, is RATIFIED in the review channel 2026-08-01. B4's scope is
money/decimal wire fields. Cite this ruling, not the in-session
selection, from here on.

RAT-2 — TB-R9 below establishes the Phase A evidence-artifact allowance
as a standing rule. Your throwaway B3 test was the single most useful
piece of evidence in the document and did not breach PROPOSAL ONLY.

=====================================================================
TB-R1 — B1 APPROVED, three conditions
=====================================================================
Mechanism (globalSetup, INTEGRATION-gated early return, SCAN+DEL on
rl:*, lib/rate-limit.ts untouched) is approved as proposed. The key-
namespace enumeration table is accepted as the flush-scope proof and
goes into the close-out verbatim.

(a) HERMETIC PROOF NEEDS A POSITIVE CONTROL. "Hermetic baseline
unchanged" is an absence reading, and absence readings are what have
cost this project four incidents. Add a stable-prefix log line emitted
by the flush function reporting the deleted key count. Required
evidence: the line PRESENT with a non-zero count on the INTEGRATION
run-1 (proves the flush ran and had something to flush), and ABSENT on
the hermetic run (proves the gate held). Plus a grep proving no
top-level ioredis import in the globalSetup file. Three captures, all
pasted.

(b) THE COMPLETENESS CLAIM MUST BE NARROW. B1 proves rate-limit residue
is eliminated. It does not prove the INTEGRATION suite is residue-
idempotent in general — dev MySQL rows, BullMQ state and analytics-
cache keys all persist across runs and are untouched by this fix. Write
the close-out and the CLAUDE.md delta as "rl:* residue eliminated; two
consecutive INTEGRATION runs exit 0 with no manual precondition." Do
NOT write "the INTEGRATION suite is residue-idempotent."

(c) DOC DELTA PRESERVES THE REOPEN HISTORY. Deleting the precondition
paragraph is approved. Do NOT flip the TODO to a bare DONE — it was
DONE 2026-07-19 and REOPENED 2026-07-29, and that history is the
lesson. Mark it CLOSED with the sequence stated inline: closed
2026-07-19 (four named tests), reopened + widened 2026-07-29 (F-1,
suite-level residue), closed durably by Task B B1 on <the ruling date
of this block>. Rewriting a reopen out of the record is how the same
gap gets re-closed a third time.

RED-gate for B1: reproduce Run-2-exits-1 on current code, or cite the
2026-07-27 record explicitly as the known-red baseline. Then both runs
exit 0, verbatim with captured exit codes. Run 2 is the discriminator.

=====================================================================
TB-R2 — B2 APPROVED. The nod you asked for: PROMOTE AND UNIFY.
=====================================================================
Promote KWD_AMOUNT_RE and FINANCE_KV_RE into lib/sentry.ts as the
shared scrubEventText, apply to event.message and
event.exception.values[].value, and collapse client-errors.ts's
scrubFrontendText to delegate. Yes, this is a global posture expansion
beyond the literal FIND-S1 wording, and yes it is the right one: a KWD
amount in a backend error message is user data in a personal-finance
app, and one scrubber with one test suite beats two that drift.

Stack frames OUT of scope — accepted, with your reasoning
(includeLocalVariables off, frames carry filename/function/line only).

CONDITION — NEGATIVE CONTROLS ARE BLOCKING. A scrubber test suite that
only proves the scrubber fires is half a test. Add precision cases
asserting the promoted regexes do NOT fire on: a production stack frame
of the exact observed shape (index-BG3YW6B5.js:80:750), a bare integer,
a 2-decimal number, and a semver-shaped string. Over-redaction that
eats diagnostics is a real cost — the 2026-08-01 crash was diagnosed
from a stack, and I want proof the new scrubber would not have eaten
it.

Idempotency test as proposed — approved, including the
email=[REDACTED] fixed-point case.

Grouping analysis — accepted as reasoned-from-code-and-docs, correctly
labelled as such rather than guessed. No live grouping experiment
required. State the NODE-EXPRESS-9 conclusion (groups on type+value,
value already pre-scrubbed, re-scrub idempotent ⇒ unchanged) in the
close-out so a future reader can check it against reality.

Site enumeration — the bucketed classification is accepted BECAUSE the
fix is at the choke point, which makes per-site classification non-load-
bearing. Say that explicitly in the close-out. If the fix were per-site
the bucketing would not be adequate.

=====================================================================
TB-R3 — B2 docs
=====================================================================
Add the ONE checklist line to docs/legal/lawyer-review-checklist.md as
drafted, including the bare-unkeyed-name limitation. Do NOT edit the
Privacy Policy text. Whether to tighten the policy wording is an
operator-and-lawyer call and is DEFERRED, not resolved here — flag it,
do not draft it.

FIND-TB1 RECORDED: the scrubbing checklist line was PROPOSED in the
T1-4 close-out and never landed; the checklist carries 6 items, none
about scrubbing. Whether it was ever approved is unverified. This is
adjacent to the commit-without-activation class — a proposed doc item
that evaporated between proposal and file. Record it in the close-out
as a finding, not as a routine addition.

=====================================================================
TB-R4 — B3(a): DELETE. Option (i) approved.
=====================================================================
Delete SELF_ORIGIN_RE, isSelfOrigin, the fromGlobalHandler &&
isSelfOrigin branch, the suppressed.selfOrigin counter, and the
dev-only test. A broken guard that reads as protection is worse than an
honest absence, and the cap bounds the worst case at 20 sends.

GREEN for this sub-commit is the BOUNDED-LOOP test, not a suppression
test: inject a reporter that throws, assert total transmit attempts
stay ≤ SESSION_SEND_CAP. The captured RED from your Phase A stands as
the evidence that the guard is inert and therefore removable — it is
recorded as justification for removal, NOT as a red that was turned
green. Paste it into the close-out again; it is the load-bearing
artifact.

CONDITION — DO NOT INHERIT THE THREE-GUARD LIST, INCLUDING FROM ME.
Before writing the module comment, verify what the reentrant flag
actually covers. Specifically: if it resets in a finally, an error
thrown inside reportError propagates out with the flag ALREADY CLEARED,
so the reentrant flag may not cover the escaped-throw path at all — in
which case the swallowed .catch() and the cap are doing the work and
the comment must say so. Read the reset semantics, then write what is
true. A module comment naming the wrong guard is exactly the defect
we are deleting.

=====================================================================
TB-R5 — B3(b) APPROVED
=====================================================================
Dual-budget truncation retaining the top of both parts, inside the
existing 4000-char cap. No server, schema, or CSP touch — correct.

CONDITION: derive the split ratio from evidence, not preference. The
real 2026-08-01 capture is in Sentry (NODE-EXPRESS-9). Retrieve it,
measure the error-stack vs componentStack split, and size the
componentStack reserve from that measurement. If the payload is not
retrievable, say so and state 1500/2500 as an explicit assumption with
its basis. "Tunable" is not a rationale.

Named proving test as proposed — innermost component name survives an
over-cap combined stack. Clean RED expected; show it.

=====================================================================
TB-R6 — B4: scope APPROVED, implementation GATED on an addendum
=====================================================================
Option (A), committed wire-shape fixture, is approved as the direction.
Options (B) and (C) correctly rejected.

GATE: the frontend bridging is unresolved and it is the load-bearing
part of the mechanism. "Finalize at implementation" is where mid-
implementation thrash comes from, and the specific risk is concrete:
TypeScript widens JSON-module imports to `string`, not to the literal
`"string"`, so an expectTypeOf assertion cannot be driven from the
committed JSON the way the sketch implies.

Deliver a SHORT B4 ADDENDUM (proposal only, no implementation) before
the B4 implement cycle, resolving:

 (i) The bridging mechanism, demonstrated to work. Evaluate — do not
     assume I am right — a codegen path that mirrors the established
     10a contract:generate precedent: generate a COMMITTED type-
     assertion file from money-wire-shape.json, so drift surfaces as a
     tsc error and the existing tsc CI gate is the checker. That
     sidesteps type erasure entirely and reuses a pattern this repo
     already runs. If you find a cleaner route, propose it with the
     same standard of proof.
 (ii) A stale-fixture guard equivalent to 10a's, so a regenerated
     fixture that nobody committed fails CI.

The addendum may create throwaway evidence artifacts under TB-R9.

RED-gate for the B4 implement cycle (unchanged, just relocated): flip
DashboardMetricsResponse.monthly[].income_kd string→number, show the
mechanism goes red, revert. Evidence artifact, not a commit (C2/Q1).

=====================================================================
TB-R7 — B4 DB-bound routes: decide in the addendum, not at implementation
=====================================================================
Do not carry the "or fall back at implementation" fork forward. The
approved shape, unless the addendum argues otherwise: hermetic per-
field capture for the pure serializers (R3/R11/R12/R13 — where every
real defect has lived), plus a MECHANICAL emit-primitive check for the
DB-bound aggregation routes (formatKd vs roundedKd at the emit line, as
enumerated in A2), with the completeness meta-check spanning BOTH sets.

"Verify under the INTEGRATION cadence" is not a control — a cadence is
a schedule, not a gate, and it is precisely how the last INTEGRATION
baseline went stale. If a route's wire type is only provable under
INTEGRATION, say so and let the mechanical check carry it, rather than
booking a future run as coverage.

Completeness meta-check approved as the named proving method, with A2's
35-field table as the coverage baseline.

=====================================================================
TB-R8 — FIND-S5(b) APPROVED, with an important reframe
=====================================================================
Correct the three ExpensesPage.test.tsx fixtures to strings. Grep proof
accepted; the three sites are the only numeric R3 fixtures in the tree.

REFRAME — READ THIS BEFORE YOU RUN THE SUITE. You predict the tests
stay green because ExpensesPage.tsx:763 coerces. If any of them goes
RED, that is a FINDING, not a fixture problem: it means a consumer of a
money field is doing arithmetic on the real wire shape without
coercion, and the money-string sweep's completeness claim missed it.
STOP AND ASK (R14). Do not adjust the fixture, the assertion, or the
component to restore green. A red here is the most valuable outcome
available in this sub-commit.

=====================================================================
TB-R9 — STANDING: Phase A evidence-artifact allowance
=====================================================================
A Phase A proposal MAY create, run, and delete a throwaway test purely
to capture evidence, provided: the artifact is deleted, the working
tree is verified clean in the delivered document, the capture is pasted
verbatim and in full, and nothing is committed. Same class as the
flip-only tsc capture (C2/Q1): an evidence artifact, not a commit.
Add `git log -1 --oneline` alongside `git status --short` as the
cleanliness proof, since status alone does not exclude a commit.

=====================================================================
SEQUENCE FROM HERE
=====================================================================
1. Persist the approved lineage to docs/modules/ (this ruling block in
   full, plus the Phase A document) BEFORE any implementation.
2. B1 implement cycle → close-out → review-channel approval.
3. B2 implement cycle → close-out → approval.
4. B3 implement cycle (a: delete; b: dual budget) → close-out →
   approval.
5. B4 ADDENDUM (proposal only) → approval → B4 implement cycle.

Every close-out carries the three mandatory sections: verbatim test
tail including the "Test Files N passed (N)" line plus captured exit
code plus no-Errors/Unhandled confirmation; verbatim tsc --noEmit plus
exit code; the baseline diff hunk old→new as the git diff itself.

Any non-zero INTEGRATION exit is a FINDING. Exit-1-by-attribution is
retired.

---
---

# PART 2 — PHASE A PROPOSAL (as delivered, 2026-08-05)

Ordering endorsed: **B1 → B2 → B3 → B4** (B1 first restores INTEGRATION residue-idempotency for
`rl:*` so later INTEGRATION runs are readable without a manual precondition; B2/B3/B4 independent).

## B1 — F-1(b): globalSetup `rl:*` scope-flush (test-only)

**What is wrong.** INTEGRATION is not residue-idempotent across back-to-back runs.
`vitest.config.ts:12` sets `setupFiles: []` under INTEGRATION so the `vi.mock("ioredis")` at
`redis-mock.setup.ts:133` never runs (tests hit real dev Redis). `rate-limit.ts:68` +`:80` build the
double-prefixed key `rl:rl:{userId}:{path}` with a 60s TTL. `env.ts:77` → REDIS_URL defaults to db 1.
Ticket `phase4-rate-limit-test-isolation.md` fixed four named tests (2026-07-19) but ~11 rate-limit
tests still share live `rl:*` buckets within the TTL → Run-2 exits 1 (proven 2026-07-27). Manual escape:
`docker exec public_statera-redis-1 sh -c "redis-cli -n 1 --scan --pattern 'rl:*' | xargs -r redis-cli -n 1 del"`.

**Recommendation.** A Vitest `globalSetup` (runs ONCE per run, Node context) that, only when
`INTEGRATION === "true"`, SCAN+DELs `rl:*` on db 1. `setupFiles` rejected (per-file granularity would
flush mid-suite). `globalTeardown` rejected as primary (a crash skips it; setup-time flush self-heals).
Per-test flush rejected (D4). **HERMETIC SAFETY (blocking):** first line `if INTEGRATION !== "true" return`;
ioredis dynamic-imported INSIDE the branch (no top-level import), so hermetic runs never dial. **Flush
scope (blocking):** `rl:*` on db 1 only, SCAN+DEL never FLUSHDB. Key-namespace table proving `rl:*` is
exclusive to rate-limit (all other prefixes — `sv_revoked:`, `pending_2fa_failures:`, `dashboard_metrics:`,
`dashboard_snapshots`, `snapshot`, `safe_to_spend:`, `bull:` — do NOT start with `rl:`). `lib/rate-limit.ts`
UNTOUCHED (RL-A1/D1).

**Proving test.** Two consecutive `INTEGRATION=true` full-suite runs, no manual flush; both exit 0.
Run 2 is the discriminator. **RED:** the 2026-07-27 known-red baseline (Run-2 exited 1).

**Files/baseline.** New `apps/api/src/test/rl-flush.globalSetup.ts`; edit `apps/api/vitest.config.ts`;
doc delta (remove the INTEGRATION-run-precondition paragraph, close the TODO). Hermetic 750/19/53
unchanged; INTEGRATION count unchanged (now idempotent); tsc/frontend unchanged.

## B2 — FIND-S1: sentryBeforeSend scrub gap

**What is wrong.** `sentry.ts:106-148` scrubs only `event.request`/`.extra`/`.breadcrumbs`; never
`event.message` or `event.exception.values[].value`. Applies to EVERY backend capture. Only
`client-errors.ts` self-scrubs (`:77-81`, `:216-218`), building `captureEvent` where the client message
becomes `exception.values[0].value` (`:228,231`).

**Enumeration (checked each).** Highest risk: `app.ts:71` `captureException(err)` for 5xx — mysql2
constraint errors echo values (e.g. duplicate-entry with an email). ~40 fire-and-forget sites carry infra
errors (low but nonzero); their user context is in `tags`/`extra` (integer userId), not the value.
`client-errors.ts:126` (fixed drop-count string) + `:228` (pre-scrubbed) already handled. Fix belongs at
the choke point (the hook), covering all sites at once.

**Design.** Scrub `event.message` + each `event.exception.values[].value` (strings). Stack frames OUT
(`includeLocalVariables` off by default → frames carry only filename/function/line). Named test requires
KWD + finance key=value redacted in message AND exception ⇒ **promote** `KWD_AMOUNT_RE`/`FINANCE_KV_RE`
from `client-errors.ts:73-75` into `lib/sentry.ts` as `scrubEventText`; `client-errors`'s
`scrubFrontendText` delegates (dedup). (Global posture expansion — flagged; recommend promote+unify.)

**Idempotency (test).** `scrubEventText(scrubEventText(x)) === scrubEventText(x)` for email/IBAN/enc1/
PII-kv/KWD/finance (incl. `email=[REDACTED]` fixed point). Same fn on both passes ⇒ safe double-pass.

**Grouping.** Sentry groups stacktrace-primary; type+value only when stackless. Backend errors WITH
stacktraces unaffected. Stackless PII-values were already per-user-fragmented → scrubbing MERGES them
(improvement). NODE-EXPRESS-9 groups on type+value, value pre-scrubbed, hook re-scrub idempotent ⇒
UNCHANGED. Reasoned from code+docs, not a live experiment.

**Docs.** Add ONE lawyer-checklist line (Privacy §5 scrubbing claim + bare-unkeyed-name limitation); do
NOT edit Privacy text (deferred, operator+lawyer). FIND-TB1: the T1-4-proposed line never landed.

**Files/baseline.** Edit `lib/sentry.ts` + `routes/client-errors.ts`; extend `lib/sentry.test.ts`
(+~3: message-scrub, exception-value-scrub incl KWD/finance, idempotency, + negative controls per TB-R2).
Hermetic ~750→~753; tsc 0; frontend unchanged.

## B3 — FIND-S3

**(a) self-origin (DELETE).** `error-reporter.ts:95` `SELF_ORIGIN_RE` requires literal `error-reporter`
in a top-3 frame (`:96-98`), consulted only for global-handler kinds (`:191-195`). Vite inlines the
reporter into `index-<hash>.js` → never matches in prod (confirmed `index-BG3YW6B5.js:80:750`). Guard is
dev-only. DELETE `SELF_ORIGIN_RE`, `isSelfOrigin`, the `fromGlobalHandler && isSelfOrigin` branch, the
`suppressed.selfOrigin` counter, and the dev-only test. GREEN = bounded-loop test (≤ SESSION_SEND_CAP);
the Phase A RED (captured — production-shaped stack NOT suppressed) is the removal justification.
CONDITION (TB-R4): verify the reentrant-flag reset semantics before writing the module comment.

**(b) componentStack truncation.** `truncateStack` (`:76-79`) keeps top 4000 chars; componentStack is
appended AFTER the error stack (`:203-205`) and React lists the failing component FIRST → on a deep tree
the component name is cut. Fix: dual budget (top of each), inside the 4000 cap (< server STACK_MAX 8000
`client-errors.ts:37`, < 16KB body cap `:34`, zod strips unknown `:57-68`). Split ratio from the real
NODE-EXPRESS-9 capture (TB-R5). Test: innermost component name survives an over-cap combined stack (RED
against current).

**Files/baseline.** Edit `error-reporter.ts`; `error-reporter.test.ts` −1 (self-origin) +1 (componentStack)
≈ net 0; tsc 0.

## B4 — S3 wire-shape assertion (GATED — see TB-R6/TB-R7)

Option (A) committed wire-shape fixture (RATIFIED scope RAT-1: money/decimal fields). (B) runtime zod and
(C) codegen rejected. Backend hermetic capture of pure serializers (R3/R11/R12/R13) → committed
`money-wire-shape.json`; mechanical emit-primitive check (formatKd vs roundedKd) for DB-bound aggregation
routes; completeness meta-check across both (A2's 35-field table = coverage baseline). Frontend bridging
GATED on the addendum (TS widens JSON imports to `string` not `"string"` — evaluate the codegen-type-
assertion path mirroring 10a `contract:generate`). RED (relocated to implement): flip
`DashboardMetricsResponse.monthly[].income_kd` string→number → mechanism red → revert (evidence artifact).
FIND-S5(b): fix `ExpensesPage.test.tsx:108,110,236` numeric→string (TB-R8 reframe: a RED there is a
FINDING, stop-and-ask).

---
---

# PART 3 — IMPLEMENTATION LOG (per sub-commit)

## B1 — F-1(b) globalSetup `rl:*` flush — IMPLEMENTED + CLOSED 2026-08-05 (Phase A approved 2026-08-05)

**Date note (superseded by B2-F2, 2026-08-05):** the entire Task B cycle was issued in the 2026-08-05
session; the earlier 2026-08-01 stamps were inherited-in-error from the prior cycle (see the Date
correction near the top). All Task B artifact dates are 2026-08-05. (An earlier TB-F5 provenance note
here wrongly reasoned that the verbatim reproductions "correctly retained" 2026-08-01 — B2-F2 supersedes
that: the blocks were misdated, not correctly 08-01; the reproductions are LEFT as-issued only because
they are faithful copies, with the true date documented in the Date correction.)

**Changeset (test infra + docs only; `lib/rate-limit.ts` untouched, RL-A1/D1):**
- NEW `apps/api/src/test/rl-flush.globalSetup.ts` — INTEGRATION-gated (`INTEGRATION !== "true"` early return),
  no top-level ioredis import (dynamic `await import("ioredis")` inside the branch), SCAN+DEL `rl:*` on the app
  Redis db, stable-prefix positive-control log `[rl-flush] flushed N rl:* key(s) on redis db D`.
- EDIT `apps/api/vitest.config.ts` — add `globalSetup: ["./src/test/rl-flush.globalSetup.ts"]`.
- DOC deltas in CLAUDE.md: `TODO(integration-rate-limit-test-isolation)` marked CLOSED with the full reopen
  sequence preserved (TB-R1(c)); narrow `rl:*`-only claim (TB-R1(b)); F-1 reopen note closed.

**Flush-scope proof (TB-R1(a), key-namespace enumeration — `rl:*` is exclusive to rate-limit):**
| Prefix | Owner | starts `rl:`? |
|---|---|---|
| `rl:` / `rl:rl:…` / `rl:client-errors:global` | rate-limit | ✅ target |
| `sv_revoked:{userId}:{sv}` | session deny-list (`middleware/auth.ts:66`) | ❌ |
| `pending_2fa_failures:{userId}` | 2FA | ❌ |
| `dashboard_metrics:*`, `dashboard_snapshots`, `snapshot`, `safe_to_spend:*` | analytics cache | ❌ |
| `bull:*` | BullMQ (default prefix) | ❌ |

**Evidence captured (verbatim in the B1 close-out):**
- tsc `--noEmit` exit 0; grep proof: no top-level import in the globalSetup file (ioredis only in comments + the dynamic import).
- Hermetic run: `[rl-flush]` ABSENT (gate held), `750 passed | 19 skipped (53)`, exit 0, no Errors/Unhandled.
- INTEGRATION run-1 (sentinel seeded): `[rl-flush] flushed 1 rl:* key(s)` PRESENT (positive control), `766/3`, exit 0.
- **B1-F1 (emit is unconditional):** `console.log` at `rl-flush.globalSetup.ts:55` sits after the scan loop, outside any `if`, so it emits even `flushed 0` (empirically confirmed — an INTEGRATION run with no residue logged `flushed 0`). Therefore the hermetic ABSENCE of `[rl-flush]` is unambiguous: past the early return the line ALWAYS emits, so its absence on a passing hermetic run can only mean the early return fired (gate held). No code change.
- **RED-gate — corrected scope (B1-F2):** a controlled **seeded** RED reproduced the **budgets half** of the documented 2026-07-27 Run-2 failure mode; the `lib/rate-limit.test.ts` counting half was **not** reproduced (a budgets-key seed cannot reach it, and the seed overshoots every limit so the count is 15, not ~11). The original natural 4-min-gap back-to-back pair was **non-discriminating** (residue expired via 60s TTL). Seeded RED→GREEN on `rl:rl:1:/api/budgets`=100: flush DISABLED → 15 budgets failures (`expected 429 to be 400/200`) / exit 1; flush ENABLED (identical re-seed) → `[rl-flush] flushed 1` / `766/3` / exit 0. Only variable = the flush.
- **E2 — natural residue (B1-F3, causal chain):** an IMMEDIATE natural back-to-back leaves **35** real `rl:*` keys after run-1, INCLUDING `rl:rl:1:/api/budgets` (the seeded-RED key) AND `rl:rl:anon:/limited` (the counting-test key); run-2's globalSetup flushed exactly **35**, both runs `766/3` exit 0. Chain: natural runs leave the budgets key (E2) → that key causes exit 1 (seeded RED) → the flush removes it (GREEN). The counting-test key is present in the natural residue too, so the flush covers it, though its FAILURE was not separately reproduced.
- **TB-F6 (residual limitation, closed by the historical record — not re-earned):** E2 captured natural residue KEY NAMES but not VALUES, so the natural counter on `rl:rl:1:/api/budgets` is unmeasured, while the seeded RED used 100 (over every limit). Strictly, E2 proves the key returns naturally; it does not prove the natural count is over the limit. That gap is filled by the 2026-07-27 record — a NATURAL Run-2 exited 1 with the documented failures, direct evidence that natural residue reaches failing counts. E2 (natural key returns) + seeded RED/GREEN (that key over-limit → exit 1 → flush fixes) + the 2026-07-27 natural exit-1 (natural residue reaches failing counts) together complete the chain. No further experiment run for this — the evidence exists and is cited, not re-earned.

## B2 — FIND-S1 sentry scrub promote+unify — IMPLEMENTED + CLOSED 2026-08-05 (TB-R2/R3, TB-F7)

**Changeset:**
- `lib/sentry.ts` — promoted `KWD_AMOUNT_RE`/`FINANCE_KV_RE` (from `client-errors.ts`) as `_KWD_AMOUNT_PATTERN`/`_FINANCE_KV_PATTERN`; new exported `scrubEventText` (= `_scrubString` + KWD + finance); `sentryBeforeSend` now scrubs `event.message` + each `event.exception.values[].value`. Stack frames NOT scrubbed (`includeLocalVariables` off). `scrubText` kept as the base primitive.
- `routes/client-errors.ts` — local `scrubFrontendText` + the two regexes DELETED; imports + delegates to `scrubEventText`. Behavior byte-identical.
- `lib/sentry.test.ts` — +14 (9→23): message+exception scrub, positive redaction, BLOCKING negative controls, idempotency.
- `docs/legal/lawyer-review-checklist.md` — added the Privacy §5 scrubbing line (FIND-TB1) incl. bare-unkeyed-name limitation; TB-F7 self-audit note (operator announces without external review).

**TB-R2 conditions:**
- **Promote+unify:** one `scrubEventText`, one test suite, no drift ✓.
- **BLOCKING negative controls (proven):** `scrubEventText` leaves untouched the prod frame `index-BG3YW6B5.js:80:750`, a bare integer, a 2-decimal number (`12.50`), and a semver (`1.2.3` / `20.11.0`) — asserted `.toBe(input)` in `sentry.test.ts`. Over-redaction would eat the diagnostics a real crash is read from.
- **Idempotency:** `scrubEventText(scrubEventText(x)) === scrubEventText(x)` (it.each, 6 inputs) + `email=[REDACTED]` fixed point ✓.
- **Grouping conclusion (reasoned from code+docs, no live experiment):** Sentry groups stacktrace-primary; `type+value` only when stackless. Backend errors WITH stacktraces group on frames → unaffected. **NODE-EXPRESS-9** (the client-errors forward) groups on `type+value`; its value is already pre-scrubbed by the route pre-B2, and the hook re-scrub is idempotent ⇒ grouping UNCHANGED. Stackless PII values were already per-user-fragmented → scrubbing MERGES them (improvement). Exception `type` (code identifier) left intact.
- **Site enumeration is non-load-bearing** BECAUSE the fix is at the choke point (the hook) — it covers `app.ts:71` 5xx capture and every current/future capture at once. If the fix were per-site the bucketed classification would need to be exhaustive; it does not.

**TB-F7 pre-announcement captures (captured, not asserted):**
- Legal placeholder markers: `PrivacyPolicyPage.tsx` / `TermsPage.tsx` / `LegalPageLayout.tsx` = 0 markers; RTL render tests (`PrivacyPolicyPage.test.tsx` + `TermsPage.test.tsx`, 7 tests) GREEN with `queryAllByText(/content pending operator review/i).toHaveLength(0)`.
- Backup retention: Privacy §7 states "daily 14 days, weekly 56 days, monthly 365 days" — matches the recorded R2 lifecycle (8f-1) + `backup-db.sh` daily/weekly/monthly prefix routing. HOLDS.
- Statement files parse-and-discard: `upload.ts` reads the file via `new Uint8Array(await file.arrayBuffer())` (in-memory), computes `file_hash`, and NEVER writes the bytes (grep for writeFile/createWriteStream/tmp/S3/R2/bucket across `import-lib.ts`+`upload.ts` = none; the only `persist*` is `persistPlannedRow` = derived transaction ROWS, which the policy says survive). Privacy §4 "never stored" HOLDS.

**FIND-TB1 (recorded):** the scrubbing checklist line was proposed in the T1-4 close-out and never landed (checklist had 6 items, none about scrubbing) — commit-without-activation class. Added by B2.

**B2-F5 — over-redaction cost, recorded (accepted, not a bug):** `_KWD_AMOUNT_PATTERN` is amount-SHAPED, not amount-AWARE — it cannot distinguish a 3-decimal KWD amount from any other 3-decimal float at a word boundary. So a `0.001` ratio, a `1.234 ` latency, or any computed 3-decimal metric in a backend error message is now redacted to `[REDACTED]`. Accepted cost: over-redacting a number is cheaper than leaking a KWD amount, and context-narrowing the regex would be fragile. Recorded so a future engineer seeing `[REDACTED]` where a duration/ratio should be knows it is by design. Pinned by a test in `sentry.test.ts` ("redacts a 3-decimal NON-money float by design") + a note in the scrubber's module comment (`lib/sentry.ts`). (Nuance: the `\b` anchor means a 3-decimal number IMMEDIATELY followed by a letter — e.g. `1.234s` — is NOT matched; the over-redaction applies at a word boundary.)

**Baseline:** hermetic 750→765 (+14 B2 + 1 B2-F5 over-redaction pin), files 53 unchanged, skipped 19 unchanged; tsc 0; exit 0, no Errors/Unhandled.

_B3/B4 pending their cycles._
