# Phase 4 — TASK B (batched follow-ons)

**Status:** Phase A APPROVED WITH CONDITIONS (review channel, 2026-08-05). B1/B2/B3 proceed to
implementation in that order; **B4 is approved in scope but GATED on a separate addendum (TB-R6)**.
This document is the durable lineage (persist-first standing rule): the ruling block in full, then the
Phase A proposal. **Implement from this file, not from conversation context.**

**Date-split amendment (B4-1 Phase A ruling, 2026-08-06) — a CORRECTION, not a silent revision.**
The line "All Task B artifacts date 2026-08-05" (B4 section, below) was true through the B4 addendum
(`8c22709`) and is now SUPERSEDED, not withdrawn: **B0 through the B4 addendum = 2026-08-05; B4-1 onward
= 2026-08-06+.** B4-1's Phase A proposal and all three of its review-channel ruling blocks fall on
2026-08-06. Do NOT stamp B4-1-and-later artifacts 08-05 by inheritance — that is the error B2-F2 corrected
one cycle earlier. The three 2026-08-06 ruling blocks, cited by TITLE because a bare date is ambiguous
across them: (1) "B4-1 Phase A ruling, 2026-08-06"; (2) "B4-1 close-out reconciliation, 2026-08-06";
(3) "B4-1a approval and E-1/E-2 acceptance, 2026-08-06".

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

## B3 — FIND-S3 self-origin delete + componentStack dual budget — IMPLEMENTED + CLOSED 2026-08-05 (TB-R4/R5)

Frontend-only (`apps/web/src/lib/error-reporter.ts` + `error-reporter.test.ts`); no backend change.
**(Artifact date 2026-08-05 per the operator all-Task-B ruling. The commit's git author-date is 2026-08-06 — the session clock advanced mid-cycle — which is real git time, not a doc stamp; recorded so a future reader isn't puzzled by the mismatch. Consistent with B1/B2 whose commits were genuinely 08-05.)**

**B3(a) — DELETE the inert self-origin guard (TB-R4, option i):** removed `SELF_ORIGIN_RE`, `isSelfOrigin`, the `fromGlobalHandler && isSelfOrigin` branch, the `suppressed.selfOrigin` counter (+ its reset), and the dev-only self-origin test. **Removal justification — the Phase A RED (guard inert in prod), re-pasted (NOT a red turned green):**
```
 FAIL  src/lib/__b3red_scratch__.test.ts > PRODUCTION-shaped stack (inlined into index-<hash>.js,
       no 'error-reporter' substring) is STILL suppressed
 AssertionError: expected "spy" to not be called at all, but actually been called 1 times
 ✓ DEV-shaped stack (contains 'error-reporter.ts') IS suppressed — the guard works in dev
```
**TB-R4 BLOCKING — reset semantics verified BEFORE writing the module comment:** `reportError` sets `reentrant=true` (line 181), and its **internal `try/catch` (line 229) swallows every synchronous throw in the body** ("never rethrow into the global handler"); the `finally` (line 234) resets `reentrant`. So a thrown error leaves `reportError` with the flag ALREADY cleared — the reentrant flag does NOT cover an escaped throw; **nothing escapes** because the catch swallows it first. The comment therefore names the TRUE guards: (1) reportError's internal try/catch (synchronous throws), (2) transmit's swallowed `.catch()` (async send rejection), (3) `SESSION_SEND_CAP`; the reentrant flag's narrow job = synchronous nested report during a send. **GREEN = bounded-loop test** (`error-reporter.test.ts`): a fetch that throws every time, fired 30× → total transmit attempts ≤ `SESSION_SEND_CAP` (20). NOT a suppression test.

**B3(b) — componentStack DUAL BUDGET (TB-R5):** React lists the FAILING component FIRST in the componentStack, appended AFTER the error stack; the old single combined truncate let a long error stack consume the whole 4000 budget and cut the componentStack. **Budget (verbatim from `error-reporter.ts:218`, all counted against `MAX_STACK_CHARS = 4000`):** `errBudget = MAX_STACK_CHARS - COMPONENT_STACK_RESERVE - COMPONENT_STACK_SEP.length`. The three numbers: **componentStack reserve = 1500**, **error-stack budget = 2477** (`4000 − 1500 − 23`), **separator = 23** (`"\n--- componentStack ---"`) → **1500 + 2477 + 23 = 4000**. (The close-out earlier said "2500"; that was loose rounding of 2477 — the code sums to 4000, not a code/prose disagreement, B3-F1.) Each part keeps its TOP; `truncateStack` now counts its marker WITHIN max.

