# Phase 4 — track: phase4-frontend-fixes

**Status:** Phase A COMPLETE and ACCEPTED (review channel, **"FF-R3, issued 2026-08-27"**). This
document is the track's durable lineage (persist-first standing rule) and is the track's FIRST
commit, written before any implementation. **Implement from this file, not from conversation
context.**

## Completeness note

- **Format in use:** Format A — ruling blocks are headed `^FF-R<n> — ` at column 0. This file
  uses Format A exclusively; there is no Format B block here. A presence sweep of this file needs
  one pattern only (contrast `phase4-10e.md`, which carries two formats — see 10e-R183).
- **Persisted set:** **FF-R1 … FF-R3**, complete and contiguous. First 1, last 3, no duplicates,
  no gaps. No FF number outside that range exists at the time of writing.
- **Relay provenance:** **FF-R1 RELAYED**, **FF-R2 RELAYED**, **FF-R3 RELAYED** — all three
  reached the implementer as verbatim relayed text inside operator prompts, none by delegation.
  All three were **UNPERSISTED** until this commit; persisting them is the whole purpose of this
  commit, per 10e-R239 (no ruling crosses a session boundary in an implementer's context) and the
  persist-first standing rule.
- **This file is the track's ruling record.** Any later FF-numbered block is appended here, in
  Format A, before the work it authorises begins.
- **Transcription seam, stated because it cannot be closed here (10e-R256):** the three blocks and
  the Phase A report below were transcribed from conversation text, not piped from a tool. There
  is no file on disk to diff them against, so their byte-fidelity rests on careful transcription
  and is **NOT mechanically verified**. This is a bounded unknown of this commit, not a claim of
  byte-identity. Where a later reader needs a load-bearing string from these blocks, derive it
  from the source the block cites, never by retyping it from here.
- **Nothing is opened by this file.** The track has shipped no code. Per 10e-R78 and FF-R3's
  deliverable (v), **CLAUDE.md is deliberately NOT edited** — a Migration-status entry naming a
  track with no commits would be a live index pointing at nothing.
- **No new CLAUDE.md standing rule was earned** (FF-R3). The standing-rule count stays at SIX.

### Amendment — track close, 2026-08-29

The five bullets above are the note as written at the Phase A persistence commit (`a39a0cb`) and
are left as they stood; this amendment is the live index from the track close forward.

- **Persisted set is now FF-R1 … FF-R8**, complete and contiguous. Shape **derived from this file**,
  not asserted: 8 Format-A headers, first **1**, last **8**, **0** duplicates, **0** breaks in
  1…8. A ninth match would mean a citation wrapped to column 0.
- **Relay provenance: all eight RELAYED** — every block reached the implementer as verbatim
  relayed text inside an operator prompt, none by delegation of authorship. All were
  **UNPERSISTED** until the commit that carried them (FF-R1…FF-R3 at `a39a0cb`; FF-R4…FF-R8 here).
- **FF-R4 was REISSUED IN BLOCK FORM.** Original date **2026-08-27**, reissued in block form
  2026-08-27. It was authored as prose in a message and never given block form or a paste fence,
  so the relay had nothing to carry — a **channel authoring defect** (10e-R147 class), not a lost
  artifact, not a persistence failure, not a relay fault. Detected only because the implementer's
  open enumeration reported it MISSING while FF-R5 cited it twice. Its text is persisted above in
  its numbered position with its original date; nothing was backdated.
- **FF-R5 is persisted UNEDITED, including its wrong `WeeklyDigestSection.tsx:121` reference.**
  The operative line is **`:116`**. FF-R6 carries the correction and sits immediately after it, so
  a reader meets the error and its correction together. The correction is **NOT** folded into
  FF-R5 (10e-R78; 10e-R148 precedent) — a line number is semantic, so R257's pre-persistence
  reissue licence (non-semantic layout only) does not reach it.
- **Supersedes the "nothing is opened by this file" bullet above:** the track has now shipped
  code (`eb036c2`, four items), and this close-out commit makes the **only two** CLAUDE.md edits
  of the track — the frontend baseline line and one Migration-status entry.
- **The transcription seam (bounded unknown 1) still applies** to FF-R4…FF-R8 and to the two
  Phase B reports, on the same terms: derive any load-bearing string from the source a block
  cites, never by retyping it from here. FF-R4 states why the unknown is bounded rather than open.

---

## Ruling blocks

FF-R1 — THE TRACK IS OPEN. Prefix FF-R. Operator sequence ruled 2026-08-27, direct.

OPERATOR RULING, 2026-08-27, DIRECT (not by delegation). Post-10e sequence, in the operator's
own order: (1) minor frontend fixes; (2) mobile friendliness; (3) no-signup demo for
first-timers; (4) Module 11, frictionless transaction logging.

THE SEQUENCE HAS A DESIGN CONSEQUENCE, NAMED HERE AND NOT YET RULED. The no-signup demo
precedes Module 11, which owns TODO(memorized-cascade-decision). If the demo ships first it
CANNOT be permitted to force that decision, because the decision is downstream of it. The only
design satisfying that cleanly is a pre-auth demo that WRITES NOTHING — no user row, no
transactions, no learnTransaction priming — so there is nothing to cascade. This is stated as a
CONSEQUENCE of the operator's ordering, not adopted as ruled. The three-way split therefore
stands as: cold-start + cascade = Module 11 interior; post-signup demo behaviour
(POST /api/auth/demo-data, behind requireAuth) = unchanged for now, still coupled to Module 11;
pre-auth no-signup demo = this track's item 3, independent if and only if it writes nothing.

STANDING CONSTRAINTS BINDING THIS TRACK AND THE MOBILE TRACK AFTER IT, cited not restated:
CLAUDE.md:482 logical properties only, no ml-/mr-/pl-/pr- additions, load-bearing for the
Phase 6 RTL sweep; CLAUDE.md:470 CSP is enforcing with NO Report-Only net, so any new external
origin lands in deploy/Caddyfile in the SAME commit; the design-track scope boundary, protected
QuickAdd journey, no renames, pinned strings, and the three named regression files.

FF-R2 — PHASE A IS MEASUREMENT. Ten items, report-only, hard stop. Three operator requests are RECLASSIFIED and are NOT minor frontend fixes.

THE OPERATOR SUPPLIED FOUR SCREENSHOTS AND A DEFECT LIST. Three of the four requests are not
frontend-fix scope and are recorded as such BEFORE measurement, so the classification is not
made retroactively to fit what is found: (i) the recurring-commitments filter is a BACKEND
behaviour change to R12 with Flask-equivalence and public-contract implications; (ii) the KPI
rework is DESIGN-TRACK work under the ink-and-brass constraints; (iii) the income contradiction
visible across two surfaces may be backend, frontend or both, and its class is unknown until
measured. None is opened here. Phase A MEASURES all of them, which commits to nothing.

M1 — BASELINES, RE-DERIVED AT EXECUTION, NEVER CARRIED.
  The exact commands CI runs, from .github/workflows/deploy.yml:
    pnpm --filter statera-frontend run test:unit
    pnpm --filter statera-api test
    pnpm --filter statera-frontend exec tsc --noEmit
    pnpm --filter statera-api exec tsc --noEmit
  EACH carries a RESOLUTION PROOF (10e-R246) — a prior invocation, same selector, emitting a
  distinguishing token — because a pnpm filter matching no project EXITS 0. Capture $? on its own
  line after a NON-PIPED command. Report the Test Files summary line, not only the Tests line.
  Also report: contract fixture entry count and the ALLOWLIST length at
  apps/api/src/contract/frontend-contract.test.ts:54, both derived FROM THE FILE (10e-R182).
  Stated so a miss is a question: frontend 209/41, api 873/34/61, both tsc 0, fixture 66,
  ALLOWLIST empty. A MISS IS REPORTED AND INVESTIGATED, NOT ABSORBED (10e-R137b).

M2 — THE CURRENCY-FORMATTING SPLIT. OBSERVED, from screenshots: the Home KPI row renders
  "KD 0.000" and the Plan KPI row renders "KD 0" — three decimals against none, same currency,
  adjacent pages. KWD is 3-decimal by project convention. ENUMERATE every KPI/headline money
  render site on Home and Plan, and report for each: the component, the file:line, the formatter
  actually called, and the WIRE TYPE of the field it consumes (string vs number — CLAUDE.md's
  per-route table is authority, money is NOT uniform on the wire). Report which sites bypass the
  shared formatter. DO NOT FIX.

M3 — THE INCOME CONTRADICTION. THIS IS THE MOST IMPORTANT ITEM. Observed simultaneously, same
  account, same month (2026-08), demo workspace loaded:
    Home       — INCOME KD 0.000, EXPENSES KD 0.000, REMAINING KD 0.000, SAVINGS RATE 0.0%
    Home       — "Safe to Spend Today" card: "No income detected yet."
    Insights   — "This Week": SAFE-TO-SPEND TODAY KD 450.000
    Insights   — "Month Snapshot": FREE TO SPEND KD 1,800.000, ALREADY SPENT 0.000,
                 COMMITTED 0.000, narrative "You're ahead of pace with healthy discretionary
                 room still available."
  Two surfaces say there is no income; two surfaces spend it. For EACH of those four figures
  report the producing route (R3/R4/R8/R9/R13), the income-resolution ARM it took
  (detected_from_transactions | declared_in_profile | not_set), and whether it reads live or from
  dashboard_snapshots / the analytics Redis cache. CHANNEL HYPOTHESIS, UNMEASURED, stated so it
  can be falsified rather than confirmed: 10b-2's demo seed writes profile income/payday
  defaults, so the Insights surfaces may be resolving declared_in_profile while the Home
  safe-to-spend card handles only the detected arm — the 9.1 defect class, which was a
  null-vs-"not_set" comparison against exactly this enum. TRY TO FALSIFY IT. Report what is
  measured, not whether it agrees.

M4 — THE DEMO SEED WINDOW. Home showed all four KPIs at zero for 2026-08 while the banner read
  "81 demo transactions and 7 budgets are loaded", and the deltas read -100.0% vs last month,
  which implies last month HAS rows. Report, from lib/demo-data-lib.ts: how the seed's date range
  is constructed, and whether a load executed on 2026-08-27 produces any transaction dated within
  2026-08. Report the construction, then state the answer. THIS IS THE FIRST-IMPRESSION QUESTION
  FOR TRACK ITEM 3 — a first-timer who loads a demo and lands on an all-zero dashboard has been
  shown the empty state with extra steps.

M5 — DELTA-CHIP INVENTORY. Home renders coloured pills with a "↘" glyph; Plan renders plain text
  with a "↓" glyph. Enumerate EVERY delta / trend / vs-last-period indicator in apps/web and
  report per site: glyph, colour rule, wording, and container treatment. Report the SET, not a
  judgement. Additionally: state how each site behaves when the current period has NO DATA — a
  "-100.0% vs last month" rendered GREEN because expenses fell to zero for want of rows reads as
  an achievement, and whether that is distinguishable from a real decrease is a question about
  the code, not about taste.

M6 — LAYOUT, OVERFLOW, AND AN RTL PRE-CHECK. Observed on Insights: "This Week" and "Month
  Snapshot" sit side by side at visibly DIFFERENT HEIGHTS; the SAFE-TO-SPEND TODAY tile's content
  is CLIPPED at the card's right edge ("Days until payday: 29" runs past the boundary); and the
  FREE TO SPEND value "KD 1,800.000" reaches its tile's right edge. Report the container
  construction for both cards — grid vs flex, stretch/align behaviour, min-width, overflow, and
  how the long-number case is handled. SEPARATELY, and this is a compliance check the mobile
  track depends on: sweep ALL of apps/web/src for physical-property spacing classes
  (ml-/mr-/pl-/pr-) per CLAUDE.md:482 and report the count and the file:line list. Quote every
  glob-bearing argument (zsh nomatch), and note that 0 is what a failed command also prints
  (10e-R150) — pair it with a positive control on a pattern known to match.

M7 — RECURRING COMMITMENTS. The operator wants this surface to show only transactions under the
  subscription category. Report ONLY: what R12's grouping key actually is
  (lib/intelligence-lib.ts buildRecurringPatternsPayload / classifyRecurringGroup); whether
  category participates in it AT ALL; what RecurringCommitmentsCard renders and where each field
  is derived; whether any first-class notion of a "subscription" category exists, or whether
  categories are wholly user-defined with no reserved names; and which tests pin R12 against
  captured Flask fixtures. DO NOT DESIGN A FILTER. The operator's requirement is not yet
  expressible until the last question is answered.

M8 — THE COST OF B4-3-R2, MEASURED ONCE. apps/web/tsconfig.json excludes src/**/*.test.ts(x), so
  NO frontend test file is type-checked by any command, in CI or locally. The cost has never been
  measured. Remove the exclusion, run the frontend tsc, CAPTURE THE ERROR COUNT AND THE EXIT
  CODE, restore the file, and prove the tree clean with git status --short READ, not with an exit
  code. PREDICTION: a NON-ZERO error count. A ZERO IS A FULL STOP AND A QUESTION, because zero is
  also what a command that never ran emits (10e-R150) — so pair the run with a deliberate
  one-line type error proving the invocation can go red, then remove it. Nothing is fixed here.

M9 — THE PLAYWRIGHT SUITE, MEASURED NOT FIXED. It is not a CI gate and is known rotted. Run it,
  capture pass/fail/exit, and report the failure classes. Do NOT repair, revive or delete
  anything — rewriting tests inside a dead suite manufactures apparent-but-inactive coverage.

M10 — THE CONSISTENCY SWEEP. The operator is explicit that inconsistency is intolerable, so this
  is a first-class deliverable and not a footnote. Produce a TABLE across Home, Plan, Insights and
  Transactions covering at minimum: presence and wording of an H1 (Plan has "Plan your monthly
  budgets"; Home appears to have a breadcrumb and a description sentence with no heading);
  currency formatting and decimal count; "KD" placement and spacing; date formats; delta glyph
  and colour; label casing; empty-state copy and its call-to-action; and the right-aligned
  subtitle pattern ("Actionable runway for the rest of this month", "TOTAL BUDGET — THIS MONTH").
  Report DIVERGENCES as a list. Do not resolve them.

REPORT FORMAT. One report, M1…M10 in order, each with its captured evidence PASTED rather than
pointed at (10e-R112). Where a figure is a count, show the command and its output. Where a claim
is about a file, show grep -n output rather than a description. HARD STOP after the report.
Nothing is committed and nothing is pushed.

FF-R3 — PHASE A IS ACCEPTED. One defect found, three reclassifications confirmed, two channel claims falsified. No work is opened by this block.

THE DEFECT, and it is one line of copy. dashboard/sections.tsx:382 renders "No income detected
yet." behind a gate that is aggregation.ts:726 `data_complete: monthlyIncome !== null &&
totalBudget.gt(0)`. The copy names INCOME; the gate is BUDGETS. A user with income resolved and
no budget for the month is told a fact the branch condition never tested. Provable from source
without a database, and it does not depend on the M3 reconstruction being right.

TWO CHANNEL CLAIMS FALSIFIED, both recorded as falsifications rather than quietly dropped:
  (1) The channel proposed the 9.1 defect class — a surface handling only the detected arm.
      FALSE. Every income_source comparison uses === 'not_set' correctly (sections.tsx:228,
      :232-233) and both arms render (:355, :360). The 9.1 fix is INTACT. The instruction was to
      try to break the hypothesis rather than confirm it, and breaking it is what located the
      actual line.
  (2) The channel claimed a fresh demo load yields an all-zero current month. FALSE. A load on
      2026-08-27 writes 14 transactions dated within 2026-08, including Monthly salary 1800.000
      on the 25th.

R4-vs-R9 IS NOT A DEFECT. R4's total_income_mtd is only ever a transaction sum with no fallback;
R9 resolves detected → declared → not_set (income-lib.ts:52-76). They answer different questions
and disagree correctly whenever income is declared-but-not-transacted. The channel's
"contradiction" framing is WITHDRAWN.

THE SEED DECAY, found in passing and worse than what was looked for. demo-data-lib.ts:439 writes
all seven budgets for currentMonthKey() ONLY, while transactions span six months. A demo loaded
in month M yields, on the first day of M+1, zero transactions in view, ZERO BUDGETS,
data_complete = false, and the :382 copy — while Insights spends the profile's declared 1800.
M3 AND M4 ARE THE SAME EVENT ONE MONTH APART. This is a second, independent argument for FF-R1's
pre-auth writes-nothing demo: a demo that writes nothing cannot decay. NOT OPENED.

THE THREE RECLASSIFICATIONS ARE CONFIRMED BY MEASUREMENT, unchanged from FF-R2 where they were
recorded in advance:
  (i)   Recurring-commitments filter — BACKEND, and worse than a filter: R12's grouping key is
        the lower-cased transaction NAME alone (intelligence-lib.ts:217-219), category
        participates nowhere in it, and db/schema/categories.ts carries only is_income — no
        reserved names, no system flag. THE REQUEST IS NOT YET EXPRESSIBLE. Three candidate
        products are recorded for the operator, none chosen: filter the existing heuristic
        Subscriptions group (no schema change, inherits an English 12-keyword list's failures);
        user-selected categories (needs a settings surface and storage); is_subscription flag
        (a migration). OPERATOR DECISION. Hazard recorded: R12's Flask equivalence is pinned by
        IN-FILE hardcoded expectations, not a committed fixture file.
  (ii)  KPI rework — DESIGN TRACK, under ink-and-brass. SpendForecastWidget.tsx:68 is
        simultaneously the brass slot, an M6 overflow site, and enlarged by the R6 WCAG ruling.
        Three constraints on one element; it cannot be restyled casually.
  (iii) Income contradiction — class now KNOWN: FRONTEND, at sections.tsx:382.

THE DELTA FINDING WAS NOT REQUESTED AND IS THE SHARPEST IN THE REPORT. No delta site has any
concept of the CURRENT period having no data; both systems guard only the baseline. On Home,
Expenses carries `inverted`, so at −100 it renders a GREEN SUCCESS PILL reading "100.0% vs last
month" — an achievement badge for the absence of rows, producing BYTE-IDENTICAL PROPS to a
genuine 100% reduction. Income at −100 renders amber, so one missing month reads as good news
and bad news in adjacent tiles.

MEASUREMENTS RECORDED, none acted on: three money formatters, two decimal conventions, two
thousands-separator conventions, three delta systems with two sign conventions, two date formats
one of which drops the year; B4-3-R2's true cost ~23 genuine errors across 6 files plus one
config line, NOT the raw 58, of which 35 are one file's missing vitest globals; the Playwright
suite 0 passed / 36 failed with NO BACKEND PROVISIONED, its first 38-failure run carrying ZERO
information and reported as such, and the honest limit named — the failure count cannot
distinguish "stale" from "would pass against a live backend"; 32 pre-existing physical-property
sites across 12 files with components/ui/ clean and the zero proven discriminating.

TWO INSTRUMENT NOTES, RATIFIED. The M8 red run is its OWN positive control — 58 diagnostics with
TS2582s proving test files were CHECKED rather than merely listed — so declining to manufacture
a synthetic error was correct, not a skipped step. And the M9 first run was correctly reported as
carrying zero information about the suite rather than as 38 failures.

THE ENVIRONMENT CHANGE IS ACCEPTED AND THE SELF-REPORT IS WHY. Pruning chromium-1228 before
knowing the retry would succeed destroyed a recoverable state for an unrecoverable reason; the
net position is better, since 1228 could never have run this suite. Declaring it unprompted is
what makes it a report rather than a discovery. Nothing owed.

NO NEW CLAUDE.md STANDING LINE. The count stays at SIX. Nothing in this Phase A earned a rule;
every discipline it exercised is already written.

NOTHING IS OPENED BY THIS BLOCK. Phase B is not scoped here and awaits three operator decisions.

FF-R4 — a39a0cb IS ACCEPTED. Two departures ratified, two bounded unknowns recorded.

PROVENANCE, STATED AND NOT BACKDATED (10e-R147 disposition). This ruling was issued as PROSE in a
message to the operator and never given block form or a paste fence, so there was nothing for the
relay to carry. It is a CHANNEL AUTHORING DEFECT — not a lost artifact, not a persistence failure,
not a relay fault. Nothing was lost. It is written in block form here, in its numbered position,
with its original date. Detected by the implementer's open enumeration reporting it MISSING while
FF-R5 cited it twice: the FIFTH occasion in this project that enumeration is the only instrument
to detect a ledger fault, after R196–R202, R205–R209, R243 and R264.

a39a0cb IS ACCEPTED. Collision sweep: count route 3, enumeration route 1/2/3, agreement between
the routes being what makes a spurious match visible. Detection control fires at 1 on a synthetic
column-0 citation. Negative control ^FF-R0 —  = 0 run AFTER the file existed, with test -f, since
a missing file greps to 0 identically. Ten per-item assertions against (i)…(v). Line count 688
reconciled by reconstruction with an off-by-one control at 687. Docs-only by exclusion with two
synthetic non-docs paths proving the exclusion discriminates.

  DELIVERABLE (v) IS THE ONE WORTH NAMING: `git status --short -- CLAUDE.md` = 0 tests a NEGATIVE
  deliverable positively. The ruled item was "do not edit CLAUDE.md", and an assertion that the
  file is untouched is how a prohibition is proven honoured rather than merely unmentioned. That
  is the omission class that let 10e's bounded-unknown record go unwritten while every
  block-level check passed.

DEPARTURE 1 — SWEEP ORDERING INVERTED. RATIFIED, WITH ITS BOUNDARY STATED. The file was written
then swept; FF-R3 ruled the reverse. No consequence followed, and the reason is precise:
10e-R257's "both remedies are forbidden after the fact" describes an append to an ESTABLISHED,
PERSISTED record — one remedy edits a verbatim block, the other corrupts the index. Neither
applied to a NEW, UNCOMMITTED file discardable whole. THAT IS A BOUNDARY, NOT A GENERAL LICENCE:
docs/modules/phase4-frontend-fixes.md is now committed, and every future append to it sits in
exactly the state R257 was written for. Recorded so this clean result is not read next cycle as
evidence the ordering is optional. No new rule; R257 is correct as written and was inverted once.

DEPARTURE 2 — COMMITTED TO main RATHER THAN BRANCHING. RATIFIED. This repo's entire lineage
commits to main and the workflow is fast-forward-then-push; a branch would have made "the push is
the operator's" mean something other than intended. Flagged rather than chosen silently.

BOUNDED UNKNOWN 1 — VERBATIM FIDELITY IS NOT MECHANICALLY VERIFIED. The blocks and the report were
transcribed from conversation text with no file to diff against, so 10e-R256 could not be
satisfied: the source was never a tool's output. SYMMETRIC — the same limitation applied to the
channel's relay of 10e-R265…R268 and was flagged then. The mitigation stands: derive any
load-bearing string from the source a block CITES, never retype it from the block. STRENGTHENED,
and this is why the unknown is bounded rather than open: FF-R3's load-bearing content is almost
entirely FILE:LINE CITATIONS AND MEASURED FIGURES, every one of which is CHECKABLE AGAINST THE
TREE. A future reader validating it has a BETTER instrument than the missing diff. The
transcription risk is concentrated in the prose, not in the claims that carry weight.

BOUNDED UNKNOWN 2 — PRESENCE ASSERTIONS TEST PRESENCE, NOT INTERIOR CONTENT. Unknown 1 restated
where it bites. Correct, and correctly not padded into a third entry.

FF-R5 — OPERATOR RULING BY DELEGATION, 2026-08-27. Phase B scope set at four items; the convention work moves to the mobile track. Two decisions remain OPEN and are named as open. One channel scope error is corrected.

ATTRIBUTION. The operator elected by delegation ("Let's go with your recommendation."),
2026-08-27, on the channel recommendations stated in the FF-R4 message. Recorded as an OPERATOR
RULING BY DELEGATION, not as an implementer or channel choice.

WHAT THE DELEGATION COVERS, AND WHAT IT CANNOT. It covers the two things the channel actually
recommended: the four-item Phase B scope, and moving the currency/delta/label convention work
into the MOBILE track so it is done once over components that track will reopen anyway, with the
32 pre-existing physical-property sites swept in the same pass.

  IT DOES NOT COVER THE SUBSCRIPTIONS DECISION. The channel explicitly DECLINED to choose among
  the three candidates, so there is no recommendation for a delegation to land on. Silence is not
  a choice, and inferring one from "go with your recommendation" would manufacture an operator
  ruling out of a refusal to make one. OPEN.

  IT DOES NOT COVER THE KPI VISUAL-VS-INFORMATIONAL QUESTION. The channel offered a READ — that
  the row shows correct numbers about an empty month and no restyling fixes that — which is an
  assessment, not a recommendation with an action attached. OPEN.

  Neither blocks Phase B. Both are recorded as OPEN so a later reader cannot mistake an
  unanswered question for a settled one.

A CHANNEL SCOPE ERROR, CORRECTED BEFORE IT REACHES A PROPOSAL. FF-R4 said "whitespace-nowrap off
the two prose labels." There is ONE prose label. WeeklyDigestSection.tsx:121 is prose ("Days
until payday: {n}") and is the site actually CLIPPED in the operator's screenshot.
SpendForecastWidget.tsx:68 is a NUMBER ("KD 1,800.000"), where nowrap is DEFENSIBLE — removing it
would break a money value across lines, which is worse than a tight fit. The two sites share a
class name and not a remedy. Corrected here rather than in the proposal, because a proposal built
on the wrong scope produces a correct-looking commit against a wrong mandate.

PHASE B IS A PROPOSAL. Four items. Produce a written proposal, no code, no commit. For each item:
the exact change, the file:line, the tests that must move and why, and the RED-FIRST proof
planned. Deviations and discoveries are STOP-AND-ASK, never autonomous resolution.

ITEM 1 — sections.tsx:382, the copy that names income while its gate names budgets.
  BEFORE PROPOSING COPY, ESTABLISH ARM 3's REACHABILITY EXHAUSTIVELY. The chain is
  data_complete ? full : incomeNeedsSetup ? "Set your income" : ARM 3. Determine, from source,
  EVERY state that reaches arm 3, and state the reasoning. The channel's expectation, offered so
  it can be FALSIFIED rather than confirmed: arm 2's `monthlyIncome <= 0` is true for a null
  monthlyIncome under JS coercion, so arm 2 absorbs the income-absent case and arm 3 is reachable
  ONLY with income resolved and totalBudget = 0. IF THAT IS WRONG AND ARM 3 HAS MORE THAN ONE
  CAUSE, STOP AND REPORT — one string cannot honestly name two causes, and a string naming
  budgets would then be false on the other path, which is the defect relocated rather than fixed.
  Confirm also whether the existing "Open Plan" CTA is already correct for a budgets cause; if it
  is, say so — a fix that changes only the copy is smaller than one that changes both.

ITEM 2 — InsightsPage.tsx:357, `items-start` overriding CSS Grid's default stretch, which is the
  ragged bottom edge. Propose its removal. State what the two cards look like stretched, and
  whether any child depends on the shrink-to-content height.

ITEM 3 — WeeklyDigestSection.tsx:121, whitespace-nowrap on a prose label in a 3-across tile with
  no min-w-0 and no overflow handling. Propose removing it from THE PROSE LABEL ONLY; the number
  at :120 keeps it. SEPARATELY, for SpendForecastWidget.tsx:68: REPORT ONLY, DO NOT PROPOSE A FIX
  IN THIS COMMIT. That element is simultaneously the brass slot under the ink-and-brass ration,
  an overflow site, and enlarged by the R6 WCAG ruling — three constraints on one element, and it
  belongs to the design/mobile track. Report the options you can see; choose none.

ITEM 4 — the no-current-data delta case. On Home, Expenses carries `inverted`, so a −100 delta
  caused by ABSENT ROWS renders a GREEN success pill reading "100.0% vs last month", with props
  BYTE-IDENTICAL to a genuine 100% reduction.
  THE PRINCIPLED FIX IS SYMMETRY, NOT A NEW POLICY. DashboardPage.tsx:253-265 ALREADY suppresses
  the chip when the PREVIOUS period is empty. Applying the same treatment when the CURRENT period
  is empty is the existing policy applied to the other side, which is why it is preferred over
  inventing neutral styling or new wording.
  DETERMINE WHETHER A "CURRENT PERIOD HAS NO DATA" SIGNAL EXISTS or must be derived, and from
  what. Propose the mechanism; do not write it. If suppression would hide a legitimately-zero
  period that genuinely has rows, SAY SO — suppressing real information to fix a misleading
  rendering is a worse trade and the operator rules it, not you.

CONSTRAINTS BINDING THIS PROPOSAL, cited not restated: logical properties only, no ml-/mr-/pl-/pr-
additions (CLAUDE.md:482); CSP enforcing with no Report-Only net, any new external origin lands in
deploy/Caddyfile in the SAME commit (CLAUDE.md:470); no renames; QuickAdd internals untouchable;
pinned strings; and the three NAMED REGRESSION FILES stay green AND untouched —
components/layout/AppShell.test.tsx, components/pages/legal/PrivacyPolicyPage.test.tsx,
components/pages/legal/TermsPage.test.tsx.

TEST IMPACT IS A PREDICTION, NOT AN ALLOWANCE. "No test impact expected" is a claim to be
verified. ANY red test, and ANY forced selector or class edit to a test, is a NAMED FORCED EDIT
requiring explicit approval BEFORE it ships. Predict the delta for each item and state what each
check would read IF THE CHANGE HAD NOT LANDED — a check whose negative case equals its positive
case is not a check.

THE CONVENTION WORK IS DEFERRED TO THE MOBILE TRACK, NOT DROPPED. Three money formatters, two
decimal conventions, two thousands-separator conventions, three delta systems with two sign
conventions, two date formats one of which drops the year, the M10 label/heading divergences, and
the 32 physical-property sites. NONE of it is in scope here. Do not tidy any of it in passing —
an unrequested convention edit inside a four-item fix commit is the scope creep this split
exists to prevent.

NOTHING IS IMPLEMENTED BY THIS BLOCK.

FF-R6 — PHASE B PROPOSAL ACCEPTED. Copy and Item 2 approved by the operator. Item 4 gated on one pre-check. Two channel errors corrected adjacent, neither by editing anything.

CHANNEL ERROR 1 — A LINE NUMBER PROPAGATED FROM A DOCUMENT INTO A RULING. Phase A recorded
WeeklyDigestSection.tsx:120-122; the tree says :115 (number), :116 (prose className), :117 (prose
text). The file is byte-identical since Phase A, so this was mis-transcription at authorship, not
drift. THE CHANNEL THEN READ THAT FIGURE OUT OF THE PHASE A DOCUMENT AND WROTE :121 INTO FF-R5 —
a figure derived from a document about the artifact rather than from the artifact, propagating
into a ruling. That is 10e-R182's exact failure mode, committed by the channel one commit after
persisting the rule.
  DISPOSITIONS, NEITHER OF THEM AN EDIT. The Phase A report is a HISTORICAL RECORD and is NOT
  corrected in place. FF-R5 is NOT amended either: it is unpersisted, but 10e-R257's
  pre-persistence reissue licence is NON-SEMANTIC LAYOUT ONLY, and a line number is semantic.
  FF-R5's text stands with :121; this block corrects it adjacent (10e-R148 precedent). Both
  persist together so a reader sees the error and its correction side by side. THE OPERATIVE LINE
  IS :116. The implementer proceeded against the correct line because the element was unambiguous
  by description — the mandate was intact.

CHANNEL ERROR 2 — "the two prose labels" in the FF-R4 message. There is ONE. Already corrected in
FF-R5 and restated here only so the correction is inside a persisted block.

ITEM 1 — ACCEPTED. The reachability proof is airtight and its load-bearing step is that arm 2's
two disjuncts are PROVABLY EQUIVALENT, not independent: warnings.includes("income_not_set") ⟺
monthlyIncome === null (aggregation.ts:705), and resolveIncomeForPeriod returns null or strictly
> 0, both non-null arms .gt(0)-guarded (income-lib.ts:58, :70). Arm 2 therefore absorbs the entire
income-absent case and ARM 3 HAS EXACTLY ONE CAUSE: income resolved AND month budget total = 0.
The NaN path is correctly NAMED as requiring a contract violation rather than dismissed. CTA
verified already correct, so the fix is COPY-ONLY.

  OPERATOR-APPROVED COPY, 2026-08-27, verbatim and not to be paraphrased:
    Title: No budget set for this month.
    Body:  Safe-to-spend compares your income against your planned budget. Set a budget for this
           month to start seeing a daily figure.
  WHY "Set a budget" AND NOT "add at least one budget category": the gate is totalBudget.gt(0),
  an AMOUNT, not a COUNT. If a zero-amount budget is creatable, a count-shaped promise is FALSE on
  that path — a new true-sounding statement the code did not check, which is this defect one
  sentence over. The approved wording avoids the question rather than answering it.
  DERIVE THESE STRINGS FROM THIS BLOCK BY COPY, NEVER BY RETYPING (10e-R249/R256).

  QUEUED, NOT OPENED, AND MORE INTERESTING THAN THE FIX: this makes the copy honest about a gate
  that may itself be wrong. R9 computes free-to-spend as income − committed − spent, which works
  with committed = 0 — and Insights PROVES it, rendering FREE TO SPEND 1,800.000 with COMMITTED
  0.000 from the SAME payload Home suppresses. Home hides a card Insights shows. Product decision,
  operator's, NOT in this commit.

ITEM 2 — APPROVED BY THE OPERATOR, 2026-08-27, on the channel recommendation that aligned edges
read as intentional while trailing space inside a card reads as breathing room. Remove
items-start. The dependency sweep was DONE rather than assumed. THE ZERO-TEST GAP IS APPROVED and
the reasoning is why: jsdom computes no layout, so a className assertion restates the diff and its
negative case equals its positive case. Writing it would manufacture apparent coverage. Recorded
as a DELIBERATE COVERAGE GAP.

ITEM 3 — ACCEPTED at :116, prose label only; the number at :115 keeps whitespace-nowrap. THE
min-w-0 ANALYSIS IS RATIFIED: grid items default to min-width:auto, so under whitespace-nowrap the
min-content width IS the whole string — min-w-0 would let the track shrink while the text still
refuses to wrap, CONVERTING OVERFLOW INTO CLIPPING. No min-w-0.
  ONE SHARPENING ON THE GREEN-TEST REASONING: the existing test staying green proves the edit did
  not touch TEXT; it does NOT prove the edit HAPPENED — a no-op is equally green. The diff carries
  that half. Two instruments, two jobs.
  SpendForecastWidget.tsx:68 REPORT-ONLY DEFERRAL CONFIRMED; the six-option table showing every
  route landing in the design or mobile track is the EVIDENCE for the deferral, not an assertion.

ITEM 4 — PROOF ACCEPTED ABOUT THE DATA, INCOMPLETE ABOUT THE LOOKUP. GATED.
  Two checks exceeded the mandate and are ratified: verifying chk_transactions_amount_positive
  reached APPLIED DDL (0000_cultured_jimmy_woo.sql:70, carried in meta/0007_snapshot.json) rather
  than living only in the schema file — the committed-≠-active class; and catching that *_mtd is a
  FLASK-INHERITED MISNOMER with both queries bounded date >= monthStart AND date <= monthEnd. Had
  they been true month-to-date, every delta would be structurally negative and suppression would
  have been treating a symptom.
  THE GAP: the proof establishes 0/0 ⟺ no rows about the DATA. The guard reads the LOOKUP.
  Current-month figures come from R4 account_overview when present and fall back to monthlyKpiMap
  from R3 monthly[] when absent — AND A LOOKUP MISS ALSO YIELDS 0/0, byte-identical to a genuinely
  empty month. That is 10e-R150 on this figure: the failure output equals the predicted success
  value and the guard cannot separate them.

  PRE-CHECK, REPORT BEFORE WRITING THE GUARD:
    (a) R3 monthly[]'s window bounds, from source. Can the selected month fall outside it?
    (b) Does the fallback distinguish an ABSENT entry from a ZERO entry, or does it default to 0?
    (c) Are the guard's operands the COERCED NUMBERS from DashboardPage.tsx:109-110? "0.000" === 0
        is FALSE, and a string reaching that comparison makes the guard SILENTLY NEVER FIRE.
    If (a) or (b) shows a lookup miss is indistinguishable from an empty month, the guard needs a
    PRESENCE condition, not only a VALUE condition. STOP AND REPORT rather than writing either.
  FF-R5's "SAY SO" CLAUSE IS ANSWERED AND CLOSED: suppression cannot hide a legitimately-zero
  period that genuinely has rows, because the DB CHECK forbids such a period existing. No
  trade-off for the operator to rule.
  MECHANISM APPROVED SUBJECT TO THE PRE-CHECK: the guard mirrors the one prevMonthKpis already
  applies, so the existing rule "no baseline → no chips" becomes "no baseline or no current data →
  no chips". All four chips vanish together. NO new colour, NO new copy, NO new prop.

IMPLEMENT, one commit, four items. Items 1, 2 and 3 proceed independently of Item 4's gate.
Test-impact predictions stand as the implementer stated them: +1 (safe-to-spend.test.tsx), 0, 0,
+1 (DashboardPage.test.tsx); frontend 209 → 211, files 41 unchanged; api untouched but RUN, since
contract/frontend-contract.test.ts reads the frontend fixture — fixture predicted 66, ALLOWLIST
empty, VERIFIED not assumed. A MISS IS A QUESTION, NOT AN ADJUSTMENT (10e-R137b). Both new tests
RED-FIRST with the red captured. Named forced edits: NONE predicted; any red test or any forced
selector/class edit STOPS and asks BEFORE it ships. The three named regression files stay green
AND untouched.

CONSTRAINTS: zero physical-property additions (CLAUDE.md:482); no new external origin, no
Caddyfile change (CLAUDE.md:470); no renames; QuickAdd untouched; pinned strings untouched. NO
CONVENTION WORK IN PASSING — the three formatters, two decimal conventions, two separator
conventions, three delta systems, two date formats, M10 divergences and 32 physical-property sites
are DEFERRED TO THE MOBILE TRACK and are not to be tidied here.

CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS (CLAUDE.md:436): the verbatim test tail INCLUDING
the Test Files summary line with captured exit code for the exact CI commands, each with a
10e-R246 RESOLUTION PROOF; the verbatim tsc --noEmit output and exit code for both packages; and
the baseline hunk old → new. Missing any is an auto-return.

NO CLAUDE.md EDIT IN THIS COMMIT. The baseline line moves at track close, not per sub-commit.
Persistence of FF-R4, FF-R5 and FF-R6 rides the close-out commit, not this one.

FF-R7 — PHASE B ACCEPTED. The unrequested control case is RATIFIED and KEPT. Prediction corrected to +3. One latent hazard queued.

THE PREDICTION MISS WAS INVESTIGATED, NOT ABSORBED, AND THE OVERSHOOT IS RIGHT. +3 against +2,
caused by a second, unrequested control case on Item 4 — "still passes hero deltas when the
selected month has rows." KEPT. No existing test asserts deltas at all, so A GUARD THAT RETURNED
null UNCONDITIONALLY WOULD HAVE PASSED THE TARGET ASSERTION. Without the control, Item 4's test
proves the chips vanish and says nothing about whether they ever appear — a check whose negative
case equals its positive case. This is 10e-R198 applied IN CONSTRUCTION rather than in review: to
attribute weight to a case you need the neighbour that survives, written in advance instead of
discovered missing later. FLAGGING IT RATHER THAN ABSORBING IT IS WHAT MAKES IT ACCEPTABLE — a
judgement outside the approved plan, declared as the implementer's own with the removal cost
stated, is a REQUEST; arriving silently inside an unquestioned +3 it would have been the
self-grant class. THE PREDICTED DELTA IS CORRECTED TO +3 / 41 files. Frontend baseline 212/41.

ITEM 4's GATE CLOSED THE RIGHT WAY. (a) dashboard-snapshot-lib.ts:244 builds monthly as
monthKeys.map(...) and :259 returns months: monthKeys — the same array, 1:1, zero-filled — and
selectedMonth is constrained to options derived from months, so a miss is structurally impossible
post-load; pre-load prevMonthKpis returns null and heroDeltas short-circuits first. The 10e-R150
concern is closed BY CONSTRUCTION rather than by a defensive condition, which is the better
outcome. (c) Both operands are statically guaranteed numbers, so === 0 cannot silently never-fire.
  THE CHECK NOBODY ASKED FOR IS THE ONE WORTH KEEPING: no placeholderData/keepPreviousData on the
  bundle query (hooks.ts:44-49), so a month switch drops accountOverview to undefined rather than
  serving the prior month's figures. HAD IT CACHED, THE GUARD WOULD HAVE READ ONE MONTH'S NUMBERS
  AGAINST ANOTHER'S — a correct guard producing wrong answers, invisible to every test.

FF-R7(a) — LATENT HAZARD, QUEUED WITH ITS TRIGGER, NOT OPENED. `?.income || 0` does NOT
distinguish an ABSENT entry from a ZERO one, and is unreachable today ONLY because months and
monthly are the same array. That is a correctness property resting on a construction detail in a
different file with nothing asserting it. TRIGGER: any change making monthly anything other than
a 1:1 zero-filled map of months. On that day `|| 0` starts reporting LOOKUP MISS as EMPTY MONTH
and the guard silently suppresses chips for months that have data, with no test going red. NOT
FIXED HERE — a defensive presence check today would be code with no reachable failure to guard.

EVERYTHING ELSE RECONCILES. RED-first captured on both new cases, and Item 1's red is the good
kind: the target string absent WITH THE OLD STRING PRESENT TWICE in the dumped DOM, proving the
case reached arm 3 rather than failing somewhere unrelated. Item 4's red printed
expensesDelta: -100, the exact value rendering the green success pill, with the control passing in
the same run — the two cases were discriminating BEFORE the fix. Resolution proofs on both
filters with a non-matching filter exiting 0. Test tails carry the Test Files line with captured
exit codes. tsc 0 bytes both packages. Fixture 66 and ALLOWLIST = [] derived from the file. Three
named regression files green and untouched via empty git diff --stat. Zero physical-property
additions with a positive control. `git status --short -- CLAUDE.md` = 0 — the negative
deliverable tested positively again. Production diff is four edits, five of six added lines being
a rationale comment. No convention work leaked in.

FF-R8 — PHASE B IS VERIFIED IN PRODUCTION BY OPERATOR OBSERVATION. THE TRACK CLOSES. Eight new findings are QUEUED to the mobile track, seven of them one root cause.

PRODUCTION VERIFICATION, OPERATOR-OBSERVED 2026-08-29, AND ITS EVIDENCE CLASS IS STATED. Three of
the four items are CONFIRMED LIVE against the deployed build by operator screenshot: Item 1 —
"No budget set for this month." with the approved body copy and the unchanged Open Plan CTA,
rendering at 81 transactions and 0 budgets, which is arm 3 in exactly the state the reachability
proof predicted; Item 2 — This Week and Month Snapshot bottom-aligned; Item 3 — "Days until
payday: 27" wrapping inside its tile rather than clipping.
  ITEM 2 IS THE ONE THAT MATTERS HERE. It shipped with a DELIBERATE ZERO-TEST GAP because jsdom
  computes no layout, so this operator observation is THE ONLY INSTRUMENT THAT HAS EVER CHECKED
  IT. Recorded as such, not as a formality.
  ITEM 4 IS NOT VERIFIED IN PRODUCTION and that is stated rather than assumed: no observed month
  had zero rows with a populated previous month, so the guard's live behaviour is UNOBSERVED. Its
  evidence is the RED-first unit proof plus the control case, which is real evidence and is not
  the same thing.
  A FIRST OBSERVATION ROUND WAS DISCARDED, and the operator's own diagnosis is recorded because
  it is the right one: the screenshots were taken after the push but BEFORE the deploy landed.
  The channel questioned the unchanged card heights, the operator identified the cause. This is
  10e-R267's stale-pre-deploy-reading class recurring at the operator seam — a push is not a
  deploy, and a UI observation is only evidence against the build actually serving.

EIGHT FINDINGS, QUEUED TO THE MOBILE TRACK, NONE OPENED, NONE FIXED HERE.
  SEVEN OF THEM ARE ONE ROOT CAUSE: THE APP DOES NOT DISTINGUISH ZERO FROM NO DATA. With budget
  total 0 it renders "% USED 0.0%" beside spend of 682 while its own caption reads "Over budget
  this month"; "Budget / Income 0.0%" badged WITHIN INCOME; "Housing is KD 542 over plan" where
  Housing has no plan at all; and "12 of 12 visible months finished with income ahead of
  expenses" where seven of the twelve are flat zero on both series. THIS IS THE SAME CLASS AS THE
  DELTA CHIP ITEM 4 JUST FIXED, and that is the finding worth carrying: the fix was correct and
  the class is wider than the site.
  THE REMAINING FOUR, RECORDED SEPARATELY: (i) two different daily safe-to-spend figures on two
  pages at the same moment, Home 609.000 and Insights 639.000 — a divergence, not a formatting
  question, and the one item here that may not be cosmetic; (ii) "% USED 1136.7%", a four-digit
  percentage in a KPI tile with no display cap; (iii) the Budget-vs-Spending legend declaring
  Spent = black while no bar is black, now unmissable because with no budgets every bar is a
  spent bar; (iv) the Home headline rounding to "KD 1.3K in reserve" directly above REMAINING
  KD 1,278.000.
  THE WITHIN-INCOME BADGE APPEARS NON-DISCRIMINATING — observed reading WITHIN INCOME at 0.0%,
  3.1% and 45.4% Budget/Income, the last while Home simultaneously warned that commitments
  exceeded 40% of income. Recorded as an OBSERVATION with its falsifier: if a ratio exists that
  flips it, the badge is fine and only its threshold disagrees with Home's. UNMEASURED.

THE TRACK CLOSES. Four items shipped, three verified in production. The convention work — three
money formatters, two decimal conventions, two thousands-separator conventions, three delta
systems with two sign conventions, two date formats one of which drops the year, the M10
heading/label divergences and 32 pre-existing physical-property sites — is DEFERRED TO THE MOBILE
TRACK by operator ruling by delegation, 2026-08-27, and the zero-vs-no-data class joins it as its
own item. Queue items recorded and not opened: the subscriptions definition (three candidates,
none chosen, and the requirement is not expressible until one is); the KPI visual-vs-informational
question; Home suppressing a card Insights renders from the same payload; the demo seed's
one-month budget shelf life; and FF-R7(a).

NO NEW CLAUDE.md STANDING LINE. The count stays at SIX. Nothing in this track earned a rule;
every discipline it exercised is already written.
---

## Phase A measurement report, verbatim as submitted

# PHASE A — phase4-frontend-fixes — MEASUREMENT REPORT

**Repo state:** `d0e06cc` (`phase-4: 10e deploy record — MODULE 10e CLOSED`), working tree clean at start and at end. No code written, no fix applied, nothing committed.

**Ruling blocks held (unpersisted):** FF-R1, FF-R2. Both received verbatim. I hold no other FF-numbered block.

**One environment change I made, declared up front (not a tree change):** M9 required Playwright browsers. My first `playwright install` **pruned the existing chromium-1228 binaries and then failed on a transient DNS error**, leaving the cache holding only `ffmpeg-1011`. A retry succeeded and the cache now holds `chromium-1217` + `chromium_headless_shell-1217`, which is the revision the runner actually needs (1228 could never have run this suite). Net effect is a correct environment, but I destroyed the prior state before knowing the download would work, and that was avoidable.

---

## M1 — Baselines, re-derived at execution

**Resolution proofs first (10e-R246).** The hazard is real here:

```
$ pnpm --filter statera-frontend exec node -e 'console.log("MATCHED-FRONTEND")'
MATCHED-FRONTEND
EXIT:0
$ pnpm --filter statera-api exec node -e 'console.log("MATCHED-API")'
MATCHED-API
EXIT:0
$ pnpm --filter statera-web exec node -e 'console.log("MATCHED-WEB-NEGATIVE-CONTROL")'
No projects matched the filters in "/Users/khaledalrashidi/DevLocal/public-statera"
EXIT:0          ← a non-matching filter EXITS 0 and emits no tail
```

The negative control is the R246 rider in the flesh: `statera-web` is a real name in this project (the Docker image), and selecting on it succeeds silently.

**The four CI commands** (verbatim from [deploy.yml:82-91](.github/workflows/deploy.yml#L82-L91)), each redirected (not piped), `$?` captured on its own line:

| Command | Result | Exit |
|---|---|---|
| `pnpm --filter statera-api exec tsc --noEmit` | 0 bytes of output | `API_TSC_EXIT:0` |
| `pnpm --filter statera-frontend exec tsc --noEmit` | 0 bytes of output | `WEB_TSC_EXIT:0` |
| `pnpm --filter statera-api test` | `Test Files  51 passed \| 10 skipped (61)` / `Tests  873 passed \| 34 skipped (907)` | `API_TEST_EXIT:0` |
| `pnpm --filter statera-frontend run test:unit` | `Test Files  41 passed (41)` / `Tests  209 passed (209)` | `WEB_TEST_EXIT:0` |

Errors instrument (10e-R133 pattern) returns **0** on both suites, and fires **1** on a synthetic `     Errors  3 errors` line — so the zero is discriminating. Per 10e-R134 this remains **one instrument**, not a second opinion on the exit code.

**Contract figures, derived from the files:**

```
$ node -e '...require("./apps/web/contract/frontend-calls.json")...'
type: array
count: 66
```
`ALLOWLIST` at [frontend-contract.test.ts:54](apps/api/src/contract/frontend-contract.test.ts#L54) is `= []` — **length 0**.

**Every stated figure matched: frontend 209/41, api 873/34/61, both tsc 0, fixture 66, ALLOWLIST empty. No miss to investigate.**

---

## M2 — The currency-formatting split

There are **three** money formatters in [lib/utils.ts](apps/web/src/lib/utils.ts), not two, and the Home/Plan divergence is a straight consequence of which one each row calls.

| Formatter | Line | Zero renders as | Notes |
|---|---|---|---|
| `formatKD` | [utils.ts:19](apps/web/src/lib/utils.ts#L19) | `KD 0.000` | 3dp, `toLocaleString`, null-tolerant |
| `formatCompactKD` | [utils.ts:29](apps/web/src/lib/utils.ts#L29) | `KD 0` | **0dp**; ≥1000 becomes `KD 1.8K`; **not** null-tolerant |
| `fmt3` | [utils.ts:44](apps/web/src/lib/utils.ts#L44) | `0.000` | 3dp, no `KD` prefix (callers prepend a literal) |

### Home KPI row — [dashboard/sections.tsx:809-833](apps/web/src/components/pages/dashboard/sections.tsx#L809-L833)

| Tile | Component | Formatter | Field consumed | Wire type |
|---|---|---|---|---|
| Income | `<AnimatedKD>` :811 | `formatKD` (via [:93](apps/web/src/components/pages/dashboard/sections.tsx#L93)) | `account_overview.total_income_mtd` (R4) | **string** |
| Expenses | `<AnimatedKD>` :816 | `formatKD` | `account_overview.total_spend_mtd` (R4) | **string** |
| Remaining | `<AnimatedKD>` :821 | `formatKD` | derived (`income − expenses`) | n/a |
| Savings rate | `<AnimatedPercent>` :829 | `.toFixed(1)` + `%` | derived | n/a |

Fallback path when `accountOverview` is absent: `monthlyKpiMap` from R3 `monthly[].income_kd/expense_kd`, also **string**, coerced at [DashboardPage.tsx:109-110](apps/web/src/components/pages/DashboardPage.tsx#L109-L110).

### Plan KPI row — [budget/sections.tsx:149-172](apps/web/src/components/pages/budget/sections.tsx#L149-L172)

| Tile | Formatter | Field consumed | Wire type |
|---|---|---|---|
| Planned total | `formatCompactKD` :153 | `budgets[].amount_kd` summed via `parseFloat` ([BudgetPage.tsx:122](apps/web/src/components/pages/BudgetPage.tsx#L122)) | **string** |
| Spent so far | `formatCompactKD` :158 | `budgetMetrics.spent_by_category` values summed ([BudgetPage.tsx:126](apps/web/src/components/pages/BudgetPage.tsx#L126)) | **number** (R7 `roundedKd`) |
| Remaining | `formatCompactKD` :164 | derived | n/a |
| % Used | `.toFixed(1)` + `%` | derived | n/a |

**Findings.**

1. **The split is real and is a formatter choice, not a data problem.** Home calls `formatKD` (3dp); Plan calls `formatCompactKD` (0dp, K-suffixed). Same currency, adjacent pages. KWD is 3-decimal by project convention, so **Plan's KPI row is the one that departs from it** — and above KD 1,000 it also abbreviates, so a planned total of `KD 890.000` renders `KD 890` while `KD 1,200.000` renders `KD 1.2K`.
2. **The Plan KPI row mixes wire types within one row** — `Planned total` originates in a **string** field and `Spent so far` in a **number** field ([types/api.ts:73](apps/web/src/types/api.ts#L73) declares `spent_by_category: Record<string, number>`, matching CLAUDE.md's authoritative list of the five `roundedKd` routes). Both are correct today; it is worth knowing they are not the same kind of value.
3. **Sites that bypass the shared formatter entirely** — a literal `KD ` prefix plus `fmt3`/`toFixed(3)`, 20+ sites, e.g. [budget/sections.tsx:513](apps/web/src/components/pages/budget/sections.tsx#L513), [:613-615](apps/web/src/components/pages/budget/sections.tsx#L613-L615), [dialogs.tsx:790](apps/web/src/components/pages/transactions/dialogs.tsx#L790), and every Recharts tooltip (`` `KD ${value.toFixed(3)}` ``). These agree with `formatKD` on decimals but **not on thousands separators** — `formatKD` uses `toLocaleString` (so `KD 1,800.000`), while `fmt3` uses `toFixed` (so `KD 1800.000`).
4. **`formatCompactKD` is not null-tolerant** where its two siblings are (the 2026-07-10 hardening was applied to `formatKD` and `fmt3` only). It returns `KD 0` for `NaN`, so a null arriving there yields `KD NaN`-avoidance only by luck of the `parseFloat` path.

---

## M3 — The income contradiction *(the important one)*

**All four surfaces are fed by exactly two backend answers to two different questions.** That is the whole finding.

### Where each figure comes from

| Surface | Figure | Route | Reads |
|---|---|---|---|
| Home KPI row | `INCOME` / `EXPENSES` | **R4** `account_overview` inside R8 bundle | pure **transaction SUM** for the month |
| Home Safe-to-Spend card | `"No income detected yet."` | **R9** inside R8 bundle | `data_complete` flag |
| Insights "This Week" | `SAFE-TO-SPEND TODAY` | **R10** weekly-digest | `String(safeToSpendPayload.daily_rate_kd)` — [aggregation.ts:1052](apps/api/src/routes/aggregation.ts#L1052) |
| Insights "Month Snapshot" | `FREE TO SPEND` etc. | **R9** direct | `remaining_budget_kd`, `committed_kd`, `actual_spend_kd` |

R8, R9 and R10 all call the **same builder**, `_getSafeToSpendPayloadCached` — [aggregation.ts:1120](apps/api/src/routes/aggregation.ts#L1120), [:927](apps/api/src/routes/aggregation.ts#L927), [:1042](apps/api/src/routes/aggregation.ts#L1042). **Home and Insights are therefore reading the identical R9 payload.** Home is not missing the income; it is choosing not to show it. Both are served from the analytics Redis cache via that builder; the Home KPI numbers come from R4 in the same cached bundle.

### The income-resolution arm

[income-lib.ts:52-76](apps/api/src/lib/income-lib.ts#L52-L76) — precedence is **detected (transaction SUM) → declared (`userProfiles.monthlyIncomeKd`) → not_set**. R4's `total_income_mtd` has **no such fallback**: it is only ever the transaction sum.

**So R4 and R9 answer different questions, and disagree with no bug at all whenever income is declared-but-not-transacted.** That asymmetry is the root of the contradiction.

### The actual defect, provable from source without any database

[dashboard/sections.tsx:286-395](apps/web/src/components/pages/dashboard/sections.tsx#L286-L395) is a three-arm chain:

```
: safeToSpend.data_complete ? ( full card )
: incomeNeedsSetup         ? ( "Set your income" )
: (                            "No income detected yet." )   ← :382
```

with `incomeNeedsSetup` at [:220](apps/web/src/components/pages/dashboard/sections.tsx#L220):
```js
safeToSpend && !safeToSpend.data_complete && (warnings.includes("income_not_set") || monthlyIncome <= 0)
```

and the backend flag at [aggregation.ts:726](apps/api/src/routes/aggregation.ts#L726):
```js
data_complete: monthlyIncome !== null && totalBudget.gt(0),
```

**`data_complete` is false when there are no BUDGETS, regardless of income.** So a user with income resolved and no budget for the month lands in the terminal arm and is told *"No income detected yet."* — **a statement the branch condition never tested.** The copy names income; the gate is budgets.

**The channel hypothesis is half right and half wrong, and I tried to break it rather than confirm it.**
- **CONFIRMED:** Insights resolves via `declared_in_profile` — the demo writes `monthly_income_kd: "1800.000"` ([demo-data-lib.ts:51](apps/api/src/lib/demo-data-lib.ts#L51)), matching the observed `FREE TO SPEND KD 1,800.000` exactly.
- **FALSIFIED:** the Home card does **not** "handle only the detected arm", and this is **not** the 9.1 class. Every `income_source` comparison in the tree uses `=== 'not_set'` correctly ([sections.tsx:228](apps/web/src/components/pages/dashboard/sections.tsx#L228), [:232-233](apps/web/src/components/pages/dashboard/sections.tsx#L232-L233)), and both arms render at [:355](apps/web/src/components/pages/dashboard/sections.tsx#L355) and [:360](apps/web/src/components/pages/dashboard/sections.tsx#L360). The 9.1 fix is intact. The failure is a different mechanism at a different line.

### Reconstruction of the observed state — offered as a reconstruction, with its falsifier

I cannot read the operator's database, so this is arithmetic over the five figures, not a measurement:

- `COMMITTED 0.000` ⇒ `totalBudget = 0` ⇒ **no budgets in the viewed month** (the demo's 7 budgets sum to 890.000).
- `ALREADY SPENT 0.000` ⇒ **no expense transactions** in the cycle.
- `FREE TO SPEND 1800.000` = `1800 − 0 − 0` ⇒ income resolved to exactly 1800 ⇒ **`declared_in_profile`**, not detected (a seeded month containing the salary would also contain rent and groceries, so `spent` could not be 0).
- `SAFE-TO-SPEND TODAY 450.000` = `1800 / days_remaining` ⇒ **`days_remaining = 4`**. On 27 Aug that is a **calendar-month** cycle ending 31 Aug, which [payday-lib.ts:58-60](apps/api/src/lib/payday-lib.ts#L58-L60) produces **only when `paydayDay` is null** — a payday of 25 would have given 28.

Consistent state: profile income 1800 present, **payday unset**, no budgets and no transactions in the viewed month. **Falsifier:** if that account's `user_profiles.payday_day = 25`, the 450 figure is unexplained and this reconstruction is wrong. Note it also means the profile is **not** in the state a clean demo load produces, since `ensureProfile` sets payday whenever it is null.

**The defect in item "the actual defect" above does not depend on any of this reconstruction being right.**

---

## M4 — The demo seed window

**Construction.** [demo-data-lib.ts:191-215](apps/api/src/lib/demo-data-lib.ts#L191-L215): `monthStartFor(offset)` takes `new Date()` at load time and adds the offset; `dateFor(offset, day)` clamps the day into that month. `MONTH_SPECS` ([:118-158](apps/api/src/lib/demo-data-lib.ts#L118-L158)) carries **six** specs at offsets **−5, −4, −3, −2, −1, and 0**. Each yields 12 fixed rows + 1 `extra` + an optional `bonus` (present at −4, −2, 0) = **81 rows**, matching the operator's banner exactly.

**Answer to the question as put: YES.** A load executed on 2026-08-27 produces **14 transactions dated within 2026-08**, including `Monthly salary` **1800.000 on 2026-08-25** and `Apartment rent` 450.000 on 2026-08-01. **The current month is seeded at load time.** The "first-timer lands on an all-zero dashboard" reading is **falsified for a fresh load.**

**But the seed is anchored to the load date and does not follow the calendar, and the budgets are worse than the transactions:**

```js
// demo-data-lib.ts:439
const month = currentMonthKey()
for (const [categoryName, amountKd] of DEMO_BUDGETS) {   // 7 budgets
  const { id, created } = await ensureBudget(tx, month, categoryName, amountKd, userId)
```

**All 7 budgets are written for the load month only.** So a demo loaded in month *M* gives a rich *M* and, on the first day of *M+1*, a dashboard with zero transactions, zero budgets, `data_complete = false`, and the Home card asserting *"No income detected yet."* while Insights spends the profile's 1800. **That is the M3 contradiction and the M4 first-impression problem being the same event, one month apart.**

For track item 3 (no-signup demo) this matters directly: a demo whose realism has a one-month shelf life is a poor first impression for any visitor arriving after the seeding session, and the pre-auth writes-nothing design FF-R1 names would sidestep the decay entirely.

**Falsified in passing:** I hypothesised the zeros came from a stale analytics cache. **Wrong** — [auth.ts:1351](apps/api/src/routes/auth.ts#L1351) and [:1387](apps/api/src/routes/auth.ts#L1387) do bust `cacheBustDashboardMetrics` + `cacheBustSafeToSpend` after both demo load and clear. Census of all non-test callers confirms the demo path is not the omission.

---

## M5 — Delta-chip inventory

**Two independent, non-communicating delta systems.**

**(A) `HeroDelta`** — [dashboard/sections.tsx:108-131](apps/web/src/components/pages/dashboard/sections.tsx#L108-L131). Home only, 4 sites (:812, :817, :822, :830).
- Glyph: lucide `TrendingUp`/`TrendingDown` **icons**, chosen on `value >= 0`.
- Colour: `success` (green) / `warning` (amber) pill with border + tint.
- Wording: `"{abs}% vs last month"` or `"{abs} pts vs last month"`.
- Container: rounded-full bordered pill.
- `inverted` prop flips the colour for Expenses.

**(B) `formatDeltaLabel`** — [utils.ts:162-193](apps/web/src/lib/utils.ts#L162-L193). Plain text, no colour, no container.
- Glyph: literal **`↑` / `↓`** characters.
- Wording: `"↓ 12.3% vs last month"`, plus `"No change vs last month"` and `"No last month baseline"`.
- Sites: Plan ×3 ([BudgetPage.tsx:145](apps/web/src/components/pages/BudgetPage.tsx#L145), [:151](apps/web/src/components/pages/BudgetPage.tsx#L151), [:157](apps/web/src/components/pages/BudgetPage.tsx#L157)), Expenses ×1 ([:730](apps/web/src/components/pages/ExpensesPage.tsx#L730)).

**(C) A third, inline** — [WeeklyDigestSection.tsx:101-108](apps/web/src/components/pages/insights/WeeklyDigestSection.tsx#L101-L108): its own `DeltaIcon` + `deltaTone()`, signed `+`/`−` prefix, `"You spent less than last week."` prose. No pill.

**Divergences:** icon vs text glyph; coloured pill vs plain text; two different sign conventions — (A) divides by `prev` (signed), (B) divides by `Math.abs(previous)`, so they disagree on a negative baseline; and only (B) has "no change" / "no baseline" vocabulary at all.

### The no-data behaviour — this is the substantive part

**No site has any concept of "the current period has no data."** Both systems guard only the **baseline**:

- (A) [DashboardPage.tsx:253-265](apps/web/src/components/pages/DashboardPage.tsx#L253-L265): `prevMonthKpis` returns `null` when the *previous* month is empty, suppressing the chip. When the previous month **has** rows and the current has none, `delta = ((0 − prev)/prev)*100 = −100`.
- (B) [utils.ts:181-183](apps/web/src/lib/utils.ts#L181-L183): `previous === 0` yields the missing-baseline label. Current `=== 0` gets no such treatment.

**Consequence, answering the question as put:** on Home, Expenses is rendered with `inverted`, so `positive = value <= 0` is **true** at −100, and the tile renders a **green success pill reading "100.0% vs last month"** — an achievement badge for the absence of rows. It is **not distinguishable in code** from a genuine 100% reduction in spending: the two states produce byte-identical props. Income at −100 renders amber, so the same missing month reads as bad news and good news in adjacent tiles.

---

## M6 — Layout, overflow, and the RTL pre-check

### The two Insights cards

Container: [InsightsPage.tsx:357](apps/web/src/components/pages/InsightsPage.tsx#L357)
```jsx
<div className="grid items-start gap-6 xl:grid-cols-[1.05fr_0.95fr]">
```

**`items-start` is the explicit cause of the unequal heights.** CSS Grid's default `align-items` is `stretch`, which would have made both cards equal-height for free; `items-start` overrides it to shrink each to its content. So the ragged bottom edge is a deliberate class, not an accident of content — whether it is *wanted* is the open question, but it is one word.

**The clipping** — [WeeklyDigestSection.tsx:120-122](apps/web/src/components/pages/insights/WeeklyDigestSection.tsx#L120-L122):
```jsx
<p className="financial-number whitespace-nowrap text-lg font-semibold">{formatKD(digest.safe_to_spend_today_kd)}</p>
<p className="whitespace-nowrap text-sm text-muted-foreground">
  Days until payday: {digest.days_until_payday === null ? "N/A" : digest.days_until_payday}
</p>
```
`whitespace-nowrap` on a **prose label** inside a 3-across grid tile. The text cannot wrap, the tile has no `min-w-0` and no `overflow` handling, so it runs past the card edge — exactly the observed `Days until payday: 29`. `whitespace-nowrap` is defensible on the *number* (keeps `KD 1,800.000` intact); on the *sentence* it guarantees overflow at narrow widths.

**`FREE TO SPEND` reaching its edge** — [SpendForecastWidget.tsx:68](apps/web/src/components/pages/insights/SpendForecastWidget.tsx#L68) carries the same `whitespace-nowrap` at an enlarged `text-[1.25rem]` (the R6 WCAG enlargement). At 3 columns, `KD 1,800.000` at 20px is simply wider than the tile. Neither tile has a long-number strategy — no truncation, no `formatCompactKD` fallback, no responsive column drop.

### RTL compliance sweep — CLAUDE.md:482

**Positive control first** (a zero must be discriminating): logical properties match **16** times across 6 files, so the search vocabulary is live.

**Result: 32 physical-property occurrences across 12 files.**

```
TransactionsPage.tsx:272,281 (mr-2), :378 (ml-auto)
transactions/dialogs.tsx:562,1132 (sm:mr-auto), :1134,:1152 (mr-2)
transactions/ImportDialogs.tsx:338 (mr-1.5), :349 (pl-5), :526 (pr-1), :773 (ml-1),
                               :1011 (file:mr-3), :1804,:1964 (mr-1), :2232 (pr-1), :2274,:2278,:2282 (mr-1)
transactions/SettingsDialog.tsx:928 (pr-8), :1048 (ml-2)
ProfilePage.tsx:348,367 (ml-auto)
NotFoundPage.tsx:26,30 (mr-2)
legal/PrivacyPolicyPage.tsx:48,88,126,201 (pl-5)
dashboard/sections.tsx:539 (sm:ml-4), :1414 (ml-1)
layout/AppShell.tsx:332,345 (mr-2)
```

**`components/ui/` is clean — and the zero is proven discriminating:** 24 `.tsx` files in scope, 16 of them match the control pattern `flex`, and **0** match the physical-property pattern (`rg` exit 1). The "primitives stay direction-free" constraint holds.

The standing rule forbids *additions*; these 32 are pre-existing. But they are load-bearing for the Phase 6 RTL sweep and sit directly in the mobile track's path, and roughly half are the trivial `mr-2` icon-spacing idiom inside buttons.

---

## M7 — Recurring commitments

**What R12's grouping key actually is.** [intelligence-lib.ts:217-219](apps/api/src/lib/intelligence-lib.ts#L217-L219):
```js
const normalized = (row.displayName ?? "").split(/\s+/).filter(Boolean).join(" ") || "Unnamed"
const key = normalized.toLowerCase()
```

**The key is the whitespace-normalised, lower-cased transaction NAME. Nothing else.**

**Does category participate at all?** **No.** Category enters in exactly two places, neither of them the key:
1. `expenseCategoryFilter()` at [:201](apps/api/src/lib/intelligence-lib.ts#L201) — a coarse income/expense gate on the source query.
2. `dominantCategory` at [:268-277](apps/api/src/lib/intelligence-lib.ts#L268-L277) — computed *after* grouping, as the most-frequent category **within** a name-group, used only as an input to the group label.

So two transactions in the same category with different names are different patterns, and one name spanning two categories is a single pattern.

**What the card renders** — [RecurringCommitmentsCard.tsx](apps/web/src/components/pages/insights/RecurringCommitmentsCard.tsx):

| Field | Derivation |
|---|---|
| `name` | R12 `name` (most-frequent display name, alphabetical tiebreak) |
| `avg_amount_kd` | **client-derived `number`** — `Number(row.avg_amount_kd \|\| 0)` at [InsightsPage.tsx:159](apps/web/src/components/pages/InsightsPage.tsx#L159); the wire field is a **string** |
| `expected_day`, `next_expected_date` | client-derived from R12 `last_seen` ([:160-167](apps/web/src/components/pages/InsightsPage.tsx#L160-L167)) |
| `status` | client-derived (`Paid`/`Due soon`/`Overdue`/`Upcoming`) |
| `group` | **R12 `group`**, server-side |

**Is there a first-class "subscription" notion?** **Not as a category — but a heuristic label exists and is already shipping.** [intelligence-lib.ts:142-159](apps/api/src/lib/intelligence-lib.ts#L142-L159):
```js
export function classifyRecurringGroup(categoryName, merchantName, displayName): string {
  const haystacks = [ …category…, …merchant…, …displayName… ]
  if (hintMatch(haystacks, LOAN_HINTS)) return "Loan Payments"
  if (hintMatch(haystacks, UTILITY_HINTS)) return "Utilities"
  if (hintMatch(haystacks, SUBSCRIPTION_HINTS)) return "Subscriptions"
  return "Other"
}
```
`SUBSCRIPTION_HINTS` ([:50-53](apps/api/src/lib/intelligence-lib.ts#L50-L53)) is a 12-string literal list (`"subscription"`, `"netflix"`, `"spotify"`, `"apple"`, …), verbatim from Flask `shared.py:25-68`. The card already groups by it and labels the section "Subscriptions" ([RecurringCommitmentsCard.tsx:11](apps/web/src/components/pages/insights/RecurringCommitmentsCard.tsx#L11), [:27-32](apps/web/src/components/pages/insights/RecurringCommitmentsCard.tsx#L27-L32)).

**Are categories wholly user-defined?** Yes. [db/schema/categories.ts](apps/api/src/db/schema/categories.ts) carries only an `is_income` boolean — **no reserved names, no system flag, no seed set**. "Subscriptions" as a *category* does not exist as a concept anywhere in the schema.

**Which tests pin R12 against captured Flask fixtures:** [lib/intelligence-lib.test.ts](apps/api/src/lib/intelligence-lib.test.ts), [routes/intelligence.test.ts](apps/api/src/routes/intelligence.test.ts), and [contract/money-wire-shape.test.ts](apps/api/src/contract/money-wire-shape.test.ts) (wire shape only). The only `__fixtures__` JSON files present are the two fuzzy-ratio ones — R12's Flask equivalence is pinned by in-file hardcoded expectations, not by a committed fixture file.

**No filter designed, per instruction.** Reporting only what the last question determines: **the operator's requirement is not yet expressible.** "Only transactions under the subscription category" presupposes a subscription category, and there is none — categories are free-text and user-defined. What exists instead is a **name/merchant keyword heuristic** already producing a `Subscriptions` group. Those are different things with different failure modes, and choosing between them (reserve a category? filter on the existing `group`? let the user tag?) is a product decision, not an implementation detail.

---

## M8 — The cost of B4-3-R2, measured once

**Baseline program membership**, before touching anything:
```
test files in the tsc program:      0
non-test src files in the program: 83
```
(83 vs the 81 recorded at 10e-4 — consistent with 10e-4 having added `MagicLinkRequestForm.tsx` + `MagicLinkPage.tsx`.)

**The exclusion**, [apps/web/tsconfig.json:24-29](apps/web/tsconfig.json#L24-L29): `src/**/*.test.ts`, `src/**/*.test.tsx`, `src/test/**`, `e2e/**`.

**With the two `*.test.*` lines and `src/test/**` removed:**
```
test files in the tsc program:  41      ← up from 0
M8_TSC_EXIT:1
error count: 58
```

**PREDICTION MET — non-zero, exit 1.** The full-stop branch does not fire, and the run is self-demonstrating red, so no synthetic error was needed to prove the invocation can go red: 58 diagnostics *are* the proof, and the `TS2582`s are proof specifically that **test files** are being checked rather than merely listed.

**Error census:**

| Code | Count | Class |
|---|---|---|
| TS2304 `Cannot find name` | 26 | vitest globals |
| TS2582 `Cannot find name 'describe'…` | 9 | vitest globals |
| TS2322 assignability | 8 | genuine |
| TS2345 argument type | 4 | genuine |
| TS18046 `is of type 'unknown'` | 4 | genuine |
| TS2552, TS2339 | 2 each | genuine |
| TS2769, TS2550, TS2353 | 1 each | genuine |

**Per file (6 files):** `transactions/helpers.test.ts` **45**, `InsightsPage.test.tsx` 6, `TransactionsTable.test.tsx` 3, `ExpensesPage.test.tsx` 2, `error-reporter.test.ts` 1, `api.test.ts` 1.

**The 58 is misleading and the split matters. 35 of them are a single config-class defect in one file.** [helpers.test.ts:1](apps/web/src/components/pages/transactions/helpers.test.ts#L1) imports `{ vi, describe as viDescribe, it, beforeEach, afterEach }` — **`expect` is never imported**, and `describe` is aliased away, so both resolve as globals that the tsconfig does not declare (no `"types": ["vitest/globals"]`). A control file, [api.test.ts:1](apps/web/src/lib/api.test.ts#L1), imports `expect` explicitly and contributes 1 error.

**So the real cost of removing the exclusion is ~23 genuine type errors across 6 files, plus one file needing an import line or a `types` entry — not 58 defects.** That is a materially smaller number than the raw count suggests, and it is the first time it has been measured.

**Restoration, proven by reading not by exit code:**
```
$ diff apps/web/tsconfig.json <backup>   → IDENTICAL
$ git status --short
[no output between markers]
$ git diff --stat
[no output]
$ test files in the tsc program: 0       ← exclusion functioning again
```

---

## M9 — The Playwright suite, measured not fixed

**First run measured the environment, not the suite.** 38 failed / 1 skipped / 10 did not run, **every single failure one cause**:
```
Error: browserType.launch: Executable doesn't exist at …/chromium_headless_shell-1217/…
```
Cache held **1228**; runner wanted **1217**. Cause: two Playwright copies coexist under the `^1.53.2` caret — `@playwright/test` resolves **1.59.1** (the runner) while `playwright` resolves **1.58.2**. No test body executed, so that run carries **zero** information about the suite.

**After provisioning browsers** (see the declaration at the top of this report), the real run:

```
 36 failed
  3 skipped
 10 did not run
M9_E2E_EXIT:1
```

**Zero passed, and the zero is discriminating:** `grep -c 'passed'` returns **0** with rc **1**, while `grep -c 'failed'` returns 7 on the same file.

**Failure classes:**

1. **Missing backend — 38 × `Error: connect ECONNREFUSED`.** The `webServer` config only builds and serves the static Vite preview on :4173; the specs need the Hono API, which nothing provisions. The suite has no backend story at all.
2. **Cascading timeouts — 30 × `Test timeout exceeded`, 23 × `locator.fill` timeouts.** Downstream of (1): pages never populate, so fills and waits expire.
3. **Stale specs targeting removed features — the documented rot, now enumerated.** Assertions still name pages deleted in 9.3b: `"Forgot Password"`, `"Create your account"`, `"Access your account"`, `"Send Reset Link"`, `getByPlaceholder("you@example.com")`.

   | Deleted thing | Specs still referencing it |
   |---|---|
   | `/register` | 17 of 18 specs |
   | `/forgot-password` | `auth-profile-qa`, `auth-visual`, `auth-pages` |
   | `/reset-password` | `auth-profile-qa` |
   | `spending-intelligence` (9.5c) | `insights-and-spending`, `responsive-qa` |
   | `/bank` (10b-1) | `bank.spec.ts`, `extended-flow-qa` |

   Whole spec files exist for features that no longer exist: `bank.spec.ts` (4 failures) and `debt-flow.spec.ts` (5 failures, feature removed in SC-1/2).

**Nothing repaired, revived, or deleted.** Note the honest limit of this measurement: because (1) prevents any spec from reaching its assertions, the failure count cannot distinguish "test is stale" from "test would pass against a live backend." Only class (3) is established independently, by static reference.

---

## M10 — The consistency sweep

All four pages use the shared [PageHeader](apps/web/src/components/layout/PageHeader.tsx), which makes the divergences below choices at the call site, not structural limits.

| Dimension | Home | Plan | Insights | Transactions |
|---|---|---|---|---|
| **Visible H1** | **none** — `title` omitted; `sr-only` "Home" at [:658](apps/web/src/components/pages/DashboardPage.tsx#L658) | "Plan your monthly budgets" | "Alerts & Trends" | "Track, import, and manage records" (varies by type) |
| **H1 style** | — | sentence case, verb phrase | **Title Case**, noun phrase, **`&`** | sentence case, verb phrase |
| **Badge suffix (month)** | ✓ `monthLabel` | ✓ `labelForYM` | ✓ `monthLabel` | **✗ absent** |
| **KPI formatter** | `formatKD` → **3dp** | `formatCompactKD` → **0dp + K** | `formatKD` → **3dp** | `formatKD` |
| **KD placement** | prefix, `KD 1,800.000` (`toLocaleString`) | prefix, `KD 1.8K` | prefix, 3dp | mixed: `formatKD` **and** literal `` `KD ${fmt3()}` `` → **no thousands separator** |
| **KPI label casing** | "Income", "Savings rate" — sentence, `uppercase tracking-wide` | "Planned total", **"% Used"** — inconsistent within the row | "Already spent" — sentence, `uppercase tracking-[0.08em]`, `text-[11px]` | — |
| **Delta glyph** | lucide icon | `↑` / `↓` char | own `DeltaIcon` + `+`/`−` | — |
| **Delta colour** | green/amber pill | **none** (plain text) | tone via `deltaTone()` | — |
| **Delta wording** | "12.3% vs last month" | "↓ 12.3% vs last month" / "No change vs…" / "No … baseline" | "You spent less than last week." | — |
| **Date format** | `formatDisplayDate` → "28 Aug 2026" | `formatDisplayDate` | **both** — plus `toLocaleDateString("en-GB", {day,month})` → "28 Aug" (**no year**) at [:166-167](apps/web/src/components/pages/InsightsPage.tsx#L166-L167) | `formatDisplayDate` |
| **Empty-state title** | "Import activity to unlock Home" | "Set your first budget plan" | "No insights yet" | "No transactions yet" / "No {label} match this view" |
| **Empty-state CTA** | import action | budget action | *(no action)* | contextual |
| **Right-aligned subtitle** | "Actionable runway for the rest of this month" (sentence) | "Total Budget — {month}" (**Title Case + uppercase class**) | section headers only | — |

### Divergences, as a list

1. **Home has no visible page title** while the other three do. Deliberate (the `PageHeader` JSDoc documents it), but it makes Home the only page whose identity is carried solely by a badge chip.
2. **Two KPI decimal conventions** — 3dp on Home/Insights, 0dp-plus-K-abbreviation on Plan. (M2.)
3. **Two thousands-separator conventions** — `formatKD`'s `toLocaleString` (`1,800.000`) vs the literal-`KD` + `fmt3` sites (`1800.000`), both live on Transactions and in every chart tooltip.
4. **H1 casing and grammar split three ways** — Title Case noun phrase (Insights) vs sentence-case verb phrases (Plan, Transactions) vs absent (Home). Insights is also the only `&`.
5. **Transactions alone lacks the month badge suffix.**
6. **KPI label treatment differs on all three axes** — casing, size (`text-xs` vs `text-[11px]`), tracking (`tracking-wide` vs `tracking-[0.08em]`). "% Used" is Title Case inside a row of sentence-case labels.
7. **Three delta systems** with different glyphs, different colour policies, different vocabularies, and two different sign conventions. (M5.)
8. **Two date formats**, one of which silently drops the year — and it is the one used for "Due {date}" on recurring commitments, where the year is arguably load-bearing.
9. **Empty states diverge in grammar** ("Import activity to unlock Home" = imperative + reward; "No insights yet" = bare statement) and **only Insights offers no call to action.**
10. **The right-aligned subtitle is not one pattern** — Home uses a sentence, Plan uses an uppercase Title-Case label. Different register, same slot.

Nothing resolved.

---

## Reclassification, restated as ruled

Per FF-R2, recorded before measurement and unchanged by it:

- **(i) Recurring-commitments filter — BACKEND**, and M7 shows it is worse than a filter: the requirement is not yet expressible, because the "subscription category" it presupposes does not exist in the schema.
- **(ii) KPI rework — DESIGN TRACK**, under ink-and-brass. M2/M10 supply the inventory; note that the brass slot ([SpendForecastWidget.tsx:68](apps/web/src/components/pages/insights/SpendForecastWidget.tsx#L68)) is also one of the two overflow sites in M6, so the design and layout questions touch the same element.
- **(iii) Income contradiction — measured, and its class is now known: FRONTEND**, at [dashboard/sections.tsx:382](apps/web/src/components/pages/dashboard/sections.tsx#L382), where copy about income sits behind a gate about budgets. R4-vs-R9 divergence is correct backend behaviour, not a defect.

Two further items surfaced that were not on the list and that I am **reporting, not opening**: the M4 seed-anchoring decay (bears directly on track item 3), and the M6 `items-start` / `whitespace-nowrap` pair.

**HARD STOP.** Nothing committed, nothing pushed, tree clean at `d0e06cc`.

---

## Phase B proposal, verbatim as submitted

# PHASE B — PROPOSAL ONLY

## Step 0 results

```
Khaleds-MacBook-Air.local
/Users/khaledalrashidi/DevLocal/public-statera

a39a0cb phase-4: phase4-frontend-fixes Phase A persistence — FF-R1…FF-R3 + measurement report
$ git status --short      → [no output]
ahead of origin/main: 1   (unpushed, content unchanged)
phase4-frontend-fixes.md: 688 lines
```

**Held FF blocks (my own sweep): FF-R1, FF-R2, FF-R3, FF-R5. FF-R4 is MISSING.** FF-R5 cites it twice as load-bearing ("the FF-R4 message"; quoting its "two prose labels" wording). Per 10e-R204 that is a non-delivery signal; per 10e-R251 I reconstruct nothing from FF-R5's quotations of it. **Not blocking** — FF-R5 supersedes FF-R4 on their only interaction and states all four items in full — but **FF-R4 must be relayed before Phase B's persistence commit**, or that commit persists a set with a hole and a dangling citation.

### Citation re-derivation (10e-R182) — two do not resolve

| Phase A cited | Actual | Status |
|---|---|---|
| `WeeklyDigestSection.tsx:120-122` | **:115** (number), **:116** (prose `className`), **:117** (prose text) | **WRONG — off by 5** |
| `monthlyIncome` (I said :212 in session) | **:214** | corrected |

Everything else resolves exactly: `sections.tsx:382`, `:220`, `:228`, `:232-233`, `:355`, `:360`, `:108`; `InsightsPage.tsx:357`; `SpendForecastWidget.tsx:68`; `DashboardPage.tsx:253-265`; `aggregation.ts:726`, `:705`; `income-lib.ts:52-76`; `demo-data-lib.ts:439`.

**This matters beyond bookkeeping. FF-R5 Item 3 names `WeeklyDigestSection.tsx:121` — that line number came from my Phase A error and is wrong.** The file is byte-identical since Phase A (tree clean, only the docs file added), so this was my mis-transcription at the time, not drift. The *element* FF-R5 describes is unambiguous ("prose label", "Days until payday"), so the mandate is intact and I proceed against the correct line — but **the persisted Phase A document and FF-R5's line reference both need amending.** This is precisely the 10e-R182 failure mode: a figure read from a document about the artifact rather than the artifact, which then propagated into a ruling.

---

## ITEM 1 — `dashboard/sections.tsx:382`

### Arm-3 reachability, established exhaustively from source

The chain, re-derived (`dashboard/sections.tsx`):

| Line | Branch | Renders |
|---|---|---|
| :276 | `isLoading ?` | skeleton |
| :278 | `: !safeToSpend ?` | "We can't calculate…" |
| :287 | `: safeToSpend.data_complete ?` | full card |
| :370 | `: incomeNeedsSetup ?` | "Set your income" |
| **:380** | `: (` | **ARM 3** — string at :382 |

Arm 3 ⟺ `safeToSpend` truthy ∧ `!data_complete` ∧ `!incomeNeedsSetup`.

`incomeNeedsSetup` (:220-222) = `safeToSpend && !data_complete && (warnings.includes("income_not_set") || monthlyIncome <= 0)`. In arm-3 context the first two conjuncts already hold, so `!incomeNeedsSetup` reduces to **no `income_not_set` warning ∧ `monthlyIncome > 0`**.

Three backend invariants close it:

1. `warnings` contains `income_not_set` ⟺ `monthlyIncome === null` — `aggregation.ts:705`.
2. `monthly_income_kd = monthlyIncome !== null ? formatKd(monthlyIncome) : null` — `aggregation.ts:715`.
3. **`resolveIncomeForPeriod` returns either `null` or a value strictly `> 0`** — both non-null arms are guarded by `.gt(0)` (`income-lib.ts:58`, `:70`). **No path returns 0 or negative.**

Frontend `monthlyIncome = Number(safeToSpend?.monthly_income_kd || 0)` (:214): income `null` → `null || 0` → `0` → `<= 0` **true**; income `> 0` → `Number("1800.000")` → `<= 0` **false**.

**So the two limbs of arm 2's disjunction are provably EQUIVALENT, not independent** — both true ⟺ income null, both false ⟺ income non-null. Arm 2 therefore absorbs the entire income-absent case, and:

> **ARM 3 HAS EXACTLY ONE CAUSE: income resolved (> 0) AND the month's budget total = 0.**

**The channel's expectation is CONFIRMED.** I tried to break it and could not; the redundant second limb is the thing that makes it airtight rather than coincidental. No STOP-AND-ASK is triggered.

**One theoretical path, named rather than dismissed:** a non-numeric `monthly_income_kd` yields `NaN`, and `NaN <= 0` is **false**, so it would reach arm 3. `formatKd` cannot emit that, so it requires a contract violation or a corrupted cache entry. **It is not a second reachable cause**, but you should know it exists rather than have me assert "exactly one" without qualification.

**CTA: already correct, so this is copy-only.** Arm 3's button is `primaryAction` = `{ label: "Open Plan", onClick: onOpenPlan }` (:219), and `onOpenPlan={() => navigate("/plan")}` (`DashboardPage.tsx:813`, `:830`). For a budgets cause, "Open Plan" routes exactly where a budget is set. **No CTA change proposed** — a copy-only fix is smaller than one touching both.

### Proposed change — two strings, `sections.tsx:382` and `:383-385`

```
:382  - No income detected yet.
      + No budget set for this month.

:383  - Categorize your income transactions so the app can calculate how much you
      -   have to spend each day.
      + Safe-to-spend compares your income against your planned budget. Add at least
      +   one budget category for this month to start seeing a daily figure.
```

Rationale: arm 3's sole cause is a missing budget, and the backend already emits `budgets_not_set` (`aggregation.ts:706`) on exactly this state — so the new copy names a condition the system independently reports. **Copy requires your approval before it ships.**

**Alternative considered, not proposed:** key the branch on `warnings.includes("budgets_not_set")` instead of relying on the reachability proof. Rejected as larger — it changes control flow to re-derive a fact the proof already establishes.

### Test plan

`components/pages/dashboard/safe-to-spend.test.tsx` — 6 cases today, **none reaches arm 3** (`:67` and `:90` both set `warnings: ["income_not_set"]` → arm 2). Confirmed independently: `rg "No income detected"` across all test files returns **no file**.

**+1 case.** Fixture: `data_complete: false`, `monthly_income_kd: "1800.000"`, `income_source: "declared_in_profile"`, `warnings: ["budgets_not_set"]`. Asserts the new title renders.

**RED-first proof:** written against unfixed code, the assertion fails because the DOM contains `No income detected yet.` — the failure message prints the old string, which is the proof the test reaches arm 3 rather than passing vacuously somewhere else. **Negative case:** had the change not landed, `getByText(/No budget set for this month/)` throws "Unable to find an element". Positive and negative differ.

**REPORT ONLY, not fixed (convention scope):** `safe-to-spend.test.tsx:90-98` uses `monthly_income_kd: "0.000"` **with** `warnings: ["income_not_set"]` — a wire state the backend cannot emit (invariants 1–3 above). A false-premise fixture, FIND-S5(b) class. It still validly unit-tests arm 2's second limb. Not touched.

---

## ITEM 2 — `InsightsPage.tsx:357`

```jsx
- <div className="grid items-start gap-6 xl:grid-cols-[1.05fr_0.95fr]">
+ <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
```

**What stretched looks like.** Removing `items-start` restores CSS Grid's default `align-items: stretch`, so both `section-panel` cards grow to the row's height. Bottom edges align. Content inside stays top-aligned, so the shorter card (Month Snapshot) gains trailing empty space *inside* its border rather than the card ending early. Below the `xl` breakpoint the grid is single-column and there is **no visible change at all** — one item per row, nothing to equalise.

**Does any child depend on shrink-to-content height? No — verified, not assumed.** Neither `WeeklyDigestSection.tsx` nor `SpendForecastWidget.tsx` contains `h-full`, `flex-1`, `min-h-`, `absolute`, `inset-`, or `sticky` (single sweep returned one hit: `SpendForecastWidget.tsx:74`, an `overflow-hidden rounded-full` progress bar whose children carry explicit `h-4`, unaffected by parent height). `.section-panel` (`index.css:184-191`) is `position: relative; overflow: hidden` with no height rule — `overflow: hidden` clips nothing new, since a taller box cannot cause content to exceed it.

**Flagged for your call:** `items-start` may have been chosen deliberately to avoid a stretched card looking empty at the bottom. Removing it is correct for edge alignment and is a plausible aesthetic regression. **This is a judgement I should not make silently** — it is the same element class FF-R5 sends to the design track for Item 3's sibling.

**Test plan: NO new test, and I want that approved rather than assumed.** jsdom computes no layout, so the only assertable artefact is the Tailwind class string — an assertion that `className` lacks `items-start` is a restatement of the diff, not a behaviour check, and its negative case is indistinguishable from its positive one in any real sense. **Predicted delta: 0 tests.** Recorded as a deliberate coverage gap.

---

## ITEM 3 — `WeeklyDigestSection.tsx:116` *(FF-R5 says :121; corrected above)*

```jsx
:115    <p className="financial-number whitespace-nowrap text-lg font-semibold">{formatKD(digest.safe_to_spend_today_kd)}</p>   ← UNCHANGED
:116  - <p className="whitespace-nowrap text-sm text-muted-foreground">
      + <p className="text-sm text-muted-foreground">
:117    Days until payday: {digest.days_until_payday === null ? "N/A" : digest.days_until_payday}
```

**Prose label only; the number at :115 keeps its `whitespace-nowrap`,** per FF-R5's correction — and the correction is right: `KD 1,800.000` broken across lines is worse than a tight fit.

**Why this is the actual remedy, and why `min-w-0` is not.** The tile grid is `grid gap-3 md:grid-cols-3` (`:82`), so clipping occurs at `md` and above only. Grid items default to `min-width: auto`, so the track cannot shrink below the item's min-content width — and with `whitespace-nowrap`, min-content width is *the whole string*. Adding `min-w-0` would let the track shrink but the text still would not wrap, converting overflow into clipping. **Removing `nowrap` is what lets the string wrap to two lines inside the tile.** No `min-w-0` is proposed.

**Test plan: 0 new tests; existing test stays green AND untouched.** `WeeklyDigestSection.test.tsx:50` asserts `getByText(/Days until payday: 27/)` and `:61` asserts the `N/A` variant. Both match on **text content**, which this change does not touch. **Negative case:** had I changed the text instead of the class, both regexes would fail — so the fact they stay green is a genuine signal that the edit was class-only, not a vacuous pass.

### `SpendForecastWidget.tsx:68` — REPORT ONLY, no fix proposed

Three constraints converge on one element: the ink-and-brass **brass slot** (`text-accent-strong`), an **overflow site**, and the **R6 WCAG enlargement** to `text-[1.25rem]` (20px clears the 18.66px large-text threshold at accent-strong's 3.39 contrast). Options I can see, **choosing none**:

| Option | Collides with |
|---|---|
| Reduce font size | R6 WCAG ruling — 20px is the floor that makes 3.39 contrast legal |
| Drop `whitespace-nowrap` | breaks a money value across lines |
| `formatCompactKD` above a threshold | the money-convention work, deferred to the mobile track |
| Widen the tile / change grid template | affects all three tiles; layout work |
| Stack tiles below a breakpoint | mobile-track work by definition |
| `min-w-0` + accept clipping | trades overflow for truncation of a money value |

Every option lands in the design or mobile track. Correctly deferred.

---

## ITEM 4 — the no-current-data delta case

### Does a "current period has no data" signal exist? **No. It must be derived.**

- **`manual_entry_summary.transactions_mtd` is the only `COUNT(*)` on the wire** (`aggregation.ts:796`) and it is scoped `eq(transactions.source, "manual")` (`:800`). Production writes three source values — `manual` (`transactions.ts` ×2), `csv_import` (`import-lib.ts`), `demo` (`demo-data-lib.ts:43`, `"demo"`). **A demo-seeded or CSV-imported month reports 0 with rows present.** It is disqualified, and disqualified precisely in the scenario that produced this whole track.
- **R3 `monthly[]` rows are `{ month, income_kd, expense_kd }`** (`types/api.ts:83-89`) — **no count field**.
- `hasRecordedTransactions` (`DashboardPage.tsx`) spans *all* months, not the selected one.

### The derivation is sound AND complete — and this is a proof, not a heuristic

`monthIncome === 0 && monthExpenses === 0` ⟺ **the selected month has zero rows**, because:

1. **The category filters are exhaustive and mutually exclusive.** `expenseCategoryFilter()` is literally `NOT (incomeCategoryFilter())` (`payday-lib.ts:16-23`), and both are NULL-safe (`IS TRUE`, `COALESCE(name,'')`), so the predicate is never NULL and every row lands in exactly one bucket — including uncategorised rows, which fall to expense.
2. **Every persisted amount is strictly positive** — DB CHECK `chk_transactions_amount_positive` (`amount_kd > 0`), and **it is in applied DDL**, not just the schema file: `migrations/0000_cultured_jimmy_woo.sql:70`, carried through `meta/0007_snapshot.json`. (I checked this specifically because a constraint that never reached a migration is unenforced — the "committed ≠ active" class.)

Therefore any month with ≥ 1 row has `income + expenses > 0` strictly. Contrapositive: both zero ⟺ no rows.

> **FF-R5's "SAY SO" clause, answered: suppression would NOT hide a legitimately-zero period that genuinely has rows — the database forbids such a period from existing.** No trade-off to rule on.

**One thing that could have made this fix wrong, checked and cleared.** Current-month figures come from R4 `account_overview` when present (`DashboardPage.tsx:153-158`), previous-month from R3 via `monthlyKpiMap`. Had R4's `*_mtd` been true month-to-date, we would be comparing a partial current month against a full previous month, every delta would be structurally negative, and suppression would have been treating a symptom. **They are not MTD:** both queries bound `date >= monthStart AND date <= monthEnd` (`aggregation.ts:771-793`). The name is a Flask-inherited misnomer. Windows are like-for-like; suppression is the right fix.

### Proposed mechanism — symmetry, not new policy

In `heroDeltas` (`DashboardPage.tsx:253-265`), add a guard mirroring the one `prevMonthKpis` already applies at **`:249`** (`if (income === 0 && expenses === 0) return null`):

```js
const heroDeltas = useMemo(() => {
  if (!prevMonthKpis) return null
+ if (monthIncome === 0 && monthExpenses === 0) return null   // current period has no rows
  const delta = (curr, prev) => { ... }
```

The existing rule — *no baseline → no chips* — becomes *no baseline **or** no current data → no chips*. All four chips vanish together, matching the existing whole-row behaviour rather than inventing per-metric styling or new wording. **No new colour, no new copy, no new prop.**

### Test plan

`dashboard-hero.test.tsx` has 5 cases and **every one passes `deltas={null}`** — `HeroDelta` has **zero** existing coverage, and `rg "vs last month"` across all test files returns **no file**. So there is nothing to break, and nothing that currently proves the chips render at all.

The fix lives in the **derivation** (DashboardPage), not the presentational component, so the test belongs in `DashboardPage.test.tsx` — which **already** mocks `./dashboard/sections` (`:47`) and spies the hero's props (`:48-49`, `mocks.dashboardHero(props)`). **No new mock infrastructure.**

**+1 case:** previous month has rows, current month has none → assert the captured `deltas` prop is `null`.

**RED-first proof:** against unfixed code the captured prop is `{ incomeDelta: -100, expensesDelta: -100, remainingDelta: -100, savingsRateDelta: … }`, so `expect(props.deltas).toBeNull()` fails and prints that object — which simultaneously demonstrates the −100 the fix exists to suppress. **Negative case:** without the change the assertion reads a populated object; a weaker assertion ("renders without crashing") would read identically in both worlds and would not be a check.

---

## Test-impact prediction — a claim to be verified, not an allowance

| Item | File | Δ tests | Negative case (what the check reads if the change did NOT land) |
|---|---|---|---|
| 1 | `dashboard/safe-to-spend.test.tsx` | **+1** | `getByText(/No budget set for this month/)` throws; DOM shows the old string |
| 2 | — | **0** | n/a — deliberate gap, approval requested |
| 3 | `insights/WeeklyDigestSection.test.tsx` | **0** (stays green **and untouched**) | text-content regexes would fail only if text changed — they don't, proving class-only |
| 4 | `DashboardPage.test.tsx` | **+1** | captured `deltas` prop is a populated `-100` object instead of `null` |

**Predicted frontend baseline: 209 → 211 tests, 41 files unchanged.** API untouched — but `apps/api` **must still be run**, because `apps/api/src/contract/frontend-contract.test.ts` reads the frontend fixture; no `api.ts` call changes here, so the fixture should hold at 66 with the ALLOWLIST empty, and I will verify rather than assume.

**Predicted NAMED FORCED EDITS: none.** If any test goes red, or any selector/class edit to a test is forced, I stop and ask before it ships.

**Three named regression files:** none of the four items touches `AppShell`, `PrivacyPolicyPage`, or `TermsPage`. Predicted green **and** untouched.

## Constraint compliance

- **CLAUDE.md:482** — Items 2 and 3 **remove** classes; Items 1 and 4 add none. **Zero physical-property additions.** The 32 pre-existing sites are not touched.
- **CLAUDE.md:470 (CSP)** — no new external origin; **no `deploy/Caddyfile` change**.
- No renames. QuickAdd internals untouched. Pinned strings untouched (the two legal testids and the FAB aria-label/tooltip are nowhere near these four sites).
- **No convention work performed in passing** — the three formatters, two decimal conventions, two separator conventions, three delta systems, two date formats, M10 divergences and 32 physical-property sites are all left exactly as they are.

## Still OPEN — recorded, not resolved

1. **The Subscriptions decision** — three candidates, none chosen. The channel declined to recommend, so there is no recommendation for the delegation to have landed on.
2. **The KPI visual-vs-informational question** — an assessment was offered, not an action.
3. **FF-R4 is not in my possession** (above). Needed before Phase B's persistence commit.

## Stop-and-ask before any code

- **Item 1 copy strings** — exact wording needs approval.
- **Item 2** — confirm that equal-height cards are wanted, given `items-start` may have been deliberate; and approve the zero-test gap.
- **Item 3** — confirm the corrected line (`:116`, not `:121`), and that FF-R5's reference and the persisted Phase A document will be amended.

**HARD STOP.** No file written, no commit, nothing pushed. Tree clean at `a39a0cb`.

---

## Phase B close-out, verbatim as submitted

# PHASE B — close-out

## Step 0

```
Khaleds-MacBook-Air.local
/Users/khaledalrashidi/DevLocal/public-statera

a39a0cb phase-4: phase4-frontend-fixes Phase A persistence — FF-R1…FF-R3 + measurement report
$ git status --short  → [no output]
ahead of origin/main: 0        ← you pushed it; SHA identical, content unchanged
```

**Hostname `Khaleds-MacBook-Air.local`** (matches my last report; the first said `Mac`). Continuity established by artifact: same path, HEAD `a39a0cbee4f3e1698e6cc9e2b200234fcb0be244`, 688-line doc.

**Open enumeration:** I hold **FF-R1, FF-R2, FF-R3, FF-R4, FF-R5, FF-R6** — six, contiguous 1→6, none outside, none missing. FF-R4's gap is closed by the reissue.

## Item 4 gate — reported before the guard was written

**Came back the right way. Value condition suffices; no presence condition.**

- **(a) NO, `selectedMonth` cannot fall outside `monthly[]` — structurally.** `dashboard-snapshot-lib.ts:244` builds `monthly` as `monthKeys.map(...)` and `:259` returns `months: monthKeys` — **the same array**, 1:1, **zero-filled** for empty months. `monthOptions` derives from `months` and `selectedMonth` is constrained to it. Post-load a miss is impossible; pre-load `prevMonthKpis` returns null and `heroDeltas` short-circuits first.
- **(b) NO, the fallback does not distinguish absent from zero.** `?.income || 0` conflates them — **real, but unreachable given (a)**. Recorded as a latent hazard that goes live the moment `months` and `monthly` diverge.
- **(c) YES, both operands are numbers on both paths**, statically guaranteed by `Map<string, { income: number; expenses: number }>` and `Number(...)`. `=== 0` cannot silently never-fire.
- **One check beyond the mandate:** no `placeholderData`/`keepPreviousData` on the bundle query (`hooks.ts:44-49`), so a month switch drops `accountOverview` to `undefined` rather than serving the prior month's figures. Had it cached, the guard could have read one month's numbers against another's.

## The four items

| # | File:line | Change |
|---|---|---|
| 1 | `dashboard/sections.tsx:382` + body | copy only; CTA unchanged |
| 2 | `InsightsPage.tsx:357` | `items-start` removed |
| 3 | `insights/WeeklyDigestSection.tsx:116` | `whitespace-nowrap` removed from the prose label; `:115` number keeps it |
| 4 | `DashboardPage.tsx:253-265` | empty-current-period guard |

Production diff is **exactly** those four edits (6 added lines at Item 4, of which 5 are the rationale comment; 1↔1 at each of the other three). No convention work.

## RED-first, red captured

**Item 1** — `Unable to find an element with the text: No budget set for this month.` with the **old string present twice in the dumped DOM**, which is what proves the case reaches arm 3 rather than failing somewhere else. Then 7 passed, exit 0.

**Item 4** — `expected { incomeDelta: -100, …(3) } to be null`, received `expensesDelta: -100` — the exact value that renders the green success pill. The control case **passed in the same red run**, so the two cases were already discriminating before the fix. Then 8 passed, exit 0.

## Mandatory sections (CLAUDE.md:436)

**Resolution proofs (10e-R246):** `statera-frontend` → `MATCHED-FRONTEND` rc 0; `statera-api` → `MATCHED-API` rc 0; negative control `--filter statera-nope` → `No projects matched the filters…` **rc 0**.

**(1) Test tails, verbatim, with exit codes**
```
 Test Files  41 passed (41)
      Tests  212 passed (212)
      WEB_TEST_EXIT:0

 Test Files  51 passed | 10 skipped (61)
      Tests  873 passed | 34 skipped (907)
      API_TEST_EXIT:0
```
Errors instrument **0** on both; fires **1** on a synthetic control line.

**(2) `tsc --noEmit`, verbatim, with exit codes**
```
WEB_TSC_EXIT:0   bytes: 0   (no output)
API_TSC_EXIT:0   bytes: 0   (no output)
```

**(3) Baseline** — frontend **209/41 → 212/41**; API **873/34/61 unchanged**. Contract fixture **66** (derived from the file), `ALLOWLIST = []` — verified, not assumed. Three named regression files **green and untouched** (empty `git diff --stat`; 6/4/3 tests passing).

## Prediction miss — raised as a question, not adjusted

**+3 tests against +2 predicted (212, not 211).** Cause: Item 4 shipped a **second, unrequested control case** — *"still passes hero deltas when the selected month has rows"*.

My reasoning: **no existing test asserts `deltas` at all**, so a guard that returned `null` unconditionally would have passed the target assertion. Without the control, the Item 4 test is not discriminating. I judged that shipping a knowingly-weak assertion was worse than a +1 overshoot — but that judgement was mine and it was not in the approved plan. **Flagged for you to accept or have removed;** removing it is a one-case deletion returning the count to 211.

## Constraints

Zero physical-property additions (positive control confirms the pattern matches a synthetic `ml-2` line); no `deploy/Caddyfile` change; **no CLAUDE.md edit** — `git status --short -- CLAUDE.md` = **0**, the negative deliverable tested positively per FF-R4; no renames; QuickAdd untouched; pinned strings untouched; the formatters, decimal/separator conventions, delta systems, date formats, M10 divergences and 32 physical-property sites left exactly as they were.

## Carried to the close-out commit

- **Persistence of FF-R4, FF-R5, FF-R6** (FF-R6 ruled it rides the close-out, not this commit) — including FF-R6's adjacent correction of the `:121`/`:116` line number, which must persist beside FF-R5's uncorrected text.
- **Queued, not opened:** FF-R6's observation that Home suppresses a card Insights renders from the same payload — R9 computes free-to-spend fine with `committed = 0`. Product decision, yours.
- The CLAUDE.md baseline line moves at track close, not per sub-commit.

Tree clean, 1 commit ahead of `origin/main`. The push is yours.
