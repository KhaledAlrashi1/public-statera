# Phase 4 — track: phase4-mobile

**Status:** TRACK OPEN. No phase is opened, no work is proposed, no code is written. This document
is the track's durable lineage (persist-first standing rule; 10e-R239) and is the track's FIRST
commit, written before any implementation, exactly as MOB-R1 directs. **Implement from this file,
not from conversation context.**

## Completeness note

- **Format in use:** Format A only — ruling blocks are headed `^MOB-R<n> — ` at column 0. There is
  no Format B block in this file, so a presence sweep needs one pattern (contrast `phase4-10e.md`,
  which carries two — 10e-R183).
- **The census pattern is the STRICT form `^MOB-R[0-9]+ — `, and that is a measured choice, not a
  stylistic one.** Measured against the FF track's file at the time of writing: the loose form
  `^FF-R[0-9]` returns **11**, the strict form returns **8**, and 8 is the true block count. The
  three extras are two body citations that wrapped to column 0 (`:284`, `:436`) and one sub-block
  header (`:554`, `FF-R7(a) — `, which is deliberate). A loose sweep of this file would therefore
  over-report, and over-reporting is the failure that 10e-R257's pre-append census exists to catch.
  Use the strict form; a match count above the block count means a citation has wrapped.
- **Persisted set:** **MOB-R1**, alone. First 1, last 1, no duplicates, no gaps. No MOB-R number
  outside that range exists at the time of writing.
- **Relay provenance:** **MOB-R1 RELAYED** — it reached the implementer as verbatim relayed text
  inside an operator prompt, not by delegation of authorship. It was **UNPERSISTED** until this
  commit; persisting it is the whole purpose of this commit.
- **This file is the track's ruling record.** Any later MOB-numbered block is appended here, in
  Format A, before the work it authorises begins.
- **Transcription seam, stated because it cannot be closed here (10e-R256):** the block below was
  transcribed from conversation text, not piped from a tool. There is no file on disk to diff it
  against, so its byte-fidelity rests on careful transcription and is **NOT mechanically
  verified**. This is a bounded unknown of this commit, not a claim of byte-identity. Where a
  later reader needs a load-bearing string, derive it from the source the block cites, never by
  retyping it from here.
- **CLAUDE.md is deliberately NOT edited by this commit**, on the FF precedent's reasoning and its
  precedent in fact: `a39a0cb`, the FF track's Phase A persistence commit, changed **one file** and
  did not touch CLAUDE.md (confirmed mechanically, not recalled). A Migration-status entry naming a
  track that has shipped no code would be a live index pointing at nothing (10e-R78). CLAUDE.md is
  edited when this track ships something.
- **No new CLAUDE.md standing rule is earned by this commit.** The standing-rule count is unchanged.

### Amendment — MOB-R5 persistence commit, 2026-09-11

The bullets above are the note as written at the track-opening commit (`e560810`) and are left as
they stood. This amendment is the live index from here forward, and it **supersedes** the
"census pattern" bullet's instruction to run the loose form.

- **Persisted set is now MOB-R1 … MOB-R5**, complete and contiguous. Shape **derived from this
  file**, not asserted: first **1**, last **5**, **0** duplicates, **0** breaks in 1…5.
- **Two instruments, and they do different jobs. Neither is the detection instrument.**
  - **INDEX — the strict form `^MOB-R[0-9]+ — ` (em-dash, space).** Unchanged. This is what
    enumerates the blocks and produces the count.
  - **DIAGNOSTIC — the tripwire `^MOB-R[0-9]+ ` (trailing space), quoted in every invocation**
    because zsh will not otherwise deliver it intact. Adopted at MOB-R5, exactly as probed.
  - **Both are run at every sweep and BOTH NUMBERS ARE REPORTED.** A disagreement is a QUESTION
    whose answer is read off the artifact, never a diagnosis already made.
  - **DETECTION is the shape check** — breaks, duplicates, and first-and-last against the range,
    reconciled two ways, with the enumerated list printed in file order. A pattern match confirms
    presence and never order. **Neither sweep detects a malformed header; the break does.** The
    tripwire's job is to say *why* a break exists — block absent, versus block present with a
    malformed header — which is the difference between recovering a lost ruling and fixing one
    character.