**FIND-S3-OFF13 (second defect, found in passing — NOT in FIND-S3's scope):** the OLD `truncateStack` sliced to `MAX_STACK_CHARS` and THEN appended the `\n…[truncated]` marker (13 chars) → **4013**, over the very cap it existed to enforce. Fixed: `truncateStack` now slices to `max − marker.length` so the result is ≤ max. The componentStack dual-budget work would not have found this alone; recorded as its own finding.

**Split ratio (TB-R5) — ASSUMPTION, not a measurement (B3-F2):** the real NODE-EXPRESS-9 capture is in Sentry and is NOT retrievable from this environment (no Sentry access) — stated, not guessed. The **1500** componentStack reserve is an **explicit assumption** sized from a **~50–90 char/frame ESTIMATE** (≈ 17–30 componentStack frames from the top — enough for the failing component + its ancestor chain); if that per-frame estimate is off by 2× the reserve holds ~8 frames, not 17–30. Corroborating basis: the recorded 2026-08-01 capture ran ~3400 chars (85% of the 4000 cap). **Revisit trigger:** the first production boundary report whose componentStack is truncated AT the reserve. **Operator-side (not blocking):** the assumption becomes a measurement if someone with Sentry access pastes NODE-EXPRESS-9's `stack` char-length and where the `--- componentStack ---` separator falls within it. **Named proving test — RED-first (captured this cycle):**
```
 × keeps the innermost component name when BOTH the error stack and componentStack are over budget
   → expected 'Error: boom\n    at f (index-abc123.j…' to contain 'CategoryBreakdownChart'
```
(the failing component name absent under the old single-truncate) → GREEN after the dual budget (component name present, combined ≤ 4000).

**Baseline:** frontend 182→183 (`error-reporter.test.ts` 13→14: −1 self-origin, +1 bounded-loop, +1 componentStack); files 38 unchanged; `tsc` 0; exit 0, no Errors/Unhandled. API baseline 765/19/53 unchanged (frontend-only). FIND-S3-DISP note updated (its earlier "reentrant flag is a primary guard" claim corrected per TB-R4).

## B4 — ADDENDUM APPROVED (review channel, 2026-08-05). NOT STARTED — implement in a NEW conversation from this lineage.

**Scope (RAT-1, ratified 2026-08-05):** money/decimal WIRE-SHAPE fields only. NOT general contract validation.
The class B4 kills: a frontend type annotation that is a claim nobody checked against the wire (9.1, budgets-crash, R3).

### Bridging mechanism — codegen compile-time assertions (TB-R6 GATE CLOSED; PROVEN)
- **JSON-import widening is REAL** (empirically confirmed): `import wire from "./x.json"` gives `typeof wire.k` = `string`, NOT the literal `"string"` — a `@ts-expect-error`-guarded assertion was *consumed*, proving widening. So a naive `expectTypeOf` driven off committed JSON literals cannot work.
- **RECOMMENDED + PROVEN:** a `money-shape:generate` script (mirrors 10a `contract:generate`) reads the backend-captured wire types and emits a **committed** `apps/web/src/contract/money-wire-shape.assert.ts` — one compile-time assertion per money field, wire type baked as a LITERAL annotation (sidesteps widening):
  ```ts
  type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : { ERR: "differ" }) : { ERR: "differ" }
  const _dashboardMetrics_monthly_income_kd:
    AssertEqual<DashboardMetricsResponse["monthly"][number]["income_kd"], string> = true
  ```
  Frontend `tsc --noEmit` (a CI gate) turns any frontend↔wire mismatch into a build error. Demonstrated: match → tsc PASS; flip (`string`→`number`) → `error TS2322: Type 'boolean' is not assignable to type '{ ERR: "differ"; }'`. Must live under `apps/web/src/` (non-`*.test.*`) so the web tsc gate reaches it. No runtime cost (Option B rejected).

### Stale-fixture guards (ii, ACCEPTED) — two committed artifacts, one generator, two guards
- `apps/api/src/contract/money-wire-shape.json` — human-readable wire-type record (backend-captured).
- `apps/web/src/contract/money-wire-shape.assert.ts` — generated from the JSON.
- **Guard 1:** backend test re-derives the wire shape and `toEqual`s the committed `.json` (10a `frontend-calls.json` pattern) → drift = "regenerate".
- **Guard 2:** test regenerates the `.assert.ts` from the `.json` and asserts byte-equality with the committed file → a regenerated-but-uncommitted assert fails CI (the non-bypassable 10a property).
- Transitive chain: wire change → Guard 1 forces `.json` commit → Guard 2 forces `.assert.ts` commit → tsc checks it against frontend types → disagreeing frontend type is tsc-red.

### TB-R13 — OPTION Y (RULING 2026-08-05, REVERSES TB-R7). Runtime-capture ALL routes R1–R13 uniformly. NO authored entries anywhere.
The operator REVERSED TB-R7's split. Premise gone (I corrected it: aggregation IS hermetically invocable via `app.request` + mock db, as `aggregation.test.ts` does — not INTEGRATION-only), so the reasoning that produced the split goes with it. **Ruling rationale (operator, overriding my split recommendation):**
1. **Authored entries ARE the defect class B4 exists to kill.** An authored-from-A2 wire-shape entry is a human transcription of what a serializer does — the same unchecked-claim artifact one layer down. The completeness guard proves every emit site has an ENTRY, not that the entry is RIGHT; a transposed `formatKd`/`roundedKd` in an A2 transcription yields a fixture that is complete, green, and WRONG, then baked into an assertion enforced against the frontend — making the frontend match a lie. Worse than no check.
2. **The cost is one-time and already paid:** ~10 aggregation routes needing auth + mock rows via `app.request` is exactly what `aggregation.test.ts` already does — transcription of an existing pattern, not new engineering.
3. **It collapses a moving part:** under the split A2's 35-field table stays load-bearing forever; under Option Y A2 reverts to a historical enumeration and the serializers are the ONLY source of truth.

**Do:** runtime-capture every route R1–R13 (pure-serializer libs R3/R11/R12/R13 via `makeDbReturning(mockRows)`; aggregation R1/R2/R4–R10 via `app.request` + mock db) → `money-wire-shape.json` entirely mechanically derived. **Keep the aggregation emit-site grep guard** (33 `formatKd`/`roundedKd` sites today): still the completeness proof, and under Option Y it gains a SECOND job — a new emit site with no captured entry means a route the capture does not invoke (a better failure signal). **Completeness meta-check spans the whole captured set** (mirrors 10a `exercisedMethodGaps`); A2's 35-field table is the coverage baseline (now historical, not load-bearing).
**R14 if Option Y is more expensive than it looks:** STOP and report the specific routes that resist hermetic invocation and why. Do NOT silently fall back to authored entries for awkward routes (a half-authored fixture has the authored failure mode with none of the visibility). Reverting to the split is available — but as a RULING, not a drift.

### NULLABLE MONEY FIELDS — BLOCKING for B4-1 (ACCEPTED as blocking)
If a fixture leaves a `… | null` money field null, the captured `typeof` is `"object"` (or the field is skipped) → the generated assertion silently narrows or vanishes. **Every nullable money field's fixture must exercise the NON-NULL branch, and the capture must FAIL LOUDLY on a null-valued money field rather than recording it.** State the mechanism in the B4-1 proposal (e.g. the capture throws on a money field whose runtime value is null/undefined/non-string-non-number, forcing the fixture to populate it).

### RED-gate (relocated per W2)
Flip `DashboardMetricsResponse.monthly[].income_kd` `string`→`number`, show `tsc` red through the generated assertion, revert. Evidence artifact, NOT a commit (C2/Q1).

### B4 implement plan — APPROVED, three sub-commits (each its own propose→approve→implement→verify with the 3 mandatory close-out sections)
- **B4-1 (backend, hermetic):** uniform runtime capture R1–R13 (Option Y) → `money-wire-shape.json` + Guard 1 + the aggregation emit-site completeness guard + the meta-check. Nullable-fail-loud stated + implemented.
- **B4-2 (frontend/tooling):** `money-shape:generate` + committed `money-wire-shape.assert.ts` + Guard 2 + the tsc gate + the RED-gate demonstrated.
- **B4-3 (FIND-S5(b), TB-R8):** correct `ExpensesPage.test.tsx:108/110/236` numeric R3 fixtures → strings. **TB-R8 reframe IN FORCE (highest-value possible Task B outcome):** if any of the three goes RED when the fixtures become strings, that red = an uncoerced money-arithmetic consumer the sweep missed → **STOP AND ASK (R14)**; do NOT adjust the fixture/assertion/component to restore green.

**Handoff:** B4 implementation runs in a NEW review-channel conversation from a self-contained successor prompt. Nothing in Task B's approved lineage depends on conversation memory — it lives here and in CLAUDE.md. Any non-zero INTEGRATION exit is a FINDING. All Task B artifacts date 2026-08-05.

**Task B commit ledger:** B1 `6afbc6c`, B2 `e76e455`, B3 `4ba99ba` (all committed, local). B4 NOT STARTED — implement from this section.

## B4-1 — money wire-shape runtime capture R1–R13 (Option Y) — IMPLEMENTED `c37046a`, 2026-08-06

Rulings: "B4-1 Phase A ruling, 2026-08-06" (R1–R6, C1–C6), "B4-1 close-out reconciliation, 2026-08-06"
(R7–R10, E-1/E-2, C7–C9 via the third block), "B4-1a approval and E-1/E-2 acceptance, 2026-08-06".

**Delivered:** `apps/api/src/contract/money-wire-shape.test.ts` + committed
`apps/api/src/contract/money-wire-shape.json`; `money-shape:capture` regenerate script. **Zero production
diff** (B4-1-R6) — no file under `src/routes/**` or `src/lib/**` modified, evidenced by the commit `--stat`.

**Mechanism.** Uniform runtime capture of all R1–R13 (+R3-tier2) via `app.request` + a shape-dispatch mock
db keyed on the `select({...})` projection (order-independent, so R8's sequential-then-`Promise.all`
fan-out needs no positional assumptions). Every leaf's wire type is OBSERVED; nothing is transcribed.
Guards: NULL fail-loud, PRESENCE fail-loud (C1), Guard 1 (`toEqual` the committed JSON), the emit-site
guard, and a serializer-provenance audit. Both fail-loud guards carry observer checks proving they can
report a violation.

**E-1 — Guard 1 proven non-vacuous (accepted).** (a) flipping `data.monthly[].income_kd` string→number in
the committed JSON drives the suite red with a `toEqual` hunk naming that path; (c) deleting
`data.cash_flow.30d.net_kd` drives it red through a different `toEqual` path (the C1 case-(ii) backstop);
(b) the only write is behind `MONEY_SHAPE_WRITE=1`, set in exactly one place repo-wide (the regenerate
script), with `vitest.config.ts` setting only `STATERA_DEV_MODE` and `deploy.yml:91` setting nothing —
proven statically AND empirically, the (a) mutation surviving a full-suite run unmodified.

**Findings.** (1) The emit-site grep returns **43** primitive call sites, not the 42 predicted:
`routes/budgets.ts:306` is a `formatKd()` on an INSERT value, not a wire field — reported, not reconciled;
baseline is the mechanical 43 with `:306` named non-wire → 42 wire + 5 non-primitive = 47. (2) The CI step
cited in the B4-1 proposal (`vitest run src/contract`) does not exist: **`433e6cc` (10f) removed it**, and
the reason is that commit's own surviving comment. The gate is `pnpm --filter statera-api test`
(`deploy.yml:91`). (3) **CF5 — `validateSnapshotPayload` polices `monthly[]` money but NOT
`expense_by_category` leaves** (`dashboard-snapshot-lib.ts:135-136` vs no equivalent check), so R3 Tier 2
can serve a JSON number where Tier 3 always serves a `formatKd` string. Proven at runtime via a TB-R9
probe (`X-Cache-Status=snapshot`, number leaf reaching the wire). **No evidence this is live today** —
current writers produce strings — the defect is that nothing enforces it, and `dashboard_snapshots` rows
persist across deploys. (4) C4: the Phase A probe's unidentified db call was `recordEventDaily`'s INSERT,
which fired only because the probe's empty rows made the "already recorded today" check fail.

## B4-1a — clock pin, R3 Tier 2 capture, multi-path inventory — 2026-08-06

- **CF6 clock pin** to `2026-05-15T09:00:00.000Z` (`vi.setSystemTime`, `toFake:["Date"]` only — faking
  timers wholesale would interfere with the ioredis mock and promise scheduling). Without it R11 falls to
  `detected:false` (nulling `suggested_monthly_income_kd` → NULL guard red) and R12's `patterns[]` empties
  (→ PRESENCE guard red) once the calendar passes the fixture dates: a red with no code change on an
  unpredicted date. R12's fixture rows were re-dated inside the 90-day lookback (flagged in advance).
  Dissolves the prior R10 cross-day-determinism residual: cross-day variation stops existing.
- **CF5 R3-tier2 capture** — a 14th entry (`?months=24`, no `until`, bare-`select()` snapshot fixture),
  `X-Cache-Status` asserted `snapshot` so the test proves WHICH tier it observed, and its money leaf types
  asserted EQUAL to Tier 3's.
- **C7 MULTI_PATH inventory** — 9 entries, derived from source. CAPTURED-BOTH: MP-1 (R3 tiers), MP-4
  (`month_trend` populated vs zero-fill), MP-5 (R6 `roundedKd` vs literal-zero). GAP-RECORDED with revisit
  triggers: MP-2/3 (income-resolver arms), MP-6 (R5's three dimension arms), MP-7 (R7 range arms), MP-8
  (R10 fallback), MP-9 (R11 null arms, forbidden by the NULL guard). Only MP-1 crosses a serializer
  boundary; a second such entry is a stop condition, asserted in the test.
- **CF7 revisit triggers** on the three empty-container exceptions (`accounts` / `connected_accounts` →
  "bank sync ships"; `warnings` → "the N1 non-null `monthly_income_kd` fixture changes").
- **CF9** — a loud unconditional banner when the regenerate path fires, so the vacuous-pass state
  self-announces.

## B4-1b — validateSnapshotPayload `expense_by_category` guard — IMPLEMENTED 2026-08-06

Rulings: charter **B4-1-R10**, "B4-1a approval and E-1/E-2 acceptance, 2026-08-06" (operator ruling by
delegation); Phase A approved by **"B4-1b Phase A approval — bucket guard in, T3 added, self-referential
SHA barred, 2026-08-06"** (R1–R11) — the SIXTH review-channel block dated 2026-08-06, so cite it by TITLE,
never by date alone.

**Delivered.** `validateSnapshotPayload` (`lib/dashboard-snapshot-lib.ts`) now type-checks the
`expense_by_category` buckets AND leaves with the same reject-to-`null` semantics it already applied to
`monthly[]` money; new `apps/api/src/lib/dashboard-snapshot-tier.test.ts` (T1/T2/T3).

**Rulings as implemented.**
- **R1 — bucket guard IN SCOPE.** Without it a string bucket passes, because `Object.values("oops")` walks
  as four strings. Mirrors `monthly[]`'s existing `if (!entry || typeof entry !== "object") return null`.
- **R2 — empty containers stay accepted.** `{}` is a legitimate no-expense month produced by the writer
  itself (`dashboard-snapshot-lib.ts:202`). C1 presence class, explicitly out of scope. A decision, not an
  oversight.
- **R3 — no telemetry on rejection.** Rejection is self-healing within the same request (Tier 3 recomputes
  and `onDuplicateKeyUpdate` overwrites), so a stale row costs exactly one miss, once. Recorded in the
  function's own comment so the silence is not later read as an oversight.
- **R4 — T3 required.** The fail-safe property rests entirely on "both writers emit strings", which Phase A
  proved with a throwaway. A premise proven by a deleted artifact is not a guard, so T3 asserts it
  hermetically at the `db.insert(...).values({...})` boundary for both entry points, with the CONTROL case
  carried over. **Count note (flagged, not smuggled):** the approval's baseline says "Three tests" / 776, so
  WRITER-1 + WRITER-2 + CONTROL are folded into T3's single `it` rather than three; five `it` blocks would
  have landed 778.
- **R5 — new file approved.** `analytics-cache.test.ts` mocks the lib under test at module scope (the 7.5
  mock-contamination class); `aggregation.test.ts` mocks `analytics-cache` wholesale.
- **R6 — INTEGRATION.** See the residue finding below.
- **R7 — 771 MEASURED, not derived.** See the CLAUDE.md baseline bullet.
- **R8 — no self-referential SHA.** Both amendments cite B4-1b by ruling name. No self-referential hash
  placeholder survives anywhere in the tree — the Phase A drafts carried one, and it was removed rather
  than backfilled. No follow-up commit owed. (This line deliberately avoids writing the placeholder token
  itself, since R8's check is a literal grep that cannot distinguish a use from a mention.)
- **R9 / R10 / R11 —** CF8 instance (i) marked closed; the `rm` near-miss added as instance (7); the
  emit-site constraint recorded and verified (`lib/dashboard-snapshot-lib.ts` holds at 3 primitive sites).

**§2 findings upheld and folded into the code comment:** the `monthly[]` monetary predicates are positive
string-type assertions, so they reject EVERY non-string (number, boolean, `null`, a missing key, object,
array) — the "float" framing names the motivating case, not the check. The comment now says so.

**Prediction ledger (all MET).** Hermetic 773 → **776 / 19 / 55 (47 | 8)**, exit 0, `tsc` 0.
`money-wire-shape.json` byte-identical; 157 leaves / 65 money paths / 14 routes; emit-site 43 → 42 + 5 = 47.
INTEGRATION mode-invariance held: 776 + 19 − 3 = **792** accounted for (790 passed + 2 failed + 3 skipped),
so the channel's inherited **780/3 is confirmed WITHDRAWN** and 789/3-at-HEAD was the right shape.

**RESIDUE FINDING (R6(c)) — pre-existing, NOT a B4-1b regression, and it is INTRA-run, not inter-run.**
`money-wire-shape.test.ts` fails under INTEGRATION on `CF6` (`tier2 … expected 'hit' to be 'snapshot'`,
`:825`) and `C7` (`expected 'hit' to be 'miss'`, `:923`). Cause: the file calls `captureAll()` five times;
under INTEGRATION the module-wide ioredis mock is absent, so the FIRST call populates
`dashboard_metrics:1:2:2026-05` and `dashboard_metrics:1:24:2026-05` (900s TTL) and later calls take a
Tier-1 hit. **Run 1 started from a verified-cold `dbsize 0`, so this is not inter-run residue**; the R6(c)
protocol was executed anyway — both keys `DEL`ed with reply `2`, re-run — and run 2 failed **identically**,
which is what proves the intra-run mechanism. **Proven pre-existing by measurement, not assertion:** with
B4-1b stashed out, the file at HEAD (`bdd49ca`) fails under INTEGRATION with the same two assertions
(`2 failed | 6 passed (8)`). B4-1b's own T1/T2/T3 are residue-immune by construction (R6(d)) — the
unique-per-run userIds produced fresh keys (`dashboard_metrics:9221381{60,61,63}:2:`) and all three passed
in every INTEGRATION run.

**Queue additions accepted at approval, NOT this commit's work:** (1) extend B1's `globalSetup` to flush
`dashboard_metrics:*` (and evaluate `safe_to_spend:*`) on db 1 — the residue class B1 scoped out, now with
a second confirmed instance; (2) the snapshot payload's non-money type holes (`months[]` elements,
`monthly[].month`), reported in Phase A §4 and deliberately unfixed. Note the fix for (1) must address the
INTRA-run case, which a run-start flush alone does not.

## B4-1b — CHARTER (as issued, superseded by the section above)

Ruling: B4-1-R10, "B4-1a approval and E-1/E-2 acceptance, 2026-08-06" (operator ruling by delegation).
Its own propose→approve→implement→verify cycle — NOT inside B4-1a, which inherits zero-production-diff.
Scope: extend `validateSnapshotPayload` to type-check `expense_by_category` leaves with the same rejection
semantics as `monthly[]` money; a test proving a number-leafed stored snapshot is REJECTED and recompute
serves instead; a test proving a string-leafed one is still accepted. No other validator change. If
hardening requires touching the write path, that is an R14 stop. **Timing: BEFORE Task B close**, so it
ships in the same deploy as B2. Basis: the validator's stated intent ("Reject float monetary values") is
half-implemented — the inert-guard class B3 already deleted once this module; `dashboard_snapshots` rows
persist across deploys, so a bad row survives a rollback; the failure mode is fail-safe (rejection falls
back to Tier 3 recompute, blast radius = a cache miss); and it sits on the crash path, in the crash field.

**Queued to the Task B close fix-forward batch:** F4 (CLAUDE.md's C2 typed-drift carry-forward is stale —
closed in source), F5 (`aggregation.ts:18-19` self-contradiction: R4 is listed as both number and string;
it is string), CLAUDE.md's 10a entry describing the `vitest run src/contract` CI step that `433e6cc`
removed, and **the T3 `it` split (B4-1b-R13)** — see the ruling below.

---

# RULINGS — the 2026-08-07 blocks (persisted BEFORE implementation, per B4-1c-R8)

**Date discipline.** These are the FIRST Task B artifacts past the 2026-08-06 cluster. Do NOT inherit
08-06 for anything from here forward. Two blocks share 2026-08-07, so cite by TITLE, never by date alone:
(1) **"B4-1b close-out ACCEPTED; B4-1c chartered on the INTEGRATION red, 2026-08-07"**;
(2) **"B4-1c Phase A approval — Option (C) with observer test; safe-to-spend replay recorded as
FIND-B4-1c-b, 2026-08-07"**.

## Carried from block (1) — B4-1b accepted, `249aa7e` blessed

- **B4-1b-R12 — the doc-comment update is ACCEPTED and the reasoning ruled correct.** "No other validator
  change" bars changes to BEHAVIOUR, not to the description of behaviour that the same commit changed.
  Leaving a comment describing only `monthly[]` floats would have manufactured a fresh inaccuracy in the
  commit that closed one — and that comment was itself the source of the §2 near-miss, since "same
  rejection semantics" read off it would have produced a narrower mirror. Flagging rather than smuggling
  is what made it a one-line ruling instead of a bounce.
- **B4-1b-R13 — the T3 `it` split rides the Task B close fix-forward batch. DO NOT amend `249aa7e`, and do
  NOT fold it into B4-1c.** The Phase A ambiguity was the channel's (R4 said "three tests" and "the
  WRITER-1/WRITER-2/CONTROL cases carry over" in one breath); following the explicit number was the right
  tie-break. But the split is the better end state: T3 guards the charter's load-bearing premise, and a
  single `it` means a WRITER-1 failure masks whether WRITER-2 is also broken — the failure-injection
  principle (assert the SPECIFIC failure) applied to a premise guard. Lands as **+2 → 778 / 19 / 55
  (47 | 8)** with its own baseline line.
- **B4-1c-R1 — STANDING, effective now: Task B CANNOT CLOSE over a non-zero INTEGRATION exit.** The
  close-out that carries the deploy must include an INTEGRATION run at exit 0 with its count reconciled.
  This is the gate that stops a named, understood, reproduced failure from decaying into ambient noise
  while other sub-items pass over it.
- **Queue item (1) AMENDED on the record.** "Extend B1's `globalSetup` to flush `dashboard_metrics:*`" is
  now known to be **insufficient alone**: it addresses INTER-run residue, and the confirmed failure is
  INTRA-run (and, per FIND-B4-1c-b, intra-CALL). Carry the item with that qualification attached so a
  future reader does not implement the flush and believe the class is closed. Queue item (2) — the
  snapshot payload's non-money type holes (`months[]` elements, `monthly[].month`) — is unchanged.

## FIND-B4-1c — the capture file is hermetic-only by construction, and was never known to be

`apps/api/src/contract/money-wire-shape.test.ts` performs **six** captures per run (five `captureAll()`
call sites, one of which sits inside CF6's two-iteration loop). Hermetically the module-wide ioredis stub
makes every `cacheGet` return null, so Tier 1 is inert and every tier assertion is valid. Under INTEGRATION
`vitest.config.ts` sets `setupFiles: []`, the stub is absent, the first capture populates
`dashboard_metrics:*`, and later captures take a Tier-1 hit — so CF6 (`:831`) and C7 (`:929`) read `hit`
where they expect `snapshot`/`miss`. **The file depended on an inertness it did not state, did not enforce,
and at header line 71 explicitly denied** (listing `cacheGet`/`cacheSet` among things that "run for real").

Established by measurement, not argument: run 1 started from a **verified `dbsize 0`** (excludes inter-run
residue); the R6(c) protocol (name the two keys, `DEL … reply=2`, re-verify by SCAN, re-run) produced an
**identical** failure, which is what converts "probably residue" into "intra-run, and a run-start flush
cannot fix it"; pre-existence proven by stashing B4-1b out and failing identically at `bdd49ca`
(`2 failed | 6 passed (8)`); mode-invariance held (`790 + 2 + 3 = 795 = 776 + 19`), so the prediction was
not retro-fitted and **780/3 stays withdrawn**.

## Carried from block (2) — B4-1c Phase A approved

- **B4-1c-R2 — Option (C) with the observer test APPROVED; (A) REJECTED on the record, durably.**
  (A) (unique-per-call userId) would have converted a loud two-assertion failure into a green run with
  R9/R10's money types still observed from a JSON round-trip — green-for-the-wrong-reason in its purest
  form, and it would have been the channel's error, since the charter offered (A) first and named it
  "proven this cycle". **Durable rule: a fix that removes the SYMPTOM by avoiding the MECHANISM is not a
  fix; it must make the file's actual requirement true and enforced.** (B) (`describe.skipIf`) rejected
  because a skip satisfies an exit-0 gate by not running — one category from the exit-1-by-attribution
  posture B4-1c-R1 retires.
- **B4-1c-R3 — FIND-B4-1c-b (below) is a SEPARATE and LARGER finding than the red that surfaced it.**
- **B4-1c-R4 — the observer test must be PROVEN ABLE TO FAIL.** Assert R9's `dbCalls` contain the
  safe-to-spend builder queries, then drive it red with a one-line temporary mutation making the inert
  mock return a value for `safe_to_spend:{u}:{month}`, show the observer catch the replay, revert.
  Evidence artifact, not a commit (C2/Q1). **A guard whose pass has never been distinguished from a
  vacuous pass means nothing** — the whole of B4-1's E-1 exists for this.
- **B4-1c-R5 — MULTI_PATH gains a safe-to-spend entry, GAP-RECORDED, in this commit.** Under (C) the
  cached-replay arm is never taken, by design and now by enforcement — under CF8 that is exactly an
  untaken arm hiding a path. Name both arms (build vs `_getSafeToSpendPayloadCached` replay), state that
  the capture takes the build arm by construction because the file mocks the cache inert, and give the
  revisit trigger (a serializer change on the safe-to-spend payload, or any assertion added that depends
  on the replay arm). **Do NOT attempt to capture the replay arm** — that re-introduces exactly what this
  commit removes. Coverage claim, not a type claim, so it stays inside the authored-entry boundary
  (B4-1-R3).
- **B4-1c-R6 — the line-71 header claim must be corrected in the same commit**, stated positively: this
  capture REQUIRES an inert Redis; the cache is mocked as a data SOURCE (a fixture), never as a serializer,
  and every serializer named in the header still runs for real. Name the file-local `vi.mock("ioredis")`
  and say why it exists — the global setup skips under INTEGRATION, so inheriting inertness from it was
  accidental.
- **B4-1c-R7 — B4-1a is EXONERATED on the record.** `c37046a`'s capture file **passes cold under
  INTEGRATION** (`6 passed`, exit 0, measured). B4-1a's tier assertions did not introduce the defect; they
  EXPOSED it, and before them the file passed under INTEGRATION while silently observing Redis replays for
  R9/R10. Recorded here so a reader arriving at the red later does not read `bdd49ca` as its cause.
  **An assertion that turns a silent wrong observation into a loud failure is the assertion working.**
- **B4-1c-R8 — persist these rulings NOW, docs-only, before implementing.** (This section is that commit.)
  The tree-clean-through-Phase-A convention exists to stop implementation landing before approval, not to
  stop rulings being recorded. Ruled the other way from the B4-1b cycle because the CONTENT is different,
  not because that cycle was wrong.
- **B4-1c-R9 — predicted baselines are the prediction of record.** Hermetic **777 / 19 / 55 (47 | 8)**,
  exit 0, `tsc` 0. INTEGRATION **793 passed / 3 skipped / 0 failed** (777 + 19 − 3, total 796), exit 0.
  `money-wire-shape.json` unmoved — already measured in the Phase A probe, so a movement is a FINDING, not
  a surprise. Emit-site table unaffected. Frontend untouched and not re-run; 183/38 carried unverified by
  design. Report what comes back; do not retro-fit.

## FIND-B4-1c-b — safe-to-spend intra-CALL replay (larger than the red that surfaced it)

`_getSafeToSpendPayloadCached` is reached from **R8 (`aggregation.ts:1115`), R9 (`:922`) and R10 (`:1037`)**
inside a single `captureAll()`, and `ROUTES` orders them R8 → R9 → R10, so R8's build populates
`safe_to_spend:{u}:{month}` (300s) and **R9/R10 replay it**. Proven by db-call signature, not inferred:
hermetic **16 / 5 / 9** against cached **13 / 2 / 6** — exactly **−3 each**, the three
`_buildSafeToSpendPayload` queries (`select{total} | select{amount,catName} | select{total}`), with **R9 at
2 building nothing at all**. A seeded sentinel reached the wire as
`EXTRA R8 data.safe_to_spend.safe_to_spend_kd = 12345`. **No unique-per-call userId can separate these —
they are one user's dashboard by construction**, which is why option (A) was rejected.

Three consequences, ruled (B4-1c-R3):

- **(a) The committed `money-wire-shape.json` is NOT tainted — state this explicitly, do not leave a reader
  to work it out.** Hermetically the ioredis stub always misses, so all three routes built for real and
  every captured type is `typeof` on a real serializer's output. The capture's central claim HOLDS for the
  artifact as committed. What was false was the claim's PORTABILITY to INTEGRATION mode.
- **(b) Nothing about safe-to-spend was ever asserted.** No `X-Cache-Status`; a JSON round-trip preserves
  string/number; and the provenance audit's `EMITTED` set is module-level and never cleared across the six
  captures, so R8's first real run masks R9/R10 permanently. **That is the observation-window shape one
  layer in: an audit that cannot distinguish "R9 emitted this" from "R8 emitted this and R9 replayed it."**
- **(c) `EMITTED`'s non-clearing is a real weakness and is NOT fixed here** (`money-wire-shape.test.ts:117`,
  written at `:126`/`:139`, read at `:608-609`). Currently harmless — hermetically every route builds — but
  it is a masking mechanism waiting for a second cache. Named finding; do not touch it in this commit.

**Enumeration (report only).** `dashboard_metrics:*` — R3/R3-tier2, distinct keys, no intra-call exposure,
asserted (this was the red). `safe_to_spend:*` — R8/R9/R10, intra-call exposure PROVEN, **unasserted**.
`sv_revoked:*` — read-only, absent ⇒ pass, identical in both modes. `rl:*` — module mocked in this file.
`routes/intelligence.ts` (R11/R12/R13) contains **no** cache calls; `_buildAccountOverviewPayload` (R4) is
uncached. Elsewhere: `aggregation.test.ts` mocks `../lib/analytics-cache` wholesale, so
`money-wire-shape.test.ts` is the SOLE exposed file.

**Stray key, chased to a conclusion:** a `safe_to_spend:1:2026-08` key (real clock, `days_elapsed: 7`)
appeared during Phase A, which the clock pin should have made impossible. It was written by the `c37046a`
control run — `grep -c 'pinClock\|useFakeTimers'` returns **0** at `c37046a` vs **4** at HEAD, because
B4-1a introduced the pin. **No hole in the pin at HEAD.**

# RULINGS — the 2026-08-08 blocks (persisted BEFORE implementation, per B4-2-R7)

**Date discipline.** TWO blocks share 2026-08-08; the second carries a **`b` suffix**. Cite by title:
(1) **"B4-1c close-out ACCEPTED; B4-2 Phase A chartered, 2026-08-08"**;
(2) **"B4-2 Phase A approval — nullability form confirmed, R8 composition check ruled a deliberate asset,
2026-08-08b"**.

## From block (1) — B4-1c accepted (`01c1175`, `8330e0e` blessed)

- **B4-1c-R10 — the order-verification near-miss becomes observation-window instance (8), and it RIDES THE
  TASK B CLOSE FIX-FORWARD BATCH. Do NOT amend `8330e0e`.** Landing text: *a grep for a baseline line whose
  pattern assumed a naming convention the line did not follow returned empty, indistinguishable from the
  line being absent — caught only by printing the list in file order and reading it. Cheap discipline: when
  verifying an ordered list, print the whole list in file order; a pattern match confirms presence, never
  order, and its silence confirms nothing.* **Order-verification is a genuinely new facet** — instances
  (1)–(7) are all about presence or absence; this one is about SEQUENCE, which no grep observes. Second
  instance in this task where the near-miss occurred during the rule's own authorship.
- **B4-1c-R11 — MP-10's `divergenceRisk` reasoning ruled correct and worth preserving.** A JSON round-trip
  preserves string/number, so the replay arm cannot change a wire TYPE — only its provenance. That is the
  precise reason the gap is safe to RECORD rather than CAPTURE, and it correctly bounds FIND-B4-1c-b: the
  replay was a **provenance** defect, never a **type** defect, which is why the committed `.json` was never
  tainted.
- The `--amend` of `8330e0e` accepted: unpushed, not `249aa7e`, fixing a defect found in its own
  verification, and stated plainly in the close-out — which is what makes it fine. A fix-forward commit for
  a chronology inversion would have been worse for the record.

## From block (2), the `b` block — B4-2 Phase A approved

- **B4-2-R1 — WITHDRAWAL ON THE RECORD (the EIGHTH this module). The charter's
  `AssertEqual<…, "string">` sketch was WRONG, and it is the channel's error, not an implementer
  deviation.** The sketch presumed the capture's `"string"` is a complete claim about the wire type. It is
  not, and **B4-1's own blocking clause is why**: the NULL fail-loud guard forbids the capture from
  recording a null money field, and MP-2/MP-9 record the non-null arms as GAP-RECORDED precisely because
  the fixtures take them. The capture can therefore only ever emit `"string"` for a field whose true wire
  type is `string | null`, and a strict bidirectional equality against that asserts something the capture
  never claimed. **The four TS2322 failures were the type system correctly reporting that the ASSERTION was
  wrong, not the frontend types.** The `Exclude`/`NonNullable` form is CONFIRMED: weaker than the sketch
  implied, and **exactly as strong as the capture's actual claim** — it still catches `number`-for-`string`,
  `string`-for-`number` and `string | number`, verified by the RED-gate firing under it.
- **B4-2-R2 — the nullability gap is recorded with its revisit trigger, AND the trigger's COST.** Land in
  both the emitted header and CLAUDE.md: *B4-2 does not check nullability; a frontend type that wrongly
  omits `| null` passes. Not a regression — nullability was never in the capture's scope.* **Explicit
  addition:** extending the capture to record nullability requires **relaxing the NULL fail-loud guard,
  which is a blocking-clause change under TB-R13 and therefore its own chartered cycle, not a tweak.**
  Write the cost into the trigger so a future reader does not attempt it as a small improvement.
- **B4-2-R3 — R3-tier2 merge APPROVED; the R8 ruling the other way APPROVED as the stronger call.**
  Merge-on-key-with-throw-on-disagreement makes duplication impossible **by construction** — there is no
  dedup step to forget. **Record the convergence:** the 62-from-65 delta being exactly R3-tier2's 3 paths,
  with the conflict check NOT firing, is a second independent instrument agreeing with C7/MP-1's runtime
  `expect(t2).toEqual(t3)` — two mechanisms reaching the same conclusion by different routes is worth more
  than either alone. On R8: emitting both `DashboardBundleResponse["safe_to_spend"]["monthly_income_kd"]`
  and `SafeToSpendResponse["monthly_income_kd"]` is **not** the duplication the charter barred — different
  key strings, and the pair is a free check that `DashboardBundleResponse.safe_to_spend` really is typed
  `SafeToSpendResponse` rather than a divergent inline shape. Resolving through composition would need an
  authored nested map and would LOSE that check. **State this in the generator's header so a future
  maintainer does not "optimise" it away.**
- **B4-2-R4 — the map-gap guard is REQUIRED, not optional.** The route→(prefix, type) map is admissible as
  a COVERAGE claim under B4-1-R3, but an unmapped route emits zero assertions, zero failures, and vanishes
  — the CF8/C1 shape one layer out. Both directions. **Prove it able to fail**: remove one route from the
  map, show red, restore.
- **B4-2-R5 — Guard 2 in the FRONTEND suite APPROVED**, with 10a's precedent noted as reversed-direction
  and load-bearing. **Confirm at implementation, do not assume:** that the cross-package path resolves
  under the frontend Vitest config as it does under 10a's, and that a **missing or moved JSON fails loudly
  rather than resolving to undefined and passing vacuously**. An empty read that looks like agreement is
  the observation-window shape yet again.
- **B4-2-R6 — `resolveJsonModule` being absent is a CONSTRAINT TO STATE, not merely to work around.** Write
  the reason into the emitted header, or a future maintainer enables `resolveJsonModule`, "simplifies" the
  generator to import the JSON directly, and **silently reintroduces the widening-to-`string` failure the
  consumed `@ts-expect-error` already proved**.
- **B4-2-R7 — persist these rulings NOW, docs-only, before implementing.** (This section is that commit.)
  Same call and same reasoning as B4-1c-R8; asking rather than inferring a standing rule from one instance
  was correct.
- **B4-2-R8 — predicted baselines are the prediction of record.** Frontend **185 / 39**, `tsc` 0, exit 0.
  API hermetic **777 / 19 / 55 (47 | 8)** and INTEGRATION **793 / 3 / 0** both UNCHANGED.
  `money-wire-shape.json` unmoved. **The 183/38 line is now MEASURED — it stopped being carried-unverified
  as of this cycle, and the carried figure was accurate.** No production code, and the assert file is not
  bundled (nothing imports it, so it never enters Vite's entry graph), so the deploy's smoke-walk
  obligations are unchanged from what B4-1b imposed.

## B4-2 Phase A — the finding that changed the design (recorded before implementation)

Running all 62 assertions against the real types **before** proposing produced 7 errors in two classes,
**neither of them typed-drift**: 3 × TS2339 (the generator could not index through an OPTIONAL intermediate,
`profile_context?`) and 4 × TS2322 (every one a NULLABLE money field —
`SafeToSpendResponse["monthly_income_kd"]`, the same through `DashboardBundleResponse`, and
`IncomePatternResponse["monthly_income_kd"]` / `["suggested_monthly_income_kd"]`, all declared
`string | null`, all captured as `"string"`). Both classes share one fix: step the path with `NonNullable<>`
and compare the leaf's non-null type via `Exclude<…, null | undefined>`. Under that form **all 62 pass,
`tsc` exit 0**, and the RED-gate still fires.

**Headline result: ZERO real typed-drift defects.** All 62 money paths agree, so **B4-2 lands as pure
infrastructure, not a defect hunt** — a fact that could not have been known without running it.
**R13 is unavailable as a RED-gate subject, verified against the tree rather than inherited:** all 12
`SnapshotResponse` money declarations are already `string` (3 in `net_position`, 3×3 via
`SnapshotCashFlowWindow`), each carrying a `// See C2 fix-forward` comment — and CLAUDE.md still says
`number`, confirming F4's staleness.

# RULINGS — the 2026-08-08c / 08-08d blocks (persisted BEFORE implementation, per B4-3-R4)

**Date discipline.** FOUR blocks now share 2026-08-08, suffixed `` / `b` / `c` / `d`. Cite by title WITH
suffix: (c) **"B4-2 close-out ACCEPTED; B4-3 Phase A chartered under the TB-R8 reframe, 2026-08-08c"**;
(d) **"B4-3 Phase A approval — the 7 additional fixtures FOLD IN; typecheck asymmetry recorded,
2026-08-08d"**.

- **B4-2-R9 — a miscounted batch is how an item gets dropped.** The B4-2 close-out said the close batch
  "now holds four items" and then listed five. The list was right, the count wrong. Same class as the
  B4-1c chronology inversion: *a claim about a list that the list itself contradicts.* **At execution,
  enumerate the batch from the file in FILE ORDER and tick items off individually, never against a
  remembered count.**
- **B4-3-R1 — the 7 additional numeric money fixtures FOLD INTO B4-3** (scope widened by ruling; a
  successor item would leave seven known-wrong fixtures in the tree after this cycle audited them and
  confirmed them wrong against the committed capture — a false-premise fixture knowingly retained, the
  exact thing FIND-S5(b) exists to name, with no guard behind the class). Conditions: **(a)** TB-R8 applies
  to all TEN sites individually — any red is a FINDING, stop and ask, do not adjust fixture/assertion/
  component to restore green; **(b)** enumerate consumer paths for the 7 BEFORE touching them, to the same
  standard as the ExpensesPage three; **(c)** `api.test.ts` is the one place LEGITIMATE assertion changes
  are expected — it tests the api layer itself, so assertions there plausibly read raw unwrapped values; an
  assertion reading `120` that must become `"120"` is correcting an expectation that was itself asserting
  the wrong wire shape (legitimate, the clearest possible case), whereas an assertion whose RENDERED output
  must change is barred; classify each explicitly, and stop if any resists clean classification;
  **(d)** report the ten sites as ONE set with per-site outcome, so the record shows what was CHECKED, not
  only what was changed.
- **B4-3-R2 — the frontend/API typecheck asymmetry is a NAMED QUEUE ITEM, not chartered in Task B.**
  Removing `src/**/*.test.ts(x)` from the frontend tsconfig would surface an unknown error count across 39
  test files, and Task B does not open an unbounded remediation this late. Recorded as **the guard that
  does not exist behind B4-3's class**, with the API side named as the precedent proving it is achievable,
  and the honest note that **the cost is unmeasured**. Post-Task-B queue, its own cycle.
- **B4-3-R3 — F6 joins the close batch.** CLAUDE.md's money-string-sweep line describing a repo-wide
  `*.test.*`-excluded typecheck is true of the frontend, FALSE of the API; correct it to state both sides
  and the asymmetry.
- **B4-3-R5 — baselines.** Frontend **185 / 39 unchanged, no count movement**; both tsc runs unchanged.
  Neither API suite re-run; B4-1c's INTEGRATION **793 / 3 / 0** exit 0 remains the run of record and
  B4-1c-R1 remains in force for the close deploy. **If any count moves, that is a FINDING — a fixture
  correction should not add or remove a test.**

## THE TASK B CLOSE BATCH — SIX items (enumerate from this list, in file order, ticking individually)

1. **F4** — CLAUDE.md's C2 typed-drift carry-forward is stale (closed in source; re-confirmed at B4-2
   Phase A: all 12 `SnapshotResponse` money declarations are already `string`).
2. **F5** — `aggregation.ts:18-19` self-contradiction: R4 is listed as both number and string; it is string.
3. **10a CI-step staleness** — CLAUDE.md's 10a entry describes a `vitest run src/contract` CI step that
   `433e6cc` removed.
4. **T3 `it` split** (B4-1b-R13) — split the single T3 `it` into WRITER-1 / WRITER-2 / CONTROL so a
   WRITER-1 failure cannot mask WRITER-2. Lands **+2 → 778 / 19 / 55 (47 | 8)** with its own baseline line.
   Do NOT amend `249aa7e`. **EXECUTED 2026-08-08: the delta (+2) held but the ABSOLUTE was stale — 778 was
   computed from B4-1b's 776 and never re-based when B4-1c added +1. Measured result: 777 + 2 = **779**.**
5. **Observation-window instance (8)** (B4-1c-R10) — order-verification, with the §3 RIDER below.
6. **F6** (B4-3-R3) — the typecheck-asymmetry line.

### Instance (8) rider text (B4-3, approved 2026-08-08d)

Instance (8) is order-verification; this is **the same lesson in SEARCH form**, recorded as a rider rather
than as instance (9) because inflating the list would cheapen it:

> *a grep pattern built from a naming convention returned a partial set that looked complete; the fix was
> to derive the search vocabulary from the artifact being checked, not from what the names were assumed to
> look like.*

Earned at B4-3 Phase A: the first re-derivation pattern (`_kd|_pct` suffix) missed
`ExpensesPage.test.tsx:110` entirely, because category names do not end in `_kd`. The fix was to extract the
money-leaf vocabulary from `money-wire-shape.json` itself — 28 leaf names with per-route wire types — and
grep on that.

## FIND-B4-3 — the typecheck asymmetry (recorded, queued, not chartered)

`apps/web/tsconfig.json` excludes `src/**/*.test.ts`, `src/**/*.test.tsx`, `src/test/**`, and every frontend
tsc invocation shares that one config (`typecheck`, `lint:typecheck`, `build` via `tsc -b`, CI
`deploy.yml:83`). **No frontend test file is type-checked by any command, in CI or locally** — which is
exactly why the numeric money fixtures survived B4-2: the compile-time assertions live in `src/contract/`,
which IS checked, but the fixtures live in files the checker never opens.

**`apps/api/tsconfig.json` has NO test exclusion** (`include: ["src"]`, `exclude: ["node_modules"]`), so
**API test files ARE type-checked in CI** (`deploy.yml:82`). Proven empirically rather than read off the
config: a deliberate error in a new `apps/api/src/lib/kd.test.ts` produced
`src/lib/kd.test.ts(2,7): error TS2322`, exit 1. **The asymmetry is the finding**, and it is more useful
than the flat "no" the charter anticipated.

## Task B CLOSE BATCH — EXECUTED 2026-08-08 (all six items)

Ruling: "B4-3 close-out ACCEPTED; Task B implementation COMPLETE; close batch chartered, 2026-08-08e".
One commit. Items enumerated FROM THIS FILE IN FILE ORDER and ticked individually (B4-2-R9), never against
a remembered count.

1. **F4 — DONE.** CLAUDE.md's C2 typed-drift carry-forward rewritten: the stale "declares 12 KWD fields as
   `number`" claim is GONE; all 12 are `string` in source, re-verified at B4-2 Phase A, which is also why
   R13 was unavailable as B4-2's RED-gate subject.
2. **F5 — DONE.** `aggregation.ts:18` now reads "R1/R2/R5/R6/R7 return numbers (roundedKd)"; R4 no longer
   appears on both sides. **Verified against the serializer, not the comment:** all six R4 money paths are
   type `"string"` in `money-wire-shape.json`. The old wording survives only as a quoted mention at `:20`
   explaining the correction.
3. **10a CI-step staleness — DONE.** The described `vitest run src/contract` step is named as removed by
   `433e6cc` (10f); the real gate is `pnpm --filter statera-api test` (`deploy.yml:91`).
4. **T3 `it` split — DONE.** T3a WRITER-1 / T3b WRITER-2 / T3c CONTROL, three independently-failing cases,
   so a WRITER-1 failure can no longer abort before WRITER-2 runs. **Measured 779, not the predicted 778 —
   see the stale-prediction finding above.**
5. **Observation-window instance (8) + BOTH riders — DONE.** Order-verification, plus rider (a) the
   partial set from an assumed-convention pattern and rider (b) the superset that only reading the
   consumer resolves. Neither promoted to a numbered instance. All eight instances verified present and
   **strictly ascending by character position** — the ordering was wrong on the first attempt (I inserted
   (8) before (7)) and was caught by printing the list, which is instance (8)'s own lesson applying to
   instance (8)'s authorship.
6. **F6 — DONE.** The typecheck line now states BOTH sides: no frontend test file is type-checked by any
   command anywhere; API test files ARE, in CI at `deploy.yml:82` (proven empirically). FIND-B4-3's queue
   item recorded with its cost stated as **unmeasured**.

**Verification:** API hermetic **779 / 19 / 55 (47 | 8)** exit 0; frontend **185 / 39** exit 0 (unchanged);
both `tsc --noEmit` exit 0. Neither INTEGRATION run performed — B4-1c's **793 / 3 / 0** exit 0 remains the
run of record, and **B4-1c-R1 is still owed by the deploy**, which must clear it again.

## B4-3 — FIND-S5(b) numeric money fixtures corrected — IMPLEMENTED 2026-08-08

Rulings: "B4-3 Phase A approval — the 7 additional fixtures FOLD IN; typecheck asymmetry recorded,
2026-08-08d" (R1–R5). Rulings persisted first in `25e385f` per B4-3-R4. Frontend test fixtures only;
**zero `apps/api` diff**, zero production code.

### The TEN sites, with per-site outcome (B4-3-R1(d) — what was CHECKED, not only what changed)

| # | site | field → capture entry | wire | fixture was | outcome |
|---|---|---|---|---|---|
| 1 | `ExpensesPage.test.tsx:108` | R3 `data.monthly[].income_kd` | string | `500` | **CORRECTED** `"500.000"` |
| 2 | `ExpensesPage.test.tsx:108` | R3 `data.monthly[].expense_kd` | string | `120` | **CORRECTED** `"120.000"` |
| 3 | `ExpensesPage.test.tsx:110` | R3 `data.expense_by_category.*.*` | string | `100`, `20` | **CORRECTED** `"100.000"`, `"20.000"` |
| 4 | `ExpensesPage.test.tsx:236` | R3 `monthly[].income_kd`/`expense_kd` | string | `0`, `0` | **CORRECTED** `"0.000"` ×2 |
| 5 | `insights/RecurringCommitmentsCard.test.tsx:9` | `avg_amount_kd` | — | `3.25` | **NO CHANGE — false positive** (see below) |
| 6 | `api.test.ts:169` | budgets `profile_context.budget_total_kd` | string | `120` | **CORRECTED** `"120.000"` |
| 7 | `api.test.ts:170` | `profile_context.monthly_income_kd` | string | `500` | **CORRECTED** `"500.000"` |
| 8 | `api.test.ts:171` | `profile_context.budget_to_income_pct` | string | `24` | **CORRECTED** `"24.0"` |
| 9 | `api.test.ts:321-323` | same three, dashboard-bundle | string | `100`, `500`, `20` | **CORRECTED** `"100.000"`, `"500.000"`, `"20.0"` |
| 10 | `api.test.ts:182` (assertion) | reads site 6 | string | `.toBe(120)` | **CORRECTED** `.toBe("120.000")` — legitimate, see below |

Nine value corrections + one assertion. Precision from the serializers, not guessed: `formatKd` → 3dp for
R3; `routes/budgets.ts:151/152` `.toFixed(3)` and `:147` `.toFixed(1)` for `profile_context`.

### Site 5 — a FALSE POSITIVE in B4-3's own Phase A list, withdrawn on the record

**This is a scope REDUCTION from B4-3-R1's "7 additional fixtures", flagged rather than taken silently.**
`RecurringCommitmentRow.avg_amount_kd` is typed **`number`** at `insights/RecurringCommitmentsCard.tsx:7`
and is a **client-derived** type, not a wire type: `InsightsPage.tsx:159` coerces the wire value with
`Number(row.avg_amount_kd || 0)` and re-emits it at `:180` into the derived row, which the card renders via
`formatKD(row.avg_amount_kd)` (`:98`). Correcting it to a string would have **introduced** a defect.
Same structure as `MonthDeltaRow`, which Phase A had already classified correctly.

**Lesson, and it is the instance-(8) rider one layer on:** matching a captured money LEAF NAME is not
sufficient — a fixture must be confirmed to stand in for the WIRE type rather than a client-derived type
that happens to share the name. The vocabulary-derived grep found the site; only reading the consumer
decided it. So: 7 additional candidates → **6 genuine, 1 withdrawn**.

### TB-R8 outcome: GREEN on the money paths, with exactly one legitimate assertion change

Run order was fixture-first, observe, then classify — never pre-adjusted. Correcting the nine values
produced **exactly one** failure:
```
 FAIL  src/lib/api.test.ts > envelope parsing > budgetsApi.get reads budget payload from envelope data
 AssertionError: expected '120.000' to be 120 // Object.is equality
 Tests  1 failed | 184 passed (185)
```
**Classified LEGITIMATE** under §5 / B4-3-R1(c): `api.test.ts:182` reads the **raw unwrapped value**
(`result.profile_context?.budget_total_kd`), not rendered output, and it was asserting `120` — a wire shape
that does not exist. It is the clearest possible case of an expectation that was itself asserting the wrong
wire shape. **Not** the barred kind: no matcher loosened, no rendered output changed, no component touched.
Site 9's triplet has **no** assertion reading it (the dashboardBundle test asserts only `month`,
`committed_kd`, `items` length and `total_income_mtd` — all already strings), so it needed none.

**All nine other corrections produced ZERO failures**, confirming Phase A §2's enumeration: every
`ExpensesPage` consumer coerces (`:565`, `:571`, `:737-739`, `:756`, `:764-766`, `:779`, `:784`), and the
one that does not (`:816-817` `allCategories`) reads `Object.keys` only and never touches a value. **No
uncoerced money-arithmetic consumer exists on these paths** — the boring outcome, reported as found.

**Verification:** frontend **185 / 39, exit 0, no count movement** (B4-3-R5 met — a moved count would
itself have been a finding); frontend `tsc` 0; API `tsc` 0 and **neither API suite re-run** (zero
`apps/api` diff). **B4-1c's INTEGRATION 793 / 3 / 0 exit 0 remains the run of record, and B4-1c-R1 remains
in force for the close deploy.**

## B4-2 — money wire-shape frontend compile-time assertions — IMPLEMENTED 2026-08-08

Rulings: block (2), "B4-2 Phase A approval — nullability form confirmed, R8 composition check ruled a
deliberate asset, 2026-08-08b" (R1–R8). Rulings persisted first in `06afb77` per B4-2-R7.

**Changeset** (frontend only; **no production code**): new generated + committed
`apps/web/src/contract/money-wire-shape.assert.ts` (62 assertions); new
`apps/web/src/contract/money-wire-shape.assert.test.ts` (generator + map-gap guard + Guard 2); new
`apps/web` script `money-shape:generate` = `MONEY_ASSERT_WRITE=1 vitest run …`.

**Evidence (all owed items discharged):**
- **RED-gate (C2/Q1 evidence artifact, reverted):** flipping `DashboardMetricsResponse.monthly[].income_kd`
  `string`→`number` produced **exactly one** error, `money-wire-shape.assert.ts(66,7): error TS2322`, on the
  `// R3, R3-tier2` assertion; reverted, `tsc` exit 0.
- **Guard 2 direction 1** (regenerated-but-uncommitted): renaming one const in the committed file →
  `FAIL … money-wire-shape.assert.ts is stale`, exit 1.
- **Guard 2 direction 2** (generator cannot self-write to pass): with the mutation still present, the full
  CI-equivalent `test:unit` run exited 1 **and left the mutation in place** (`_aZZ` still present, verified
  by grep) — the write path is unreachable without the env var.
- **Map-gap guard (B4-2-R4) proven able to fail:** removing `R7` from `ROUTE_MAP` →
  `unmapped=["R7"]` and `Captured route(s) with no entry in ROUTE_MAP — their money fields would be
  silently unasserted: R7`; it correctly failed BOTH tests, since the missing route also changes the
  generated bytes. Restored.
- **`MONEY_ASSERT_WRITE` footprint:** exactly one setting site (`apps/web/package.json:15`) plus the
  guarded write and its CF9 banner; CI's four gate steps (`deploy.yml:83`, `:84`, `:92`, `:93` area) carry
  no `env:` at all.
- **B4-2-R5 cross-package read confirmed, not assumed:** `resolve(HERE, "../../../api/src/contract/
  money-wire-shape.json")` resolves under the frontend Vitest config, and `readWireShape()` **throws with a
  named message** on an unreadable file and on an empty/non-object parse — so a missing or moved JSON fails
  loudly instead of resolving to `{}` and passing vacuously.

**Verification:** frontend **185 / 39**, `tsc` 0, exit 0. API hermetic **777 / 19 / 55 (47 | 8)**, `tsc` 0,
exit 0 — unchanged. `money-wire-shape.json` unmoved (`git diff --stat` empty). INTEGRATION not re-run: B4-2
is frontend-only with zero `apps/api` diff, and the last INTEGRATION run of record is B4-1c's 793 / 3 / 0
exit 0. **B4-1c-R1 remains in force for the Task B close deploy, which must clear it again.**

## B4-1c — inert-Redis capture fix — IMPLEMENTED 2026-08-07

Rulings: block (2), "B4-1c Phase A approval — Option (C) with observer test; safe-to-spend replay recorded
as FIND-B4-1c-b, 2026-08-07" (R2–R9). Rulings persisted first in `01c1175` per B4-1c-R8; implementation
sits on top of that commit.

**Changeset** (one file, `apps/api/src/contract/money-wire-shape.test.ts`; zero production diff):
- **R2/(C)** — file-local `vi.mock("ioredis")` reusing the exported `RedisMock`, in the async-factory form
  (`vi.mock` is hoisted above imports). Makes `cacheGet` miss in BOTH modes.
- **R6** — header line 71 corrected. `cacheGet`/`cacheSet` removed from the "run for real here" list;
  `ioredis` added to the mocked list; a new "THIS CAPTURE REQUIRES AN INERT REDIS" section states the
  requirement positively and says why the mock is file-local (the global setup skips under INTEGRATION, so
  inheriting inertness was accidental).
- **R5** — MULTI_PATH gains **MP-10** (safe-to-spend, GAP-RECORDED): both arms named, the build arm taken
  by construction AND by enforcement, `divergenceRisk` "none (a JSON round-trip preserves string/number, so
  the replay arm cannot change a wire TYPE — only its provenance)", revisit trigger recorded, and an
  explicit **do NOT capture the replay arm**. Coverage claim, inside the B4-1-R3 authored-entry boundary.
  The C7 assertions are unaffected (`both` still `["MP-1","MP-4","MP-5"]`; TYPE-risk still only `["MP-1"]`).
