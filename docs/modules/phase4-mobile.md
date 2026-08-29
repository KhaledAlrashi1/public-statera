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