- **The bare form `^MOB-R[0-9]` is RETIRED.** It fires on prose: a possessive citation opening a
  paragraph at column 0 (`MOB-R1'S …`, MOB-R4's own text) matches it while being no header at all.
  Its one evidential number, recorded once and never to be reported again: against the four-block
  MOB-R5 payload it returned **5** where strict and tripwire both returned **4**. The probe that
  justified the replacement is persisted below with its three counts; any future change to either
  pattern carries its own probe or it does not ship.
- **Relay provenance, per block.** All five RELAYED as verbatim text inside operator prompts, none
  by delegation of authorship.
  - MOB-R1 — relayed; persisted at `e560810`.
  - MOB-R2 — **RELAYED, RE-RELAYED AFTER NON-DELIVERY.** Authored and issued alongside MOB-R1, did
    not reach the implementer, re-sent **verbatim and unedited rather than re-authored**; its
    number and original date are unchanged. A delivery fault **diagnosed, not reconciled away**,
    and surfaced by the implementer's owed-next enumeration and by nothing else.
  - MOB-R3 — relayed, one cycle late relative to its issue. **Arrived twice as a truncated prefix
    followed by a complete copy**; transcribed from the complete copy. The instrument is the
    TERMINATION, not a comparison: a copy ending mid-sentence with no closing marker is established
    as incomplete by its own tail. A prefix is not a version, so no authority question arises.
  - MOB-R4 — relayed. Carries two corrections travelling adjacent to MOB-R3, neither folded in.
  - MOB-R5 — relayed. Carries two corrections travelling adjacent to MOB-R4, neither folded in.
    It also **arrived twice as two complete copies reading identically** — a duplicate delivery,
    not a divergence, so no halt; "identically" there is a reading, not a mechanical diff.
- **The "Open at the time of writing" section below is SUPERSEDED and is not edited** — its own
  title tenses it. Items 1 and 2 are resolved: the (b)/(c) order was ruled at MOB-R4
  (**MOB-1 RESPONSIVE → MOB-2 ZERO-VS-NO-DATA → MOB-3 CONVENTIONS**), and MOB-0 was mandated by
  MOB-R2 and executed. **Phase names carry their content word from here on** (MOB-R4): the phase
  label and the ruling number differ by one character, and a human reader is not a pattern.
- **What is open is ONE item:** whether **MOB-F1**, the dead invalidation key, opens as a short fix
  cycle before MOB-1 RESPONSIVE. Until the operator rules it, **no phase opens.** The channel
  recommendation is offered and is not adopted by the passage of cycles.
- **The transcription seam still applies** to MOB-R2…MOB-R5 on the same terms: derive any
  load-bearing string from the source a block cites, never by retyping it from here. As with the
  FF track, these blocks' load-bearing content is predominantly file:line citations and measured
  figures, every one checkable against the tree.
- **CLAUDE.md is still deliberately NOT edited.** This track has shipped no code. The
  Migration-status entry and the baseline line land at track close, as the FF track did.
- **No new CLAUDE.md standing rule is earned.** The count stays at **SIX** (MOB-R4, MOB-R5).

## Open at the time of writing — carried, not resolved

Recorded here so a later reader meets the open questions in the ruling record rather than having to
reconstruct them. Nothing below is a ruling; each item names who owes it.

1. **The (b)/(c) order is NOT RULED.** MOB-R1 says so in its own words and states why: the channel
   recommendation that would have settled it was conditioned on the operator choosing only one of
   the two, and the operator chose all three, so the condition failed and the clause did not fire.
   The channel's `(c)`-first recommendation is offered for ratification and is **not adopted**.
   **Owed by:** the operator. Until it is ruled, neither MOB-2 nor MOB-3 is opened.
2. **MOB-0 is not opened by MOB-R1.** Its mandate is MOB-R2, which does not exist yet.
   **Owed by:** the review channel.
3. **MOB-1 is not opened.** MOB-R1 names its surface — breakpoints, tap targets, navigation, tables
   at narrow widths, the FAB question, `SpendForecastWidget.tsx:68` — and says "Not opened here."
4. **MOB-0's finding may leave this track**, by MOB-R1's own advance statement: a backend defect in
   R9/R10 or the cache layer is not mobile-track work, and two observations taken at two different
   moments retires the finding in favour of a fresh simultaneous post-deploy observation. Both
   outcomes are stated in advance so neither can be absorbed later as though it had been the plan.
5. **The 32 physical-property sites stay parked with (b)**, and the figure — 32 across 12 files — is
   a Phase A measurement of the FF track. Per MOB-R1 it is **re-derived at (b)'s Step 0**, never
   carried, because MOB-1's own work may move it incidentally.

---

## Ruling blocks

MOB-R1 — THE MOBILE TRACK IS OPEN. Prefix MOB-R. All three shapes in scope as separate phases.
Sequence set through MOB-1; the (b)/(c) order is OPEN and named as open.

PREFIX. This track numbers MOB-R1 onward. The FF-R series is CLOSED and its record does not
grow. Ruling blocks are Format A, headed ^MOB-R<n> —  at column 0, one format only, persisted to
docs/modules/phase4-mobile.md. That file is this track's FIRST commit, written before any
implementation (persist-first standing rule; 10e-R239).

ATTRIBUTION, 2026-08-29, and the two parts are different classes.
  DIRECT: "Let's do them all but at separate phases. 2 or 3 phases as you see fit." All three
  candidate shapes are in scope for this track, executed as separate phases, with the phase
  structure delegated to the channel.
  BY DELEGATION: "Let's go with your recommendation." It lands on the channel recommendation
  stated in the message immediately preceding it, and on nothing else: run the safe-to-spend
  divergence as a standalone measurement BEFORE any of the three, then (a) responsive layout as
  the track proper, with (b) and (c) following.

WHAT THE DELEGATION DOES NOT COVER. The recommendation's clause "(c) over (b) if you want only
one of them" was CONDITIONED on choosing one. The operator chose all three, so the condition did
not obtain and the clause did not fire. The relative order of (b) and (c) is therefore NOT ruled.
Recorded as OPEN so a later reader cannot mistake an unanswered question for a settled one.
Inferring the order from a conditional whose condition failed would manufacture an operator
ruling out of an unfired clause, which is the FF-R5 subscriptions-silence class.

THE SEQUENCE.
  MOB-0 — MEASUREMENT ONLY. The Home 609.000 / Insights 639.000 daily safe-to-spend divergence.
    Source-side derivation, no code, hard stop. This is NOT a fourth body of work; it is the
    pre-step the delegation covers, sized at one cycle. Its mandate is MOB-R2.
  MOB-1 — (a) RESPONSIVE LAYOUT. The charter as the operator worded it: "making the web app
    friendlier for mobile users." Breakpoints, tap targets, navigation, tables at narrow widths,
    the FAB question, SpendForecastWidget.tsx:68. Not opened here.
  MOB-2 / MOB-3 — (c) THE ZERO-VS-NO-DATA CLASS and (b) THE CONVENTION SWEEP, in an order not yet
    ruled. CHANNEL RECOMMENDATION, offered for ratification and NOT adopted: (c) first, on two
    grounds — correctness precedes presentation, and (c) removes render sites that (b) would
    otherwise have to normalise, so (c)-first strictly shrinks (b)'s surface. The operator rules
    it; until then neither is opened.

MOB-0 MAY REASSIGN ITS OWN FINDING, AND THAT IS STATED IN ADVANCE. If the divergence resolves to
a backend defect in R9/R10 or in the cache layer, it is not mobile-track work and leaves this
track for its own module. If it resolves to two observations taken at two different moments, the
finding is retired and a fresh simultaneous post-deploy observation is what is owed instead. Both
outcomes are stated now so neither is absorbed later as though it had been the plan.

THE 32 PHYSICAL-PROPERTY SITES STAY WITH (b), where they were parked. MOB-1 adds ZERO physical
properties under CLAUDE.md:482 and does not sweep the pre-existing 32. If MOB-1's work deletes or
rewrites some of them incidentally, that is a MEASURED movement of (b)'s baseline, re-derived at
(b)'s Step 0 and never carried from the Phase A figure of 32 across 12 files.

STANDING CONSTRAINTS BINDING EVERY PHASE OF THIS TRACK, cited not restated: logical properties
only, no ml-/mr-/pl-/pr- ADDITIONS (CLAUDE.md:482), load-bearing for the Phase 6 RTL sweep and
the single constraint most likely to be violated by accident in responsive work; CSP enforcing
with no Report-Only net (CLAUDE.md:470), any new external origin in deploy/Caddyfile in the SAME
commit; the protected QuickAdd journey and the FIXED design-5.3 FAB topology, which does not move
without an operator ruling; ink and brass, brass rationed, components/ui/* direction-free; no
renames; the pinned strings; the three named regression files green AND untouched.

THE E2E SUITE IS NOT TOUCHED BY THIS TRACK. No repair, no revival, no deletion, as a side effect
of any phase. Its disposition is its own module on the open ledger.

QUEUE ITEMS CARRIED, NONE OPENED BY THIS BLOCK: the subscriptions definition (three candidates,
none chosen); the KPI visual-vs-informational question; Home suppressing a card Insights renders
from the same payload; the demo seed's one-month budget shelf life; FF-R7(a); the ten items from
10e's close; and B4-3-R2, the frontend tsconfig test-file exclusion measured once at ~23 genuine
errors across 6 files. Cross-family token presentation and the R36-R101 recovery hypothesis are
SEPARATELY SCOPED to their own conversations and are NOT bundled here.

NOTHING IS IMPLEMENTED BY THIS BLOCK.

MOB-R2 — MOB-0 IS A SOURCE-SIDE MEASUREMENT. Report only, hard stop. No production observation is
requested in this cycle and none is to be inferred.

WHY SOURCE FIRST. The Phase A report established that R8, R9 and R10 all call the SAME builder,
_getSafeToSpendPayloadCached (aggregation.ts:1120, :927, :1042), which is what makes the observed
divergence surprising rather than routine. Determining from source whether two figures CAN
disagree, and under exactly what conditions, is cheap and it tells us which observation is worth
taking. Taking the observation first risks measuring a moment instead of a mechanism.

STEP 0, REPORTED, IN THIS ORDER.
  (0.1) `hostname; pwd` as the first line of the report, without exception.
  (0.2) HEAD SHA and `git status --short`, both pasted. A SHA that appears only in a relayed
        report and is never round-tripped against the repository is a label, not an identifier.
  (0.3) OPEN ENUMERATION: state which MOB-numbered ruling blocks you hold. Enumerate what you
        hold; do not confirm a list supplied to you. The outstanding set is settled by your
        enumeration, never by the channel's memory.
  (0.4) BASELINES, RE-DERIVED FROM THE ARTIFACT AT EXECUTION, NEVER CARRIED. Each command carries
        a RESOLUTION PROOF — a prior invocation, same selector, emitting a distinguishing token —
        because a pnpm filter matching no project EXITS 0 and emits no tail. Include a
        non-matching filter as a negative control and show it exiting 0. The packages are
        statera-api and statera-frontend; apps/web/ is a directory and statera-web is a Docker
        image, and neither is a package name. Capture $? on its own line after a NON-PIPED
        command. Report the Test Files summary line, not only the Tests line.
          pnpm --filter statera-frontend run test:unit
          pnpm --filter statera-api test
          pnpm --filter statera-frontend exec tsc --noEmit
          pnpm --filter statera-api exec tsc --noEmit
        STATED SO A MISS IS A QUESTION AND NEVER AN ADJUSTMENT: frontend 212 passed / 41 files;
        api hermetic 873 passed / 34 skipped / 61 files; both tsc 0 errors and 0 bytes; contract
        fixture 66; ALLOWLIST length 0 at apps/api/src/contract/frontend-contract.test.ts:54, both
        derived FROM THE FILE. A MISS IS REPORTED AND INVESTIGATED.
        INTEGRATION IS NOT OWED AND IS NOT RUN this cycle: no db.transaction() boundary is
        touched, no integration case is added or edited, and no code is written at all. Recorded
        as a deliberate omission with its reason, not as an oversight. For the record, its figure
        is 897 passed / 10 skipped / 61 files, and the two-mode relation 873 + 34 - 10 = 897 is
        COLLECTED-SET INVARIANCE — both modes collect 907 — not a coverage claim. Say it that way
        if you say it at all.

THE MEASUREMENT. The operator observed, on Home and on Insights at the same sitting, two
different daily safe-to-spend figures: Home KD 609.000, Insights KD 639.000. Determine FROM
SOURCE how many distinct expressions in apps/web can render a daily safe-to-spend figure, and
whether any two of them can disagree.

  D1 — ENUMERATE THE RENDER SITES. Every site in apps/web that renders a per-day safe-to-spend
       figure. For each: file:line, the component, the exact expression rendered, the API field it
       consumes, that field's WIRE TYPE, the formatter called, and the route that produced it
       (R8/R9/R10/R13). Show grep -n output, not a description. Derive the search vocabulary from
       the artifact — the field names in types/api.ts and the serializer — not from what the names
       are assumed to look like.

  D2 — SERVER-DERIVED OR CLIENT-DERIVED, PER SITE. State for each whether the figure arrives as a
       server-computed field or is recomputed in the client from remaining and a day count. If any
       site recomputes, that is the leading candidate and the report says so plainly.

  D3 — THE BUILDER. Confirm or falsify, from source at execution, that every enumerated site
       traces to _getSafeToSpendPayloadCached. If any does not, name the divergence point. If all
       do, state what remains that could still differ: cache key, cache TTL, the point in the
       request at which the day count is computed, and the pay-cycle bounds each route passes in.

  D4 — CAN THEY DISAGREE, AND UNDER WHAT CONDITIONS. Give the exhaustive condition set under which
       two enumerated sites render different values at one moment, reasoned from source. Include
       the case in which they CANNOT and the observation was of two different moments. Do not
       assume rounding; if rounding is a candidate, show the two formatters and the arithmetic.

  D5 — THE 30.000. Report whether any mechanism you found produces a difference of exactly 30.000
       on plausible inputs, and if so which. If none does, SAY SO. An unexplained magnitude
       reported as unexplained is worth more than a mechanism selected because it is available.

PREDICTIONS, STATED IN ADVANCE SO A MISS BECOMES A QUESTION. The channel expects D3 to find a
common builder and D4 to therefore land on either a client-side recomputation or a cache-timing
window. TRY TO FALSIFY BOTH. Report what is measured, not whether it agrees. A finding that the
sites CANNOT disagree is a valid and useful result and closes this cycle in the other direction.

INSTRUMENT DISCIPLINE. An empty grep is byte-identical to a command that did not run: pair every
zero with a positive control on a pattern known to match, and state what a populated result would
have looked like. Quote every glob-bearing argument; the shell is zsh and an unquoted glob that
matches nothing errors the whole command before the search runs. Derive every figure from the
FILE, never from a document about the file, including the Phase A report and this block. Paste
captured output rather than pointing at it.

SCOPE. NOTHING IS FIXED, NOTHING IS STYLED, NOTHING IS COMMITTED, NOTHING IS PUSHED. No
convention work, no responsive work, no zero-vs-no-data work. No test is written. The e2e suite is
not run, repaired, revived or deleted. If a discovery would enlarge this mandate, that is a
STOP-AND-ASK and a REQUEST, never a self-grant.

HARD STOP after the report.

MOB-R3 — e560810 IS ACCEPTED. The loose-versus-strict finding is CONFIRMED INDEPENDENTLY. One
classification is corrected, one capture gap is named, and the branch question is settled by
citation.

e560810 IS ACCEPTED. One file, docs-only, Format A, no phase opened, no package touched. The
open-items ledger recording the four things the block leaves open is the right instrument and was
not asked for: an unruled item that is not written down becomes a settled one by attrition.

THE CENSUS FINDING IS ACCEPTED AND INDEPENDENTLY CONFIRMED, and the confirmation is stated
because a channel that only accepts is not an instrument. The channel re-derived it from the FF
file directly. Under a strict pattern the FF file carries EIGHT headers. A loose sweep returns
ELEVEN, and the three extra matches are exactly what the implementer named: two body lines
wrapped to column 0 at :284 and :436, both beginning with a bare ruling number and NEITHER
carrying the em-dash separator, plus the deliberate sub-header at FF-R7(a), which carries the
separator but not the bare-number shape. Three distinct reasons for three extra matches, none of
them a real header. The FF amendment's count of 8 is TRUE.

THE CLASSIFICATION IS CORRECTED, AND THE ACTION IT PRODUCED STANDS. The report calls the FF
amendment "a historical record". It is not: that amendment declares itself "the live index from
the track close forward", in its own text. The action — do not edit it, record the measurement in
the live track's file — was nonetheless CORRECT, and the reason is not the one given.
  FIRST, the FF track is CLOSED, so its index governs a FROZEN artifact and cannot go stale;
  nothing will ever move under it. The live-index obligation to move when the tree moves is
  vacuously satisfied, not violated.
  SECOND, and this is the actual defect, the note is not STALE, it is UNDER-SPECIFIED: the count
  is true under the pattern the note means and the note never names that pattern. Staleness and
  under-specification have different remedies. The remedy for an under-specified index over a
  frozen artifact is a note in the LIVE track naming the pattern, which is what was done.
  RECORDED BECAUSE A RIGHT ACTION WITH A WRONG REASON IS AVAILABLE TO RECUR with the reason
  attached to a case where it does not hold — a live index over a MOVING artifact, edited under a
  historical-record classification, is exactly the failure 10e-R78 exists to prevent, and it would
  arrive looking like this precedent.

THE STRICT PATTERN IS THIS TRACK'S SWEEP INSTRUMENT AND THE COMPLETENESS NOTE NAMES IT
EXPLICITLY. This file carries ONE format only; there is no Format B here and a single pattern
therefore suffices, in contrast to the 10e file. Every future sweep of this file runs BOTH the
strict and the loose form and REPORTS BOTH NUMBERS. Agreement between them is the composite;
disagreement is positive evidence of a column-0 body line and is investigated before any append,
never after. The bare grep is a correlate; the composite is the instrument.
  THE :103 READ IS THE PART WORTH NAMING. Printing both column-0 lines and READING them, rather
  than inferring the count was clean, is what distinguishes a measurement from an arithmetic
  agreement. The body line beginning MOB-0 MAY REASSIGN is a genuine near-miss: it sits at column
  0 and begins with the track prefix, and it fails the pattern only on the character after it.

THE CAPTURE GAP, NAMED AND NOT A BOUNCE. The report ASSERTS one file, 132 lines, docs-only, and a
clean tree by empty output; it does not CARRY the bytes. There is no `git show --stat` naming the
one path, no census command with its output, and no `git status --short` output. The disposition
is not a return, for two reasons: the claims are consistent with everything else in the report,
and a single-path commit is settled by ENUMERATION, which is a stronger instrument than the
exclusion-by-pattern proof the FF precedent used — one path enumerated cannot hide a second.
  BUT A REPORT THAT POINTS AT A CAPTURED RESULT TRANSMITS A POINTER THE READER CANNOT RESOLVE,
  which is functionally identical to an uncaptured claim however genuinely the capture happened.
  The failure is invisible from inside the implementing session, because there the pointer
  resolves. This track is one commit old and the standard is set now or it is not set.
  OBLIGATION, FROM THE NEXT REPORT ONWARD: the bytes are in the report. `git show --stat` for the
  commit, the census commands with their output, and the `git status --short` output, all pasted
  or dumped, never retyped and never summarised.

BRANCHING: NO. TRACKS DO NOT BRANCH, AND THIS IS SETTLED BY CITATION RATHER THAN BY PREFERENCE.
A deploy is one git push of main; the ride-along rule diffs origin/main..HEAD as the
actually-deployed ref, having already been corrected once for comparing against local main; and
the parallel UX-redesign thread rode on main under that rule for its whole life. A track branch
would place this work outside the ref every deploy check reads, which converts a checked condition
into an unchecked one. Phase-4 commits land on main. Convention unchanged, and the implementer was
right to follow it and right to ask rather than assume.

CLAUDE.md IS CORRECTLY NOT EDITED, and settling it by the a39a0cb precedent in fact rather than by
inference is the better instrument. A Migration-status entry naming a track with no shipped
commits is a live index pointing at nothing. The entry lands at track close, with the baseline
line, exactly as the FF track did.

THE BOUNDED UNKNOWN IS ACCEPTED ON THE FF-R4 TERMS. The block was transcribed from a prompt with
no file to diff against, so byte-fidelity is not mechanically verified. The mitigation stands and
is the same: derive any load-bearing string from the SOURCE A BLOCK CITES, never by retyping it
from the block. As with FF-R3, this block's load-bearing content is predominantly file:line
citations and measured figures, every one of which is checkable against the tree — so a future
reader validating it holds a better instrument than the missing diff.

THE (b)/(c) ORDER IS STILL OPEN AND IS NOT RULED HERE. Neither of the two later phases opens
until the operator rules it. The channel recommendation sits in the file as offered-and-not-adopted
and is not to be read as adopted by the passage of a cycle.

PERSISTENCE, AND IT RIDES THE NEXT DOCS COMMIT BEFORE ANY BOUNDARY. Append MOB-R2 and this block,
verbatim, Format A, to docs/modules/phase4-mobile.md, and amend the completeness note to record
the persisted set and to name the strict sweep pattern per the clause above. Sweep the PAYLOAD for
header collisions BEFORE appending: the strict count of the payload must equal TWO. After the
append the file's strict count must equal THREE, first 1, last 3, no duplicates, no breaks in
1…3; reconcile that two ways and print the enumerated list in file order rather than pattern-
matching for presence. Run the loose form as well and report its number beside the strict one.
Record MOB-R2's provenance as RELAYED, RE-RELAYED AFTER NON-DELIVERY — it was authored and issued
alongside MOB-R1, did not reach the implementer, and was re-sent verbatim and unedited rather than
re-authored; its number and its original date are unchanged. Recorded as a delivery fault
diagnosed, not reconciled away, and surfaced by the implementer's owed-next enumeration and by
nothing else. This commit is docs-only and is permanently licensed to skip both test gates; state
that it is skipping them and why, rather than skipping them silently.

MOB-0 IS OPENED BY MOB-R2, NOT BY THIS BLOCK. Persist first, then execute it.

MOB-R4 — THE (b)/(c) ORDER IS RULED. THE MOB-0 REPORT IS ACCEPTED. The channel's prediction was
half falsified and the reasoning error is named. The divergence observation is DISCHARGED into a
class. Three requests are triaged, one of them opens nothing yet.

OPERATOR RULING BY DELEGATION, 2026-08-29. "Let's go with your recommendation," landing on the
channel recommendation carried in MOB-R1 as offered-and-not-adopted: the zero-vs-no-data class
runs BEFORE the convention sweep, on the two stated grounds — correctness precedes presentation,
and the earlier phase strictly shrinks the later one's surface. The sequence is now complete:
    MOB-1 RESPONSIVE, then MOB-2 ZERO-VS-NO-DATA, then MOB-3 CONVENTIONS.
  PHASE NAMES CARRY THEIR CONTENT WORD FROM HERE ON, and this is a legibility ruling with a
  reason. The phase label "MOB-3" and the ruling number "MOB-R3" differ by one character in a
  file that is swept by pattern for the second of them. The sweep instrument is unaffected because
  it anchors on the ruling form, but a HUMAN reader is not a pattern, and the two will be adjacent
  in this file for the rest of the track. Cite phases with the content word attached. Nothing is
  renamed; this governs citation, not identity.

THE MOB-0 REPORT IS ACCEPTED IN FULL. Step 0 complete, all six baseline figures matched with no
miss to investigate, resolution proofs with two negative controls both shown exiting 0, and
INTEGRATION correctly declared not-owed WITH ITS REASON rather than silently skipped. The
collected-set invariance was stated the way it was asked to be stated.

THE PREDICTION WAS HALF FALSIFIED AND THE FALSIFICATION IS THE VALUABLE HALF. Client-side
recomputation was named as the leading candidate and DOES NOT EXIST: no remaining-over-days
division occurs anywhere in apps/web, and days_remaining reaches production code at exactly one
site where it is rendered as a count and never used as a divisor. That is a clean kill, and the
instruction was to try to break the hypothesis rather than confirm it.

  THE CHANNEL'S REASONING ERROR, NAMED RATHER THAN LEFT AS AN INCOMPLETE PREDICTION. The channel
  reasoned from the Phase A finding that all three surfaces call the same builder to a disjunction
  — either the client recomputes, or the timing differs — and that disjunction was NOT exhaustive.
  It omitted the case the report found first: THE ROUTES PASS DIFFERENT ARGUMENTS INTO THE SHARED
  BUILDER. A common producer does not imply a common product; the inputs are a separate question
  and the channel never asked it. R10 hardcodes the current month while R8 takes the selected
  month, so the two surfaces can differ for as long as a past month stays selected, with no timing
  coincidence required at all. A structural cause was misfiled as a timing cause because "same
  builder" was read as "same value."
  NO NEW CLAUDE.md STANDING LINE, AND THE TEST APPLIED IS STATED SO THE DECLINE IS CHECKABLE. The
  count stays at SIX. The candidate rule would read "a shared producer does not imply a shared
  product," which is general and true — and it is a rule about ARGUMENT rather than about
  INSTRUMENT, where every one of the six lives. A standing rule that cannot be violated by a
  command, only by a sentence, has no place to fire and would be read past. Recorded here in the
  track file, where the reader who needs it is the one reading this track. Both prior tracks
  earned none; the bar is unchanged.

D5 IS CLOSED AND THE 30.000 IS NOT PURSUED FURTHER. The report was right to hold the magnitude as
unexplained rather than adopting an available mechanism, and the day-count-alone exclusion is a
genuine result — 639/609 reduces to 213/203, so the minimal integer day pair is 203 and 213 and
no calendar produces it. Rounding is excluded by four orders of magnitude.
  THE DISPOSITION IS THAT ATTRIBUTION IS NO LONGER WORTH ITS COST, AND THE REASON IS NOT FATIGUE.
  The report established that at least four independent mechanisms can produce a disagreement, at
  least two of them unbounded in magnitude, and no source-side reasoning distinguishes which one
  produced a single historical observation taken without instrumentation. Chasing it further would
  be selecting among mechanisms by availability, which is exactly what the report declined to do.
  THE OBSERVATION HAS ALREADY PAID FOR ITSELF: one screenshot pair surfaced a structural month
  mismatch, a dead invalidation key across eleven sites, and a client-cache regime that never
  self-corrects. That is the return, and it does not require the original figure to be explained.

MOB-R1'S ADVANCE REASSIGNMENT STATEMENT IS DISCHARGED, AND BY THE THIRD BRANCH RATHER THAN EITHER
OF THE TWO IT NAMED. It anticipated a backend defect leaving the track, or a retired finding
needing a fresh simultaneous observation. Neither obtains. What obtains is that the finding
DECOMPOSED into three separable items with three different homes, none of which is the original
question. The implementer stated plainly that it could not discharge the clause from source alone
and did not infer an observation it was not asked for; that refusal is correct and is the reason
the decomposition is trustworthy. Recorded as a discharge by decomposition.

THE THREE REQUESTS, TRIAGED. All three were raised as REQUESTS with their scope arguments stated
and none was acted on, which is the shape the standing rule asks for.

  REQUEST 1 — THE DEAD INVALIDATION KEY. Assigned the handle MOB-F1 and it is the sharpest thing
  in the report. Eleven invalidation sites across six files target a key prefix that no declared
  query carries, while the query they were plainly meant to refresh sits under a different first
  segment and is invalidated from exactly one place in the app. The positive control showing the
  same anchored pattern correctly finding a declared key is what makes the negative a measurement
  rather than an empty result.
    IT IS NOT MOBILE WORK AND IT IS NOT DEFERRED EITHER, AND THE ARGUMENT IS ABOUT INSTRUMENTS,
    NOT ABOUT SEVERITY. Every phase of this track is verified in part by the operator LOOKING at
    screens. With refetch-on-focus disabled, no polling anywhere, and the invalidation that should
    freshen one of the two surfaces landing on nothing, two open pages can hold client caches of
    arbitrarily different ages and never self-correct. A screenshot is therefore not evidence
    about the build; it is evidence about whichever cache generation that tab happens to hold.
    That is the push-is-not-a-deploy class one layer further in — a render is not a read of
    current state — and it corrupts the only instrument the responsive phase has.
    CHANNEL RECOMMENDATION, OFFERED AND NOT ADOPTED: open MOB-F1 as a short fix cycle BEFORE the
    responsive phase. OPERATOR DECISION. Nothing is opened by this block.
    ONE CONDITION ON ITS PHASE A WHENEVER IT OPENS, STATED NOW SO IT IS NOT DISCOVERED LATE: an
    eleven-site edit predicated on "no declared query matches this prefix" needs that negative
    established at full strength, so Phase A ENUMERATES EVERY DECLARED QUERY KEY IN apps/web and
    reads the list, rather than searching for the absence of one. Matching a name is not the same
    as reading the consumer. What the eleven sites SHOULD target — the exact key, or the broader
    first segment — is a design question for the proposal and is not settled here.

  REQUEST 2 — THE MONTH MISMATCH. It leaves this track and it does NOT become a defect module,
  because it is not yet established to be a defect. A weekly digest scoped to the current month is
  a defensible product choice; what is not defensible without a decision is rendering it beside a
  month-aware card so that selecting a past month puts two different daily figures on one screen
  with no indication they answer different questions. That is a PRODUCT question about what the
  digest is scoped to, and it is the operator's. QUEUED, NOT OPENED, and it joins the existing
  queue rather than starting a module.

  REQUEST 3 — THE FORMATTER ONE-ULP DIVERGENCE. Correctly assigned. It goes to MOB-3 CONVENTIONS,
  which already owns both formatters. The measured divergent case is a useful concrete input to
  that phase and is recorded with it rather than restated here.

THE INSTRUMENT SELF-REPORTS ARE RATIFIED AND THE SECOND ONE IS THE ONE WORTH NAMING. The unquoted
glob that errored before the search ran was caught, reported and re-run quoted — the exact zsh
failure whose appearance is byte-identical to an empty result. The scope slip on a positive
control was declared unprompted, with the fact it establishes correctly stated as unaffected.
DECLARING AN IMPERFECT CONTROL IS WHAT MAKES THE OTHER CONTROLS CREDIBLE; a report in which every
instrument worked perfectly is a report whose instruments were not examined.

TWO CORRECTIONS TRAVELLING ADJACENT TO MOB-R3, NEITHER FOLDED INTO IT AND NEITHER AN EDIT. That
block was issued before the MOB-0 report existed and is persisted with its text unchanged.
  (a) ITS CLOSING CLAUSE IS FALSIFIED BY EVENTS. It reads that MOB-0 is opened by MOB-R2 and
      instructs persist-then-execute. MOB-0 was in fact executed before MOB-R3 reached the
      implementer, because that block was issued in the same cycle as the mandate and the operator
      relayed the mandate first. Nothing is owed under it. The block is persisted as the historical
      record of an instruction whose premise passed, which is what a historical record is for.
  (b) ITS CENSUS FIGURES ARE SUPERSEDED, and the supersession is the self-falsifying-figure class
      operating exactly as predicted: a count describing the set it belongs to is falsified by any
      addition to that set, and MOB-R3 was correct when written. It specified a payload of TWO and
      a resulting file total of THREE. This block joins the same payload. THE OPERATIVE FIGURES
      ARE BELOW AND THEY ARE DERIVED AT COMMIT TIME, NOT CARRIED FROM EITHER BLOCK.

PERSISTENCE, RIDING THE NEXT DOCS COMMIT, BEFORE ANY BOUNDARY. Append the mandate block, MOB-R3
and this block — THREE blocks — verbatim, Format A, to docs/modules/phase4-mobile.md, together
with this cycle's MOB-0 report in full and the three triaged items.
  SWEEP THE PAYLOAD BEFORE APPENDING, NEVER AFTER. Strict count of the payload must equal THREE.
  After the append the file's strict count must equal FOUR, first 1, last 4, no duplicates, no
  breaks in 1 to 4. Reconcile two ways and PRINT THE ENUMERATED LIST IN FILE ORDER; a pattern
  match confirms presence and never order. Run the loose form as well and report BOTH numbers
  beside each other. If they disagree, a body line has wrapped to column 0 — halt before writing.
  DERIVE THE TOTAL AT COMMIT TIME FROM THE BLOCKS ACTUALLY PRESENT. If anything else is appended
  in the same commit, the figures above are wrong and yours are right; say so and show the
  reconciliation rather than forcing agreement with this block.
  PROVENANCE, PER BLOCK, because a set without one cannot be distinguished from a reconstructed
  set: the mandate block RELAYED, RE-RELAYED AFTER NON-DELIVERY, original number and date
  unchanged, re-sent verbatim rather than re-authored, the fault surfaced by the implementer's
  owed-next enumeration and by nothing else; MOB-R3 RELAYED, one cycle late relative to its issue,
  with the two adjacent corrections above; this block RELAYED.
  AMEND THE COMPLETENESS NOTE to record the persisted set, to name the strict pattern as this
  track's sweep instrument with the loose form run alongside it, and to record that both figures
  are reported at every future sweep.
  THIS COMMIT IS DOCS-ONLY AND IS PERMANENTLY LICENSED TO SKIP BOTH TEST GATES. State that it is
  skipping them and why, rather than skipping them silently. Prove docs-only by exclusion with the
  exclusion shown discriminating, and carry the bytes per the obligation MOB-R3 set: the stat
  output, the census commands with their output, and the status output, pasted and never retyped.

WHAT IS OPEN AFTER THIS BLOCK, AND IT IS ONE ITEM. Whether MOB-F1 opens as a short fix cycle
before the responsive phase. Until the operator rules it, NO phase opens — not the responsive
phase, not either of the two behind it. The channel recommendation above is offered and is not to
be read as adopted by the passage of a cycle.

NOTHING IS IMPLEMENTED BY THIS BLOCK.

MOB-R5 — THE HALT WAS CORRECT AND THE TRIPWIRE IS REPLACED. Option (c) is ADOPTED exactly as
probed. The bare loose form is RETIRED. Two corrections travel adjacent to the preceding block,
neither an edit. Prior tracks are NOT impugned, and the reason is stated rather than assumed.

THE HALT IS RATIFIED, AND THE PART THAT MATTERS IS NOT THE HALT. The instruction fired on its
stated premise — the two forms disagreed — and the implementer stopped before writing, which is
the whole point of running the sweep before the append rather than after. But the instruction also
carried a DIAGNOSIS, and the implementer checked the diagnosis against the artifact instead of
executing it. The diagnosis was FALSE. There was no wrap. The offending line is an authored
paragraph opener inside the preceding block's own verbatim text, failing the strict pattern on a
single character — an apostrophe where a space would be.
  A CORRECT INSTRUCTION WITH A FALSE DIAGNOSIS ATTACHED IS THE THING THAT WAS CAUGHT, and it is a
  more useful catch than a wrap would have been. Had the implementer acted on the diagnosis, it
  would have rewrapped a line that was never wrapped, spending a narrow licence on a non-problem
  and destroying the evidence that motivated this ruling. It declined on the correct ground: the
  pre-persistence reissue licence belongs to the block's AUTHOR, not to the implementer, and this
  channel is the author. That refusal is the disposition working as designed.

THE CHANNEL AUTHORED ITS OWN NEAR-MISS, AND THIS IS THE SECOND TIME IN THIS TRACK THAT CHANNEL
TEXT HAS TRIPPED THE CHANNEL'S OWN INSTRUMENT. The first was the body line beginning with the
phase handle at column 0 in the track-opening block, named a cycle ago and correctly classified as
a near-miss that failed on one character. This one is the same shape one character over, and the
implementer's argument for why it is not a one-off is accepted in full: the pattern is a
POSSESSIVE CITATION AT COLUMN 0, which this channel produces naturally when a paragraph opens by
naming an earlier block, and which will recur with a different number every cycle.

OPTION (c) IS ADOPTED, EXACTLY AS PROBED AND NOT AS IMPROVED. The tripwire pattern is
    ^MOB-R[0-9]+ (with a trailing space)
quoted in every invocation, because zsh will otherwise not deliver it intact. The strict form
    ^MOB-R[0-9]+ — (em-dash, space)
is UNCHANGED and remains this track's INDEX instrument. Both are run at every sweep and BOTH
NUMBERS ARE REPORTED. The bare form is RETIRED as a correlate that fires on prose.
  ADOPTED AS PROBED IS A CONDITION, NOT A PHRASE. The candidate was demonstrated against a
  four-line synthetic carrying a hyphen header, an en-dash header, a proper header and a
  possessive body line, and it returned 3 where strict returned 1 and the bare form returned 4.
  Substituting a cleverer pattern here — a character class, a negated set — would replace a
  MEASURED instrument with an UNMEASURED one on the strength of it looking better, which is the
  error this track has now named twice. Any future change to either pattern carries its own probe
  or it does not ship. THE PROBE IS PERSISTED WITH THIS BLOCK AS THE EVIDENCE FOR THE RULING; a
  ruling whose justification is an assertion is not checkable a cycle later.

(a) AND (b) ARE DECLINED, WITH REASONS THAT ARE NOT INTERCHANGEABLE.
  (a) REISSUE-AND-REWRAP is declined although the licence is available and this channel holds it.
  It would restore equality for one cycle and reproduce the halt on the next possessive, which the
  implementer stated and which is correct. It has a second cost that was not stated and is the
  stronger one: THE LINE IS EVIDENCE. It is the artifact that motivated the instrument change, and
  a reader running the retired form against this file a year from now sees the near-miss live
  rather than reading a description of one. Rewrapping it would erase the reason the ruling exists.
  (b) PERSIST-WITH-A-KNOWN-OFFSET is declined on the ground the implementer identified: an
  instrument whose baseline is N+1 requires every future reader to know the offset before the
  numbers mean anything, and a genuine wrap would then have to be recognised at N+2 against a
  baseline carried in prose. That converts a mechanical check into a remembered one, and the
  remembered ones are the ones that fail.

WHAT THE TRIPWIRE IS ACTUALLY FOR, STATED BECAUSE THE PROBE CHANGED THE ANSWER. Strict catches ONE
OF THREE header shapes — now demonstrated, not assumed — so a header typo'd with a hyphen or an
en-dash is invisible to it. That sounds alarming and is not, and the reason is the composite.
  A TYPO'D HEADER IS ALREADY CAUGHT BY THE SHAPE CHECK, NOT BY EITHER SWEEP. If a block's header
  fails strict, the enumerated list shows a BREAK at that number and the count disagrees with the
  payload's block count. Breaks, duplicates and first-and-last are the detection instrument; they
  have been run at every persistence commit in this project and they cover this class already.
  THE TRIPWIRE'S JOB IS THEREFORE DIAGNOSIS, NOT DETECTION — it tells you WHY a break exists,
  distinguishing "the block is absent" from "the block is present with a malformed header", which
  is the difference between recovering a lost ruling and fixing a character.
  PRIOR TRACKS ARE NOT IMPUGNED AND THIS IS POSITIVE EVIDENCE RATHER THAN AN ABSENCE OF REPORTS.
  The 10e and FF persistence commits each reconciled their counts TWO WAYS against the range and
  inspected the enumeration for breaks and duplicates. A typo'd header necessarily produces a break
  in the range route while leaving nothing else to see, so the agreement observed at every one of
  those commits is affirmative evidence that no header in either file is malformed.

NO NEW STANDING LINE. The count stays at SIX. The candidate rule — probe a pattern against the
failure it exists to catch, not only against the false positive that motivated it — is the
existing near-miss rider on tightening a pattern past its target, running in the opposite
direction, and it is cited rather than minted. Three tracks have now earned none between them and
the bar is not moved by a cycle wanting one.

TWO CORRECTIONS TRAVELLING ADJACENT TO THE PRECEDING BLOCK, NEITHER FOLDED INTO IT, NEITHER AN
EDIT. That block is persisted with its text unchanged.
  (a) ITS SWEEP CLAUSE IS SUPERSEDED BY THIS ONE. Where it instructs that the loose form be run
      and a disagreement treated as a wrap, the operative instruction is the tripwire above:
      run strict and the tripwire, report both, and treat a disagreement as a QUESTION whose
      answer is read off the artifact rather than as a diagnosis already made.
  (b) ITS DERIVE-AT-COMMIT-TIME CLAUSE FIRED EXACTLY AS WRITTEN AND IS RECORDED AS A CONTROL. It
      stated that if anything else were appended in the same commit its figures would be wrong and
      the implementer's would be right. This block is that something else. The clause is what makes
      a superseded figure a non-event instead of a discrepancy, and it is cheap enough to write
      into every persistence instruction from here on.

THE CAPTURE OBLIGATION IS DISCHARGED AND THE STANDARD IS NOW SET. Stat output naming the one path,
the status output with its emptiness marked between printed delimiters rather than asserted, and
the docs-only exclusion shown EMPTY on the docs commit and SIX PATHS on a known code commit. That
last one is the part that makes it a measurement: an empty exclusion is byte-identical to an
exclusion that does not discriminate, and the positive control is what separates them.

THE DOUBLE ARRIVAL IS A TRUNCATION, NOT A DIVERGENCE, AND THE DISTINCTION IS CHECKABLE. Reporting
it rather than passing over it is correct. The disposition for a ruling number arriving twice with
DIFFERENT text — report the divergence and answer neither version — governs two COMPLETE copies
that disagree, because at that moment neither end knows which is authoritative. A visibly
interrupted copy followed by a complete one is a PREFIX AND ITS COMPLETION, and a prefix is not a
version: there is no authority question to resolve and nothing to halt for.
  THE INSTRUMENT IS THE TERMINATION, NOT THE COMPARISON, and it does not require diffing prompt
  text. A copy that ends mid-sentence with no closing marker is established as incomplete BY ITS
  OWN TAIL. Read the tail; transcribe from the copy that terminates properly. That is what was
  done. The transcription seam stands unchanged as this track's bounded unknown: derive any
  load-bearing string from the source a block cites, never by retyping it from the block.

PERSISTENCE, RIDING THE NEXT DOCS COMMIT, BEFORE ANY BOUNDARY. The payload is now FOUR blocks —
the measurement mandate, the acceptance block, the sequencing block and this one — verbatim,
Format A, appended to docs/modules/phase4-mobile.md, together with this cycle's MOB-0 report in
full, the three triaged items, the halt report above, and the synthetic probe with its three
counts.
  SWEEP THE PAYLOAD BEFORE APPENDING, UNDER BOTH OPERATIVE PATTERNS. Predicted, so that a miss is
  a question and never an adjustment: payload strict 4, payload tripwire 4, AGREEING. The retired
  bare form would return 5 on this payload and that number is now meaningless; do not report it
  except once, in the completeness note, as the retirement's evidence.
  AFTER THE APPEND: strict 5 and tripwire 5, first 1, last 5, no duplicates, no breaks in 1 to 5.
  Reconcile two ways — 1 + 4 = 5 and 5 minus 1 plus 1 = 5 — and PRINT THE ENUMERATED LIST IN FILE
  ORDER. A pattern match confirms presence and never order. Derive the totals from the blocks
  actually present; if the payload changes, these figures are wrong and yours are right, and you
  say so and show the reconciliation rather than forcing agreement with this block.
  PROVENANCE, PER BLOCK: the measurement mandate RELAYED, RE-RELAYED AFTER NON-DELIVERY, number
  and date unchanged, re-sent verbatim rather than re-authored; the acceptance block RELAYED, one
  cycle late relative to its issue, ARRIVED TWICE AS A TRUNCATED PREFIX FOLLOWED BY A COMPLETE
  COPY, transcribed from the complete copy per the termination instrument above; the sequencing
  block RELAYED; this block RELAYED.
  AMEND THE COMPLETENESS NOTE to record the persisted set; to name strict as the INDEX instrument
  and the tripwire as the DIAGNOSTIC one, with both reported at every sweep; to record the bare
  form as RETIRED with its reason and its one evidential number; and to state that breaks,
  duplicates and first-and-last are the detection instrument and neither sweep is.
  THIS COMMIT IS DOCS-ONLY AND IS PERMANENTLY LICENSED TO SKIP BOTH TEST GATES. State that it is
  skipping them and why. Prove docs-only by exclusion with the exclusion shown discriminating, and
  carry the bytes.

WHAT IS OPEN AFTER THIS BLOCK, AND IT IS ONE ITEM, UNCHANGED AND NOT TOUCHED BY THIS CYCLE.
Whether the dead-invalidation-key fix opens as a short cycle before the responsive phase. Until the
operator rules it, NO phase opens. The channel recommendation is offered and is not to be read as
adopted by the passage of two cycles rather than one.

NOTHING IS IMPLEMENTED BY THIS BLOCK.

---

## MOB-0 — source-side measurement report (executed 2026-08-29, accepted by MOB-R4)

Report-only cycle under MOB-R2. Nothing was fixed, styled, committed or pushed; no test was
written; the e2e suite was not run, repaired, revived or deleted.

### Step 0

**(0.1)** `Khaleds-MacBook-Air.local` / `/Users/khaledalrashidi/DevLocal/public-statera`

**(0.2)** HEAD `e560810e0eb63cd6668ea10c8b24e98f2e14473e`, branch `main`. `git status --short`
printed **no lines** — that empty output is the tree-clean evidence, not the exit code.

**(0.3) Open enumeration — what was held, enumerated not confirmed:** MOB-R1 (persisted,
`e560810`) and MOB-R2 (prompt, unpersisted). That was the complete set. **This enumeration is what
surfaced the MOB-R2 non-delivery**, and nothing else did.

**(0.4) Baselines, re-derived. Resolution proofs first:**

| filter | token | exit |
|---|---|---|
| `statera-frontend` | `MATCHED-frontend` | 0 |
| `statera-api` | `MATCHED-api` | 0 |
| `statera-web` *(negative control)* | — `No projects matched the filters` | **0** |
| `apps/web` *(negative control)* | — `No projects matched the filters` | **0** |

Both controls **exit 0 while doing nothing**, which is the hazard MOB-R2 named. Package names read
from the manifests: `statera-frontend`, `statera-api`, `statera` (root).

```
 Test Files  41 passed (41)
      Tests  212 passed (212)
```
`$?` = **0**. Errors-instrument matches **0**, pattern shown firing on a synthetic line = 1.

```
 Test Files  51 passed | 10 skipped (61)
      Tests  873 passed | 34 skipped (907)
```
`$?` = **0**. Errors-instrument **0**.

`tsc --noEmit`: frontend exit **0**, **0 bytes**; api exit **0**, **0 bytes**.

Contract fixture **66**, derived by parsing the JSON. ALLOWLIST at `frontend-contract.test.ts:54`
— `[]`, length **0**.

**Every figure matched; no miss to investigate.** INTEGRATION not run and not owed: no
`db.transaction()` boundary touched, no integration case added or edited, no code written.
Deliberate omission with its reason. Its figure is 897 passed / 10 skipped / 61 files, and
`873 + 34 − 10 = 897` is **collected-set invariance** — both modes collect 907 — not a coverage
claim.

### D1 — the render sites

Vocabulary derived from `types/api.ts` and the serializer, not from assumed names. The only
per-day money fields that exist are `daily_rate_kd` (`api.ts:145`) and `safe_to_spend_today_kd`
(`api.ts:234`).

| # | file:line | component | expression | field | wire type | formatter | route |
|---|---|---|---|---|---|---|---|
| 1 | `sections.tsx:311` | `SafeToSpendHero` (:199) | `<AnimatedKDNumber value={Number(safeToSpend.daily_rate_kd)} />` | `daily_rate_kd` | `string` | `useAnimatedNumber` → `fmt3` | **R8** |
| 2 | `sections.tsx:307` | `SafeToSpendHero` | `formatKD(safeToSpend.daily_rate_kd)` (sr-only) | `daily_rate_kd` | `string` | `formatKD` | **R8** |
| 3 | `WeeklyDigestSection.tsx:115` | `WeeklyDigestSection` (:32) | `formatKD(digest.safe_to_spend_today_kd)` | `safe_to_spend_today_kd` | `string` | `formatKD` | **R10** |

Non-render consumer, named so it is not mistaken for a fourth site: `sections.tsx:213`
`Number(safeToSpend?.daily_rate_kd || 0)` feeds `safeToSpendTone` (badge colour) and renders no
figure. **R13 exposes no per-day safe-to-spend field** — checked, and the vocabulary grep is known
to work because it found both real fields.

**Home is R8. Insights is R10.** Not the same route.

### D2 — server-derived or client-derived

**All three are server-derived. No site recomputes.** There is no `remaining / days` division
anywhere in `apps/web`: `days_remaining` appears in production code at exactly one place,
`sections.tsx:321`, where it is rendered as a day count and never used as a divisor. `Number(...)`
at sites 1 and 213 is a string→number coercion of an already-computed field.

**This falsified the leading half of MOB-R2's stated prediction.** Client recomputation is not the
candidate; it does not exist.

### D3 — the builder

Confirmed. All three call sites reach `_getSafeToSpendPayloadCached` (`aggregation.ts:731`): R9 at
`:927`, R10 at `:1042`, R8 at `:1120`. One cache key, one TTL:

```
safeToSpendCacheKey(userId, month) -> `safe_to_spend:${userId}:${month}`   TTL 300s
```

R10 does not re-derive the figure — it reads the shared payload:
`safe_to_spend_today_kd: String(safeToSpendPayload.daily_rate_kd ?? "0.000")` (`:1052`).

What remains that can still differ, per the four axes MOB-R2 named:

- **Cache key** — keyed on `(userId, month)` only. `today` is **not** in the key, so a payload
  built at 23:59 can be served after midnight with a stale `days_remaining` for up to 300s.
- **TTL** — 300s server; the **client** caches are separate and longer-lived in practice:
  `["dashboard-bundle", month]` `staleTime 60_000`, `["insights","weekly-digest"]` global
  `staleTime 30_000`, global `refetchOnWindowFocus: false`, and **no `refetchInterval` anywhere in
  `src`**.
- **Day count** — computed inside the payload at build time and frozen into the cached object.
- **Month passed in** — **the routes disagree structurally.** R10 hardcodes
  `const month = currentMonthKey()` (`:1001`) and its client call `weeklyDigest()` takes **no month
  argument** (`api.ts:624`). R8 takes `selectedMonth` (`api.ts:573`, `hooks.ts:45`).

### D4 — the exhaustive condition set

**They CANNOT disagree** when both requests resolve to the same month, both responses derive from
the same server cache generation, and no write intervened. Then R10's field is `String()` of the
identical cached object and the two are byte-identical before formatting.

Otherwise, four mechanisms:

**C1 — Month divergence (structural, needs no timing coincidence).** Home's figure follows
`selectedMonth`; Insights' digest is always the current month. Select a past month on Home and the
two disagree for as long as the selection stands. This also makes Insights internally
inconsistent: its own `["insights","safe-to-spend",selectedMonth]` query is month-aware while the
digest beside it is not.

**C2 — Client-cache generation skew (dominant, unbounded).** Two independent query entries fetched
at different moments. With `refetchOnWindowFocus: false` and no polling, a page left open never
self-corrects.

**C3 — Invalidation asymmetry.** `invalidateQueries({queryKey: ["safe-to-spend"]})` appears at
**11 sites** and **matches no query**: the only declared key containing that string is
`["insights","safe-to-spend",selectedMonth]`, which does not have it as a prefix. Positive control
— the same anchored pattern correctly finds `["dashboard-bundle", selectedMonth]` *declared* at
`hooks.ts:45`, so the pattern distinguishes declaration from invalidation. Meanwhile `["insights"]`
is invalidated at exactly **one** site (`QuickAddContext.tsx:60`). A write from TransactionsPage /
ExpensesPage / IncomePage / BudgetPage / DashboardPage therefore refreshes Home and leaves
Insights' client cache untouched until it remounts stale.

**C4 — Server-cache generation boundary**, bounded by the 300s TTL, layered under C2. Server bust
coverage itself is good: `cacheBustSafeToSpend` is called from transactions (7 sites), budgets,
upload and auth.

**C5 — Two different moments**, which C2 and C3 make easy to produce without the user doing
anything unusual.

### D5 — the 30.000

**No mechanism found predicts exactly 30.000. Several admit it. The magnitude is reported as
unexplained.**

One clean result, and it is negative — **a day-count change alone is excluded**:

```
R/d1 = 639, R/d2 = 609  =>  d2/d1 = 639/609,  gcd = 3  =>  213/203
minimal integer day pair: d1 = 203, d2 = 213   (days_remaining <= 31)
```

A remaining-budget change fits arithmetically but does not single out 30: Δdaily = 30 requires
Δremaining = 30 × days — KD 30.000 at 1 day remaining, 60.000 at 2, 90.000 at 3.

**Rounding is excluded, with the arithmetic.** The formatters do differ — `fmt3` is `toFixed(3)`,
`formatKD` is `toLocaleString(en-US, 3/3)` — and a real divergent case exists, `609.0005` →
`609.000` vs `609.001`. But the bound is **one ulp at the third decimal (≤ 0.001)**, and 30.000 is
**4.93%** of 609. Rounding cannot produce this gap.

### Predictions, scored

Common builder: **confirmed**. Client recomputation: **falsified — no such code exists**. Cache
timing: **supported but incomplete** — the prediction did not anticipate C1, which is structural
rather than a timing window, or C3, which is a dead key.

### Instrument self-reports

One unquoted-glob failure occurred and was reported rather than absorbed: `--include=*.tsx`
produced `(eval):3: no matches found` — the grep **never ran**, byte-identical in appearance to an
empty result. Re-run quoted. Every zero was paired with a positive control. One positive control
accidentally matched `apps/web/dist/` because the `src` scope was dropped; the fact it establishes
(`refetchInterval` absent from `src`) is unaffected, and the slip was declared unprompted.

---

## The three triaged items (MOB-R4)

**MOB-F1 — the dead invalidation key.** Eleven `invalidateQueries({queryKey: ["safe-to-spend"]})`
sites across six files target a prefix no declared query carries; the query they were plainly meant
to refresh sits under `["insights", ...]` and is invalidated from exactly one place
(`QuickAddContext.tsx:60`). Not mobile work and not deferred: it corrupts the operator-screenshot
instrument every phase of this track depends on, because a render is a read of whichever cache
generation the tab holds, not of current state. **Channel recommendation, offered and NOT adopted:
open as a short fix cycle before MOB-1 RESPONSIVE. Operator decision. Nothing is opened.**
Condition on its Phase A whenever it opens: **enumerate every declared query key in `apps/web` and
read the list**, rather than searching for the absence of one. What the eleven sites should target
— the exact key or the broader first segment — is a design question for that proposal.

**Request 2 — the month mismatch.** Leaves this track; does **not** become a defect module, being
not yet established as a defect. A current-month-scoped digest is a defensible product choice; what
needs a decision is rendering it beside a month-aware card so a past-month selection puts two
different daily figures on one screen with no indication they answer different questions. **A
product question, the operator's. QUEUED, NOT OPENED.**

**Request 3 — the formatter one-ulp divergence.** Goes to **MOB-3 CONVENTIONS**, which already owns
both formatters. Measured input for that phase: `609.0005` renders `609.000` under `fmt3` and
`609.001` under `formatKD`; the bound is one ulp at the third decimal.

---

## Halt report — pre-append sweep of the MOB-R2…MOB-R4 payload (2026-08-29)

The sweep was run before the append, the two forms disagreed, and the write was halted. Captured
output, strict then loose:

```
=== PAYLOAD SWEEP — STRICT  ^MOB-R[0-9]+ —  ===
1:MOB-R2 — MOB-0 IS A SOURCE-SIDE MEASUREMENT. Report only, hard stop. No production observation is
88:MOB-R3 — e560810 IS ACCEPTED. The loose-versus-strict finding is CONFIRMED INDEPENDENTLY. One
186:MOB-R4 — THE (b)/(c) ORDER IS RULED. THE MOB-0 REPORT IS ACCEPTED. The channel's prediction was
strict count: 3

=== PAYLOAD SWEEP — LOOSE  ^MOB-R[0-9]  ===
1:MOB-R2 — MOB-0 IS A SOURCE-SIDE MEASUREMENT. Report only, hard stop. No production observation is
88:MOB-R3 — e560810 IS ACCEPTED. The loose-versus-strict finding is CONFIRMED INDEPENDENTLY. One
186:MOB-R4 — THE (b)/(c) ORDER IS RULED. THE MOB-0 REPORT IS ACCEPTED. The channel's prediction was
243:MOB-R1'S ADVANCE REASSIGNMENT STATEMENT IS DISCHARGED, AND BY THE THIRD BRANCH RATHER THAN EITHER
loose count: 4
```

Strict = 3, exactly as MOB-R4 required. Loose = 4. **The extra match is payload line 243, an
authored paragraph opener inside MOB-R4's own verbatim text, beginning `MOB-R1'S`** — failing the
strict pattern on one character, an apostrophe where a space would be. Not a wrap. MOB-R4's
premise (disagreement) held; its attached diagnosis (a wrap) did not.

The line was **not** rewrapped: that edits a verbatim block, and the pre-persistence reissue
licence for non-semantic layout belongs to the block's author, not the implementer. MOB-R5
subsequently declined the rewrap on a stronger ground — **the line is the evidence that motivated
the instrument change**, and erasing it would erase the reason the ruling exists.

**Note on the line numbers above:** they refer to the ephemeral scratchpad payload of that cycle,
which did **not** survive the session boundary and had to be rebuilt from context at the
persistence commit. The numbers are retained as the captured bytes of the halt; they do not index
any surviving file. Recorded because it is 10e-R239's lesson applying to a *working* artifact
rather than to a ruling: a scratchpad file is not persistence.

---

## The tripwire probe — evidence for MOB-R5's adoption of option (c)

Four-line synthetic carrying a hyphen header, an en-dash header, a proper header and a possessive
body line. **Rendered here with `cat -n` line numbers, and that rendering is load-bearing:** the
probe's raw lines sit at column 0 and would otherwise inject a phantom `MOB-R9` header into this
file's own index. The hazard is quantified below; this is the collision the pre-append sweep
exists to catch, demonstrated on the very artifact that motivated the instrument.

```
     1	MOB-R9 - hyphen not em-dash
     2	MOB-R9 – en-dash not em-dash
     3	MOB-R9 — proper
     4	MOB-R1'S possessive body line
```

Counts against that file, captured:

```
strict   '^MOB-R[0-9]+ — ' : 1
tripwire '^MOB-R[0-9]+ '   : 3
bare     '^MOB-R[0-9]'     : 4
```

**Strict catches 1 of 3 header shapes** — a hyphen- or en-dash-typo'd header is invisible to it.
**The tripwire catches all 3 and does not fire on the possessive.** The bare form fires on the
possessive, which is why it is retired. Against the real four-block payload the tripwire returns 4,
agreeing with strict.