- **R4** — new safe-to-spend OBSERVER CHECK asserting R8/R9/R10 each issue the builder's own queries.

**R4 — the observer PROVEN ABLE TO FAIL** (one-line temporary mutation making the inert mock serve a
`safe_to_spend:` value; evidence artifact, reverted, never committed):
```
    R8 dbcalls=13 :: execute | select{id,month,amountKd,categoryName} | ...
    R9 dbcalls=2  :: execute | execute
    R10 dbcalls=6 :: execute | select{total} | select{total} | select{name,total} | select{paydayDay} | execute
 FAIL … OBSERVER CHECK: the safe-to-spend builder ran for R8/R9/R10 — no cache replay
 AssertionError: R8 must run the safe-to-spend builder, not replay a cached payload:
   expected [ 'execute', …(12) ] to include 'select{amount,catName}'
 Tests  3 failed | 6 passed (9)
```
Green after revert, with the full builder signature restored: **R8=16, R9=5, R10=9**.
(The same mutation also drove Guard 1 and the provenance audit red — `EXTRA R8
data.safe_to_spend.safe_to_spend_kd = "1.000"` — so three independent guards see it once a cache is live.)

**Verification (B4-1c-R9 — every prediction MET, none retro-fitted):**
- Hermetic **777 passed / 19 skipped / 0 failed across 55 files (47 passed | 8 skipped)**, exit 0, no
  Errors/Unhandled section. `tsc --noEmit` exit 0.
- **INTEGRATION `793 passed / 3 skipped / 0 failed across 55 files, exit 0`**, reconciling exactly as
  777 + 19 − 3 = 793 (total 796). **This run discharges B4-1c-R1.**
- **Residue class closed for this file, proven not asserted:** the run wrote **zero** `dashboard_metrics:1:*`
  and **zero** `safe_to_spend:*` keys (the only `dashboard_metrics:*` keys left are B4-1b's
  unique-per-run tier-test userIds), and an immediate back-to-back second INTEGRATION run was also
  `793 / 3 / 0` exit 0 with no manual precondition.
- `money-wire-shape.json` **unmoved** (Guard 1 green; `git diff --stat` empty) — measured in the Phase A
  probe and again here. Emit-site table unaffected (no serializer call site touched).
- Frontend untouched and **not re-run**; 183/38 carried unverified by design.
