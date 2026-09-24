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

### Amendment — MOB-R6 persistence commit, 2026-09-11

The amendment above is left as it stands. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R6**, complete and contiguous: first **1**, last **6**,
  **0** duplicates, **0** breaks in 1…6, derived from this file.
- **MOB-R6 provenance: RELAYED.**
- **PROVENANCE WORDING, CORRECTED (MOB-R6), and the correction travels adjacent rather than as an
  edit.** The MOB-R5 cycle's report and the halt-report note below both say the four blocks were
  "rebuilt from conversation context." That phrase is ambiguous between the two classes this
  apparatus exists to separate. **The correct class is RECOVERED** — read back verbatim out of the
  author's own emission, which is legitimate and precedented — **not RECONSTRUCTED** from prose,
  summaries or close-out reports, which is the class excluded outright. The act was correct; only
  the word was wrong, and a later reader has only the word. **From here on, provenance lines say
  the CLASS, not the mechanism.**
- **THE SCRATCHPAD IS NOT A RECORD AND ITS LOSS IS NOT A LOSS (MOB-R6).** The canonical source of a
  ruling block is the relay message in which the channel emitted it; the scratchpad is a staging
  convenience downstream of that. When it is absent, recover from the emission and **say
  RECOVERED**. The real loss would be the emission being gone, and the answer to that is the
  persistence commit already in force.
- **The two byte-fidelity claims are SEPARATE and only one is discharged (MOB-R6).** "Appended by
  redirect, retyped at no point" is true and establishes the **scratchpad→file** hop. It does
  **not** reach the **emission→scratchpad** hop, which is performed by transcription. **The
  transcription seam is therefore UNDISCHARGED** and remains this track's bounded unknown, on
  unchanged terms: derive any load-bearing string from the source a block CITES, never by retyping
  it from here. Recorded because a true claim sitting adjacent to an undischarged one reads as
  discharging it.
- **PROBE-COLLISION TECHNIQUE, recorded as durable technique (MOB-R6).** Evidence that demonstrates
  a pattern-based instrument is **header-shaped by construction** — that is what makes it a probe —
  so it is the one artifact guaranteed to trip the instrument it demonstrates. Never write a probe
  into the file whose pattern it probes without neutralising it first. **The remedy: persist it in
  a line-numbered rendering so no line begins at column 0, and MARK THE NUMBERING LOAD-BEARING**
  (as the probe section below does) so a later reader does not tidy it back and reintroduce the
  collision. An unexplained formatting quirk gets normalised by the next person who touches the
  file. This cycle's measured hazard: the probe would have added strict **+1** and tripwire **+3**.
  **No new standing rule was minted** — the existing sweep-the-payload-before-appending rule
  already covered it, the payload was swept, and the rule fired.
- **STANDING OBLIGATION ON THE CHANNEL, not on the implementer (MOB-R6):** any block instructing
  that pattern-shaped evidence be persisted states its neutralisation **in the same block**.
  Channel-authored text has engaged the collision instrument **three times** on this track — the
  phase-handle body line, the possessive citation, and the probe — two near-misses failing on one
  character and one genuine collision.
- **ACCEPTANCE CADENCE, LIGHTENED from the cycle after MOB-R6.** A docs-only persistence commit
  that meets every predicted figure **does not earn its own ruling block**: the implementer reports
  it, the channel acknowledges it in the message, and the acknowledgement rides the next
  substantive block. A block is issued only when it **(a)** opens or closes a phase, **(b)** rules
  something the operator or implementer cannot proceed without, or **(c)** records a finding costly
  to relearn. **Persistence is not relaxed** — every block issued still persists before any
  boundary; what changes is how many blocks are issued, not how they are kept.
- **Still open, still ONE item:** whether **MOB-F1** opens as a short fix cycle before MOB-1
  RESPONSIVE. No phase opens until the operator rules it. Four cycles have not adopted the channel
  recommendation.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX**.

### Amendment — MOB-R7/R8 persistence commit, 2026-09-11

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R8**, complete and contiguous: first **1**, last **8**,
  **0** duplicates, **0** breaks in 1…8, derived from this file.
- **MOB-R7 provenance: RELAYED. MOB-R8 provenance: RELAYED.**
- **MOB-F1 CACHE-INVALIDATION is OPEN** (operator ruling, 2026-08-29, direct), running **before**
  MOB-1 RESPONSIVE. Sequence: **MOB-F1 → MOB-1 RESPONSIVE → MOB-2 ZERO-VS-NO-DATA → MOB-3
  CONVENTIONS**. Phase A ran as measurement-and-proposal in ONE report (a deliberate compression,
  named at MOB-R7 so it is not read as a precedent) and is **accepted in full** at MOB-R8.
- **THREE CHANNEL CLAIMS WERE FALSIFIED by Phase A and are recorded as falsifications** (MOB-R8),
  because the cycle's own justification rested on them:
  - **(i)** The screenshot-instrument rationale is a **CROSS-TAB** hazard, and the `QueryClient` is
    a module-level singleton — one per JS context, one per tab — so key repair cannot touch it.
  - **(ii)** "Eleven broken behaviours" is **false**: 19 of the 20 dead sites are **SHADOWED** by
    an adjacent live invalidation covering the same payload. Dead **code**, not dead **behaviour**.
  - **(iii)** The in-tab divergence window is **bounded**, not unbounded: `refetchOnMount` defaults
    to `true` and was never overridden.
  **The decision to run this cycle first STANDS; only its reason is corrected** — the
  right-action-wrong-reason class, named on this track for the second time.
- **PROCEDURAL MITIGATION replacing the code one (MOB-R8), binding on MOB-1 RESPONSIVE:** operator
  UI observations are taken **in ONE tab, from a fresh load, navigating between pages**, and the
  report **states that this was done**. It also inherits the standing requirement that any operator
  UI observation state **the deploy completed first**.
- **The client-cache regime, measured and recorded** (Phase A F7): global `staleTime 30_000`,
  `retry 1`, `refetchOnWindowFocus: false`; **`gcTime` never declared** → default 5 min;
  `refetchOnMount`/`refetchOnReconnect` never declared → default `true`; **no `refetchInterval`
  anywhere**. The matching rule is pinned to **`@tanstack/query-core@5.100.9`** and derived from
  that package on disk, not from memory.
- **THREE ITEMS WITH THE OPERATOR, none blocking implementation** (MOB-R8), each a channel
  recommendation **offered and not adopted**:
  - **Item A** — the three dead lines inside `QuickAddContext.tsx` (`:54`, `:58`, `:59`), a
    **protected surface**. Recommendation: DELETE. Withholding them was correct.
  - **Item B** — the four unreachable `["budgets", <month>]` sites. Recommendation: FOLD IN, with
    their own per-site P1 entry, quantified behaviour change and discriminating test.
  - **Item C** — the cross-tab regime. Recommendation: **QUEUE, DO NOT OPEN.** Trigger recorded:
    any requirement that two simultaneously-open contexts agree.
- **The tripwire continues to earn its place.** This payload's sweep was **strict 2 / tripwire 2,
  agreeing**, with one further column-0 `MOB-` line read and classified — a wrapped phase handle
  (`MOB-2 ZERO-VS-NO-DATA, then MOB-3 CONVENTIONS.`) matching neither operative pattern. Both
  numbers are reported at every sweep, per the MOB-R5 instrument ruling.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX**.

### Amendment — MOB-R9 persistence commit, 2026-09-11

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R9**, complete and contiguous: first **1**, last **9**,
  **0** duplicates, **0** breaks in 1…9, derived from this file. **MOB-R9 provenance: RELAYED.**
- **MOB-F1 CACHE-INVALIDATION has SHIPPED CODE** — `90c65ec`, 17 of the 20 dead sites repaired,
  preceded by its persistence commit `fa59ee6`. The close-out record with all carried evidence is
  persisted below. **Deploy is NOT authorised by MOB-R9 and has not happened.**
- **DEFERRED OBLIGATION, WITH ITS TRIGGER SO IT CANNOT EVAPORATE (MOB-R9).** The frontend baseline
  moved **212 tests / 41 files → 215 / 42**. The standing-rules baseline line was NOT edited,
  because MOB-R8 required both "show the baseline hunk as a diff" and "show the standing-rules file
  untouched" — and the figure lives in that file, so the two cannot both hold in one commit. That
  contradiction was a **channel error**, resolved at MOB-R9: the diff-hunk form is **deferred to
  TRACK CLOSE, not waived**. **TRIGGER: at this track's close, the CLAUDE.md baseline edit ships
  with its `git diff` old→new hunk**, per the standing requirement that a baseline change is
  confirmed with the hunk itself and never with a prose restatement.
  **General form, recorded so it does not recur:** a close-out requirement written for a commit that
  MOVES a figure does not apply unchanged to a commit that moves the figure's SUBJECT while freezing
  the file recording it. When a block imposes both, **the block is wrong and the implementer reports
  the collision rather than choosing.** The baseline line is a LIVE INDEX, and a live index
  deliberately frozen must carry a stated release point — now stated.
- **TWO MEASURED SUITE LIMITATIONS (MOB-R9), recorded with the cost of removing them:**
  - **`DashboardPage.test.tsx` and `BudgetPage.test.tsx` cannot assert cache state at all** — each
    constructs its `QueryClient` inside `renderPage()` and never returns it. Cost of removal:
    change both signatures and update their existing call sites, an edit to two shared harnesses.
  - **Both stub their sections inert**, so no trigger seam exists for a user action that issues an
    invalidation. Cost of removal: add trigger-rendering stubs to two `vi.mock` factories — the
    enumerating-factory class this project has already been bitten by on the api side.
  Together these are **why the suite was structurally incapable of catching this defect class**,
  the same family as the earlier frontend finding. MOB-F1's new test file routed around them by
  carrying its own harness; the limitation itself is untouched and is recorded so a future cycle
  does not pay for it twice.
- **A WITHDRAWN ARGUMENT, recorded as a withdrawal (MOB-R9).** The implementer first argued that the
  test count holding at 212/41 proved no existing test was force-edited. **That reasoning is
  NON-DISCRIMINATING and is withdrawn**: an edit adding and removing no case leaves the count
  identical, so it agreed with the hypothesis and its negation equally. Re-established with the
  discriminating instrument — an **empty diff over all pre-existing test paths (count 0)**, behind a
  positive control showing the same pathspec reporting two files on a commit that did edit tests.
  The claim was true; the reasoning was not evidence, and those are different problems.
- **The new tests mount the REAL page.** `DashboardPage` is rendered for real with its real write
  handlers; every `vi.mock` targets a dependency, never the page. The two stand-ins are
  presentational children invoking the real handler props. Proven discriminating by the RED run,
  which reverted only the five production files and reddened all three cases. **This is a
  strengthening over the existing harnesses**, recorded as such per MOB-R9.
- **Item B's price has CHANGED (MOB-R9).** The four unreachable `["budgets", <month>]` sites can no
  longer ride an approved commit — they are **their own commit** now. The recommendation to fold
  them in still stands on the merits, restated at the new price rather than carried at the old one.
  **Items A and C are unchanged**, offered and not adopted; cycles passing does not adopt them.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX**.

### Amendment — MOB-R10 persistence commit, 2026-09-11

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R10**, complete and contiguous: first **1**, last **10**,
  **0** duplicates, **0** breaks in 1…10, derived from this file. **MOB-R10 provenance: RELAYED.**
- **MOB-F1 CACHE-INVALIDATION IS CLOSED.** Three commits: `fa59ee6` (persistence), `90c65ec`
  (implementation, 17 sites), `b198386` (close-out record), plus this one. **NOT DEPLOYED** — the
  deploy is the operator's and no block has authorised it. Any later UI observation of this fix
  **states that the deploy completed first**.
- **CONTROL-PROVENANCE ITEM — DISPOSED: the command changed, and the implementer changed it.**
  MOB-R10 offered two readings; the answer is the worse one. `| head -3` and `| head -2` were
  appended to the docs-only positive control in two successive reports to keep output compact, and
  neither was declared — a **silently modified instrument**, not a transcription elision. Prior
  form re-run verbatim against the same immutable input returns **6** paths; the 3 and the 2 are
  its first 3 and first 2, confirmed by running all three forms side by side. **The docs-only
  claims are unaffected** — three paths discriminate against zero exactly as six do; what was
  damaged was the control's provenance, not the conclusion.
  **DURABLE FORM: a control is run in ONE form and that form does not change between cycles; if its
  output must be shortened, the shortening is named in the same breath.** A control whose output
  moves for an undeclared reason stops being a control, because its entire function is to prove the
  instrument *could* have reported — and an instrument quietly narrowed cannot support that proof.
  This is the **second reporting defect** this track has caught as distinct from a verification
  defect; both were caught by the channel re-deriving a figure rather than reading the report.
- **FIFTH COLUMN-0 INSTANCE, AND THE FIRST AUTHORED BY THE IMPLEMENTER.** The MOB-R10 payload swept
  **strict 1 / tripwire 2** — a disagreement, so the write halted. The extra match was in the
  implementer's own close-out prose (`MOB-R10 offered two possibilities…` opening at column 0), not
  in any verbatim block. Because it was the implementer's own text it was **rewrapped rather than
  escalated** — the reissue licence question does not arise when the author and the editor are the
  same party — and the re-sweep returned **1/1, agreeing**. The four prior instances were
  channel-authored; the instrument is now shown catching both parties.
- **THE DEFERRED BASELINE OBLIGATION REMAINS LIVE**, unchanged and carrying its trigger: the
  standing-rules frontend baseline line moves at **TRACK CLOSE** with its `git diff` old→new hunk
  (**212/41 → 215/42**), never a prose restatement.
- **Still open, none ruled:** **Item A** (three protected QuickAdd lines), **Item B** (four
  unreachable budget sites — now **its own commit**, no longer a free ride-along), **Item C**
  (cross-tab regime), and **the deploy**. Cycles passing does not adopt any of them.
- **NO PHASE ADVANCES.** MOB-1 RESPONSIVE opens on its own block, after the operator disposes of
  the open items or explicitly leaves them open and says so.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX across four tracks**.

### Amendment — MOB-R11/R12 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R12**, contiguous: first **1**, last **12**, **0**
  duplicates, **0** breaks in 1…12. **MOB-R11 provenance: RELAYED, RE-RELAYED AFTER TWO
  NON-DELIVERIES** — number and date unchanged, re-sent verbatim, never reconstructed.
  **MOB-R12 provenance: RELAYED**, carrying an adjacent correction from MOB-R13 (below).
- **MOB-R13 IS HELD, NOT PERSISTED, AND THE REASON IS MECHANICAL.** Its Provenance sentence wraps
  so that a line begins `MOB-R11 RELAYED, …` at column 0 — a **genuine wrap**, tripwire-only,
  which made the three-block payload sweep read **strict 3 / tripwire 4** and halted the write.
  The pre-persistence rewrap licence is the **author's**, not the implementer's, so it was reported
  with its minimal layout-only remedy rather than applied. MOB-R11's own persistence clause
  instructs persisting **R11 + R12**, which is executable and swept clean at **2/2**, so that is
  what shipped. **MOB-R13 appends at 13 once reissued**; the index will then read 1…13.
- **THE SIXTH COLUMN-0 INSTANCE IS THE FIRST GENUINE WRAP.** The five prior were authored paragraph
  openers, a possessive citation, or the probe. MOB-R4's original diagnosis — *"a body line has
  wrapped to column 0"* — was **false when written and is true now**. The instrument has caught the
  thing it was once wrongly said to have caught, on both parties' text.
- **THE THREE ITEMS ARE RULED** (operator, by delegation, 2026-08-29): **Item A DELETE**,
  **Item B FOLD IN**, **Item C QUEUE**. One implementation commit carries A and B.
  - **Item A** lifts the protected-surface constraint for **those three lines and nothing else**;
    QuickAdd internals stay untouchable in every other respect and the FAB topology is unmoved.
  - **Item C carries its trigger:** any requirement that two simultaneously-open contexts agree, or
    any operator staleness report that survives a single-tab fresh load. **The procedural
    mitigation stands in its place** — UI observations in ONE tab, fresh load, navigating between
    pages, and the report says so.
- **THE CONTROL FORM IS ADOPTED FOR THIS TRACK (MOB-R11):** a control runs in **ONE FORM ACROSS
  CYCLES**, and if its output must be shortened the shortening is **named in the same breath**. A
  control's value is entirely its comparability across runs, so a silently changed control is not a
  weaker control — it is not a control at all, and the page cannot tell the two apart. **No new
  standing rule minted**; this is the named-elision rule's instrument-side twin, cited.
- **THE COMMIT COUNT IS MEASURED, AND TWO EARLIER FIGURES WERE WRONG — not merely unmeasured.**
  Measured against a real `origin/main` (`eba7385`): `git rev-list --count origin/main..HEAD` = **7**,
  and the enumerated `git log --oneline` = **7**, agreeing.

  | report | stated | actual | verdict |
  |---|---|---|---|
  | MOB-R9 close-out | FOUR | **6** at `b198386` | **wrong by 2** |
  | MOB-R10 close-out | FIVE | **7** at `74676a7` | **wrong by 2** |
  | MOB-R12 halt | SEVEN | **7** | correct |

  **4 → 5 → 7 grew monotonically while two of its three terms were off by the same amount** — the
  plausible-growth shape the channel named, and nothing in a report could have caught it. **Durable
  form: a commit count is derived from the range, never from what the session remembers adding.**
  The implementer had personally made every one of those commits and still got it wrong twice;
  recency is not enumeration.
- **NOTHING IS PUSHED.** Seven commits unpushed at this amendment; the push is the operator's, and
  the channel's recommendation changed from *push now* to *wait and bundle A/B* — stated as a
  changed recommendation, not made quietly.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX across four tracks**.

### Amendment — MOB-R13 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R13**, contiguous: first **1**, last **13**, **0**
  duplicates, **0** breaks in 1…13. The break at 11 recorded in the previous amendment is
  **CLOSED**. **MOB-R13 provenance: RELAYED, REISSUED PRE-PERSISTENCE BY ITS AUTHOR.**
- **THE REISSUE NOTE'S SCOPE CLAIM IS FALSIFIED BY DIFF, and this is recorded because it is
  checkable-and-wrong — the class this project rates worse than an uncheckable claim.** The note
  says: *"Exactly one line changed… No token was added, removed or altered. A reader comparing this
  against the first relay sees a wrapping difference and nothing else."* The first relay was still
  on disk, so the two were compared **token-wise, where a pure rewrap shows nothing**:

  ```
  first relay : 89 lines, 1103 tokens
  reissued    : 144 lines, 1891 tokens
  tokens ADDED: 831      tokens REMOVED: 43
  ```

  **The wrap itself WAS fixed** — the first relay's line 82 (`MOB-R11 RELAYED, …` at column 0) is
  gone and the payload swept 1/1. But the reissue also added the REISSUE NOTE, the
  one-block-per-message paragraph, a rewritten PERSISTENCE clause, and two whole new sections; the
  43 removals are the old provenance list and the old persistence figures. **The added material is
  wanted and is persisted** — the defect is the scope claim, not the content. Noted with mild
  irony: the note asserting nothing was added is itself among the additions.
  **Durable form: a reissue that claims "layout only" is checkable against the prior relay whenever
  that relay survives, and the check is a TOKEN diff, because a line diff cannot distinguish a
  rewrap from a rewrite.**
- **FOURTH NON-DELIVERY, AND THE NAMING DISPOSITION IS SUPERSEDED BY ONE BLOCK PER MESSAGE.** The
  fourth occurred *inside the remedy written for the third*: MOB-R13 stated MOB-R11 was re-relayed
  alongside it, and again only one block arrived. Naming both numbers in a two-block message is
  **insufficient**; a block that must accompany another is **sent in its own message**, and the
  accompanying message says which number arrives separately. All four were caught by the
  implementer's open enumeration and by nothing else.
- **SIXTH COLUMN-0 INSTANCE — THE FIRST GENUINE WRAP — IS NOW CLOSED.** Reported with its minimal
  remedy and **not applied by the implementer**, because the pre-persistence rewrap licence is the
  author's. MOB-R4's original diagnosis (*"a body line has wrapped to column 0"*) was false when
  written and true here.
- **MOB-R12's SEQUENCING CLAUSE IS CORRECTED ADJACENT, NOT EDITED.** Its claim that the two cycles
  *"are not gated on each other in substance"* is **FALSE**: L8 re-derives the physical-property
  baseline across twelve files and the authorised commit touched two of them. **L8 is measured
  against the tree AFTER that commit** — which has now landed (`4cc2c847`), so L8 is measurable.
  If ever sequenced the other way, **L8 is DEFERRED, never estimated**.
- **F1 INCOMPLETENESS — THE CORRECTION TRAVELS ADJACENT, the persisted report is not edited.** The
  Phase A report records **28** declared queries; there are **29**. The parser matched `useQuery(`
  and missed `useQuery<BudgetData>(` at `budget/hooks.ts:121` — a generic type argument between the
  name and the paren. **No conclusion moves**: distinct first segments unchanged at **11**, the four
  dead segments still dead, the unreachable set still unreachable, Item B's analysis intact.
  **THE GENUINELY NEW PART: the parser's own self-check — "0 sites without a key" — was
  NON-DISCRIMINATING, because it counted only among the sites the parser had already found.** A
  completeness check computed over a search's own output cannot detect what the search missed; it
  agrees with the hypothesis and its negation equally and reads as reassurance, which is worse than
  no check. **AN ENUMERATION IS VALIDATED AGAINST THE ARTIFACT, NOT AGAINST ITSELF** — count a
  second way and reconcile the routes. **Cited into MOB-1 RESPONSIVE, whose entire deliverable is
  enumerations: EVERY L-ITEM ENUMERATION IS RECONCILED TWO WAYS**, and a self-check over the
  search's own output does not count as the second route.
- **THE A/B COMMIT IS ACCEPTED** (`4cc2c847`): Item A's three lines deleted, all confirmed shadowed
  by the single live sibling at `QuickAddContext.tsx:53`, zero tests owed with the reasoning
  stated; Item B's four sites repointed month-agnostically after the pre-check established the two
  months are independent state in two components. Close-out reconciled **215/42 → 216/42, +1 test
  +0 files, as predicted**.
- **Commit count at this amendment: measured, not carried.** The deferred baseline-hunk obligation
  remains live with its trigger at **track close**.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** The count stays at
  **SIX across four tracks**.

### Amendment — MOB-R14 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R14**, contiguous: first **1**, last **14**, **0**
  duplicates, **0** breaks in 1…14. **MOB-R14 provenance: RELAYED.** MOB-1 RESPONSIVE **Phase A is
  COMPLETE and ACCEPTED**; the full report is persisted below. **No proposal is opened.**
- **THE PHYSICAL-PROPERTY FIGURE IS 32 SITES ACROSS *NINE* FILES, DELTA ZERO. "Twelve files" is
  FALSIFIED and anything citing it is citing a falsified number.** Two independent routes agree on
  nine, and the second does not depend on the pattern being right: (1) re-measurement at `a39a0cb`,
  the commit where the figure was recorded, gives 32/9 — identical to HEAD; (2) **the record's own
  enumeration lists nine file paths while its prose immediately above says twelve**, and its site
  count reconciles at 32 across those nine. **The figure was wrong when written, not moved by
  intervening work**, and **the channel propagated it twice** — into the track-opening block and
  into this phase's L8 mandate — without checking it against the enumeration directly beneath it in
  the same document. That is derive-don't-carry's sharpest form: a figure taken from a *document
  about* the artifact rather than from the artifact, committed in the block instructing the
  implementer to re-derive rather than carry. **Three corrections in three places, none an edit** —
  the Phase A report and both carrying blocks are historical records; the correction travels
  adjacent. **The primitives zero is unaffected** and holds under both patterns, control 30.
- **L4's LABEL IS UPGRADED, AND THE MANDATE WAS WRONG.** The Button size table is **DERIVED**, not
  OBSERVABLE-ONLY: `preflight.css:12` sets `box-sizing: border-box`, so a declared height IS the
  rendered box height. **Every variant is below 44px; none reaches `h-11`.** An implementer showing
  a required label is unnecessarily weak, with the mechanism, is a report and not a deviation.
  **The call-site gap MOB-R14 identified is now closed:** 190 `<Button>` tags, **61** override the
  height in-tag, and **exactly ONE is above threshold** — `AppShell.tsx:562`, `h-14` = 56px, the FAB
  — subtracted as a false member. 54 remain below by explicit value; **6 carry `h-auto` and are
  reclassified OBSERVABLE-ONLY** (content-dependent). Two routes disagreed 187/27 vs 190/61; cause
  named — route 1's regex stopped at a `>` inside a nested JSX expression — and route 2 is
  operative because 190 matches the independent grep total.
- **STANDING INSTRUCTION — THE UNPUSHED COUNT IS RE-DERIVED BY BOTH ROUTES AT THE TOP OF ANY REPORT
  THAT STATES IT, OR IT IS NOT STATED.** It has now been wrong **four times** for one quantity, the
  fourth arriving one cycle after the same reporter measured it and wrote that recency is not
  enumeration. An omitted figure costs a command; a wrong one costs the credibility of the report
  around it. Measured at this amendment: **10**, both routes agreeing.
- **THE OBSERVATION LIST NEEDS NO DEPLOY, ESTABLISHED FROM THE DIFF AND REPORTED PER CHECK.** Every
  added or removed source line across the unpushed range is an `invalidateQueries` key argument, a
  deleted dead invalidation, or a four-line comment. **Zero lines match
  `className|style=|<[A-Za-z]|grid-|h-[0-9]|max-w|whitespace|overflow`** — control: the same
  pattern finds **9** on `eb036c2`, a commit that did change layout. **All eleven checks are
  runnable against the currently live build**, per-check table in the report below. The
  precondition is **satisfied differently, not waived**: the observed properties are identical in
  both builds. **The one-tab fresh-load precondition stands unchanged** — the cross-tab staleness
  limit (Item C) is queued unfixed.
- **TWO FINDINGS THAT WILL SHAPE THE PROPOSAL.** (i) **The breakpoint skew** — 85% of all
  responsive styling sits at `sm`, with two uses of `xl` and none above; the app is effectively
  **two-state**, so a mobile pass here is a question about *one* threshold, not five. (ii) **The FAB
  clearance gap** — the wrapper clears 64px while the FAB's upper edge sits at 136px, and the FAB
  shares `z-40` with the tab bar, so content can pass beneath it. Topology is **FIXED**; the remedy
  is a *clearance* question, not a *position* question, which matters because the obvious fix is
  the one the constraint forbids.
- **THE ASSUMED-CONVENTION CLASS NOW HAS THREE INSTANCES** in this project — the generic type
  argument (F1, last cycle), the numeric-suffix assumption (L8, this cycle), and the earlier
  vocabulary-derivation findings. Cited, not minted; the count stays at **SIX**.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.**

### Amendment — MOB-R15 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R15**, contiguous: first **1**, last **15**, **0**
  duplicates, **0** breaks in 1…15. **MOB-R15 provenance: RELAYED.**
- **THE OBSERVATION ROUND IS RECORDED AS AN OPERATOR OBSERVATION AGAINST THE LIVE BUILD**, taken on
  a **physical phone, not a simulator**, in one session. The deploy precondition was **satisfied
  differently, not waived** — MOB-R14's per-check diff analysis established the eleven checks read
  nothing the unpushed commits touched. **Nine of eleven observed and passing (1–6, 8, 9); THREE
  UNOBSERVED (7 untested; 10 and 11 need a resizable viewport). The unobserved are UNOBSERVED, not
  passing.**
- **TWO PASSES ARE DISCOUNTED, and the fault is the channel's authoring, not the observation.**
  **Check 8** (32px tap targets) — one attentive person tapping deliberately hits a 32px control;
  the 44px guideline is about **error rates** across users and conditions, so its pass and fail are
  not different worlds. **The L4 measurement stands on its own and is NOT weakened by this pass.**
  **Check 5** (FAB clearance) — passed while four of nine captures show the FAB overlapping content;
  the check asked about **interactive** elements and the overlaps are non-interactive, so it
  returned true while its underlying concern was real. **A check narrower than its concern reports
  on the narrow thing and reads as reporting on the broad one.** Both met L11's *form* (pass and
  fail stated separately) and failed its *purpose*. **No new standing rule** — the existing
  negative-case-equals-positive-case rule applied to a check the channel wrote. Count stays **SIX**.
- **A PREVIOUSLY-UNVERIFIED ITEM IS NOW VERIFIED IN PRODUCTION.** September captures show four KPIs
  at zero **with no delta chips**; August captures show chips present. That is the **frontend-fixes
  track's Item 4 empty-month delta guard**, which closed recorded explicitly as NOT verified in
  production because no observed month had zero rows beside a populated previous month. **The
  operator's unrequested month-switch produced exactly that state.** Verified by an observation
  nobody planned.
- **THE TENSE CLASS IS A DISTINCT DEFECT CLASS AND WAS MISFILED ONCE BY THE CHANNEL.** On a PAST
  month the safe-to-spend card renders a per-day figure equal to the whole monthly runway above a
  zero-days-remaining label, with on-pace/ahead-of-pace/"so far this month" copy about a finished
  month, and forward-looking advice about August rendered in September. **The root cause is failing
  to distinguish THE SELECTED MONTH from THE CURRENT MONTH — not zero-vs-absent.** Filing it under
  the zero class would have buried a distinct cause inside a phase scoped to a different one.
  **Severity corrected:** it requires a past month to be selected and the default view is
  unaffected, so **it does not jump the queue and no phase is resequenced.** The September captures
  ARE the zero class (on-track copy on a month with no transactions) — **two classes, one round,
  kept separate.** **The application already knows:** the needs-attention card renders a this-month
  badge vs a year-month badge correctly *in its own header*, then renders body copy assuming the
  present — the signal exists at one site and is unused at the site beside it.
- **QUEUED BY OPERATOR STATEMENT, NOT OPENED: CSV/spreadsheet import must let the user MAP THEIR
  COLUMNS to the application's fields.** Belongs with the import surface; **NOT mobile-track work.**
  **TRIGGER: the next cycle that opens import.**
- **NEXT CYCLE (not opened here): the responsive proposal against L1–L11, carrying the T1–T4 tense
  measurement IN THE SAME REPORT**, report-only, nothing proposed for T1–T4. The operator's three
  observed findings and the channel's two are **observed instances to be addressed within that
  proposal, not new scope**.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.**

### Amendment — MOB-R16 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R16**, contiguous: first **1**, last **16**, **0**
  duplicates, **0** breaks in 1…16. **MOB-R16 provenance: RELAYED.** **MOB-1 RESPONSIVE PHASE B is
  OPENED as a proposal**, carrying the T1–T4 tense measurement.
- **THE OBSERVATION ROUND IS BOUNDED AT 390 POINTS, NOT 320 — supersedes the MOB-R15 amendment's
  coverage line.** Every check in the list specified **320**; the operator observed on a physical
  iPhone at **390** points (1170×2532 at 3x). **Neither party noticed the widths did not match.**
  **Checks 1–6, 8 and 9 are re-labelled OBSERVED-AT-390. The 320 case is UNOBSERVED** — and 320 is
  where the measured tight layouts are likeliest to fail (the 232px dialog template inside a 304px
  dialog; the non-wrapping money values). At 390 those templates have 86px more to work with.
  Checks 7, 10, 11 remain unobserved at any width.
- **THIRD CHECK-AUTHORING DEFECT IN ONE LIST**, after the two discounted at MOB-R15. The channel
  specified a width, gave desktop instructions for achieving it, then offered a physical device as a
  *better* alternative — **without noticing a physical device fixes the viewport and cannot deliver
  the specified width at all.** Physical-device evidence is stronger in every respect except the one
  the check was about; **the controlled variable was traded for realism without saying so.** All
  three defects share one shape: **the check was narrower or looser than the property it was written
  to settle, and the pass read as settling the broader property.** A list of individually well-formed
  items can still fail collectively if **the mapping from check to claim** is not itself checked.
  **No new standing rule** — the existing non-discriminating-check rule, with the failure located in
  the SPECIFICATION rather than the instrument. Count stays **SIX**.
- **A 320 TOP-UP IS RECOMMENDED AND IS THE OPERATOR'S, NOT OWED BY PHASE B:** four checks at 320 in
  desktop responsive mode — the four pages, a transaction edit dialog, the settings dialog, and the
  Insights money figures. **The proposal proceeds without it**, marking every 320-dependent item as
  resting on the L-series source measurement rather than on observation.
- **THREE REFERRALS TO THE OPERATOR, options proposed and none chosen:** **(A) tap-target policy**
  (the size table is app-wide, so raising it is not a mobile-only change); **(B) KPI enclosure —
  REFERRED TO THE DESIGN TRACK and NOT proposed here**, since KPI rework was reclassified as
  design-track work under the ink-and-brass constraints; the operator's observation is recorded
  against that referral so it is not lost, and **the value wrap is the part that is a defect and is
  in scope**; **(C) profile discoverability**, whose remedy changes navigation topology.
- **ONE ITEM REFERRED OUT OF THIS PHASE ENTIRELY:** the duplicate category label and the orphaned
  separator bullet on activity rows are **render/label defects visible at every width**, not
  responsive work. Channel recommendation, offered and not adopted: they belong to the **CONVENTIONS
  phase**. Queued, not opened, the operator's to place.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.**

### Amendment — MOB-R17 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R17**, contiguous: first **1**, last **17**, **0**
  duplicates, **0** breaks in 1…17. **MOB-R17 provenance: RELAYED.**
- **PHASE B IS PARTLY APPROVED: (i), (iv), (v) approved; (ii) and (iii) RETURNED; (vi) deferral
  ratified.** Items (i) and (iv) **do not ship ahead of the returns** — one implementation commit
  carries the approved set, because two commits means two verification rounds and two operator
  observation passes for one phase.
- **THE TENSE ENUMERATION HAD A SCOPE DEFECT AND ITS SIZING IS WITHDRAWN.** Four sites were
  reported; re-measurement finds **15**. The cause: the corpus was built from strings that NAME A
  MONTH, while the property is copy that is **present-tense or forward-looking ABOUT the selected
  month** — different sets, and a forward-looking claim need not mention a month to be wrong about
  one. **TWO ROUTES OVER ONE CORPUS ARE ONE ROUTE** — both routes were computed over the same
  month-bearing corpus, so they agreed with each other and with the wrong scope. This is the
  self-check-over-its-own-output finding recurring at the level of the **CORPUS** rather than the
  **PATTERN**, and it is the more dangerous form because the arithmetic looks right. **T4's sizing
  is WITHDRAWN; the sequencing decision is not put to the operator this cycle.**
- **ITEM (v) IS WITHDRAWN ENTIRELY BY RE-MEASUREMENT** rather than answered: the 340px column sits
  behind `isDesktop = useMinWidth(1024)` (`ImportDialogs.tsx:1324`, gate at `:2193`), so it never
  renders at 320 or 390. The L-series entry cited the declaration **without checking its render
  gate** — the same scope-error family as the tense defect.
- **ITEM (ii)'s RETURN WAS CORRECT AND THE PREDICTED FAILURE IS REAL.** All 24 `section-header`
  containers were parsed: **23 have two direct children, 1 has one.** But **4 of the 23 are
  `[icon, h2]` sibling pairs** (`InsightsPage.tsx:347`, `MonthDeltaCard.tsx:70`,
  `SpendForecastWidget.tsx:33`, `WeeklyDigestSection.tsx:45`) — stacking those puts the icon on its
  own line, exactly the break predicted. Those 4 are precisely the sites carrying `justify-start
  gap-2`. **The one-line change is falsified; the revised shape is 1 rule + 4 exceptions.**
- **THE CASCADE CLAIM IS PROVEN STRUCTURALLY, NOT BY EMISSION ORDER.** `.section-header` sits in
  `@layer components` (`index.css:183`), and the installed tailwindcss declares
  `@layer theme, base, components, utilities;` at `index.css:1` — **utilities win by layer
  precedence**, independent of source order or specificity.
- **ITEM (iv)'s PORTAL PRE-CHECK FOUND A NON-PORTAL DROPDOWN AND CLEARED THE CHANGE ANYWAY.**
  `Select`, `Tooltip` and `Dialog` all portal out; `suggestion-combobox.tsx:142` renders
  `absolute z-50 … overflow-y-auto` **in place**. Its four consumers sit inside `dialogs.tsx:335`
  and `:1006`, **both of which already declare `max-h-[92vh] overflow-y-auto`** — so **none of the
  14 gaining the declaration contains a non-portal dropdown. No exclusion needed.** A latent
  clipping condition in those two pre-existing dialogs is **recorded, not opened**.
- **FOURTH MIS-SPECIFIED CHECK, AND THE FIRST AUTHORED BY THE IMPLEMENTER.** Item (iii)'s check was
  written at 390 while the cost it names occurs at 320. Three of the four were the channel's; a
  pattern belonging to one party is easier to dismiss than one belonging to both.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.**

### Amendment — MOB-R18/R19 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R19**, contiguous: first **1**, last **19**, **0**
  duplicates, **0** breaks in 1…19. **Both provenance: RELAYED.**
- **BOTH BLOCKS' PREDICTED FIGURES WERE STALE AND THE IMPLEMENTER'S WERE RIGHT, per their own
  clauses.** MOB-R18 predicted "appending at seventeen … 16+1=17" and MOB-R19 "appending at
  eighteen … 17+1=18"; both were written before MOB-R17 landed at 17. **MOB-R19 also contradicted
  itself** — a block numbered 19 cannot append at 18 with "no breaks in 1 to 18". **The implementer
  HALTED on that contradiction rather than picking a reading**, and the arrival of MOB-R18 resolved
  it: R18 → 18, R19 → 19, index contiguous. Renumbering a block or guessing which artifact was
  wrong would have manufactured a ruling number.
- **IMPLEMENTATION IS AUTHORISED (MOB-R18): items (i)–(iv) ship as ONE commit.** **Item (v) is
  WITHDRAWN and ships nothing; item (vi) stays DEFERRED** pending a 320 observation.
- **ITEM (v)'s WITHDRAWAL IS A SHARED DEFECT AND THE CHANNEL PROPAGATED IT FIRST.** The L5 report
  cited the 340px declaration **without its render gate**; the channel then put it on the
  observation list as a 320 check and into the proposal mandate as an item to fix, **without
  checking the gate either**. Two parties, three cycles, one unchecked conditional. **A STRING'S
  PRESENCE IN A FILE IS NOT ITS PRESENCE ON A SCREEN.**
- **THE GATE-CONDITIONAL FOLLOW-ON IS DISCHARGED.** Every finding entering the proposal and the
  observation list was checked for a width/device/feature gate: the four icon sites, the 19
  two-block sites, the KPI tiles, the FAB and three of four dialog files carry **zero**
  `useMinWidth`/`matchMedia`. `ImportDialogs.tsx` carries six, but `isDesktop` belongs to
  `PreviewImportDialog` (`:1261`) alone, and the two in-scope dialogs at `:516`/`:1062` sit in
  different components. **Item (v) was the only gated finding.**
- **THE TENSE RE-MEASUREMENT IS ACCEPTED AT FIFTEEN.** Corpus from the surfaces (124 strings, 10
  files) plus a structurally-built second corpus from the narrative builders, which **caught one
  the first missed**. **T4's sizing stays WITHDRAWN on the implementer's own motion** — declining
  to re-size in the same breath as correcting the measurement. Recorded for whenever it is sized:
  15 copy sites + a server guard + a boolean to hoist **spans both packages**, which no mobile-track
  phase has done.
- **TWO OPERATOR RULINGS, DIFFERENT CLASSES (MOB-R19). Tap targets — BY DELEGATION**, the
  touch-only minimum. **Profile discoverability — DIRECT**, the header control. **Neither opens
  now**; each takes its own proposal cycle after the implementation commit.
- **THE HEADER-CONTROL PRE-CHECK MAY FALSIFY ITS OWN REMEDY**, and leads that phase: the operator's
  report is ambiguous between *the control is misplaced* and *the menu gives no indication of what
  is inside*. **If the menu is the defect, relabelling it is proposed instead — that is a SUCCESS of
  the pre-check, not a deviation from the ruling.**
- **THE COARSE-POINTER HAZARD IS RECORDED IN ADVANCE:** it is a **device-capability** switch, not a
  width switch — it fires on a touch laptop and not on a narrow desktop window, so it is **not
  equivalent** to the narrow-width threshold the rest of this track uses. **That tension is reported,
  not resolved silently.** The FAB is **not** resized by it; a global table change that would move
  it is a STOP-AND-ASK.
- **THE 320 TOP-UP REMAINS OUTSTANDING AND IS THE OPERATOR'S.** Three checks unobserved, item (vi)
  deferred on it, item (iii)'s risk lives there. **Its absence is not a pass.**
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.**

### Amendment — MOB-R20 persistence commit, 2026-09-12

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R20**, contiguous: first **1**, last **20**, **0**
  duplicates, **0** breaks in 1…20. **Position DERIVED from the file (last was 19), not from the
  clause** — this track has had two blocks predict their own position from a state that had
  already moved, and one halt spent resolving it. **MOB-R20 provenance: RELAYED.**
- **THE CADENCE IS WIDENED BY OPERATOR INSTRUCTION (2026-09-12, direct): larger cycles, more per
  cycle, clarity preserved.** Measurement, proposal and implementation **collapse into one report**
  where the surface is enumerable from source. The proposal half is still **written** — it is the
  record of what was decided and why — but no longer waits a cycle. **NOT collapsed:** every named
  gate is a **hard stop**; any red test or forced test edit stops and asks; any mandate-enlarging
  discovery is a **REQUEST, never a self-grant** — *more* important as cycles widen, because an
  unsupervised cycle compounds a silent self-grant; and **operator observation rounds cannot be
  collapsed**, being the only instrument for layout. **Cost, stated:** more surface change per
  verification round, so a failed observation is harder to attribute.
- **THE SUITE IS THE INSTRUMENT; THE FLAG IS A PRIOR.** The Phase B flagged risk (a dialog selector
  assumption) did **not** fire; the red came from the item thought safest — an invalid JSX comment
  as a sibling expression inside `return()`, collapsing a whole file's collection (216 → 210). A
  flag that does not fire is not wasted, but **the flagged item gets attention and the unflagged
  items get its residue, so the marginal defect lands where nobody is looking.** Running the full
  suite after the LAST edit is what caught it, not judgement about where risk lay.
- **THE NUMBERING HALT IS VINDICATED.** Both blocks' figures were stale in the same way and neither
  was wrong about its own number; picking either reading would have written a wrong number or a
  wrong position permanently into the index. The distinction from the earlier gap — that one was
  ambiguous about **which artifact was missing**, this one about **which artifact was wrong** — was
  the implementer's, not supplied.
- **GATE 1 PASSES, with a firing control.** The installed **tailwindcss 4.2.4** exposes the named
  variant: a compiled probe emits `.pointer-coarse\:h-11 { @media (pointer: coarse) { … } }`. **My
  first control did not fire** — I looked for `min-width` when v4 emits range syntax; corrected, the
  control shows `lg:` → `@media (width >= 64rem)`. **No raw CSS, no new styling mechanism, no
  structural change.**
- **GATE 2 PASSES.** The touch minimum is `min-h-11` (44px) on the **base**, and `min-*` raises a
  floor without capping, so the FAB's `h-14` (56px) is untouched. No stop-and-ask.
- **GATE 4 FIRES — PART 2 (the profile header control) STOPS.** At 320 the **fixed** contributions
  alone consume 216 of 280px (mark 40 + gap-3 12 + gap-4 16 + three 44px controls 132 + two gap-2
  16), leaving **64px** for a two-line brand text block whose longer line is 17 characters and
  whose shorter line alone is ~63px. With today's **two** controls the same arithmetic leaves
  116px and fits. **Text width is a rendered property jsdom cannot measure — but the fixed subtotal
  is DERIVED and sufficient on its own.** Nothing in that row was shrunk; the brand mark is a
  rationed brass slot and was not touched.
- **PART 2a's PRE-CHECK ANSWERED AND REFINED ITS OWN PREMISE.** The menu is **adequately labelled** —
  entry `Profile` (then `Sign out`) inside `role="menu" aria-label="User menu"`, opened by a control
  showing the user's first name. **The defect is that on mobile the user menu does not render at
  all** (`hidden … lg:flex`), leaving only the hamburger; the command palette is likewise
  `lg:inline-flex`. So the mobile header holds **two** controls, not the assumed two-plus-menu.
  **No relabel is owed.**
- **THE DEPLOY RECOMMENDATION IS OFFERED AND NOT ADOPTED:** push before further UI work, because
  tap targets and the header control touch the **same surfaces** as the accepted responsive commit,
  and stacking unverified layers makes a failed check unattributable.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** Count stays **SIX**.

### Amendment — MOB-R21 persistence commit, 2026-09-18

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R21**, contiguous: first **1**, last **21**, **0**
  duplicates, **0** breaks in 1…21. **Position DERIVED from the file (last was 20), not from the
  clause.** Both operative patterns AGREE at **21** — strict `'^MOB-R[0-9]+ — '` (INDEX) and
  tripwire `'^MOB-R[0-9]+ '` (DIAGNOSTIC); payload sweep before the write was **1 and 1**, so no
  header collision. **MOB-R21 provenance: RELAYED.**
- **PROVENANCE FOOTNOTE — this block's bytes were RECOVERED, not held.** The conversation was
  compacted between MOB-R21's arrival and its persistence, and the summary that survived is a
  PARAPHRASE. A paraphrase cannot be persisted as a verbatim block, so the bytes were recovered
  from the session transcript and appended by pipe, never retyped. This is precisely the failure
  10e-R239 names — **a ruling that crosses a session boundary in an implementer's context is not
  evidence it still holds** — and it is the second argument for persist-first being the FIRST
  action of a cycle rather than its last.
- **THE WIDER-CADENCE INSTRUCTION IS STANDING AND CARRIES INTO SUCCESSOR CONVERSATIONS**
  (operator, 2026-09-12, direct; restated MOB-R21): more authorised per block, implementation
  collapsed into the measuring cycle where the surface is enumerable, clarity preserved.
  **NOT collapsible, and these are the condition the instruction runs on rather than a hedge
  against it:** every named gate is a hard stop; any red test or forced test edit stops and asks;
  any mandate-enlarging discovery is a REQUEST, never a self-grant; operator observation rounds
  keep their own cycle. A wider cycle runs further before anyone sees it, which is what makes the
  stopping points load-bearing.
  - **CORRECTION, carried from MOB-R21 — MEASUREMENT DOES NOT PARALLELISE BEHIND IMPLEMENTATION.**
    MOB-R20 reasoned that a measurement rides safely alongside an implementation because it emits
    no code and so needs no second verification round. **That reasoning was about COMMITS; the
    binding constraint is ATTENTION.** Measurement quality degrades when it runs behind
    implementation in the same report, and **a degraded measurement is worse than a deferred one
    because it looks like an answer.** Wider cycles mean more IMPLEMENTATION per cycle, not
    measurement crammed behind it.
- **GATE 4 FIRED, AND THE FINDING IS THAT TWO APPROVED CHANGES WERE IN DIRECT CONFLICT.** At 320,
  280px survive the horizontal padding; brand mark 40 + gap 12 + block gap 16 + three icon controls
  at the 44px minimum 132 + two inter-control gaps 16 = **216 fixed, leaving 64px for a two-line
  brand block whose longer line is 17 characters** — under 4px per character. With today's TWO
  controls the same arithmetic leaves 116 and fits. **Part 1's own 44px touch minimum is the term
  that pushes the header over.** Both changes were approved in the same block by two separate
  operator rulings, and **neither ruling could see the other's consequence**. It surfaced before
  any code was written only because the block required the header row be MEASURED at 320 rather
  than assumed to fit. **A DERIVED IMPOSSIBILITY NEEDS NO OBSERVATION**, and nothing in the header
  row was shrunk to make it fit — the brand mark is a rationed brass slot and the ration lives in
  that row.
- **THE PRE-CHECK REFUTED THE RULING'S PREMISE, and both the unreported half and its remedy follow
  from that.** The operator's three options and the channel's framing both assumed the mobile
  header carried a dark-mode control, a menu, and room for a third. **It does not:** the user menu
  and the command palette are BOTH desktop-gated, so the mobile header holds two controls and no
  menu. The enumeration that established this then reported a menu **without composing it with its
  own render gate** — the declaration-without-its-render-condition class, one cycle after an item
  was withdrawn for exactly it. **The mobile route was therefore UNREPORTED while demonstrably
  existing** (the operator had reached the profile page on his phone). Enumerated here as
  **outcome 2A**: Profile IS in the mobile drawer, in the drawer footer, labelled with the user's
  first name ALONE and carrying no accessible name; route = hamburger → drawer → first-name button,
  **2 steps**. The remedy is therefore prominence and labelling inside a surface that costs no
  header space and **clears Gate 4 entirely**.
- **THE DEPLOY RECOMMENDATION IS ESCALATED AND STILL OFFERED-AND-NOT-ADOPTED.** Eighteen commits
  unpushed (both routes, measured before this cycle's commits). **THREE UNVERIFIED LAYERS NOW SIT
  ON THE SAME SURFACES** — the cache work, the responsive commit and the touch minimum — and
  because the responsive change and the touch change both alter the same dialog footers and
  toolbars, **the next observation round cannot attribute a failure between them**. This is no
  longer caution: a failed check would establish that something is wrong without establishing
  what, and the remedy would then be guesswork on a live surface. **Still the operator's, and
  nothing waits on it.**
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** Count stays **SIX**.

### Amendment — MOB-R22 persistence commit, 2026-09-19

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R22**, contiguous: first **1**, last **22**, **0**
  duplicates, **0** breaks in 1…22. **Position DERIVED from the file (last was 21), not from the
  clause.** Both operative patterns AGREE at **22**. Payload sweep before the write was **1 and 1**,
  with the sweep shown DISCRIMINATING by injecting a second header into a copy and watching strict
  go to 2 — an all-clear from an instrument never shown able to fire is not an all-clear.
  **MOB-R22 provenance: RELAYED.** Its bytes were taken from the session transcript rather than
  transcribed out of context: the same emission, reached by a byte-exact conduit with no typing
  step. **That is NOT the RECOVERED class** — nothing was lost to a boundary here; the transcript
  was used to eliminate transcription risk (10e-R256), not to recover a missing artifact.
- **THE ROOT CAUSE OF THE PROFILE COMPLAINT WAS A LABEL, AND THE OPTION SET WE RULED BETWEEN WAS
  THE WRONG SET.** The entry existed at phone width, two steps in, carrying the account holder's
  **first name as its only accessible name**. A control labelled with a person's name does not read
  as a route to account settings — to a first-time user it reads as decoration or a greeting, and
  the operator's report ("I would not have found it had I not known it existed") is exactly what a
  correctly-placed control with the wrong label produces. Three PLACEMENTS were offered and ruled
  between; **none of them was the defect.** The pre-check that refuted the premise, and the
  enumeration that followed it, produced a remedy that costs no header space, engages no gate, and
  fixes the cause. **The operator's ruling is not overridden — it was a ruling about placement, and
  placement was not the problem.**
- **A CONTAINER BOUNDARY IS THE EDGE OF "ORDERING", and the block did not spell that out.** The
  authorisation read *"ordering and one label."* The entry sits in a **footer container**, not in
  the navigation list, so changing its position means moving it **BETWEEN containers** — a
  restructure, not a reorder, and therefore a stop-and-ask. **Reported rather than taken.** The
  secondary point — that a footer is the conventional home for account controls — is a reason not
  to want the move anyway, and it was offered as a reason rather than used as the authorisation.
- **THE TWO-MUTATION ATTRIBUTION FORM, recorded as a reusable instrument.** Mutation 1 restored the
  pre-change form and took **all three** cases red, proving the tests fail in the changed world's
  absence. **That alone would NOT have proven the visible-label assertion does any work** — it
  could have been carried entirely by the accessible-name assertion beside it. Mutation 2 retained
  the accessible name and removed **only** the visible label, taking **exactly one** case red with
  the other two **GREEN**. **THE GREEN IS THE EVIDENCE:** it attributes the failure to one
  assertion rather than to the set (10e-R198). Both restorations verified byte-identical against a
  backup. Companion point: the fixture helper **derives from its argument** rather than reproducing
  the sibling harness's hardcoded value — a constant would have satisfied the assertion even if the
  component passed nothing through, and an instrument sharing its value with what it measures
  cannot detect a fault in it (10e-R168).
- **THE RECOVERED PROVENANCE OF MOB-R21, WITH THE CONTROL THAT TURNED RECOVERY INTO EVIDENCE.** The
  session compacted between that block's arrival and its persistence, leaving a **paraphrase** as
  the surviving artifact. A paraphrase cannot be persisted as a verbatim block, and persisting one
  would have written a **reconstructed ruling** into the permanent record — the class this project
  rates WORSE than an uncheckable one, because it is checkable and wrong (10e-R71). Bytes were
  recovered from the session transcript, appended by pipe, and the provenance recorded as
  **RECOVERED**. **The verification is what makes it evidence:** the pre-append state was
  reproduced byte-identically, **and a control deleting a different span of the same length was
  shown NOT to reproduce it** — that control is what separates *"my reconstruction matches"* from
  *"any reconstruction of that size would match"* (10e-R113). **Standing form: the canonical source
  of a block is the channel's own emission; a working copy is a convenience downstream of it; when
  it is gone, recover from the emission and SAY RECOVERED.**
- **THE ENUMERATING-FACTORY CLASS NOW HAS AN INSTANCE WITH BOTH METHODS RUN SIDE BY SIDE.** A new
  test file needed three mock factories completed before the component would render —
  `QuickAddProvider`, `useDarkMode`, `getUserFirstName`. **Two were found by ITERATION** (run, fail,
  add, repeat) **and the third by ENUMERATION** — listing every named import the component takes
  from each mocked module in one pass — **which found it BEFORE it failed.** The first two are
  named as **wasted cycles**, not folded into the narrative as progress. **Iteration on a mock
  factory is a search whose stopping condition is "the last failure stopped," which is not a
  stopping condition at all; enumeration has one.** Same closed-list mechanism as 10e-R37.
- **REPORTING-FORM CHANGE, NAMED (raised by MOB-R22).** The empty allowlist was reported this cycle
  as an **empty body** (a regex capturing between the brackets, yielding `''`) where every prior
  cycle reported an **empty literal**. **The derivation CHANGED; the fact did not.** Re-run in both
  forms against the same file, they agree: the literal at
  `apps/api/src/contract/frontend-contract.test.ts:54` is `= []`, the standing form matches it
  **1** time, and that form is shown discriminating by **0** matches against a non-empty allowlist.
  **The standing form is restored going forward** — comparability across runs is the entire value
  of a repeated figure, and a control whose form drifts silently is no longer the same control.
- **THE DEPLOY INVENTORY — recorded as a count and an inventory, not as a fourth argument.** Twenty
  commits unpushed at the close of the MOB-R21 cycle. **Waiting on one push and one observation
  round:** the four responsive items, each carrying a declared coverage gap whose only instrument
  is the operator's eyes; the touch minimum, invisible to the suite in both directions and
  unverifiable in a desktop responsive mode; Gate 3's interaction between taller controls and the
  dialogs that just gained internal scroll, deferred to observation because it is rendered; item
  (vi), deferred pending a 320 observation; and eleven written checks across two close-outs. **The
  three layers sit on the same dialog footers and toolbars, so a failure in the next round is not
  attributable between them.** When the push happens: diff against **origin/main**, never local
  main; enumerate every riding commit and name any that is not this track's work with its CSP
  check; and **no UI observation is evidence until the Actions run has landed.**
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** Count stays **SIX**.

### Amendment — MOB-R23 persistence commit, 2026-09-19

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R23**, contiguous: first **1**, last **23**, **0**
  duplicates, **0** breaks in 1…23. Both operative patterns AGREE at **23**. **Position DERIVED
  from the file (last was 22), not from the clause.** Payload sweep before the write was **1 and
  1**, and the sweep was **shown discriminating** by injecting a second header into a copy and
  watching strict go to 2. **MOB-R23 provenance: RELAYED.**
- **"SEVEN FACES" IS FALSIFIED. THE OPERATIVE FIGURE IS FOUR, and the error was the CHANNEL'S,
  carried through three consecutive blocks.** `phase4-frontend-fixes.md:595-608` declares **EIGHT**
  findings, then **SEVEN** as one root cause, then **THE REMAINING FOUR** — 7 + 4 = **11**. The
  root-cause sentence enumerates **FOUR**; 4 + 4 = **8**, which closes. The figure entered in this
  track's handoff and was repeated three times **without the source record once being opened** —
  including in the block instructing the implementer to derive the corpus from the surfaces rather
  than from that list. **Nothing downstream inherited it:** the Part 6 corpus was derived from the
  surfaces, so the enumeration is unaffected. **The source record is a HISTORICAL RECORD and is NOT
  edited** (10e-R78); the correction lives in the Part 6 report and here.
  - **THIRD INHERITED FIGURE THIS TRACK HAS FALSIFIED, and all three are one failure.** (i) "32
    sites across twelve files", which was **nine**, contradicted by the record's own enumeration
    two lines below the prose; (ii) a column width whose site sits behind a **desktop gate** and
    never renders at phone width; (iii) this. **EACH WAS READ FROM A DOCUMENT ABOUT THE ARTIFACT
    RATHER THAN FROM THE ARTIFACT** — which is [[10e-R182]], the rule the channel enforces on every
    block it writes and was not applying to itself. **NO NEW STANDING LINE: the rule exists.** The
    CLAUDE.md count stays at **SIX** across four tracks.
- **GATE A PASSES ON A CONSTRAINT-LEVEL PROOF, which is stronger than the mandate asked for.** Two
  DB CHECK constraints — `chk_transactions_amount_positive` and `chk_budgets_amount_positive`, both
  in migration `0000` — make zero an **unattainable sum**, so both series at zero ⟺ no rows. That
  invariant is enforced **below the application**: no component or serialiser can violate it, and
  unlike an argument from how the code currently constructs a value, **construction can change and
  a constraint cannot without a migration.**
  - **THE "ONE REPRESENTATIVE FACE" INSTRUCTION WAS WRONG AND WAS REFUSED ON EVIDENCE.** There are
    **TWO FAMILIES**: the **months** family pre-seeds zeros (`dashboard-snapshot-lib.ts:223-227`)
    and carries no count or flag, losing the distinction in transit but leaving it losslessly
    recoverable at the client; the **budget** family never loses it at all — an absent map key with
    a client-side collapse at `BudgetPage.tsx:206`. **One trace would have given the wrong answer
    for the other family.** The durable form: **a representative sample presupposes homogeneity,
    and homogeneity was the thing being measured — asking for one representative asks the
    measurement to assume its own result.**
- **GATE B FIRES AT SEVENTEEN SITES and the grouping is KEYED ON THE SIGNAL, not the page.** Sites
  needing the same signal are one change; sites on the same page needing different signals are not.
  **Group 1** "no budget exists" **10**; **Group 2** "this month has no transactions" **3**;
  **Group 3** "both comparison periods absent" **4**. Implementation does not proceed under
  MOB-R22; the operator sequences it.
- **THE PARTIALLY-APPLIED GUARD — the sharpest finding in the report.** Group 1 needs **no new
  derivation**: `hasBudget = budgets.length > 0` already exists, is already passed into the
  component holding three of its sites, and **is already applied to the status label at that very
  site** — but not to the percentage, its caption, or the progress bar. **The guard is not missing;
  it is PARTIALLY APPLIED.** That is why one card can say "Over budget this month" and "% Used
  0.0%" simultaneously: **two renderings of one state, one guarded and one not.** Any fix extends
  the existing predicate rather than introducing a parallel one — **a second predicate for the same
  state is how this defect was born.**
- **ZERO GATES TENSE — a dependency established from source, no longer an ordering preference.**
  Both classes turn on the same predicate. A tense fix alone still asserts present tense about an
  empty period; a zero guard alone renders a correct claim in the wrong tense; and **the tense
  rewrite cannot choose a tense until something tells it the period is empty.** The operator's
  September capture is both classes firing at one site. **Sequence: zero first, then tense** — the
  operator retains the decision, but reversing it means doing the tense work twice. The tense class
  is **its own phase**; declining to size it off an unsettled corpus boundary (61 re-derived against
  15 accepted) is ratified for a second cycle running.
- **THE THIRD PATH-MATCHING INSTRUMENT FAILURE, and the family is now legible.** A `grep` exclusion
  token `page` matched **109 of 112** lines because the output begins `./components/pages/…` — the
  content filter was matching the **FILE PATH**. With the earlier two — `grep -h` **stripping**
  filenames, and `${line##*:}` **truncating** to the last delimiter — that is **three instances,
  three different mechanisms, ONE CAUSE: the filter was written against the intended CONTENT rather
  than against the tool's ACTUAL OUTPUT**, which carries more than the content being filtered. It
  returned **0 from a four-stage pipe** and was found by **bisection**, the right instrument for a
  pipeline whose failure is silent at every stage.
  - **AND THE TRIPWIRE EARNED ITS KEEP ON LIVE TEXT FOR THE FIRST TIME.** Strict returned **0**,
    tripwire **1**, and the patterns disagreed on the implementer's own line-wrapping in the Part 6
    payload. **Rewrapped rather than halted because the text was the implementer's** — author and
    editor the same party, so the licence question does not arise — then both re-measured with the
    control still firing. Adopted on a synthetic probe; this is the first time the real file
    produced the case it was built for.
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** Count stays **SIX**.

### Amendment — MOB-R24 persistence commit, 2026-09-19

The amendments above are left as they stand. This is the live index from here forward.

- **Persisted set is now MOB-R1 … MOB-R24**, contiguous: first **1**, last **24**, **0**
  duplicates, **0** breaks in 1…24. Both operative patterns AGREE at **24**. Position DERIVED from
  the file (last was 23). Payload sweep before the write was **1 and 1**, shown DISCRIMINATING by
  injecting a second header into a copy. **MOB-R24 provenance: RELAYED.**
  - **Extraction finding, recorded because it is the same class as everything else here:** the
    first transcript extractor reported MOB-R24 **ABSENT**. It was not — the extractor tested only
    string-form message content while that message is list-form, so a narrow type check produced a
    confident false negative. Caught by a second probe that enumerated the last user messages
    instead of searching for one. **A search that can only see one of two shapes reports the other
    as missing.**
- **DEPLOY RECORD — 2026-09-19.** Pushed `eba7385..1f570eb`, **23 commits**, GitHub Actions run
  **`35445606773`** on head **`1f570eb`**, conclusion **success**. All 23 were this track's own
  work — **no foreign riders**, so no third-party CSP check was owed; **no `deploy/` change, no new
  external origin, ZERO migrations** (each asserted with a firing positive control rather than
  omitted). Pre-push gate: frontend 219/43 exit 0, api 873/34/61 exit 0, both `tsc` 0 bytes.
  **UI observation is evidence again** and the operator's round is the next instrument.
- **B6 AND B7 ARE WITHDRAWN — a count corrected DOWNWARD by its own author, mid-cycle.** `rows` is
  built by mapping over `budgets` themselves (`BudgetPage.tsx:163-174`), so every row HAS a budget
  and `allocated > 0` is guaranteed by `chk_budgets_amount_positive`, making the `: 0` branch
  **unreachable**. **Group 1 is EIGHT sites; the class is FIFTEEN, not seventeen.** Gate B still
  fires at fifteen. Recorded as the harder direction to move a number in.
- **THE RED-PROOF CONTROL REQUIREMENT — adopted, cited not minted.** A red proof reported `exit 1`
  **and no test had run**: an unquoted two-path variable arrived as a single argument (zsh does not
  word-split unquoted parameter expansions), the runner exited 1 on **"No test files found"**, and
  that is **the same exit code a genuinely red test produces**. Both red proofs in that batch were
  no-ops that looked exactly like success at proving failure. **The instrument that failed was the
  one verifying that the OTHER instruments discriminate**, and it failed in the reassuring
  direction. **THE RULE: a red proof carries a POSITIVE CONTROL — before a non-zero exit may be
  read as "the assertion failed", the same invocation is shown capable of FINDING AND RUNNING the
  tests, by an unmutated run reporting a test COUNT or by the runner's collected-file line. A count
  is the control; an exit code alone is not.** The mutation attribution for that batch rests
  entirely on the redone runs. **No new standing line — this is the existing empty-result rule
  reaching the verification instrument itself.** CLAUDE.md count stays at **SIX**.
- **AN OUT-OF-CHANNEL RULING WAS CITED AND ITS TEXT IS NOW PERSISTED** — see the section
  "Out-of-channel operator rulings — verbatim" below. The MOB-R23 cycle's report cited "per your
  Option B ruling"; **no such ruling exists in the review channel.** The operator answered
  directly, which is his right; the defect is **record integrity, not authority** — a ruling
  citable only from a side exchange is, in the record, indistinguishable from a self-grant. **All
  FOUR decisions taken that way are persisted, not only the one MOB-R24 named**, because all four
  were acted on: ship Group 1, fold in Part 5, push now, and B4's Option B guard.
  **STANDING DISPOSITION:** any ruling reaching the implementer outside the review channel is
  persisted with its verbatim text and an OUT-OF-CHANNEL provenance **before** it is acted on in a
  report.
  - **The substance is accepted and is sharper than G1a's blanket preference** (MOB-R24): two
    fields of the SAME payload object cannot disagree with each other, while a separate query can,
    so the same-object field is the stronger guard at that site and the general preference was
    wrong there.
- **I5's PREDICATE WAS WIDENED, AND THE CATCH WAS LUCK.** The first form (`total === 0`) missed a
  month with real spend and no budgets; the widened form (`committed_kd <= 0`) subsumes it and
  matches the signal its sibling I1 already uses. **It was caught by ANOTHER component's test** —
  `InsightsPage`'s I1 case firing on `SpendForecastWidget`'s guard, because both render on the same
  page. **That is coincidence, not coverage**, and the lesson is the one MOB-R24 names: a guard's
  predicate is DERIVED FROM THE SIGNAL ITS SIBLINGS USE, not invented per site.
- **GATE C FIRED ON D2 and the wording is the operator's.** `dashboard/sections.tsx:1022-1026`
  cannot be fixed by suppression without emptying the "Needs attention" panel it sits in, so it
  needs NEW COPY, which is a product decision. **"No categories are over budget" is TRUE and
  MISLEADING on an account with no budgets — which is the whole shape of this class.**
- **CLAUDE.md still deliberately NOT edited; no new standing rule earned.** Count stays **SIX**.

## Part 6 — zero-versus-no-data measurement report (implementer, executed 2026-09-19, pending acceptance)

Opened by MOB-R22. **REPORT ONLY — zero code changed.** Gate A PASSES, **Gate B FIRES**, so 6d does
not proceed and the enumeration is reported with a proposed grouping instead.

### 0 — the inherited count was wrong, and that is why the corpus was derived

The block MOB-R22 records "seven faces … in the preceding track's Phase A".
The source (`phase4-frontend-fixes.md:595-608`) does not reconcile: it says **EIGHT FINDINGS**, then **SEVEN
OF THEM** are one root cause, then **THE REMAINING FOUR**. 7 + 4 = **11**, not 8. The root-cause
sentence enumerates **four** faces; 4 + 4 = 8, which does close. **"Seven" is an error at source
and the channel inherited it.** No corpus was taken from that list.

**Provenance, added at MOB-R23:** the error is the CHANNEL'S, not the source record's alone — the
figure entered this track's handoff and was repeated in **three consecutive blocks** without the
source record once being opened, including in the block instructing that the corpus be derived from
the surfaces rather than from that list. **The operative figure is FOUR.** The source record is a
historical record and is NOT edited.

### 6a — the two corpora, and how they DIFFER

**CORPUS B (mechanism — where absence is materialised as 0): 81 sites / 14 files.** Construction:
`(?? | ||) 0` co-occurring with a money token, noise-filtered.

**CORPUS A (surface — where a CLAIM is asserted over money): 41 candidates / 8 files**, narrowed
from 520/54 after the first vocabulary was found to be a superset (it matched `remaining`, `left`
and `percent` in legal and auth pages). Construction: a comparative/ratio/count claim token AND a
money token, on the surfaces that consume analytics payloads.

**HOW THEY DIFFER — this is the part that matters.** They are not two routes over one corpus. B is
built from *mechanism* and A from *assertion*, and neither contains the other:
- **In B, not in A:** a collapse feeding a pure formatter. `formatKD(x ?? 0)` renders "KD 0.000",
  which is wrong-looking but asserts nothing. The majority of B's 81 are this.
- **In A, not in B:** a claim whose zero is manufactured **server-side**, so no client-side `|| 0`
  exists to find. `monthsAhead` is the case — the zero is pre-seeded at
  `dashboard-snapshot-lib.ts:223-227`, and **corpus B cannot see it at all.**
- **The intersection is not the answer either:** the collapse and the claim are usually in
  different files (`BudgetPage.tsx:206` collapses, `budget/sections.tsx:298` claims).

**A single-corpus search would have missed a different site depending on which one was chosen**,
which is the concrete form of "two routes over one corpus are one route."

**INSTRUMENT FAILURE, NAMED.** Corpus B first returned **0** from a four-stage pipe. Bisection: the
exclusion token `page` matched **109 of 112** lines — because `grep -rn` output begins
`./components/pages/…`, so **the content filter was matching the FILE PATH.** Third instance of
this family in the track, after `grep -h` stripping filenames and `${line##*:}` stripping to the
last colon. Rebuilt with the content isolated from the `file:line:` prefix.

### 6b — the root cause, traced end to end. **GATE A: the distinction SURVIVES.**

**There is no single representative face — the two families answer differently**, which is why one
trace would have given the wrong answer for the other.

**Budget family — absence survives literally.** `BudgetPage.tsx:194-208` builds `budgetMap` from
budget rows only, while `categoriesSet` is the UNION of budgeted and spent categories. A category
with spend and no budget is therefore **absent from the map**, and the collapse happens in the
client at `:206` (`budgetMap[cat] || 0`) and `:208`. The payload never lied.

**Months family — absence is encoded, not lost.** `dashboard-snapshot-lib.ts:223-227` pre-seeds
every month key to `new Decimal(0)` *before* folding in query rows, and
`DashboardMetricsPayload` carries **no** count, has-data flag or row count.

**What makes this a presentation fix rather than a contract change:**

```
apps/api/src/db/schema/transactions.ts:60
  check("chk_transactions_amount_positive", sql`${t.amountKd} > 0`)
apps/api/src/db/schema/budgets.ts:37
  check("chk_budgets_amount_positive", sql`${t.amountKd} > 0`)
```

Both are in migration `0000` and are therefore enforced **by the database**. Zero is an
**unattainable sum of strictly positive amounts**, so `income_kd === "0.000"` ⟺ no income rows and
both series zero ⟺ **no transactions that month**. Every write path agrees independently
(`parseKd` rejects `<= 0`; `import-lib.ts` call sites at `:735`/`:761` both reject non-positive,
the permissive parse existing only to report auto-exclusions).

**So the distinction is not REPRESENTED but is LOSSLESSLY RECOVERABLE, and the guarantee is a DB
constraint rather than an application convention.** Gate A passes. **Stated precisely because it
is close to the line:** for budgets absence survives as `undefined`; for months it survives only
as an *encoding*, and any fix must carry a comment saying why zero means absent, because nothing
at the call site shows it.

### 6a result — the enumeration. **GATE B FIRES: 17 sites > 12.**

**Budget family (7)** — `components/pages/budget/sections.tsx`
| # | Site | Renders |
|---|---|---|
| B1 | `:170` | `% Used` shows `0.0%` beside real spend |
| B2 | `:126-130` | caption "Over budget this month" with no budget |
| B3 | `:181,:183` | progress-bar tone and width from `percentUsed` |
| B4 | `:273` | `Budget / Income 0.0%` — the `!== null` guard catches income-absent ONLY |
| B5 | `:296-301` | "X is KD N over plan" for a category with no plan |
| B6 | `:499` | row utilisation tone from `r.pct = 0` |
| B7 | `:609` | same, second table |

**Dashboard family (5)** — `components/pages/dashboard/sections.tsx`
| # | Site | Renders |
|---|---|---|
| D1 | `:1043,:1057` | "N of M visible months finished with income ahead of expenses" — `0 >= 0` counts as ahead |
| D2 | `:1022-1026` | "You're on track. No categories are over budget right now." on an empty list |
| D3 | `:159-176`, `:218` | `safeToSpendTone(0)` → "You're out of discretionary runway." |
| D4 | `:1044-1055` | `expenseAverage` / `peakExpenseMonth` over zero-filled months |
| D5 | `:836` | "On pace to spend … /day" computed from no data |

**Insights family (5)**
| # | Site | Renders |
|---|---|---|
| I1 | `InsightsPage.tsx:263-265` | "Committed spending is now overtaking…" when `remainingBudget` is 0 |
| I2 | `InsightsPage.tsx:266-268` | "tracking about the same as last month" when both are absent |
| I3 | `insights/MonthDeltaCard.tsx:13-18,:107` | delta 0 falls through to the "unchanged" tone |
| I4 | `insights/WeeklyDigestSection.tsx:6-10,:106` | "Your weekly pace is unchanged." with no data either week |
| I5 | `insights/SpendForecastWidget.tsx:23-28` | all three zero → `remaining_kd <= 0` → "overtaking" |

**Not counted, with reasons:** `dashboardMomentumState` (`:134`) is **already guarded**
(`monthRemaining <= 0 || savingsRate <= 0` returns null); `DashboardPage.tsx:150-151` is the
FF-R7(a) mechanism, **unreachable today** because `months` and `monthly` are the same array; pure
`formatKD` renders assert nothing.

### Proposed grouping (Gate B deliverable) — three groups by the SIGNAL each needs

- **GROUP 1 — "no budget exists" (10 sites: B1–B7, D2, I1, I5).** Signal **already exists and is
  already in the right component**: `hasBudget = budgets.length > 0` (`BudgetPage.tsx:458`) is
  computed, passed in, and applied to `status` but **not** to B1–B3. Lowest risk, largest count,
  no new derivation.
- **GROUP 2 — "this month has no transactions" (3 sites: D1, D4, D5).** Needs the derived
  predicate plus a shared helper and the comment Gate A's wording requires.
- **GROUP 3 — "both comparison periods absent" (4 sites: I2, I3, I4, D3).** Same derivation over a
  PAIR of periods; D3 additionally has `income_source === 'not_set'` already available.

### 6c — T4 re-size: **its own phase, not a handful of strings.**

An independent re-derivation returns **61** present-tense claim sites across **13** files against
the accepted **15**, so the two constructions disagree by 4×. The number is not the point — **the
corpus boundary is unsettled**, and sizing a phase off an unsettled boundary is the
clean-arithmetic-over-wrong-scope failure this track has already paid for once. Even at 15 the
sites span at least six files and each needs its own copy decision.

### 6e — the relationship: **ONE GUARD, TWO RENDERS — and the zero class GATES the tense class.**

They are not one fix, and not two independent fixes. Both Group 2/3 and the tense class turn on the
identical predicate — *does the selected period have data* — and neither can be written without it.
A tense fix alone still asserts the present tense about an empty month; a zero guard alone renders
a correct claim in the wrong tense. **The zero guard must land first**, because the tense rewrite
cannot choose a tense until something tells it whether the period is empty. This is exactly the
operator's September capture — on-track copy on a month with no transactions — being **both classes
firing at one site**.

## Out-of-channel operator rulings — verbatim (provenance: OPERATOR, DIRECT, OUT-OF-CHANNEL)
Owed by MOB-R24 and persisted here before being relied on again. The MOB-R23 cycle's report cited
"per your Option B ruling"; **no such ruling exists in the review channel.** The operator answered
directly, which is entirely his right — the defect is RECORD INTEGRITY, not authority: a ruling
citable only from a side exchange is, in the record, indistinguishable from a self-grant.

**Standing disposition (MOB-R24):** any ruling reaching the implementer outside the review channel is
persisted with its verbatim text and an OUT-OF-CHANNEL provenance BEFORE it is acted on in a report.

Text below is recovered from the session transcript — a byte-exact conduit, not a transcription.
Nothing here is re-decided; MOB-R24 has already accepted the substance of exchange 2.

### Exchange 1 — transcript line 1942
**QUESTION (implementer):** Group 1 (10 sites, "no budget exists") is authorised conditionally on your ruling. Ship it as its own cycle now?
  - `Ship Group 1 now (Recommended)` — 10 sites, under the threshold on its own count. Needs NO new signal — hasBudget already exists and is already passed into the component holding 3 of the sites; the fix extends a partially-applied guard rather than adding a parallel one. Runs G1a–G1d with red-first tests and mutation attribution; Gate C stops any site needing new copy rather than suppression.
  - `Hold Group 1` — Leave all 17 sites unfixed until you sequence the whole class. Nothing changes on screen; '% Used 0.0%' beside 'Over budget this month' stays live.
  - `Ship Group 1 + Groups 2 and 3` — All 17 sites in one cycle. Exceeds MOB-R22's Gate B threshold of twelve, so this overrides that gate — Groups 2 and 3 also need a NEW derived predicate, which Group 1 does not.
**QUESTION (implementer):** Part 5 (duplicate category label + orphaned separator bullet) has been unruled for three cycles. Fold it in?
  - `Fold in with Group 1` — Ships in the same commit with per-site treatment: file:line, the condition producing the duplicate, the condition producing the orphan, and one discriminating test each with its negative case stated. These are render defects at every width, so they are testable and no coverage gap is declared.
  - `Keep deferring to conventions` — Stays referred out to the conventions phase, untouched for a fourth cycle.
  - `Fold in as its own cycle` — Ship it separately from Group 1 so a failed check is attributable to one change rather than two.
**QUESTION (implementer):** Twenty-three commits are unpushed and three unverified layers sit on the same dialog footers and toolbars. Push now?
  - `Push now (Recommended)` — Until this lands, the next observation round cannot attribute a failure between the cache work, the responsive commit and the touch minimum. I'd diff against origin/main (never local main), enumerate every riding commit with its CSP check, and treat no UI observation as evidence until the Actions run has landed.
  - `Hold the push` — Checks stay unattributable and the 320 top-up plus item (vi) stay blocked. I will say so explicitly in each report rather than let their absence read as a pass.
  - `Push after Group 1 lands` — One more commit on the same surfaces, then push — trading a slightly larger unattributable set for a single deploy cycle.

**ANSWER (operator, verbatim tool result):**

```
Your questions have been answered: "Group 1 (10 sites, "no budget exists") is authorised conditionally on your ruling. Ship it as its own cycle now?"="Ship Group 1 now (Recommended)", "Part 5 (duplicate category label + orphaned separator bullet) has been unruled for three cycles. Fold it in?"="Fold in with Group 1", "Twenty-three commits are unpushed and three unverified layers sit on the same dialog footers and toolbars. Push now?"="Push now (Recommended)". You can now continue with these answers in mind.
```

### Exchange 2 — transcript line 2081
**QUESTION (implementer):** B4's guard: which predicate should gate the Budget/Income ratio and its WITHIN INCOME badge?
  - `Option B — derive from budgetTotal (Recommended)` — hasBudget = Number(budgetTotal) > 0, computed inside IncomePlanningCard from the SAME profile_context object that supplies budgetPct. Zero test edits, suite 219/219 exit 0, tsc 0. Departs from G1a's stated preference — hence the ask. Rationale: a guard built from the same payload as the claim it guards cannot disagree with it mid-load.
  - `Option A — pass hasBudget as a prop` — Follows G1a literally: extends the exact predicate BudgetHero already receives (budgets.length > 0), passed down from BudgetPage. Costs one forced edit to budget/sections.test.tsx to supply the newly-required prop — which is the red test, and is why this stops and asks. The edit weakens no assertion.
  - `Drop B4 from this cycle` — Ship the other six sites and report B4 alongside D2 as needing a ruling. The '0.0%' ratio and 'WITHIN INCOME' badge stay live on an account with no budgets.

**ANSWER (operator, verbatim tool result):**

```
Your questions have been answered: "B4's guard: which predicate should gate the Budget/Income ratio and its WITHIN INCOME badge?"="Option B — derive from budgetTotal (Recommended)". You can now continue with these answers in mind.
```

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

MOB-R6 — e95d155 IS ACCEPTED. The probe collision is the finding and it was authored by this
channel. One provenance classification is corrected. Two byte-fidelity claims are separated. The
acceptance cadence is LIGHTENED from the next cycle, and this block is the last of its kind.

e95d155 IS ACCEPTED. Pre-append sweep 4/4 agreeing as predicted; post-append 5/5 agreeing; the
enumeration PRINTED IN FILE ORDER with first 1, last 5, zero duplicates, zero breaks, and the
ascending check run rather than eyeballed; both reconciliation routes landing on 5. All eight
column-0 lines carrying the track prefix printed and READ — five headers and three classified body
lines — rather than inferred from a count agreeing. The retired bare form reported once and not
again, exactly as ruled.

THE PROBE COLLISION IS THIS CYCLE'S FINDING, AND THE CHANNEL CAUSED IT. The preceding block
required the tripwire probe persisted as the ruling's evidence. That probe's lines are
HEADER-SHAPED BY CONSTRUCTION — that is what makes it a probe — so appending it as captured would
have written phantom headers into the very index the tripwire exists to protect, measured at
strict +1 and tripwire +3. Caught before the write.
  THE SHAPE IS NEW AND IT IS WORTH STATING PLAINLY: a ruling's own evidence attacked the
  instrument the ruling was written to repair. Evidence demonstrating a pattern-based instrument is
  the ONE artifact guaranteed to trip that instrument, and persisting it into the swept file is
  therefore not an ordinary append. The generalisation — never write a probe into the file whose
  pattern it probes without neutralising it first — holds beyond this project.
  NO NEW CLAUDE.md STANDING LINE, AND THE COUNT STAYS AT SIX. The existing sweep-the-payload-
  before-appending rule ALREADY COVERED THIS: the probe was in the payload, the payload was swept,
  and the rule fired. A rule minted for a case an existing rule caught is inflation, and it would
  make the record worse by suggesting the existing rule was insufficient when it was not. Cited,
  not minted. Three tracks have now earned zero standing lines between them.
  THE REMEDY IS THE DURABLE PART AND IT IS RECORDED AS TECHNIQUE: persist the probe in a
  line-numbered rendering so no line begins at column 0, and MARK THE NUMBERING LOAD-BEARING in
  the note so a later reader does not tidy it back and reintroduce the collision. Marking it is
  what makes the remedy survive; an unexplained formatting quirk gets normalised by the next person
  who touches the file.
  THIS IS THE THIRD TIME IN THIS TRACK THAT CHANNEL-AUTHORED TEXT HAS ENGAGED THE COLLISION
  INSTRUMENT: the phase-handle body line at column 0, the possessive citation at column 0, and now
  the probe. Two were near-misses failing on one character; the third was a genuine collision. The
  common cause is that this channel writes prose that opens paragraphs by naming ruling numbers and
  phase handles. STANDING OBLIGATION ON THE CHANNEL, not on the implementer: any block instructing
  that pattern-shaped evidence be persisted states its neutralisation IN THE SAME BLOCK. The
  preceding block did not, and the implementer absorbed the cost.

THE PROVENANCE CLASSIFICATION IS CORRECTED, AND THE CORRECTION IS NOT PEDANTIC. The report says the
four blocks were "rebuilt from conversation context." That phrase is AMBIGUOUS between the two
classes this entire apparatus exists to separate: RECONSTRUCTED from prose, summaries or close-out
reports — the one class excluded outright, rated worse than an uncheckable block because it is
checkable and wrong — and RECOVERED by reading verbatim out of the author's own emission, which is
legitimate and has precedent twice in this project.
  WHAT HAPPENED WAS RECOVERY. The four blocks were read back out of the relay messages in which
  this channel emitted them verbatim. That is the author's own emission, not prose about it, and it
  is the same mechanism that recovered two prior sets. THE WORD MATTERS MORE THAN THE ACT HERE: the
  act was correct, and a reader a year from now has only the word.
  SAY THE CLASS, NOT THE MECHANISM, in every future provenance line.

THE TWO BYTE-FIDELITY CLAIMS ARE SEPARATED, BECAUSE TOGETHER THEY READ AS MORE THAN EITHER PROVES.
The report states the payload was appended with a redirect and "retyped at no point." That is TRUE
and it establishes the SCRATCHPAD-TO-FILE hop: no corruption between the staged payload and the
committed file, which is exactly the hop the never-retype rule was written for.
  IT DOES NOT REACH THE EMISSION-TO-SCRATCHPAD HOP, which this cycle performed by transcription
  because the scratchpad had not survived. THE TRANSCRIPTION SEAM IS THEREFORE UNDISCHARGED and
  remains this track's bounded unknown on unchanged terms: derive any load-bearing string from the
  source a block CITES, never by retyping it from the block. The mitigation is strong here for the
  same reason it was on the prior track — this track's load-bearing content is predominantly
  file:line citations and measured figures, every one checkable against the tree.
  RECORDED BECAUSE A TRUE CLAIM ADJACENT TO AN UNDISCHARGED ONE READS AS DISCHARGING IT, and that
  is the integrity-instrument-reading-as-a-completeness-instrument class on a single sentence.

THE SCRATCHPAD LOSS IS RATIFIED AND THEN DEFUSED. The self-report is correct that surviving on
context is luck rather than method, and correct to name it as the no-ruling-crosses-a-boundary
lesson applying to a working artifact. The durable disposition, stated so this does not recur as an
anxiety each cycle: THE SCRATCHPAD IS NOT A RECORD AND ITS LOSS IS NOT A LOSS. The canonical source
of a ruling block is the relay message in which this channel emitted it; the scratchpad is a
staging convenience downstream of that. When it is absent, recover from the emission and SAY
RECOVERED. What would be a real loss is the emission being gone, and the answer to that is the
persistence commit, which is the rule already in force.

TWO RELAY DISPOSITIONS RATIFIED, BOTH HANDLED CORRECTLY AND KEPT DISTINCT. The preceding block
arrived as TWO COMPLETE COPIES, both terminating properly, reading identically — a duplicate at the
RECIPIENT, which is the re-relay case and not the dangerous variant, since the dangerous variant
requires two complete copies that DISAGREE. No halt was correct. The block before it arrived as a
TRUNCATED PREFIX FOLLOWED BY A COMPLETION, resolved by the termination instrument. Logging them
separately rather than collapsing them into "arrived twice" is right: they have different causes
and different dispositions, and a merged record would teach the wrong one.

THE DANGLING LINE NUMBERS ARE HANDLED CORRECTLY. The halt report's figures describe a payload that
no longer exists as a standalone artifact, which is the self-falsifying-structural-figure class:
the figures were true when measured and were falsified by the append that persisted them. Recording
the note ADJACENT, where a reader meets them, rather than editing the report, is the correct
disposition for a historical record.

THE ACCEPTANCE CADENCE IS LIGHTENED, EFFECTIVE FROM THE NEXT CYCLE. Five blocks have been issued on
this track and NO PRODUCT WORK HAS SHIPPED. One of the five did the work it was written for — the
source-side measurement, which surfaced a dead invalidation key across eleven sites, a structural
month mismatch between two routes, and a client-cache regime that never self-corrects. The
remainder have largely adjudicated the track's own machinery, and two of the three problems
adjudicated were authored by this channel. That is a real cost and it is named rather than absorbed.
  THE RULE FROM HERE. A docs-only persistence commit that meets every predicted figure does NOT
  earn its own ruling block. The implementer reports it; the channel acknowledges it in the message
  and the acknowledgement rides the NEXT substantive block. A block is issued only when it (a)
  opens or closes a phase, (b) rules something the operator or the implementer cannot proceed
  without, or (c) records a finding that would be costly to relearn.
  THIS BLOCK IS ISSUED UNDER (c) AND IS THE LAST OF ITS KIND. The probe collision, the provenance
  classification and the seam separation are all durable; the acceptance itself would not have been.
  The inconsistency of ruling a lighter cadence in a block the cadence would have suppressed is
  noted rather than hidden — the cadence takes effect from the next cycle, and this block carries
  the findings that justify writing it at all.
  PERSISTENCE IS NOT RELAXED BY ANY OF THIS. Every block issued still persists before any boundary;
  what changes is how many blocks get issued, not how they are kept.

PERSISTENCE. Append this block alone, verbatim, Format A. Payload strict 1, tripwire 1, AGREEING —
and note that this block contains NO pattern-shaped evidence, so the payload sweep is predicted
clean rather than assumed clean. After the append: strict 6 and tripwire 6, first 1, last 6, no
duplicates, no breaks in 1 to 6, reconciled 5 + 1 = 6 and 6 minus 1 plus 1 = 6, with the
enumeration PRINTED IN FILE ORDER. Derive the totals from what is actually present; if these
figures are wrong, yours are right and you show the reconciliation rather than forcing agreement.
Provenance: RELAYED. Amend the completeness note to record the persisted set and the lightened
cadence. Docs-only under the standing permanent licence — state the skip and its reason, prove
docs-only by exclusion with the exclusion shown discriminating, carry the bytes.

WHAT IS OPEN, AND IT IS STILL ONE ITEM. Whether the dead-invalidation-key fix opens as a short
cycle before the responsive phase. No phase opens until the operator rules it. The channel
recommendation is offered and four cycles have not adopted it.

NOTHING IS IMPLEMENTED BY THIS BLOCK.

MOB-R7 — MOB-F1 CACHE-INVALIDATION IS OPENED BY OPERATOR RULING. Phase A is MEASUREMENT AND
PROPOSAL IN ONE REPORT, deliberately compressed, hard stop before any code. adf5fd5 is accepted.

adf5fd5 IS ACCEPTED and this is the acknowledgement riding the next substantive block, which is
the lightened cadence operating for the first time. Pre-append 1/1 with the single column-0 line
printed and read; post-append 6/6 agreeing, enumeration in file order, first 1, last 6, zero
duplicates, zero breaks, ascending checked, both routes landing on 6; nine column-0 lines carrying
the prefix printed and classified. The provenance correction was made ADJACENT with the persisted
note's wording left intact, which is the right disposition for a historical record.

OPERATOR RULING, 2026-08-29, DIRECT. The dead-invalidation-key fix opens as a short cycle BEFORE
the responsive phase. The channel recommendation is therefore ADOPTED BY OPERATOR RULING and stops
being offered-and-not-adopted. The sequence is now: this cycle, then MOB-1 RESPONSIVE, then
MOB-2 ZERO-VS-NO-DATA, then MOB-3 CONVENTIONS.

WHY IT RUNS FIRST, RESTATED SO THE MANDATE CARRIES ITS OWN REASON. Every phase behind it is
verified in part by the operator LOOKING at screens. With refetch-on-focus disabled, no polling
anywhere in src, and an invalidation that should freshen one of the two surfaces landing on
nothing, two open pages can hold client caches of arbitrarily different ages and never
self-correct. A screenshot is then evidence about a cache generation, not about the build. That is
the push-is-not-a-deploy class one layer further in, and it corrupts the only instrument the
responsive phase has.

THE COMPRESSION IS DELIBERATE AND IS NAMED SO IT IS NOT READ AS A PRECEDENT. The frontend-fixes
track ran measurement and proposal as two report cycles. This one runs them as one report. The
reason is scope: the surface is a small, enumerable set of call sites in one package, and a
separate proposal round would cost a relay cycle for a fix whose shape the measurement already
determines. THE HARD STOP IS NOT COMPRESSED. No code is written, nothing is committed, nothing is
pushed, and the proposal half requires explicit approval before implementation. If the measurement
finds the surface is larger or more entangled than the report anticipates, SPLIT IT BACK INTO TWO
CYCLES AND SAY SO — that is a report, not a failure.

STEP 0, REPORTED, IN THIS ORDER.
  (0.1) `hostname; pwd` as the first line, without exception.
  (0.2) HEAD SHA and `git status --short`, both pasted, emptiness marked between printed
        delimiters rather than asserted.
  (0.3) OPEN ENUMERATION: state which MOB-numbered blocks you hold. Enumerate what you hold; do
        not confirm a list supplied to you.
  (0.4) BASELINES, RE-DERIVED FROM THE ARTIFACT AT EXECUTION. Resolution proof per selector plus a
        non-matching negative control shown exiting 0. Capture the return code on its own line
        after a NON-PIPED command. Report the Test Files summary line, not only the Tests line.
        STATED SO A MISS IS A QUESTION AND NEVER AN ADJUSTMENT: frontend 212 passed / 41 files;
        api hermetic 873 passed / 34 skipped / 61 files; both tsc 0 errors and 0 bytes; contract
        fixture 66; ALLOWLIST length 0, derived FROM THE FILE. INTEGRATION is NOT owed and NOT run
        — no db.transaction() boundary, no integration case, no code. State the omission and its
        reason.

═══ THE MEASUREMENT ═══

F1 — ENUMERATE EVERY DECLARED QUERY KEY IN apps/web, AND PRINT THE WHOLE LIST. This is the
  load-bearing step and its form is ruled, not left to judgement. The defect under investigation
  was PRODUCED by a search that found nothing and was believed; "no declared query matches this
  prefix" established by searching for an absence is the same instrument that created the bug.
  DERIVE THE LIST, THEN READ IT. For each: file:line, the literal key array as written, whether
  any segment is a variable, and the hook that declares it. Sorted and printed in full. A search
  confirms presence and never completeness, and its silence confirms nothing.

F2 — ENUMERATE EVERY INVALIDATION CALL SITE IN apps/web. Every `invalidateQueries`,
  `removeQueries`, `resetQueries`, `refetchQueries` and `setQueryData` call. For each: file:line,
  the key argument as written, any options passed alongside it, and the user action that triggers
  it. Do not scope this to the eleven sites already named — the eleven came from a search, and
  whether they are the COMPLETE set of invalidations is exactly what this step decides.

F3 — THE MATCHING SEMANTICS, DERIVED FROM THE INSTALLED VERSION AND NOT FROM MEMORY. Establish, at
  execution, the exact TanStack Query version resolved in this repo from the lockfile, then
  establish its key-matching rule from that version's own source or types in node_modules — not
  from recollection of the library's behaviour and not from documentation for a different major.
  State the rule precisely enough that a reader can apply it by hand to any pair of keys.

F4 — CROSS-MATCH F2 AGAINST F1 AND CLASSIFY EVERY INVALIDATION. Three buckets, each site in
  exactly one, each assignment shown rather than asserted: LIVE, it matches at least one declared
  key under the F3 rule and you name which; DEAD, it matches nothing declared; AMBIGUOUS, matching
  depends on a runtime value. Report the counts and the per-site table. THE DEAD SET IS THIS
  CYCLE'S SUBJECT and the other two buckets are what prove the dead set was found by classification
  rather than by looking for it.

F5 — WAS IT EVER LIVE. From git history, determine whether any query was ever declared under the
  dead key, or whether these sites never matched anything. State which, with the commit that
  changed it if one exists. A regression and a never-wired call site are different defects with
  different lessons, and the record should not have to guess later.

F6 — THE BLAST RADIUS OF THE DEAD SET. For each dead invalidation: which declared query or queries
  the site was evidently INTENDED to refresh, inferred from the surrounding write and stated as an
  inference with its basis. Then: what a user actually observes today because the refresh does not
  happen — which surface shows stale figures, after which action, and for how long given the
  declared staleTime, the global refetch-on-focus setting and the absence of polling.

F7 — THE REGIME, REPORTED AND NOT OPENED. Report the client-cache configuration as it stands:
  every staleTime and gcTime declared, the global defaults, refetch-on-focus, refetch-on-mount,
  refetch-on-reconnect, and any polling. State plainly whether repairing the keys is SUFFICIENT to
  make a write visible on both surfaces, or whether the regime itself would also have to change.
  IF THE REGIME WOULD ALSO HAVE TO CHANGE, THAT IS A FINDING AND A REQUEST, NOT A SELF-GRANT — say
  so and propose nothing for it in this cycle.

═══ THE PROPOSAL ═══

Only for the DEAD set from F4. Nothing else is in scope.

P1 — THE CHANGE, PER SITE. Exact file:line, the key as written now, the key proposed, and the
  declared query from F1 it will then match under the F3 rule. Prefer the narrowest key that
  reaches the intended queries; where a broader segment is the right answer, say why and state
  what else it will sweep in. If two sites want different answers, they get different answers —
  do not unify eleven call sites onto one key because uniformity looks tidier than correctness.

P2 — THE BEHAVIOUR CHANGE, QUANTIFIED, BECAUSE THE OPERATOR WAS TOLD IT EXISTS. These queries do
  not currently refetch on these writes and will begin to. State, per user action: how many queries
  newly refetch and which routes they hit. This is a deliberate change in network behaviour, not a
  silent side effect of a bug fix, and it ships named.

P3 — THE PROTECTED-SURFACE CHECK, RUN BEFORE PROPOSING AND NOT AFTER. QuickAdd internals are
  UNTOUCHABLE. One invalidation already sits inside QuickAddContext. If any proposed edit falls
  inside a protected surface, that edit is a STOP-AND-ASK and is proposed to nobody until the
  operator rules it. Report explicitly whether any does.

P4 — THE TEST PLAN, WITH ITS NEGATIVE CASE STATED PER TEST. Establish first whether ANY existing
  test asserts invalidation behaviour, by enumeration rather than by a search for its absence. For
  each proposed test: the file, what it asserts, and WHAT THE ASSERTION WOULD READ IF THE CHANGE
  HAD NOT LANDED. A check whose negative case equals its positive case is not a check. RED-FIRST
  with the red captured is required for every new case.
  ONE HAZARD NAMED IN ADVANCE, because it is this project's recurring shape: a test that asserts
  "invalidate was called with key K" restates the diff and passes against a key that still matches
  nothing. The discriminating assertion is about the OUTCOME — that the target query is marked
  stale, or refetches — which requires the real matching rule to run rather than a mock of it.
  Propose the discriminating form or state why it is not reachable here.

P5 — PREDICTED TEST DELTA, per file, with the frontend baseline movement stated as a DELTA and its
  absolute re-derived at execution. Predicted NAMED FORCED EDITS: state them, and state none if
  none. Any red test, or any forced selector or class edit to a test, STOPS and asks before it
  ships. The three named regression files stay green AND untouched.

CONSTRAINTS, cited not restated: logical properties only, zero physical-property additions; CSP
enforcing, no new external origin and therefore no Caddyfile change expected — say so explicitly
rather than leaving it unmentioned; no renames; QuickAdd internals untouchable; pinned strings
untouched; the three named regression files green and untouched. NO CONVENTION WORK, NO RESPONSIVE
WORK, NO ZERO-VS-NO-DATA WORK IN PASSING. The month-mismatch finding and the formatter one-ulp
divergence are QUEUED ELSEWHERE and are not touched here. The e2e suite is not run, repaired,
revived or deleted.

PREDICTIONS, STATED IN ADVANCE SO A MISS BECOMES A QUESTION, AND OFFERED TO BE FALSIFIED RATHER
THAN CONFIRMED. The channel expects F4's dead set to be LARGER than the eleven already named,
because eleven came from a search and F4 comes from a classification. It expects F5 to find these
sites were never live rather than broken by a rename. It expects F7 to find key repair SUFFICIENT.
TRY TO BREAK ALL THREE. Report what is measured, not whether it agrees. A dead set of exactly
eleven is a fine result and is reported as a met prediction, not as a confirmation.

INSTRUMENT DISCIPLINE. Every zero paired with a positive control on a pattern known to match, with
what a populated result would have looked like stated. Every glob-bearing argument quoted; an
unquoted glob that matches nothing errors before the search runs and prints an empty result
indistinguishable from a real one. Scope every search to src and say so. Derive every figure from
the FILE, never from a document about the file, including the prior report and this block. Paste
captured output; a pointer to a result the reader cannot resolve is functionally identical to an
uncaptured claim, and the failure is invisible from inside your own session.

PERSISTENCE, AND IT IS DEFERRED DELIBERATELY. This block and the Phase A report persist together in
the commit that PRECEDES any implementation, following the frontend-fixes track's own precedent
where Phase A ran before its persistence commit and implementation followed it. Persist-first
governs IMPLEMENTATION, not measurement, so nothing is at risk and a commit is saved. Provenance
RELAYED. If a session boundary approaches before that commit, PERSIST IMMEDIATELY AND SAY SO — no
ruling crosses a boundary in an implementer's context, and a saved commit is not worth a lost
block.

HARD STOP after the report. No file written, no commit, no push. Implementation begins only on an
explicit approval of the proposal half.

MOB-R8 — PHASE A IS ACCEPTED. THREE CHANNEL CLAIMS ARE FALSIFIED. Seventeen sites approved, one of
them GATED on a pre-check. Three items go to the operator and none blocks implementation.

CADENCE. Issued under test (b) — it rules things the implementer cannot proceed without — and
under (c). The acceptance of adf5fd5 rode the preceding block; this one carries no separate
acceptance ceremony.

PHASE A IS ACCEPTED IN FULL. Step 0 complete with all six figures matched. The compression into one
report was correct and the surface was as enumerable as it was predicted to be.

THREE CHANNEL CLAIMS ARE FALSIFIED, RECORDED AS FALSIFICATIONS RATHER THAN QUIETLY DROPPED.
  (i) THE SCREENSHOT-INSTRUMENT RATIONALE IS THE BIG ONE AND IT WAS THIS CHANNEL'S JUSTIFICATION
      FOR THE ENTIRE CYCLE'S PLACEMENT. The stated hazard was two open pages holding caches of
      arbitrarily different ages. That is the CROSS-TAB case, and the client is a module-level
      singleton — one per JS context, one per tab — so an invalidation in one tab is STRUCTURALLY
      INCAPABLE of reaching another. Key repair does not touch it and cannot. The implementer
      established this from the artifact and stated that it bears on the ruling's own rationale,
      which is the report reading the mandate rather than only executing it.
  (ii) "ELEVEN BROKEN BEHAVIOURS" IS FALSE. Nineteen of the twenty dead sites are SHADOWED — each
      sits in a block that also invalidates a live key covering the same payload. The refreshes
      happen. This is dead CODE, not dead BEHAVIOUR, and the channel described it to the operator
      as the latter.
  (iii) THE IN-TAB DIVERGENCE WINDOW IS BOUNDED, NOT UNBOUNDED. Refetch-on-mount defaults to true
      and was never overridden, so navigating to a surface after the stale time has elapsed
      refetches it regardless of any invalidation. The unbounded case requires sitting on a MOUNTED
      page without navigating, which is narrower than what was claimed.

THE DECISION STANDS AND THE REASON IS CORRECTED, AND THE DISTINCTION IS THE POINT. Opening this
cycle before the responsive phase was right — it cost one cycle and found a real user-visible
defect that no other phase would have gone looking for. It was right for reasons other than the
ones given. That is the right-action-wrong-reason class this track already named once, and the
reason is recorded because a wrong reason recurs attached to a case where it does not hold.
  THE OPERATOR-FACING CORRECTION HAS BEEN MADE IN PLAIN LANGUAGE AND IS NOT RESTATED HERE.
  THE PROCEDURAL MITIGATION REPLACES THE CODE ONE: during the responsive phase, operator UI
  observations are taken in ONE tab, from a fresh load, navigating between pages, and the report
  states that this was done. That closes the cross-tab hazard for the only instrument it threatens,
  at zero cost and with no behaviour change. It also inherits the standing requirement that any
  operator UI observation state that the deploy completed first.

PREDICTIONS SCORED HONESTLY: two met, one half-falsified, and the half-falsification is the
valuable one. Dead set larger than eleven — MET at twenty. Never-wired rather than a regression —
MET. Key repair sufficient — HALF FALSIFIED, sufficient in-tab, structurally impossible cross-tab.

TWO INSTRUMENT NOTES RATIFIED, THE FIRST OF THEM UNPROMPTED AND THE BETTER ONE.
  F5's METHOD. The obvious history search was tried, RECOGNISED AS NON-DISCRIMINATING because the
  substring occurs in invalidations as well as declarations, and DISCARDED — the false-positive
  rider named explicitly. It was replaced by parsing declared keys at every frontend-touching
  commit, which answers the question the search could not. Discarding a working-looking instrument
  because it cannot separate the two cases is the discipline, and it was applied without being
  asked for.
  F3's DERIVATION. The matching rule was read out of the installed package on disk at the resolved
  version, with the lockfile and the installed manifest shown agreeing, and stated precisely enough
  to apply by hand. Deriving library semantics from the artifact rather than from recollection is
  what makes the F4 classification a computation instead of a belief.

THE FOUR AMBIGUOUS SITES ARE A SECOND REAL DEFECT AND WERE CORRECTLY REPORTED SEPARATELY. Comparing
a year-month string against a literal segment cannot match, so budget writes never invalidate the
setup-progress query, which carries a five-minute stale time. Holding them out of the strict dead
set was the right call under this cycle's scope. THEY GO TO THE OPERATOR, below.

═══ THE GATE — REPORT BEFORE WRITING THE BUDGET-ALERT FIX ═══

THE ONE GENUINE USER-VISIBLE DEFECT IS ALSO THE ONE PLACE THIS PROPOSAL COULD SHIP A NO-OP. The fix
invalidates the bundle so the alert list refetches. THAT ONLY CLEARS THE ALERT IF THE SERVER STOPS
RETURNING IT. Nothing in the report establishes that it does.
  ESTABLISH FROM SOURCE, BEFORE WRITING ANY CODE: does the bundle's budget-alerts payload EXCLUDE
  alerts the user has dismissed? Trace the dismissal write to the field or table it sets, then trace
  the bundle's alert query to whether it filters on that field. Show the code both ways.
  IF IT DOES NOT EXCLUDE THEM, STOP AND REPORT. The fix would then add a request per dismissal and
  change nothing on screen, and the correct remedy is a different one — likely local suppression of
  the dismissed id, which is a larger change than this cycle approved.
  STATE IN ADVANCE WHAT THE CHECK WOULD READ IF THE SERVER DID NOT FILTER, so the check has a
  negative case distinct from its positive one. The other sixteen sites proceed independently of
  this gate.

═══ APPROVED ═══

P1 IS APPROVED AS PROPOSED, all three answers, and the refusal to unify them is ratified.
  THE TEN REPOINTED TO THE BROAD SEGMENT — APPROVED, and the reasoning is the load-bearing part.
  The narrowest matching key would refresh one of two surfaces that read THE SAME BUILDER, which
  reproduces the exact divergence the preceding measurement cycle was opened to investigate. A
  narrower key is not automatically a better key; it is better only when it does not split a pair
  that must move together. The broader segment also agrees with what the QuickAdd path already
  does, so the two write paths converge rather than diverge.
  THE SIX DELETED RATHER THAN REPOINTED — APPROVED. Each already sits beside a live line covering
  the same payload; repointing would issue a second invalidation of a query just invalidated.
  Deletion is narrower and truer, and a line that does nothing is worse than absent because a reader
  believes it.
  THE ONE REPOINTED ALERT SITE — APPROVED SUBJECT TO THE GATE ABOVE.

P2 IS ACCEPTED AND THE QUANTIFICATION IS THE RIGHT SHAPE. Zero new requests at write time because
the target surface is unmounted and the default refetch type is active-only; six queries refetching
at next navigation that previously could serve cache; one request per alert dismissal, which is the
point of the fix. Named, not silent.

P4 IS APPROVED WITH TWO SHARPENINGS, BOTH ABOUT KEEPING THE TESTS DISCRIMINATING LATER.
  THE OUTCOME FORM IS THE RIGHT CHOICE AND THE REASONING FOR IT IS RATIFIED. Asserting that a spy
  was called with a key restates the diff and passes against a key matching nothing — the defect
  under repair would survive its own test. Seeding a real client under a real declared key and
  asserting the invalidated state routes through the library's actual matching rule, which makes it
  a measurement.
  SHARPENING 1 — NAME THE CONTROL KEY AND PROVE IT IS OUTSIDE BOTH FILTERS. "An unrelated key" is
  not specified enough to be checkable. State the literal key, and show it shares no first segment
  with either filter used in the same block. A control that turns out to be swept by the broad
  segment would pass for the wrong reason and the failure would be invisible.
  SHARPENING 2 — THE WEEKLY-DIGEST SEEDING IS LOAD-BEARING AND MUST SAY SO IN THE FILE. That case
  is what fails if a later reader "simplifies" the broad segment to the narrow one. Comment it with
  WHY it is seeded under that specific key, or a future tidy deletes the only thing pinning the
  breadth decision. Same discipline as commenting a mock boundary that looks gratuitous.
  RED-FIRST WITH THE RED CAPTURED for every new case, and the red must show the discriminating
  value, not merely a failure.

P5 IS ACCEPTED. Plus three tests, no file movement, absolute re-derived at execution against the
measured baseline and stated as a delta. A MISS IS A QUESTION, NEVER AN ADJUSTMENT. Named forced
edits predicted NONE; any red test or any forced selector or class edit STOPS and asks BEFORE it
ships. The three named regression files stay green AND untouched.

═══ THREE ITEMS FOR THE OPERATOR — NONE BLOCKS IMPLEMENTATION ═══

  ITEM A — THE THREE DEAD LINES INSIDE THE PROTECTED SURFACE. Withholding them was CORRECT; the
  constraint requires an operator ruling and the implementer does not hold one. Channel
  recommendation, offered and not adopted: DELETE. They match nothing, so no behaviour can change,
  and leaving a misleading string inside the most protected journey in the app is the exact defect
  this cycle exists to remove. If the operator rules delete, they ride the SAME commit; if the
  ruling arrives later, they are a separate one-line commit and that cost is accepted rather than
  pre-empted.
  ITEM B — THE FOUR UNREACHABLE BUDGET SITES. Channel recommendation, offered and not adopted:
  FOLD IN. Same files, same class, same cycle, and a five-minute stale window on a setup indicator
  is a real if small user-visible defect. If folded in, they carry their own per-site P1 entry, their
  own quantified behaviour change and their own discriminating test, exactly as the seventeen do —
  not appended as an afterthought to an approved set.
  ITEM C — THE CROSS-TAB REGIME. Channel recommendation, offered and not adopted: QUEUE IT, DO NOT
  OPEN IT. The procedural mitigation above closes the only instrument it threatens at zero cost. A
  regime change — focus-refetching or a cross-tab broadcast — is an app-wide behaviour change
  affecting every query, and it deserves its own measurement rather than riding a key-repair commit.
  QUEUED WITH ITS TRIGGER: any requirement that two simultaneously-open contexts agree.

═══ IMPLEMENTATION ═══

ONE COMMIT. The sixteen ungated sites proceed immediately and independently. The seventeenth
proceeds when the gate closes. Items A and B enter the commit only if the operator rules them in
before it is written.

CONSTRAINTS: zero physical-property additions, with a positive control proving the pattern matches;
no new external origin and no Caddyfile change — assert it rather than omit it; no renames; QuickAdd
internals untouched absent an Item A ruling; pinned strings untouched. NO CONVENTION WORK, NO
RESPONSIVE WORK, NO ZERO-VS-NO-DATA WORK IN PASSING. The month mismatch and the formatter
divergence stay queued elsewhere and are not tidied. The e2e suite is not run, repaired, revived or
deleted.

CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS, and a close-out missing any is auto-returned: the
verbatim test tail INCLUDING the Test Files summary line with its captured exit code for the exact
commands CI runs, each carrying a resolution proof and a non-matching negative control; the verbatim
typecheck output with its captured exit code and byte count for BOTH packages; and the baseline
hunk old-to-new shown as the diff itself, not as prose. The api suite is RUN even though no api file
is touched, because the contract test reads the frontend fixture. Assert the fixture count and the
allowlist length derived FROM THE FILE. Assert the negative deliverable positively: the standing
rules file is untouched, shown by an empty status on that path. Re-derive every figure AFTER THE
LAST EDIT, not after the largest one.

PERSISTENCE. The preceding mandate block, this block and the Phase A report persist in the commit
that PRECEDES implementation — that clause is now due. Sweep the payload before appending under both
operative patterns; the Phase A report contains bracketed key literals but no track-prefixed
column-0 lines, so the payload is predicted clean rather than assumed clean, and any disagreement
between the two forms halts the write. Predicted payload strict 2 and tripwire 2, AGREEING; after
the append, strict 8 and tripwire 8, first 1, last 8, no duplicates, no breaks in 1 to 8, reconciled
two ways, enumeration PRINTED IN FILE ORDER. Derive the totals from what is actually present; if
these figures are wrong, yours are right and you show the reconciliation. Provenance for both blocks
RELAYED. Amend the completeness note. That commit is docs-only under the standing permanent licence
— state the skip and its reason, prove docs-only by exclusion with the exclusion shown
discriminating, carry the bytes.

NOTHING ELSE IS OPENED BY THIS BLOCK.

---

## MOB-F1 CACHE-INVALIDATION — Phase A report (executed 2026-09-11, accepted by MOB-R8)

Measurement and proposal in one report, per MOB-R7. Hard stop: no file written, no commit, no push.

### Step 0

**(0.1)** `Khaleds-MacBook-Air.local` / `/Users/khaledalrashidi/DevLocal/public-statera`

**(0.2)** HEAD `adf5fd5361f7014b1dba69debfd558642713ff23`, branch `main`; `git status --short`
printed no lines between printed delimiters.

**(0.3) Held at execution: MOB-R1 … MOB-R7.** R1–R6 persisted at `adf5fd5`; R7 held, unpersisted,
deferred deliberately per its own persistence clause.

**(0.4)** Resolution proofs `MATCHED-frontend` / `MATCHED-api`, both exit 0; negative control
`statera-web` → `No projects matched the filters`, exit 0. Frontend `Test Files 41 passed (41)` /
`Tests 212 passed (212)`, exit 0. API `Test Files 51 passed | 10 skipped (61)` /
`Tests 873 passed | 34 skipped (907)`, exit 0. Errors-instrument 0 on both, control fires = 1.
Both `tsc` exit 0, 0 bytes. Fixture 66. ALLOWLIST `= []`. All six matched. INTEGRATION not run and
not owed — no `db.transaction()` boundary, no integration case, no code.

### F1 — every declared query key (28), derived then read

`useQuery` is the ONLY declaring hook present. No `useInfiniteQuery`, `useSuspenseQuery`,
`queryOptions`, `prefetchQuery`, `fetchQuery`, `ensureQueryData`, and NO `useMutation` anywhere —
writes are plain async functions with manual invalidation. 28 call sites, 0 without a key.

| file:line | key as written |
|---|---|
| BudgetPage.tsx:107 | `["budget-items", comparisonMonth]` |
| BudgetPage.tsx:117 | `["budget-metrics", comparisonMonth, "month"]` |
| ExpensesPage.tsx:560 | `["dashboard-metrics", 60]` |
| ExpensesPage.tsx:590 | `["categories"]` |
| ExpensesPage.tsx:628 | `["transactions","expenses","recent",debouncedSearch,filterCategory,rangeFrom]` |
| ExpensesPage.tsx:657 | `["transactions","expenses","category",activeCategory,selectedMonth,categoryOffset]` |
| IncomePage.tsx:344 | `["dashboard-metrics", 24]` |
| IncomePage.tsx:408 | `["transactions","income","recent",debouncedSearch,rangeFrom]` |
| InsightsPage.tsx:102 | `["insights","month-options",currentMonth]` |
| InsightsPage.tsx:124 | `["insights","recurring-patterns",120]` |
| InsightsPage.tsx:129 | `["insights","month-delta",selectedMonth]` |
| InsightsPage.tsx:134 | `["insights","readiness",selectedMonth]` |
| InsightsPage.tsx:139 | `["insights","safe-to-spend",selectedMonth]` |
| InsightsPage.tsx:144 | `["insights","weekly-digest"]` |
| TransactionsPage.tsx:70 / :80 / :90 | `["categories"]` / `["merchants"]` / `["auth-profile","activity"]` |
| budget/hooks.ts:78 / :111 / :133 | `["budget-active-months"]` / `["categories"]` / `["budget-metrics",selectedMonth,range]` |
| dashboard/hooks.ts:23 / :33 / :45 | `["dashboard-metrics",24]` / `["auth-profile","dashboard"]` / `["dashboard-bundle",selectedMonth]` |
| dashboard/hooks.ts:57 | `["transactions","dashboard","category",activeCategory,selectedMonth,categoryOffset]` |
| dashboard/hooks.ts:81 | `["budgets","setup-progress",setupMonth]` |
| BulkEditDialog.tsx:69 | `["transactions","bulk-edit",selectedIds]` |
| TransactionsTable.tsx:68 | `["transactions","search",debouncedQ,category,merchant,dateFrom,dateTo,transactionType,offset]` |
| QuickAddContext.tsx:27 | `["categories"]` |

11 distinct first segments: `auth-profile`, `budget-active-months`, `budget-items`,
`budget-metrics`, `budgets`, `categories`, `dashboard-bundle`, `dashboard-metrics`, `insights`,
`merchants`, `transactions`.

### F2 — every cache-mutating call site

`queryClient.invalidateQueries(` 76, `setQueryData(` 5, `clear(` 2, and ZERO `removeQueries` /
`resetQueries` / `refetchQueries` / `cancelQueries` / `getQueryData` / `getQueriesData` /
`setQueriesData`. All 76 enumerated with keys. No site passes `exact`, `predicate`, `type`,
`refetchType` or `stale` (control: the same window finds `queryKey` 75 times — the 76th is
`WorkspaceChoicePage.tsx:34`, a bare `invalidateQueries()` after demo-data load).

### F3 — the matching rule, from `@tanstack/query-core@5.100.9` on disk

Lockfile and installed manifest agree on 5.100.9. From `build/modern/utils.js`:

```js
} else if (!partialMatchKey(query.queryKey, queryKey)) { return false; }
...
function partialMatchKey(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object" && typeof b === "object")
    return Object.keys(b).every((key) => partialMatchKey(a[key], b[key]));
  return false;
}
```

Rule, applicable by hand: a declared key D matches a filter key F iff for every index i in F,
`D[i]` deep-partial-equals `F[i]`. `Object.keys(b)` over an array yields exactly F's own indices,
so F must be an element-wise PREFIX of D; D may be longer, never shorter; primitives compare by
`===`. A filter with no `queryKey` skips the check and matches every query.

### F4 — classification of all 76, computed not asserted

LIVE 51 / DEAD 20 / AMBIGUOUS 5, sum 76.

| filter key | n | verdict |
|---|---|---|
| `["safe-to-spend"]` | 11 | DEAD — nothing declared |
| `["analytics-account-overview"]` | 4 | DEAD |
| `["snapshot"]` | 4 | DEAD |
| `["budget-alerts"]` | 1 | DEAD |
| `["budgets", <month>]` | 4 | AMBIGUOUS → unreachable in fact |
| `["budget-items", <month>]` | 1 | AMBIGUOUS, genuinely reachable |
| 13 other key shapes + the bare call | 51 | LIVE |

Prediction met: the dead set is 20, not 11. The four `["budgets", <month>]` sites are AMBIGUOUS
under the rule but can never match: the only declared `budgets` query is
`["budgets","setup-progress",setupMonth]`, and index 1 compares a `YYYY-MM` string
(`toYearMonth(today())`) against the literal `"setup-progress"`.

### F5 — never live

The obvious history search (`git log -S'queryKey: ["safe-to-spend"'`) was tried and DISCARDED as
non-discriminating: that substring occurs in invalidations too. Re-derived by parsing declared keys
at every one of the 50 commits that touched the frontend src. Only four distinct declared-segment
sets ever existed:

```
160ae90 | auth-profile,bank,budget-active-months,budget-items,budget-metrics,budgets,categories,
          dashboard-bundle,dashboard-metrics,debt-accounts,insights,merchants,savings-goals,
          spending-intelligence,transactions
b1cc009 | (minus spending-intelligence)
6565a68 | (minus bank)
0f27745 | (minus debt-accounts, savings-goals)
```

None of the four dead segments ever appeared. Prediction met: never-wired call sites, not a
regression. The set only ever shrank, by feature removals.

### F6 — blast radius

19 of the 20 dead sites are SHADOWED: every `["safe-to-spend"]`, `["analytics-account-overview"]`
and `["snapshot"]` line sits in a block that also invalidates `["dashboard-bundle"]`, which is
LIVE — and account-overview, snapshot and safe-to-spend all arrive inside that bundle
(`hooks.ts:99`, `:113`, `:92`). Those refreshes happen; the keys are dead CODE, not dead BEHAVIOUR.

The exception: `["budget-alerts"]` at DashboardPage:461 is ALONE in `dismissBudgetAlert` — no
companion invalidation. Alerts render from `dashboardBundle.budget_alerts.items` with no local
filtering of the dismissed id (`dismissingAlertId` only drives the spinner). Observed today: the
user clicks dismiss, the server records it, and the alert stays on screen until the bundle's 60s
`staleTime` elapses AND the component remounts. With `refetchOnWindowFocus: false` and no polling,
sitting on the Dashboard never clears it.

Second consequence: `["insights",…]` is invalidated from exactly one place
(`QuickAddContext.tsx:60`). A write from Budget / Dashboard / Expenses / Income / Transactions
leaves all six Insights queries untouched — which is what the dead `["safe-to-spend"]` line was
evidently reaching for (inference; basis: it is paired with the bundle line that already covers
Home's copy, so the only safe-to-spend query it could add is the Insights one).

### F7 — the regime

Global: `staleTime 30_000`, `retry 1`, `refetchOnWindowFocus: false`. `gcTime` NEVER declared →
default 5 min. `refetchOnMount` / `refetchOnReconnect` never declared → default `true`. No
`refetchInterval` anywhere. Overrides: 5 min on `auth-profile` ×2, `categories` (QuickAdd),
`budgets/setup-progress`; 60 s on `dashboard-bundle`; 30 s on `budget-active-months`; 0 on
`bulk-edit`.

`invalidateQueries` marks matches stale then refetches
`type: filters?.refetchType ?? filters?.type ?? "active"` — inactive queries are marked stale and
refetch at next mount.

Is key repair sufficient? IN-TAB, yes. CROSS-TAB, no — and it cannot be, by construction:
`new QueryClient` is a module-level singleton in `App.tsx`, one client per JS context = one per
browser tab, so invalidation in tab A is structurally incapable of reaching tab B. Reported as a
FINDING and a REQUEST with nothing proposed for it.

### The proposal

P3 first, because it gates the rest: YES, a protected surface is touched. Three dead lines live
inside `QuickAddContext.tsx` (`:54` safe-to-spend, `:58` account-overview, `:59` snapshot). Nothing
proposed for them — STOP-AND-ASK. 17 sites proposed, 3 withheld.

**P1 — per site**

| sites | now | proposed | matches then |
|---|---|---|---|
| BudgetPage 239,262,274,307; DashboardPage 444,655; ExpensesPage 826; IncomePage 485; TransactionsPage 158,221 (10) | `["safe-to-spend"]` | `["insights"]` | all six `["insights",…]` queries |
| DashboardPage 446,447; TransactionsPage 160,161,223,224 (6) | `["analytics-account-overview"]`, `["snapshot"]` | DELETE the line | — |
| DashboardPage 461 (1) | `["budget-alerts"]` | `["dashboard-bundle"]` | `["dashboard-bundle", selectedMonth]` |

Why the broader segment for the 10: the narrowest key reaching the intended query is
`["insights","safe-to-spend"]`, and it is wrong here. `["insights","weekly-digest"]` carries
`safe_to_spend_today_kd`, the same figure from the same builder. Refreshing one and not the other
reproduces the divergence MOB-0 was opened to investigate. `["insights"]` additionally sweeps in
`month-options`, `recurring-patterns`, `month-delta`, `readiness` — 6 queries total — and matches
what QuickAddContext already does.

Why deletion for the 6, not repointing: each already sits beside a live `["dashboard-bundle"]`
line; repointing would issue a second invalidation of a query just invalidated.

**P2 — behaviour change, quantified.** The 10 repointed: zero new requests at write time (Insights
unmounted; `refetchType` defaults to `"active"`); the change is at next navigation to Insights, 6
queries that previously served ≤30 s-old cache now refetch — routes `dashboardMetrics` ×3
(months 24 / 2 / 3), `recurringPatterns(days:120)`, `safeToSpend(month)` (R9), `weeklyDigest()`
(R10). The 6 deleted: zero change. The 1 repointed alert site: +1 request per dismissal, fired
immediately because the Dashboard is mounted and the query active.

**P4 — tests.** Enumerated, not searched-for-absence: `invalidateQueries` appears in test files 0
times (control: `queryClient` appears 20 times, all constructing a client + provider). There is no
existing invalidation coverage at all. The discriminating form: mount with a REAL `QueryClient`,
seed a query under the real declared key, run the write, assert
`queryClient.getQueryState(key)?.isInvalidated === true` — routing through the real
`partialMatchKey` rather than a spy.

**P5 — predicted delta.** Frontend +3 tests, +0 files; absolute re-derived at execution. Predicted
named forced edits: NONE. No `apps/api` change, no contract-fixture change, no `deploy/Caddyfile`
change and no new external origin. No renames, no physical properties, no pinned strings.

### Predictions, scored

Dead set larger than eleven — MET (20). Never live rather than renamed — MET. Key repair
sufficient — HALF FALSIFIED: sufficient in-tab, structurally impossible cross-tab.

MOB-R9 — 90c65ec IS ACCEPTED SUBSTANTIVELY. The baseline collision was a CHANNEL ERROR and is
resolved. fa59ee6's ruled evidence is OWED. One question decides whether the new tests measure the
app or a reconstruction. Nothing is returned.

CADENCE. Issued under test (b) and (c).

THE GATE CLOSED THE RIGHT WAY AND IT IS THE BEST-CONSTRUCTED CHECK IN THE CYCLE. The dismissal write
and the listing path were traced to the SAME constant, shown filtering at the listing site, and the
bundle shown calling that listing. The negative case was stated IN ADVANCE and it differs from the
positive: had the server not filtered, the constant would appear nowhere in the listing lib. It
appears six times, three in the listing path, with a positive control proving the file was actually
searched. That is a check whose failure output is distinguishable from its success output, which is
the whole requirement and is the thing most checks quietly fail.

THE THREE MANDATORY SECTIONS ARE PRESENT AND GREEN. Resolution proofs with a non-matching negative
control shown exiting 0; both test tails carrying the Test Files summary line with captured exit
codes; the Errors instrument zero on both; both typechecks exit 0 at 0 bytes; the api suite RUN
despite no api file being touched, with the fixture count and empty allowlist derived from the file.

═══ THE BASELINE COLLISION IS A CHANNEL ERROR AND IS RESOLVED HERE ═══

THE IMPLEMENTER IS RIGHT AND THE CONTRADICTION IS MINE. The preceding block required the baseline
movement shown AS A DIFF HUNK and, in the same paragraph, required the standing-rules file shown
UNTOUCHED. The figure lives in that file. Both requirements cannot hold in one commit, and the
report surfaced the collision and declined to resolve it silently rather than satisfying whichever
was easier and leaving the other unmentioned. THAT IS THE CORRECT HANDLING OF A CONTRADICTORY
MANDATE and it is worth more than the figure it was about.

RULING: THE DIFF-HUNK FORM IS NOT OWED THIS CYCLE AND IS NOT WAIVED. Item (3) is satisfied for this
commit by the measured old and new stated with both figures derived at execution — 212 tests across
41 files moving to 215 across 42. The hunk form is DEFERRED TO TRACK CLOSE, which is where the
standing-rules baseline line actually moves, exactly as the frontend-fixes track did: that track made
its only two edits to the standing-rules file at its close, and its baseline line moved there and
nowhere else. THE OBLIGATION CARRIES ITS TRIGGER SO IT CANNOT EVAPORATE: at this track's close the
baseline edit ships with its `git diff` old-to-new hunk, per the standing requirement that the change
is confirmed with the hunk itself and not with a prose restatement of the counts.
  THE GENERAL FORM, RECORDED SO THIS DOES NOT RECUR: a close-out requirement written for a commit
  that MOVES a figure does not apply unchanged to a commit that moves the figure's SUBJECT while
  freezing the file that records it. When a block imposes both, the block is wrong, and the
  implementer reports the collision rather than choosing. Cited against the existing rule that a
  doc line is either a live index or a historical record and the two are updated by opposite rules —
  the baseline line is a LIVE INDEX, and a live index that is deliberately frozen has a stated
  release point, which is now stated.

═══ OWED, AND IT IS A SHORT REPLY RATHER THAN A REDO ═══

fa59ee6's RULED EVIDENCE DID NOT REACH THE REPORT. The preceding block predicted, for the
persistence commit, a payload sweep of strict 2 and tripwire 2 agreeing; a post-append composite of
strict 8 and tripwire 8; first 1, last 8, zero duplicates, zero breaks in 1 to 8; both reconciliation
routes; the enumeration PRINTED IN FILE ORDER; the docs-only exclusion shown discriminating; the gate
skip stated with its reason; and the bytes carried. THE REPORT CARRIES THE SHA AND NOTHING ELSE.
  THIS IS NOT AN AUTO-RETURN AND THE DISTINCTION MATTERS. The three mandatory sections govern the
  IMPLEMENTATION close-out and they are complete. What is missing is a DIFFERENT commit's ruled
  deliverable, and the correct response to a missing deliverable is to ask for it, not to reject work
  that satisfied its own requirements.
  IT IS NAMED RATHER THAN ABSORBED BECAUSE OF WHAT IT IS AN INSTANCE OF. N ruled items close with N
  per-item presence assertions, and reading a finished report and finding it plausible is not a
  presence check — the omitted item is precisely the one not on the list being read. This project has
  already lost a ruled four-entry record to exactly this, past three parties, while every block-level
  check passed. A report that is complete about the commit it foregrounds and silent about the one it
  mentions in its first line is the same shape.
  SUPPLY, IN ONE REPLY, FOR fa59ee6 AND FOR 90c65ec BOTH: the stat output naming the changed paths;
  the status output with emptiness marked between PRINTED delimiters rather than asserted in prose;
  for fa59ee6 the full pre-append and post-append sweep under both operative patterns with the
  enumeration in file order and both reconciliation routes, plus the docs-only exclusion shown
  discriminating and the gate-skip statement; and for 90c65ec the production diff. If any predicted
  figure missed, it is a QUESTION and never an adjustment.
  THE STANDARD WAS SET THREE CYCLES AGO AND HELD FOR THREE CYCLES. A report that points at a captured
  result transmits a pointer the reader cannot resolve, which is functionally identical to an
  uncaptured claim however genuinely the capture happened — and the failure is invisible from inside
  the implementing session, because there the pointer resolves.

═══ THE QUESTION THAT DECIDES WHAT THE NEW TESTS ESTABLISH ═══

THE NEW-FILE ROUTE IS THE RIGHT INSTINCT AND IT WAS DECLARED WITH ITS COST, WHICH IS WHAT MAKES IT A
REQUEST RATHER THAN A SELF-GRANT. Avoiding edits to two existing harnesses is a real benefit and the
+1 file was reported against its prediction rather than adjusted away.
  BUT A NEW FILE BUILDS ITS OWN HARNESS, AND A HARNESS THE TEST AUTHOR CONSTRUCTED CAN AGREE WITH THE
  CODE BY CONSTRUCTION. State, per new case, WHAT IS MOUNTED: the real page component with its real
  write handler, or a constructed stand-in that reproduces the handler's behaviour. If the real
  component is mounted, say so — that is a STRENGTHENING over the existing harnesses, which mock the
  sections as inert stubs and are therefore structurally incapable of this assertion, and it should be
  recorded as such rather than left implicit. IF A STAND-IN IS MOUNTED, name what it stands in for and
  state plainly what the test therefore does NOT establish: that the real page issues that
  invalidation on that user action. A test proving the library's matching rule works is not the test
  that was approved.
  THE STANDING GAP EITHER WAY: the two page harnesses remain incapable of asserting cache state,
  because they construct their client without returning it. Record it as a measured limitation with
  the cost of removing it stated. It is the family the earlier frontend finding already named — a
  suite structurally unable to catch a class of defect — and an unrecorded limitation is one a future
  cycle pays for twice.

THE NO-FORCED-EDITS PROOF IS NON-DISCRIMINATING AS ARGUED, AND THE RIGHT INSTRUMENT IS CHEAP. The
report reasons that the count holding at 212/41 before the new file was added proves no existing test
was force-edited. IT DOES NOT: an edit to an existing test's assertions or selectors that adds and
removes no case leaves the count identical, so the observation agrees with the hypothesis and its
negation equally. The discriminating instrument is an EMPTY DIFF over the existing test paths, which
the report already ran for the three named regression files and did not extend to the rest. Run it
across all pre-existing test files and report it. THE CLAIM IS ALMOST CERTAINLY TRUE; the reasoning
offered for it is not evidence, and this project treats those as different problems.

THE P5 MISS IS ACCEPTED AND THE FINDING INSIDE IT IS THE VALUABLE PART. Tests met exactly at plus
three; files missed by one, reported and not adjusted. The cause — two harnesses that construct their
client without returning it and stub their sections inert — is a measured property of the suite, not
an excuse, and it belongs in the record beside the gap above.

THE TWO SHARPENINGS LANDED. The control key is NAMED, declared at a stated site, and shown to share
no first segment with the single filter the dismiss path issues, so it cannot be swept by the filter
it exists to be outside of. The breadth decision is pinned by a seeding comment explaining why that
key and what narrowing would unguard — which is the one thing standing between a future tidy and the
silent return of the divergence this whole cycle began with.

CONSTRAINTS RECONCILE. Zero physical-property additions with the pattern shown matching 27 elsewhere,
so the zero is discriminating. No Caddyfile change and no new external origin, asserted rather than
omitted. No renames, pinned strings untouched, QuickAdd untouched. No convention, responsive or
zero-vs-no-data work; the month mismatch and the formatter divergence left alone. The e2e suite
untouched.

═══ STILL OPEN, AND ONE OF THEM HAS CHANGED PRICE ═══

Items A, B and C are unruled and none entered this commit, correctly.
  ITEM B'S COST HAS MOVED and the operator has been told so. The four unreachable budget sites can no
  longer ride an approved commit; they are their own commit now. The channel recommendation to fold
  them in STANDS on the merits — same files, same class, a real if small stale window on a setup
  indicator — but it is no longer free, and a recommendation whose price changed is re-stated with the
  new price rather than carried at the old one.
  ITEMS A AND C ARE UNCHANGED, offered and not adopted, and cycles passing does not adopt them.

DEPLOY IS NOT AUTHORISED BY THIS BLOCK AND IS NOT TOUCHED BY IT. A push of main is a deploy. Any
later UI observation of this fix must state that the deploy completed first; a screenshot taken after
a push and before the run lands shows the pre-fix build, which this project has already recorded
once at the operator seam.

PERSISTENCE. This block persists with the close-out record. Sweep the payload under both operative
patterns before appending — predicted strict 1 and tripwire 1, agreeing; after the append, strict 9
and tripwire 9, first 1, last 9, no duplicates, no breaks in 1 to 9, reconciled 8 + 1 = 9 and 9 minus
1 plus 1 = 9, enumeration PRINTED IN FILE ORDER. Derive from what is present; if these figures are
wrong, yours are right and you show the reconciliation. Provenance RELAYED. Amend the completeness
note to record the persisted set, the deferred baseline obligation WITH ITS TRIGGER, and the two
measured suite limitations above. Docs-only under the standing permanent licence — state the skip and
its reason, prove docs-only by exclusion with the exclusion shown discriminating, carry the bytes.

NOTHING IS OPENED BY THIS BLOCK AND NO PHASE ADVANCES UNTIL THE OWED EVIDENCE AND THE MOUNTING
QUESTION ARE ANSWERED.

---

## MOB-F1 — implementation close-out record (2026-09-11)

Two commits: `fa59ee6` (persistence, docs-only) and `90c65ec` (implementation). The evidence below
was supplied in reply to MOB-R9 and is persisted here so it is not a pointer.

### The gate, closed from source before any code was written

Stated in advance: had the server NOT filtered dismissed alerts, the dismissal constant would appear
nowhere in the listing lib. Measured — it appears six times, three in the listing path:

```
notifications.ts:61        await recordEvent(userId, BUDGET_ALERT_DISMISSED_EVENT_NAME, { alert_key: alertKey }, db)
budget-alerts-lib.ts:197   if (row.eventName === BUDGET_ALERT_DISMISSED_EVENT_NAME) { dismissedKeys.add(key); continue }
budget-alerts-lib.ts:228   .filter((item) => !dismissedKeys.has(item.alert_key))
aggregation.ts:1133        items: await listActiveBudgetAlerts(userId, month, db),
```

Positive control: `alert` occurs 22 times in that file, so the file was genuinely searched. The fix
is real, not a no-op; all 17 approved sites proceeded.

### `fa59ee6` — the persistence commit

```
 docs/modules/phase4-mobile.md | 592 ++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 592 insertions(+)
```

Docs-only by exclusion, shown discriminating — paths NOT under `docs/`: none (rc=1, empty); the same
exclusion on the known code commit `eb036c2` returns six paths.

PRE-APPEND payload sweep: **strict 2, tripwire 2, AGREEING** (headers at payload lines 1 and 165).
One further column-0 `MOB-` line read and classified: `MOB-2 ZERO-VS-NO-DATA, then MOB-3
CONVENTIONS.` — a wrapped phase handle, matching neither operative pattern.

POST-APPEND composite, measured against the file AS COMMITTED at that SHA:

```
224:MOB-R1  292:MOB-R2  379:MOB-R3  477:MOB-R4  631:MOB-R5  1039:MOB-R6  1161:MOB-R7  1325:MOB-R8
strict: 8   tripwire: 8   AGREE? YES
numbers in file order: 1 2 3 4 5 6 7 8
first 1  last 8  dups 0  ascending IN-ORDER  breaks-in-1..8 0
reconcile route A: 6 + 2 = 8    route B: 8 - 1 + 1 = 8    measured: 8
```

Every predicted figure met. Both test gates deliberately skipped under the standing docs-only
licence, stated rather than silent: the commit touches no package, so no baseline could move.

### `90c65ec` — the implementation commit

```
 apps/web/src/components/pages/BudgetPage.tsx       |   8 +-
 apps/web/src/components/pages/DashboardPage.tsx    |  12 +-
 apps/web/src/components/pages/ExpensesPage.tsx     |   2 +-
 apps/web/src/components/pages/IncomePage.tsx       |   2 +-
 apps/web/src/components/pages/TransactionsPage.tsx |   8 +-
 .../components/pages/cache-invalidation.test.tsx   | 209 +++++++++++++++++++++
 6 files changed, 224 insertions(+), 17 deletions(-)
```

Working tree clean after both commits (empty `git status --short` between printed delimiters).

### WHAT IS MOUNTED — the mounting question, answered

**The REAL `DashboardPage` component is mounted, with its REAL write handlers.** The test file
imports `DashboardPage from "./DashboardPage"` (`:21`) and renders `<DashboardPage />` (`:138`).
Every `vi.mock` targets a DEPENDENCY of the page — `react-router-dom`, `toaster`, `QuickAddContext`,
`@/lib/api`, `./dashboard/hooks`, `./budget/hooks`, `./budget/sections`, `category-detail-modal`,
`./dashboard/sections`, `demo-workspace-banner` — and never the page itself. The handlers exercised
are the real ones: `invalidateFinancialQueries` (`DashboardPage.tsx:440`), `dismissBudgetAlert`
(`:453`), `clearDemoWorkspace` (`:619`).

**The two stand-ins are PRESENTATIONAL CHILDREN only.** `HomeAttentionCenter` and
`DemoWorkspaceBanner` are replaced by stubs that render a button invoking the REAL handler prop
(`onDismissBudgetAlert`, `onClearDemoWorkspace`). They stand in for the real sections' *rendering*.

**What the tests therefore do NOT establish:** that the real `HomeAttentionCenter` and
`DemoWorkspaceBanner` render a control wired to that prop, nor its label or reachability. Stated
plainly rather than left implicit.

**The discriminating evidence that the real page is under test, not a reconstruction:** the RED run
reverted ONLY the five production `.tsx` files via `git stash push` — the test file was untouched and
remained on disk — and all three cases went red with `expected false to be true`. A test measuring a
constructed reproduction of the handler would have been unaffected by reverting production source.

**This is a STRENGTHENING over the existing harnesses** and is recorded as such.

### MEASURED SUITE LIMITATIONS (two, recorded with the cost of removal)

1. **`DashboardPage.test.tsx` and `BudgetPage.test.tsx` cannot assert cache state at all.** Each
   constructs its `QueryClient` inside `renderPage()` and does not return it, so no test in either
   file can reach the cache. Cost of removal: change both `renderPage()` signatures to return the
   client and update their existing call sites — an edit to two shared harnesses, which is why this
   cycle routed around it instead.
2. **Both files stub their sections inert**, so no trigger seam exists for a user action that issues
   an invalidation. Cost of removal: add trigger-rendering stubs to two `vi.mock` factories, the
   enumerating-factory class this project has been bitten by on the api side.
   Together these are why the suite was structurally incapable of catching this defect class — the
   same family as the earlier frontend finding, and recorded so a future cycle does not pay twice.

### THE NO-FORCED-EDITS CLAIM, re-established with the discriminating instrument

The original argument — that the count holding at 212/41 proved no existing test was force-edited —
was **NON-DISCRIMINATING and is withdrawn**: an edit that adds and removes no case leaves the count
identical, so the observation agreed with the hypothesis and its negation equally. Re-run as an
empty diff over all pre-existing test paths:

```
git diff --name-only fa59ee6 HEAD -- 'apps/web/src/**/*.test.ts' 'apps/web/src/**/*.test.tsx'
  (minus the new file)  ->  count: 0
POSITIVE CONTROL, same pathspec on eb036c2~1..eb036c2:
  apps/web/src/components/pages/DashboardPage.test.tsx
  apps/web/src/components/pages/dashboard/safe-to-spend.test.tsx
```

**Zero pre-existing test files touched**, and the pathspec is shown capable of reporting two.

### Verification

Resolution proofs `MATCHED-frontend` / `MATCHED-api` (exit 0); negative control `statera-web` →
`No projects matched the filters`, exit 0. Frontend `Test Files 42 passed (42)` /
`Tests 215 passed (215)`, exit 0, Errors 0. API `Test Files 51 passed | 10 skipped (61)` /
`Tests 873 passed | 34 skipped (907)`, exit 0, Errors 0 — run because the contract test reads the
frontend fixture (66, ALLOWLIST `[]`, both from the file). Both `tsc` exit 0 at 0 bytes.

Baseline moved **212/41 → 215/42**; the hunk form is deferred to track close per MOB-R9, with its
trigger stated. Predicted +3 tests / +0 files; measured **+3 / +1**, the file miss reported as a
question, not adjusted.

MOB-R10 — THE OWED EVIDENCE IS SUPPLIED AND THE HOLD IS DISCHARGED. MOB-F1 CACHE-INVALIDATION IS
CLOSED. One control's output changed on an immutable input and needs one line. Three operator items
and the deploy remain open; no phase advances.

CADENCE. Issued under test (a) — it closes a cycle — and (c).

EVERY OWED ITEM IS SUPPLIED AND EVERY PREDICTED FIGURE IS MET. The persistence commit's pre-append
sweep at 2/2 agreeing and its post-append composite at 8/8, enumerated in file order, first 1, last
8, zero duplicates, zero breaks, both reconciliation routes landing on 8; the same for this cycle's
own persistence at 9/9; both stats; both statuses between printed delimiters; the production diff;
the gate skips stated with their reason rather than performed silently.

AN INDEPENDENT ARITHMETIC CROSS-CHECK, RUN BY THE CHANNEL AND REPORTED BECAUSE A CHANNEL THAT ONLY
ACCEPTS IS NOT AN INSTRUMENT. The implementation stat reports 224 insertions and 17 deletions across
six files, of which the new test file is 209 insertions. The production half is therefore 15
insertions against 17 deletions. The approved shape predicts exactly that: ten repoints contribute
ten and ten, six deletions contribute zero and six, and the alert repoint contributes one and one,
totalling eleven insertions against seventeen deletions, with the remaining four insertions being the
explanatory comment the proposal required. SEVENTEEN DELETIONS IS THE DISCRIMINATING FIGURE — it is
the sum the approved site count predicts and no other distribution of seventeen sites produces it by
accident. The stat independently corroborates the diff.

═══ THE ONE THING THAT NEEDS A LINE ═══

THE DOCS-ONLY POSITIVE CONTROL CHANGED ITS OUTPUT ON AN IMMUTABLE INPUT. The same exclusion run
against the same code commit has returned SIX paths in every prior cycle of this track — the two
dashboard files, the insights page, the safe-to-spend test, the dashboard sections file and the
weekly-digest section. This cycle it returned THREE, the first three of that six. THE COMMIT CANNOT
HAVE CHANGED, so either the command changed or the capture was abbreviated in transcription.
  THIS IS NOT A RETURN AND THE INSTRUMENT IS NOT IMPUGNED. Three paths discriminate against zero
  exactly as six do, so the docs-only claim stands on its own evidence in both commits. What is at
  issue is the CONTROL'S OWN PROVENANCE, and a control whose output moved unexplained is not a
  control until the movement is explained — the control is the only thing separating an empty result
  from an instrument that cannot report.
  THE LIKELY CAUSE IS AN UNNAMED ELISION, and that is precisely the distinction the standing rule
  draws: when a payload is too long, paste the discriminating portion and SAY WHAT WAS ELIDED AND
  WHY — a named elision is still evidence, a silent one is indistinguishable from a changed command.
  SUPPLY IN ONE LINE: which it was. If elided, say so and the matter closes. If the command changed,
  state the change and re-run the prior form once so the two are reconciled.
  RECORDED AS THE SECOND TIME THIS TRACK HAS CAUGHT A REPORTING DEFECT RATHER THAN A VERIFICATION
  ONE. Those call for different fixes and this project already separates them.

═══ ACCEPTED ═══

THE MOUNTING ANSWER IS ACCEPTED AND IT IS THE STRONGER OF THE TWO POSSIBLE ANSWERS. The real page is
mounted with its real write handlers; the ten mock targets are all DEPENDENCIES and the page is never
among them; the three exercised handlers are named at their lines. The stand-ins are presentational
children invoking the real handler prop.
  THE RED-RUN DISCRIMINATOR IS THE PART WORTH KEEPING. The red was produced by reverting ONLY the
  five production files with the test file untouched on disk, and all three cases went red. A test
  measuring a reconstruction of the handler would have been unaffected by a change to the handler.
  That is an instrument distinguishing the two hypotheses rather than an assertion that they differ,
  and it was not asked for in that form.
  THE NAMED GAP IS CORRECT AND IS NOT A DEFECT: these tests do not establish that the real
  presentational children render a control wired to that prop, nor its label or reachability. Stating
  what a test does not reach is what makes what it does reach believable.

THE WITHDRAWAL IS RATIFIED AND THE REPLACEMENT IS THE RIGHT INSTRUMENT. The count-held argument was
non-discriminating and was withdrawn rather than defended. Its replacement — an empty name-only diff
over the pre-existing test pathspec, with the SAME pathspec shown returning two files on a known
test-touching commit — proves the pathspec was capable of reporting, which is the half that turns an
empty result into an observation. The pathspec-that-matched-nothing failure has cost this project a
cycle before.

THE TWO SUITE LIMITATIONS ARE ACCEPTED AS MEASURED, WITH THEIR REMOVAL COSTS STATED. Both page
harnesses construct their client without returning it, so no test in either file can reach the cache;
both stub their sections inert, so no trigger seam exists. TOGETHER THEY ARE WHY THE SUITE WAS
STRUCTURALLY INCAPABLE OF CATCHING THIS CLASS, and this cycle routed around them rather than removing
them — which was correct and is now on the record instead of being rediscovered. Same family as the
earlier frontend finding that a suite can be incapable by construction of catching the defect it
appears to cover.

A FOURTH INSTANCE OF CHANNEL TEXT AT COLUMN 0, AND THE TRIPWIRE HANDLED IT SILENTLY. A wrapped phase
handle sat at column 0 in the persistence payload and matched NEITHER pattern — read and classified
rather than inferred from a count agreeing. THIS IS THE CASE THE SEQUENCING BLOCK ANTICIPATED when it
ruled that phase labels carry their content word, on the ground that a phase handle and a ruling
number differ by one character in a file swept for the second. The anticipation was correct and the
instrument was already right. Nothing owed.

═══ MOB-F1 CACHE-INVALIDATION CLOSES ═══

SEVENTEEN SITES SHIPPED IN ONE COMMIT: ten repointed to the broad segment, six deleted, one repointed
behind a gate that closed with the server's filtering shown both ways. Frontend 212 across 41 files
moving to 215 across 42. Three tests added, RED-first with the discriminating value captured, zero
pre-existing test files touched, proven by a pathspec shown capable of reporting.
  WHAT THE CYCLE ACTUALLY BOUGHT, STATED PLAINLY BECAUSE THE CHANNEL'S ORIGINAL JUSTIFICATION FOR IT
  WAS FALSIFIED: one real user-visible defect fixed — an alert that did not clear when dismissed —
  nineteen misleading dead call sites removed or repointed, a second defect found and held for the
  operator, a structural cross-tab limit established, and two suite limitations measured. The
  screenshot-instrument rationale that justified running it first did not survive contact with the
  measurement, and the procedural mitigation replaced it.
  NO NEW STANDING LINE. The count stays at SIX across four tracks.
  THE DEFERRED BASELINE OBLIGATION IS LIVE AND CARRIES ITS TRIGGER: the standing-rules baseline line
  moves at TRACK CLOSE, shipping with its diff hunk old-to-new, not with a prose restatement.

═══ OPEN — THREE ITEMS AND A DEPLOY, NONE RULED HERE ═══

Items A, B and C are unchanged and unadopted; cycles passing does not adopt them, and Item B's price
is now its own commit rather than a ride-along. THE DEPLOY IS THE OPERATOR'S AND IS NOT AUTHORISED BY
THIS BLOCK. Any later UI observation of this fix states that the deploy completed first.

NO PHASE ADVANCES. The responsive phase opens on its own block after the operator disposes of the
open items, or explicitly leaves them open and says so.

PERSISTENCE. This block persists with the close-out record. Predicted payload strict 1 and tripwire 1
agreeing; after the append, strict 10 and tripwire 10, first 1, last 10, no duplicates, no breaks in
1 to 10, reconciled 9 + 1 = 10 and 10 minus 1 plus 1 = 10, enumeration PRINTED IN FILE ORDER. Derive
from what is present; if these figures are wrong, yours are right and you show the reconciliation.
Provenance RELAYED. Amend the completeness note to record the persisted set, the cycle's close, and
the control-provenance item with its disposition once the one line arrives. Docs-only under the
standing permanent licence — state the skip and its reason, prove docs-only by exclusion with the
exclusion shown discriminating AND WITH ITS CAPTURE COMPLETE OR ITS ELISION NAMED, carry the bytes.

NOTHING IS OPENED BY THIS BLOCK.

---

## Control-provenance disposition — THE COMMAND CHANGED (2026-09-11)

Two possibilities were offered and the answer is the second: **the command changed, and the
implementer changed it.** `| head -3` was appended to the docs-only positive control in the
`fa59ee6` evidence reply, and `| head -2` in the `b198386` commit block, to keep output compact.
Neither was declared. This was **not** a transcription elision — it was a silently modified
instrument, which is the worse of the two readings MOB-R10 offered.

Prior form re-run verbatim to reconcile, against the same immutable input
(`eb036c2 phase-4: frontend-fixes Phase B — four items …`):

```
git show --name-only --format='' eb036c2 | grep -v '^docs/'
apps/web/src/components/pages/DashboardPage.test.tsx
apps/web/src/components/pages/DashboardPage.tsx
apps/web/src/components/pages/InsightsPage.tsx
apps/web/src/components/pages/dashboard/safe-to-spend.test.tsx
apps/web/src/components/pages/dashboard/sections.tsx
apps/web/src/components/pages/insights/WeeklyDigestSection.tsx
count: 6
```

The 3 and the 2 are the first 3 and first 2 of that same 6 — confirmed by re-running both
truncated forms side by side. **The docs-only claims in `fa59ee6` and `b198386` are unaffected**:
three paths discriminate against zero exactly as six do. What was damaged was the control's
provenance, not the conclusion.

**Durable form: a control is run in ONE form and that form does not change between cycles. If its
output must be shortened, the shortening is named in the same breath.** A control whose output
moves for an undeclared reason stops being a control, because the whole function of a positive
control is to prove the instrument could have reported — and an instrument that was quietly
narrowed cannot support that proof. This is the **second reporting defect** this track has caught
as distinct from a verification defect; both were caught by the channel re-deriving a figure rather
than reading the report.

## MOB-F1 CACHE-INVALIDATION — CLOSED

Three commits: `fa59ee6` (persistence), `90c65ec` (implementation, 17 sites), `b198386`
(close-out record). **Not deployed.**

**What shipped:** ten `["safe-to-spend"]` sites repointed to `["insights"]`; six
`["analytics-account-overview"]` / `["snapshot"]` lines deleted as shadowed duplicates; one
`["budget-alerts"]` site repointed to `["dashboard-bundle"]` behind a gate that closed with the
server's dismissal filtering shown both ways.

**What the cycle bought**, with the channel's original justification recorded as falsified: one
real user-visible defect fixed (a dismissed alert that did not clear), nineteen misleading dead
call sites removed or repointed, a second defect found and held for the operator, a structural
cross-tab limit established (one `QueryClient` per JS context — key repair cannot reach a second
tab), and two suite limitations measured.

**Channel arithmetic cross-check, recorded because it corroborates independently:** the stat's
**17 deletions** is the discriminating figure — ten repoints contribute 10/10, six deletions 0/6,
the alert repoint 1/1, totalling 11 insertions against 17 deletions, with the remaining four
insertions being the required explanatory comment. 209 of the 224 insertions are the new test file.

**No new standing rule. The count stays at SIX across four tracks.**

**Live deferred obligation:** the standing-rules frontend baseline line moves at **track close**,
shipping with its `git diff` old→new hunk (212/41 → 215/42), never a prose restatement.

MOB-R11 — ITEMS A, B AND C ARE RULED. 74676a7 IS ACCEPTED. The control disclosure is RATIFIED as
the correct handling of a self-caused instrument fault. A carried commit count is MEASURED before
any push. One implementation commit is authorised.

CADENCE. Issued under test (b).

OPERATOR RULING BY DELEGATION, 2026-08-29, on the channel recommendations stated in the message
immediately preceding it and on nothing else: Item A DELETE, Item B FOLD IN, Item C QUEUE. The
push was part of the same recommendation and its disposition is restated below with a changed
reason, which is the operator's to accept or reject.

74676a7 IS ACCEPTED. Pre-append 1/1 after the halt and rewrap; post-append 10/10 agreeing,
enumerated in file order, first 1, last 10, zero duplicates, zero breaks, both routes landing on
10; docs-only exclusion empty; both gates skipped with the reason stated.

THE CONTROL DISCLOSURE IS RATIFIED AND IT IS THE BEST THING IN THIS CYCLE. The instrument was
modified by appending a truncation to it, the modification was not declared, and the implementer
named it AGAINST ITSELF as the worse of the two readings the channel had offered rather than
taking the benign one that was equally available. The uncut form was then re-run verbatim against
the same immutable commit and the shortened outputs shown to be its first three and first two.
  THE DURABLE FORM RECORDED WITH IT IS THE CORRECT GENERALISATION AND IS ADOPTED FOR THIS TRACK: a
  control runs in ONE FORM ACROSS CYCLES, and if its output must be shortened the shortening is
  named in the same breath. A control's value is entirely in its comparability across runs, so a
  silently changed control is not a weaker control — it is not a control at all, and the page
  cannot tell the two apart.
  WHY THIS IS RATIFIED RATHER THAN MERELY ACCEPTED: a silently shortened capture and a broken
  instrument are indistinguishable in a report, and the ONLY thing that ever separates them is a
  party volunteering which it was. That volunteering cannot be compelled by any rule, which is
  exactly why it is recorded when it happens.
  NO NEW CLAUDE.md STANDING LINE. The count stays at SIX across four tracks. The existing rule
  already governs — a named elision is still evidence, a pointer is not — and this is that rule's
  instrument-side twin, cited rather than minted.

THE FIFTH COLUMN-0 INSTANCE IS THE INSTRUMENT'S FIRST CATCH ON THE IMPLEMENTER'S OWN TEXT, and it
is worth recording for that reason alone. The tripwire was built to catch this channel's habit of
opening paragraphs with a ruling number; it has now fired on both parties. An instrument that
catches only its author's known habit is a pattern fitted to a sample; one that catches an
unrelated party is measuring the property it claims to measure. The rewrap was correct — author
and editor were the same party, so the licence question does not arise — and the halt-then-re-sweep
sequence was run in the right order.

═══ THE CARRIED COUNT — MEASURED FIRST, BEFORE ANY PUSH ═══

TWO FIGURES FOR THE SAME QUANTITY APPEAR FOUR LINES APART IN ONE REPORT: four commits named for
this cycle, and five commits stated as unpushed. The prior cycle said four. NEITHER IS TREATED AS
CORRECT AND NEITHER IS RECONCILED BY ARGUMENT.
  THIS IS THE DERIVE-DON'T-CARRY CLASS ON ITS CANONICAL SUBJECT. This project has already recorded
  an unshipped-commit count incremented from memory across three cycles — thirteen, then a reported
  fifteen, then a reported sixteen — with the wrong figure inherited into a charter, and one command
  settled it at fourteen. The figure is not carried; it is derived.
  MEASURE AND REPORT, AS THE FIRST ACTION OF THE NEXT REPORT:
      git rev-list --count origin/main..HEAD
      git log --oneline origin/main..HEAD
  Both outputs pasted. Reconcile the count against the enumerated list — two routes, and a
  disagreement is investigated rather than averaged. If the enumeration shows a commit neither the
  channel nor the implementer expected, that is a finding and it is reported before anything is
  pushed.

═══ ITEM A AND ITEM B — ONE COMMIT, AND ONE PRE-CHECK GATES HALF OF IT ═══

ITEM A — THE THREE PROTECTED-SURFACE LINES ARE DELETED. The operator ruling lifts the constraint
for these three lines and for nothing else; QuickAdd internals remain untouchable in every other
respect, and the FAB topology is unmoved.
  DELETION, NOT REPOINTING, AND THE REASON IS THE SAME ONE THAT GOVERNED THE SIX. The broad
  insights segment is ALREADY invalidated in that same file, so repointing would issue a second
  invalidation of a query invalidated one line earlier. Deletion is narrower and truer.
  PRE-CHECK, REPORTED IN THE SAME REPORT AND NOT ASSUMED: confirm from the file that each of the
  three deletions sits beside a live invalidation covering the same payload, naming which line
  covers which. If any of the three is NOT shadowed, deleting it is a behaviour change rather than
  dead-code removal — STOP AND REPORT that one; the other two proceed.
  ZERO TESTS ARE OWED FOR ITEM A if the pre-check confirms shadowing, because a deletion of a line
  that matched nothing and was shadowed by a live sibling changes no observable behaviour, and a
  test asserting that nothing changed reads identically in both worlds. State that reasoning rather
  than leaving the absence of a test unexplained.

ITEM B — THE FOUR UNREACHABLE BUDGET SITES ARE FOLDED IN, and they carry their own per-site
treatment rather than riding Item A's coat-tails.
  PROPOSE AND IMPLEMENT IN ONE REPORT, compressed on the same grounds the preceding cycle was: the
  surface is four sites and one target query. The hard stop is not compressed — if the pre-check
  below shows the choice is not clean, STOP AND REPORT rather than choosing.
  PER-SITE P1 ENTRY: file:line, the key as written, the key proposed, and the declared query it
  will then match under the matching rule already derived at the installed version. Prefer the
  narrowest key that reaches the intended query.
  THE HAZARD, NAMED IN ADVANCE SO IT IS NOT DISCOVERED AFTER THE CHOICE. The declared key carries a
  month segment, and the month the setup-progress query was mounted with is not necessarily the
  month the write targets. A key that pins the month matches only when the two coincide and fails
  silently when they do not — which is this defect's own mechanism recurring one segment over.
  Establish from source whether they can differ. If they can, the month segment is omitted from the
  filter and you say so; if they cannot, say how that is guaranteed.
  QUANTIFY THE BEHAVIOUR CHANGE per user action, as the approved sites did: how many queries newly
  refetch, which routes they hit, and whether the target is mounted at write time.
  ONE DISCRIMINATING TEST, OUTCOME FORM NOT SPY FORM: seed the real declared key on a real client,
  run the real write handler, assert the invalidated state. Plus a named control key shown to share
  no first segment with the filter. State what each reads IF THE CHANGE HAD NOT LANDED. RED-first
  with the discriminating value captured.
  IF THE PAGE HARNESS CANNOT REACH THE CACHE — and the measured limitation says both page harnesses
  construct their client without returning it — use the new-file route already established, mount
  the REAL page with its REAL handler, and state which components are mocked and that none of them
  is the page. Do not edit an existing harness; if the only workable route requires it, that is a
  NAMED FORCED EDIT and it stops and asks before it ships.

ONE COMMIT CARRIES BOTH. Constraints as before: zero physical-property additions with a positive
control; no Caddyfile change and no new external origin, asserted rather than omitted; no renames;
pinned strings untouched; the FAB topology untouched; the three named regression files green AND
untouched. No convention, responsive or zero-vs-no-data work in passing. The e2e suite untouched.
CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS, with the api suite RUN because the contract test
reads the frontend fixture, and the fixture count and allowlist length derived FROM THE FILE.
Predicted deltas stated in advance; A MISS IS A QUESTION, NEVER AN ADJUSTMENT. Re-derive every
figure AFTER THE LAST EDIT.

ITEM C — THE CROSS-TAB REGIME IS QUEUED, NOT OPENED, AND IT CARRIES ITS TRIGGER. The client is a
module-level singleton, one per browser context, so no key repair can make two contexts agree; the
remedies are app-wide behaviour changes — focus-refetching, or a cross-tab broadcast — affecting
every query in the application. TRIGGER: any requirement that two simultaneously-open contexts
agree, or any operator report of staleness that survives a single-tab fresh load. THE PROCEDURAL
MITIGATION STANDS IN ITS PLACE for this track: operator UI observations are taken in ONE tab, from
a fresh load, navigating between pages, and the report states that this was done.

═══ THE PUSH — RESTATED WITH A CHANGED REASON, THE OPERATOR'S TO ACCEPT OR REJECT ═══

THE CHANNEL RECOMMENDED PUSH NOW AND NOW RECOMMENDS WAITING, and the change is stated rather than
made quietly. Items A and B are small and already ruled, so bundling them yields ONE deploy record
and ONE verification instead of two, and the ride-along diff against the deployed ref is simpler to
read for one push than for two. The alert defect is real but not urgent — an alert that clears on
the next page load.
  NOTHING STALLS ON THIS EITHER WAY. The implementer proceeds with the count measurement and the
  A/B commit regardless; the push is the operator's action at the moment he chooses.
  WHEN IT HAPPENS, THE DEPLOY DISCIPLINE IS UNCHANGED AND IS NOT WAIVED BY THE PUSH BEING SMALL.
  Diff against ORIGIN/MAIN, not local main — local main is not a reliable proxy for what production
  runs, and this project has already missed a riding commit exactly that way. Enumerate every riding
  commit and name any that is not this track's own work, with its CSP check. A PUSH IS NOT A DEPLOY:
  no UI observation of any fix in this push is evidence until the Actions run has LANDED, and the
  report says that it had. The deploy record is written at the close of the push, not deferred.

PERSISTENCE. This block persists together with the block following it. Sweep the payload under both
operative patterns before appending — and note that the payload's prose opens paragraphs with
ruling numbers and phase handles, which is now a five-instance class, so the sweep is predicted
clean rather than assumed clean and a disagreement halts the write. Predicted payload strict 2 and
tripwire 2 agreeing; after the append, strict 12 and tripwire 12, first 1, last 12, no duplicates,
no breaks in 1 to 12, reconciled 10 + 2 = 12 and 12 minus 1 plus 1 = 12, enumeration PRINTED IN
FILE ORDER. Derive from what is present; if these figures are wrong, yours are right and you show
the reconciliation. Provenance for both blocks RELAYED. Amend the completeness note to record the
persisted set, the three dispositions, the adopted control form, and the measured commit count once
it exists. Docs-only under the standing permanent licence — state the skip and its reason, prove
docs-only by exclusion with the exclusion shown discriminating AND ITS CAPTURE UNCUT, carry the
bytes.

MOB-R12 — PHASE MOB-1 RESPONSIVE IS OPENED. Phase A is SOURCE-SIDE MEASUREMENT, report only, hard
stop. The rendered half is deliberately deferred and its reason is stated.

CADENCE. Issued under test (a) — it opens a phase.

THE CHARTER, IN THE OPERATOR'S OWN WORDS: "making the web app friendlier for mobile users." This is
the second of the four items in his sequence and the first of this track's three shapes. It is what
he actually asked for.

THE SPLIT, AND WHY PHASE A CANNOT MEASURE EVERYTHING AT ONCE. Layout is a RENDERED property. jsdom
computes no layout, which is why a prior item in this project shipped a deliberate zero-test gap
and was verified only by operator observation; and the e2e suite has no backend provisioned and is
not to be repaired, revived or deleted as a side effect of this work. THE IMPLEMENTER THEREFORE
CANNOT OBSERVE THIS APPLICATION RENDERING AT ANY WIDTH. Phase A measures what source settles and
produces the observation list for what it does not. Claiming a rendered property from a class name
is inference, and this phase's whole risk is that inference looks like measurement.
  EVERY FINDING IS LABELLED, PER ITEM, ONE OF TWO WAYS: DERIVED — settled by source, with the
  source shown — or OBSERVABLE-ONLY — requiring a rendered check, with the check stated. An item
  whose label is wrong is worse than an item omitted.

STEP 0 AS USUAL: hostname and pwd first; HEAD and status pasted with emptiness marked between
printed delimiters; OPEN ENUMERATION of held blocks, enumerated not confirmed; baselines re-derived
with resolution proofs and a non-matching negative control shown exiting 0, absolutes stated so a
miss is a question and never an adjustment, and the frontend figure re-derived rather than carried
because the preceding commits moved it. INTEGRATION is not owed and not run; state the omission and
its reason.

L1 — THE VIEWPORT AND BREAKPOINT INVENTORY. Establish from source: whether a viewport meta tag
  exists and what it declares; which Tailwind breakpoints are configured, including any customised
  in the v4 CSS-first configuration rather than a JS config file; and the FULL COUNT AND
  DISTRIBUTION of responsive-prefixed classes across src, by prefix, with the file list for the
  least-used prefix. DERIVE THE PREFIX VOCABULARY FROM THE CONFIGURATION, not from what Tailwind's
  defaults are assumed to be — a configured breakpoint absent from the assumed list is invisible to
  a search built on the assumption.

L2 — WHAT THE APP DOES BELOW THE SMALLEST BREAKPOINT. This is the question the charter is actually
  about. For each of the four main pages, report the outermost layout container and its declared
  column behaviour at the unprefixed base width. State which pages collapse to one column by
  construction and which retain a multi-column track at every width. A grid template that names
  fixed fractions with no unprefixed single-column fallback is the failure mode; report whether any
  exists, with file:line.

L3 — HORIZONTAL OVERFLOW SITES. Enumerate every element carrying a class that prevents shrinking or
  wrapping — nowrap, fixed widths, min-widths, explicit whitespace control — and for each state
  whether a shrink path exists. The two known sites are the starting point and not the answer: one
  was fixed and one was deliberately deferred INTO this phase. Positive control required; an empty
  result here is the likely one and is worth nothing without proof the pattern fires.

L4 — TAP TARGETS. Enumerate interactive elements whose declared size falls below a 44px minimum, by
  reading the size variants actually applied rather than by assuming a default. Report the variant
  definitions themselves — the shared primitive's size table — and then the call sites using the
  smallest ones. LABEL THIS CAREFULLY: a declared height in a variant is DERIVED; whether a
  rendered control meets the threshold after padding, borders and line-height is OBSERVABLE-ONLY.

L5 — THE TABLES. The transaction table is virtualised. Report its column construction, whether it
  declares a minimum width, what its container does when the viewport is narrower than that
  minimum, and whether any alternative narrow-width presentation exists anywhere in the tree.
  Report the same for any other tabular surface found; enumerate rather than assuming there is one.

L6 — DIALOGS AND MODALS AT NARROW WIDTHS. The transaction, import and settings dialogs are the
  largest surfaces in the application. For each: declared width and max-width, whether it is
  responsive, whether its content scrolls, and whether it can exceed the viewport height. The
  import dialog file also holds the largest concentration of physical-property sites in the tree,
  which is context for L8 and not a licence to touch it here.

L7 — THE FAB, REPORT ONLY. Its topology is FIXED — icon-only at 56px, its z-index, its aria-label,
  its tooltip, sole visible trigger, the global shortcut. IT DOES NOT MOVE WITHOUT AN OPERATOR
  RULING and none exists. Report its declared position, what sits beneath it at narrow widths, and
  whether any scrollable content or control can pass under it. A MOBILE PASS WILL WANT TO MOVE IT;
  report the collision, propose nothing.

L8 — THE PHYSICAL-PROPERTY BASELINE, RE-DERIVED. It was measured at thirty-two sites across twelve
  files and the preceding commits touched five of those files. RE-DERIVE FROM THE TREE, do not
  carry the figure, and report the movement as a delta against it with the cause of any change
  named. The primitives directory was proven clean and its zero proven discriminating; re-derive
  that too. THE STANDING RULE FORBIDS ADDITIONS AND THIS PHASE MUST ADD NONE — the pre-existing set
  belongs to the conventions phase and is not swept here.

L9 — THE BRASS-SLOT ELEMENT. It is now in scope and it is the hardest single element in this track:
  simultaneously the rationed brass slot, an overflow site, and enlarged to clear the large-text
  contrast threshold by a ruling. A six-option table already exists showing every remedy landing in
  the design or mobile track. RE-DERIVE THAT TABLE FROM THE TREE rather than reading it out of the
  document, confirm each collision still holds, and state whether any option has become available
  that was not before. PROPOSE NOTHING.

L10 — CHARTS AT NARROW WIDTHS. Report how the chart surfaces declare their dimensions, whether any
  declares a minimum width, and what their tooltips and axis labels do when the container is
  narrow. Note that the inline-style CSP allowance exists specifically for these components and
  must not be disturbed.

L11 — THE OBSERVATION LIST — THE PHASE'S MOST USEFUL DELIVERABLE. Produce a SHORT ORDERED LIST of
  checks only the operator can perform: the exact widths to test, the page, what to look at, and
  WHAT A PASS AND A FAIL EACH LOOK LIKE stated separately so the check is discriminating. Keep it
  to the checks that source could not settle. Each carries the standing preconditions: the deploy
  must have LANDED, not merely been pushed, and the observation is taken in ONE tab from a fresh
  load, navigating between pages.

REPORT FORMAT. One report, L1 through L11 in order, each with its evidence PASTED rather than
pointed at, each finding labelled DERIVED or OBSERVABLE-ONLY. Where a figure is a count, show the
command and its output. Where a claim is about a file, show the matched lines rather than a
description. Every zero paired with a positive control and with a statement of what a populated
result would have looked like. Every glob-bearing argument quoted. Every search scoped to src, and
say so. Derive every figure FROM THE FILE, never from a document about the file — including the
prior measurement report and this block.

SCOPE. NOTHING IS FIXED, NOTHING IS STYLED, NOTHING IS COMMITTED, NOTHING IS PUSHED. No convention
work, no zero-vs-no-data work, no cache work beyond what the preceding block authorises. The e2e
suite is not run, repaired, revived or deleted. The queued items stay queued and are not tidied in
passing. If a discovery would enlarge this mandate, that is a STOP-AND-ASK and a REQUEST, never a
self-grant.

SEQUENCING, STATED SO IT IS NOT AMBIGUOUS: the preceding block's commit lands FIRST; this
measurement follows it. They are not gated on each other in substance, but they are not worked in
parallel, and this phase's Phase A report is written against the tree as it stands AFTER that
commit.

HARD STOP after the report. A proposal is a separate cycle and is not written here.

MOB-R13 — THE HALT WAS CORRECT AND THE DEPENDENCY FINDING IS ACCEPTED. MOB-R12's sequencing clause
is WRONG and is corrected ADJACENT, not edited. The non-delivery is recorded as the third instance
on this track. A third figure for the commit count makes its measurement non-optional.

CADENCE. Issued under test (b).

REISSUE NOTE, CARRIED INSIDE THE BLOCK SO IT CANNOT BE SEPARATED FROM IT. This block was reissued
PRE-PERSISTENCE by its author for WRAPPING ONLY, under the narrow licence: author only,
pre-persistence only, non-semantic layout only. Exactly one line changed — the Provenance
sentence's line break moved so no line begins with a ruling number at column 0. No token was added,
removed or altered. The defect was found by the implementer's pre-append sweep, reported with its
minimal remedy, and NOT applied by the implementer, correctly, because the licence is the author's.
A reader comparing this against the first relay sees a wrapping difference and nothing else.

THE NON-DELIVERY IS CONFIRMED AND THE BLOCK IS RE-RELAYED VERBATIM, NOT RE-AUTHORED. MOB-R11 was
authored and issued in the same message as MOB-R12, in its own fenced block, immediately preceding
it. It did not arrive. Text this end authored being reported absent at the far end is a
non-delivery signal, and the disposition is to re-relay the original unchanged with its number and
date intact. Nothing is backdated and nothing is reconstructed.
  THIS IS THE THIRD NON-DELIVERY ON THIS TRACK AND THE SECOND OF A BLOCK ISSUED ALONGSIDE ANOTHER.
  MOB-R2 was lost the same way: issued in one message with the track-opening block, and only the
  first arrived. The pattern is now legible — WHEN THIS CHANNEL ISSUES TWO BLOCKS IN ONE MESSAGE,
  THE SECOND IS AT RISK. Whether the cause sits in the relay or in the operator's paste, neither
  end can see it alone; only the operator sees both sides.
  STANDING DISPOSITION ON THE CHANNEL, not on the implementer: when two blocks must be issued
  together, the message names both by number and states that both are owed, so a single-block
  arrival is detectable from the block that did arrive rather than only from the implementer's
  enumeration a cycle later. MOB-R12's references to MOB-R11 happened to serve that function here,
  which is luck rather than method.
  STRENGTHENED AT THE FOURTH INSTANCE, WHICH OCCURRED INSIDE THIS REMEDY: the naming disposition
  above is INSUFFICIENT and is superseded. ONE BLOCK PER MESSAGE. A block that must accompany
  another is sent in its own message, and the accompanying message says which number is arriving
  separately. Three of this track's non-deliveries were a second block in a two-block message, the
  third of them occurring inside the remedy written for the second — which is the strongest
  available evidence that naming the risk does not mitigate it and only splitting does.
  ENUMERATION CAUGHT IT AGAIN, AND BY NOTHING ELSE. Step 0.3 was run in open form, from the file,
  and the absence was established BEHIND A POSITIVE CONTROL — the same search shown finding the
  preceding number eight times — so the zero is an observation rather than an empty result. That is
  now the fifth occasion in this project that an implementer enumerating what it holds is the only
  instrument that detected a ledger fault.

═══ THE L8 DEPENDENCY IS REAL AND MOB-R12 IS WRONG ═══

THE FINDING IS ACCEPTED IN FULL AND IT IS SHARPER THAN A PROCEDURAL OBJECTION. MOB-R12 states that
the two cycles "are not gated on each other in substance." THAT IS FALSE, and the implementer
located why: L8 re-derives the physical-property baseline across the twelve files and reports the
delta WITH ITS CAUSE NAMED, and the authorised commit touches two of those twelve. Measuring a
figure that an unmade commit is about to move, and naming a cause not yet visible, produces a
carefully-specified number measured against the wrong tree — with nothing in the report able to
say so. The clause asserted independence where a dependency existed.
  THE DISPOSITION IS AN ADJACENT CORRECTION, NOT AN EDIT. MOB-R12 is persisted with its text
  unchanged, including the false clause, and this block sits beside it so a reader meets the error
  and its correction together. The operative instruction is below.
  MOB-R12's SUBSTANTIVE MANDATE IS UNAFFECTED. L1 through L11 stand exactly as written. What
  changes is when L8 is measured and against what.

L8 IS MEASURED AGAINST THE TREE AS IT STANDS AFTER THE AUTHORISED COMMIT, and the ordering is now
explicit rather than implied: the commit lands FIRST, then the responsive measurement runs. That
is what MOB-R12's own sequencing sentence required; only its parenthetical claim of substantive
independence was wrong.
  IF THE OPERATOR LATER SEQUENCES THEM THE OTHER WAY, L8 IS DEFERRED RATHER THAN ESTIMATED — the
  report states that L8 is not measured and why, and every other item proceeds. An unmeasured item
  declared unmeasured costs a cycle; an item measured against the wrong tree costs the credibility
  of the figure and of everything reported beside it.
  RE-DERIVE, DO NOT CARRY, AND RE-DERIVE AFTER THE LAST EDIT. The thirty-two-site figure across
  twelve files is a measurement of a past tree. The delta is reported against it with the cause of
  any movement named, and the primitives directory's proven-discriminating zero is re-derived too.

THE REFUSAL TO INFER IS THE PART WORTH RECORDING. The implementer declined to reconstruct MOB-R11
from MOB-R12's references to it, and declined to proceed on the assumption that the missing block's
commit is cache-only and therefore harmless to L8 — stating that the assumption is probably right
and that "probably right" is the class this track has spent ten blocks refusing to act on. THAT IS
CORRECT AND IT IS THE HARDER CHOICE. A reconstructed ruling is checkable-and-wrong, which this
project rates worse than an uncheckable one, and a plausible assumption acted on silently is
indistinguishable in the record from a verified fact.

═══ THE COMMIT COUNT NOW HAS THREE FIGURES ═══

FOUR, THEN FIVE, THEN SEVEN, ACROSS THREE CONSECUTIVE REPORTS, NONE OF THEM MEASURED. Growth is
expected — commits were added between the reports — which is exactly what makes a stated figure
indistinguishable from a carried one incremented by hand. A sequence that grows plausibly is the
hardest kind of wrong figure to see, and this project has the precedent in its own record.
  THE MEASUREMENT IS ALREADY RULED as the first action of the next report and it is restated here
  because the block carrying it was the one that did not arrive. Both commands, both outputs
  pasted, the count reconciled against the enumerated list, a disagreement investigated rather than
  averaged. NOTHING IS PUSHED UNTIL IT IS MEASURED — the count is what decides what a push ships,
  and the operator is choosing when to push against it.

PERSISTENCE. This block persists alone, appending at position 13 after the pair that preceded it.
Sweep the payload under both operative patterns before appending; the payload's prose opens
paragraphs with ruling numbers, which is now a six-instance class, so the sweep is predicted clean
rather than assumed clean and a disagreement halts the write. Predicted payload strict 1 and
tripwire 1 agreeing; after the append, strict 13 and tripwire 13, first 1, last 13, no duplicates,
no breaks in 1 to 13, reconciled 12 + 1 = 13 and 13 minus 1 plus 1 = 13, enumeration PRINTED IN
FILE ORDER. Derive from what is present; if these figures are wrong, yours are right and you show
the reconciliation. Provenance: RELAYED, REISSUED PRE-PERSISTENCE BY ITS AUTHOR FOR WRAPPING ONLY.
Amend the completeness note to record the persisted set, the fourth non-delivery with the
one-block-per-message disposition that supersedes the naming one, the sixth column-0 instance as
the first genuine wrap, and the adjacent correction to MOB-R12's sequencing clause.

═══ THE PRECEDING CYCLE IS ACCEPTED — RECORDED HERE BECAUSE ITS OWN BLOCK IS SPENT ═══

THE A/B COMMIT IS ACCEPTED. Item A's pre-check confirmed all three lines shadowed by a single live
sibling carrying all three payloads, each named at its line; all three deleted; zero tests owed
with the reasoning STATED rather than the absence left unexplained.
  ITEM B'S PRE-CHECK IS THE BEST WORK IN THE CYCLE AND IT CHANGED THE ANSWER. The two months are
  independent state in two components, user-changeable in one, so a month-pinned filter would have
  matched only on coincidence — this defect's own mechanism one segment over, found before the
  choice rather than after it. The segment was omitted and the broader key chosen on the ground
  that four existing live sites already spell it that way, so the repair CONVERGES rather than
  adding a fifth spelling. THE TEST SEEDS A DIFFERENT MONTH THAN THE WRITE TARGETS, which pins
  month-agnosticism as well as the repair — a stronger assertion than the one approved, and the
  mutation attributed to exactly one case with the other three surviving, which is what attributes
  weight to a case rather than to a set.
  CLOSE-OUT RECONCILES: 215/42 to 216/42, plus one test and no files, AS PREDICTED; both suites
  exit 0 with the Test Files line; both typechecks 0 bytes; fixture 66 and allowlist empty from the
  file; zero physical-property additions behind a control finding 27; the negative deliverables
  tested positively by empty status. The deferred baseline-hunk obligation remains live with its
  trigger at track close.

THE F1 INCOMPLETENESS IS ACCEPTED, SELF-REPORTED, AND IS THIS TRACK'S SHARPEST INSTRUMENT FINDING.
The enumeration found 28 declared queries; there are 29. The parser matched the hook's plain call
form and missed a call carrying a GENERIC TYPE ARGUMENT between the name and the paren. The file is
unchanged since phase 2, so this is the pattern's fault and not drift.
  IT IS THE ASSUMED-CONVENTION CLASS, and this project has the rule already: derive the search
  vocabulary from the ARTIFACT being checked, not from what the names are assumed to look like.
  THE PART THAT IS GENUINELY NEW AND WORTH CARRYING: the parser's own self-check — zero sites
  without a key — was NON-DISCRIMINATING, because it counted only among the sites the parser had
  already found. A completeness check computed over a search's own output cannot detect what the
  search missed. It agrees with the hypothesis and with its negation equally, and it reads as
  reassurance, which is worse than no check. AN ENUMERATION IS VALIDATED AGAINST THE ARTIFACT, NOT
  AGAINST ITSELF: count the declaring sites a second way — every file importing the hook, or every
  occurrence of the hook name regardless of what follows it — and reconcile the two routes.
  NO CONCLUSION MOVES AND THE REPORT SAYS SO CORRECTLY: distinct first segments unchanged at 11,
  the four dead segments still dead, the unreachable set still unreachable, Item B's analysis
  intact. THE PERSISTED FIGURE IS WRONG AND THE CORRECTION TRAVELS ADJACENT at the next
  persistence, never by editing the report — it is a historical record of what was measured then.
  CITED INTO THE RESPONSIVE PHASE, WHERE IT MATTERS MORE THAN IT DID HERE: that phase's entire
  deliverable is enumerations, and its L1 already requires the prefix vocabulary be derived from
  the configuration rather than from assumed defaults. EVERY L-ITEM ENUMERATION IS RECONCILED TWO
  WAYS, and a self-check computed over the search's own output does not count as the second route.

NOTHING IS OPENED BY THIS BLOCK. MOB-1 RESPONSIVE proceeds under its own mandate; L8 is now
measurable, the authorised commit having landed.

MOB-R14 — PHASE A IS ACCEPTED AND IT IS THE BEST REPORT OF THIS TRACK. The twelve-files figure is
FALSIFIED and the channel propagated it twice. One DERIVED label is upgraded correctly and one is
NOT YET EARNED. Three items are owed. The observation list may need no deploy and that is checked,
not assumed. No proposal is opened.

CADENCE. Issued under test (b) and (c).

PHASE A IS ACCEPTED. Step 0 complete, all six figures matched, the held set reconciled two ways.
L1 through L11 delivered in order with evidence pasted, every finding labelled, every enumeration
reconciled two ways, and both route disagreements — 102 against 96 at L3, 27 against 32 at L8 —
TRACED TO A NAMED CAUSE rather than averaged. That last discipline is what makes the rest of the
figures worth reading.

THREE INSTRUMENT SELF-REPORTS, ALL CAUGHT BEFORE USE, AND THE SECOND IS THE MOST VALUABLE THING IN
THE REPORT. A shell classifier stripping to the last colon mislabelled every prefixed class as
unprefixed, exposed because the two routes disagreed — which is the reconciliation requirement
paying for itself in its first application. A filename-stripping flag made a following test-file
exclusion INERT, voiding the non-test label on two counts; re-derived with filenames the figures
were unchanged, AND THE REPORT SAYS WHY THAT IS NOT VINDICATION: those patterns appear in no test
file, so the claim was right for a reason that had not been established. A CORRECT FIGURE BEHIND A
BROKEN INSTRUMENT IS RECORDED AS A BROKEN INSTRUMENT. That is the distinction this project has
spent four tracks trying to hold, stated unprompted about the reporter's own work.
  THE THIRD IS THE ASSUMED-CONVENTION CLASS AGAIN, SECOND CONSECUTIVE CYCLE, and it is the one to
  carry forward: a numeric-suffix assumption undercounted by five. Last cycle it was a generic type
  argument between a hook name and its paren. Both times the pattern was built from what the code
  was assumed to look like. THE STANDING FORM IS THE EXISTING RULE — derive the search vocabulary
  from the artifact being checked — and it now has three instances in this project. Cited, not
  minted. The count stays at SIX.

═══ THE TWELVE-FILES FIGURE IS FALSIFIED, AND THE CHANNEL CARRIED IT TWICE ═══

THE FINDING IS CONFIRMED INDEPENDENTLY AND BY A STRONGER INSTRUMENT THAN THE ONE THAT FOUND IT. The
implementer re-measured at the commit where the figure was recorded and got nine files, identical
to HEAD. The channel then checked the record itself: THE PHASE A REPORT'S OWN ENUMERATION LISTS
NINE FILE PATHS while its prose immediately above says twelve. The document contradicts itself, and
its site count reconciles at exactly thirty-two across those nine paths.
  THAT IS A BETTER INSTRUMENT BECAUSE IT DOES NOT DEPEND ON THE PATTERN BEING RIGHT. A
  re-measurement establishes nine under one pattern; the record's own enumeration establishes nine
  under whatever pattern produced the record. Both agree, by independent routes, on the same digit.
  THE FIGURE WAS WRONG WHEN WRITTEN. The baseline has not moved and the delta is ZERO — the
  cache-invalidation commits added none, consistent with the zero-additions check run at each.
  THE CHANNEL PROPAGATED IT TWICE, into the track-opening block and into this phase's own L8
  mandate, without checking it against the enumeration sitting directly beneath it in the same
  document. This is derive-don't-carry's sharpest form — a figure derived from a document about the
  artifact rather than from the artifact — committed by the channel in the block that INSTRUCTED
  the implementer to re-derive rather than carry. The instruction was right and its author did not
  follow it.
  DISPOSITION, AND IT IS THREE CORRECTIONS IN THREE PLACES, NONE OF THEM AN EDIT. The Phase A
  report is a HISTORICAL RECORD and is not corrected in place; the correction travels adjacent in
  this track's file. The two blocks that carried the figure are persisted historical records and
  are likewise not edited; this block corrects them adjacent. THE OPERATIVE FIGURE IS
  THIRTY-TWO SITES ACROSS NINE FILES, delta zero, and anything citing twelve is citing a
  falsified number.
  THE PRIMITIVES ZERO STILL HOLDS under both patterns with its control returning thirty. That
  constraint is intact and was the load-bearing half.

═══ ONE LABEL UPGRADED CORRECTLY, ONE NOT YET EARNED ═══

L4's UPGRADE FROM OBSERVABLE-ONLY TO DERIVED IS ACCEPTED FOR THE VARIANT TABLE, and the argument is
right: the preflight sets border-box, so a declared height is the rendered box height, padding and
border inclusive. THE MANDATE SAID TO LABEL IT OBSERVABLE-ONLY AND THE MANDATE WAS WRONG. An
implementer establishing that a required label is unnecessarily weak, with the mechanism shown, is
a report and not a deviation. EVERY VARIANT IS BELOW FORTY-FOUR PIXELS and none reaches h-11 — the
default at thirty-six, the most-used explicit size at thirty-two, the largest at forty.
  BUT THE CALL-SITE CLAIM IS NOT YET EARNED AND THIS IS THE ONE GAP IN THE REPORT. The variant
  table is DERIVED. The rendered height of the ninety call sites is NOT, because a class-merge
  utility lets a call site's own className override the variant's height, and the report did not
  check whether any does. A site passing a taller height would be a false member of the
  below-threshold set, and the direction of the error is the dangerous one: it inflates the problem
  and would put a site on a fix list that does not need fixing.
  OWED: enumerate the call sites that pass an explicit height in their className and subtract them,
  reconciled two ways, with the pattern derived from the artifact rather than from the height scale
  assumed to be in use. IF THE ANSWER IS ZERO, the zero carries a positive control — the same
  pattern shown firing on a synthetic override — because an empty result here is exactly the
  expected one and is worth nothing without proof the search could have reported.

═══ TWO SMALLER ITEMS OWED ═══

L2's 232-PIXEL ARITHMETIC HAS AN UNSOURCED TERM. The fixed tracks sum to two hundred and eight
pixels and that is checkable from the template. The gap term is stated as twenty-four pixels
without naming the class that produces it, and a four-column grid has THREE gaps, so twenty-four
implies one gap class and thirty-six implies another. NAME THE CLASS AT EACH OF THE SIX SITES and
restate the minimum per site. The conclusion — whether it overflows at three hundred and twenty
pixels is OBSERVABLE-ONLY — is unaffected either way, which is precisely why the figure should be
right rather than defended: a stated number that nobody checks because it does not change the
answer is how a wrong figure survives into a cycle where it does.

THE COMMIT COUNT IS WRONG AGAIN, IN THE REPORT AFTER THE ONE THAT MEASURED IT. The observation
list's preconditions say nine unpushed. The preceding report MEASURED ten by two agreeing routes
and no commit has been removed since; this cycle committed nothing. That is the FOURTH wrong figure
for one quantity, and it arrived one cycle after the same reporter measured it, diagnosed the cause
and wrote that recency is not enumeration.
  IT IS CONSEQUENTIAL OF NOTHING HERE — nothing is pushed either way — AND IT IS REPORTED ANYWAY,
  because a figure that goes wrong when the stakes are zero is the same figure that will go wrong
  when they are not. The diagnosis already on the record is correct and is now demonstrated twice:
  this quantity does not survive being re-stated from memory, in either direction. OWED: re-derive
  it at the top of every report that states it, by both routes, or DO NOT STATE IT AT ALL. An
  omitted figure costs a command; a wrong one costs the credibility of the report around it.

═══ THE OBSERVATION LIST MAY NEED NO DEPLOY — CHECKED, NOT ASSUMED ═══

THE LIST IS THIS PHASE'S MOST USEFUL DELIVERABLE AND IT IS CORRECTLY BUILT: eleven checks, each
with its width, its surface, and ITS PASS AND FAIL STATED SEPARATELY, which is what makes a check
discriminating rather than a prompt to look at something.

THE CHANNEL'S OBSERVATION, OFFERED FOR THE IMPLEMENTER TO ESTABLISH OR FALSIFY: the ten unpushed
commits are documentation and cache-key edits, and NONE OF THE ELEVEN CHECKS READS ANYTHING THOSE
COMMITS TOUCH. Every check reads layout, declared sizes, dialog heights, table presentation, chart
containers or the FAB — and the cache work changed invalidation key arguments, added one test file,
and deleted dead lines. IF THAT HOLDS, THE OPERATOR CAN RUN ALL ELEVEN AGAINST THE CURRENTLY LIVE
BUILD TODAY, with no deploy and no waiting, in parallel with the proposal cycle.
  THE PRECONDITION IS NOT WAIVED, IT IS SATISFIED DIFFERENTLY. "The deploy must have landed" exists
  because an observation is only evidence against the build actually being served. Where the
  property observed is IDENTICAL in both builds, the live build is a valid subject — but THAT
  IDENTITY IS A CLAIM ABOUT THE DIFF AND IT IS ESTABLISHED, NOT ASSUMED. The channel has not read
  the diff; the implementer has.
  OWED: from the diff across the unpushed range, establish per check whether any of the eleven
  reads a file, class, component or declared value that any unpushed commit changed. Report it per
  check, not in aggregate — an aggregate answer hides the one check that fails it. IF ANY CHECK IS
  AFFECTED, that check waits for the deploy and the other ten do not.
  THE ONE-TAB FRESH-LOAD PRECONDITION STANDS UNCHANGED for every check, and it is load-bearing:
  the cross-tab staleness limit is queued unfixed and a stale tab renders figures from an arbitrary
  earlier moment.

TWO FINDINGS I WANT KEPT BECAUSE THEY WILL SHAPE THE PROPOSAL AND ARE EASY TO LOSE.
  THE BREAKPOINT SKEW. Eighty-five per cent of all responsive styling sits at one breakpoint, with
  two uses of the next-widest and none above it. The application is effectively TWO-STATE. That is
  a fact about the proposal's shape rather than a defect: a mobile pass on a two-state app is a
  question about one threshold, not five.
  THE FAB CLEARANCE GAP. The page wrapper clears sixty-four pixels while the FAB's upper edge sits
  at one hundred and thirty-six, so content can pass beneath it, and the FAB shares its stacking
  level with the tab bar. The topology is FIXED and does not move without an operator ruling; none
  exists. REPORT ONLY, and the remedy is a clearance question rather than a position question —
  which is worth saying now, because the obvious fix is the one the constraint forbids.

NOTHING IS PROPOSED AND NO PHASE ADVANCES. The proposal is its own cycle and is not opened here.
The queued items stay queued; the brass-slot element's three collisions were re-derived from the
tree and all still hold, with no new option available, and nothing is proposed for it either.

PERSISTENCE. This block persists ALONE, one block per message, appending at fourteen — together
with the Phase A report in full and the adjacent twelve-files correction. Sweep the payload under
both operative patterns before appending; the payload's prose opens paragraphs with ruling numbers
and phase handles, a six-instance class of which one was a genuine wrap, so the sweep is predicted
clean rather than assumed clean and a disagreement HALTS THE WRITE AND IS REPORTED, not remedied by
the implementer where the text is the channel's. Predicted payload strict 1 and tripwire 1
agreeing; after the append, strict 14 and tripwire 14, first 1, last 14, no duplicates, no breaks
in 1 to 14, reconciled 13 + 1 = 14 and 14 minus 1 plus 1 = 14, enumeration PRINTED IN FILE ORDER.
Derive from what is present; if these figures are wrong, yours are right and you show the
reconciliation. Provenance RELAYED. Amend the completeness note to record the persisted set, the
operative thirty-two-across-nine figure with its two independent routes and the channel's double
propagation, the L4 label upgrade with its remaining call-site gap, and the standing instruction
that the unpushed count is re-derived or omitted. Docs-only under the standing permanent licence —
state the skip and its reason, prove docs-only by exclusion with the exclusion shown discriminating
and its capture UNCUT, carry the bytes.

---

## MOB-1 RESPONSIVE — Phase A report (executed 2026-09-12, accepted by MOB-R14)

Source-side measurement under MOB-R12, as corrected by MOB-R13. Report only; no file written, no
commit, no push in the measuring cycle. Every finding labelled DERIVED or OBSERVABLE-ONLY; every
enumeration reconciled two ways.

### Step 0

Host `Khaleds-MacBook-Air.local`, cwd `/Users/khaledalrashidi/DevLocal/public-statera`.
HEAD `1161035c6907e4953b1d75eb32cf204c6dd0b143`, `main`, `git status --short` empty between printed
delimiters. Held set MOB-R1…MOB-R13, reconciled two ways (strict 13, tripwire 13, 0 breaks).
Resolution proofs `MATCHED-frontend`/`MATCHED-api` exit 0; negative control `statera-web` →
`No projects matched the filters`, exit 0. Frontend `42 passed (42)` / `216 passed (216)`; API
`51 | 10 skipped (61)` / `873 | 34 skipped (907)`; both exit 0, Errors 0. Both `tsc` exit 0 /
0 bytes. Fixture 66, ALLOWLIST `[]`. All six matched. INTEGRATION not run and not owed — no
`db.transaction()` boundary, no integration case, no code.

### L1 — viewport and breakpoints — DERIVED

`apps/web/index.html:6` `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
(control: 2 `<meta>` in the file). No `tailwind.config.*`; v4 CSS-first with one stylesheet,
`apps/web/src/index.css`, whose `@theme` contains no `--breakpoint-*` (control: 130 other custom
properties). Defaults therefore apply, read from installed **tailwindcss 4.2.4**:
`--breakpoint-sm: 40rem` (640px), `md: 48rem` (768), `lg: 64rem` (1024), `xl: 80rem` (1280),
`2xl: 96rem` (1536).

Distribution, reconciled two ways (333 = 333): **sm 284, md 28, lg 19, xl 2, 2xl 0.** The zero
carries a positive control — a synthetic `2xl:grid-cols-4` probe matches. `xl`'s two sites are
`InsightsPage.tsx:357` and `:372`. 30 of 84 non-test src files carry any responsive prefix.

**THE FINDING IS THE SKEW: 85% of all responsive styling is a single breakpoint.** The app is
effectively two-state — below and above 640px.

### L2 — behaviour below the smallest breakpoint — DERIVED

Shell: `AppShell.tsx:516` `<main … mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-4 sm:px-6
lg:px-8 lg:py-6>`. All four nav pages (`/`, `/activity`, `/plan`, `/insights`) return a `space-y-8`
vertical stack as their outermost container — all four collapse to one column at the root by
construction.

`grid-cols-N`: 39 total, **33 prefixed / 6 unprefixed** (33+6=39; zero in test files). All six
unprefixed are `grid-cols-2`; four pair with a larger prefixed count (deliberate mobile-first),
`transactions/dialogs.tsx:352` is a 2-segment toggle, and `TwoFactorSetup.tsx:109` is a bare
2-column backup-code grid.

**The failure mode MOB-R12 named exists in six places, all dialogs**, with the gap class named per
site (all `gap-2` = 8px):

| site | template | tracks | minimum |
|---|---|---|---|
| `ImportDialogs.tsx:1155` | `[minmax(0,1fr)_minmax(80px,140px)_96px_32px]` | 4 (3 gaps) | 208 + 24 = **232px** |
| `ImportDialogs.tsx:1167` | same | 4 (3 gaps) | **232px** |
| `ImportDialogs.tsx:1913` | `[minmax(0,1fr)_minmax(80px,140px)_96px]` | 3 (2 gaps) | 176 + 16 = **192px** |
| `ImportDialogs.tsx:2210` | 4-track | 4 (3 gaps) | **232px** |
| `dialogs.tsx:722` | 4-track | 4 (3 gaps) | **232px** |
| `dialogs.tsx:734` | 4-track | 4 (3 gaps) | **232px** |

Whether these overflow at 320px is OBSERVABLE-ONLY.

### L3 — horizontal overflow sites — DERIVED

**96 distinct matched substrings** (non-test). Routes first disagreed 102 vs 96; the cause is that
route 1 double-counts the 6 `min-w-[Npx]` strings satisfying both `min-w-\[` and `w-\[[0-9]+px\]`.
102 − 6 = 96, reconciled. Breakdown: `whitespace-nowrap` 18, `min-w-[` 9, `w-[Npx]` 27,
`overflow-x-auto` 1, `shrink-0` 47, `overflow-x-hidden` 0, `flex-nowrap` 0.

The `whitespace-nowrap` set is dominated by money values (WeeklyDigestSection ×4,
SpendForecastWidget ×3, MonthDeltaCard ×3, RecurringBillsCard ×2, RecurringCommitmentsCard ×1), and
`button.tsx:8` applies it to every button in the app.

### L4 — tap targets — variant table DERIVED; call sites resolved below

Size table read from `components/ui/button.tsx`:
`default h-9` (36px), `sm h-8` (32), `lg h-10` (40), `icon h-9 w-9` (36), `pill h-10` (40).
**Every variant is below 44px; none reaches h-11.** This is DERIVED rather than OBSERVABLE-ONLY
because `preflight.css:12` sets `box-sizing: border-box`, so a declared height IS the rendered box
height. MOB-R12's required OBSERVABLE-ONLY label was unnecessarily weak; MOB-R14 accepted the
upgrade.

**CALL-SITE OVERRIDES (owed under MOB-R14, supplied here).** Two routes disagreed and the cause is
named: route 1's regex `<Button\b((?:[^<>]|\n)*?)/?>` stops at the first `>`, including one inside
a nested JSX expression, and inspected only a narrowed className blob — it found 187 tags / 27
overrides. Route 2, a character state machine tracking `{}` depth over the whole tag, found **190
tags / 61 overrides**, and 190 matches the independent plain-grep count of `<Button` occurrences.
**Route 2 is operative.** Heights found: `h-8` ×36, `h-9` ×7, `h-10` ×6, `h-auto` ×6, `h-7` ×4,
`h-14` ×1, `h-5` ×1.

**Exactly ONE call site overrides above the threshold** — `AppShell.tsx:562`, `h-14` = 56px, the
FAB. It is a false member of the below-threshold set and is subtracted. Of the remaining 60: 54
carry an explicit value still below 44px, and **6 carry `h-auto`, which is content-dependent and
therefore OBSERVABLE-ONLY**. The 129 sites with no override take the variant height. No positive
control was needed for a zero because the answer was not zero.

### L5 — tables — DERIVED

**10 `<table>` elements**, not one. The transactions table has two presentations:
`TransactionsTable.tsx:277` `<div className="space-y-3 p-4 md:hidden">` renders `<article>` cards;
`:366` `<div className="hidden max-h-[560px] overflow-auto md:block">` renders the table — **the
table is hidden below 768px.** Six of eight table-bearing files have a `md:hidden` card branch;
`ImportDialogs` uses `overflow-x-auto` (`:741`); `BudgetPage:569` sits inside
`surface-scroll-card max-h-72 overflow-auto` — initially misread as having no strategy and
corrected in the same report, since `overflow-auto` covers both axes. No table declares `min-w`;
all are `w-full`. One hard constraint: `ImportDialogs.tsx:2207` `<th style={{ minWidth: 340 }}>`.

### L6 — dialogs — width DERIVED, height OBSERVABLE-ONLY

`dialog.tsx:35` declares `w-[calc(100vw-1rem)] max-w-lg … sm:w-full`, so `max-w-*` binds only when
the viewport is wide; at 320px every dialog is 304px regardless of a `max-w-5xl` override.
**Vertical is the gap: 21 `DialogContent` instances, 7 declare a `max-h`, 14 do not**, and those 14
can exceed viewport height with no internal scroll. `dialogs.tsx:336` (`max-h-[92vh] …
overflow-y-auto`) and `SettingsDialog.tsx:1127` (`max-h-[88vh] … flex-col`) show the intended
pattern.

### L7 — the FAB — REPORT ONLY

`AppShell.tsx:567` `fixed bottom-20 end-4 z-40 h-14 w-14 … lg:bottom-6 lg:end-8`, aria-label
`Log transaction` (`:568`). 56px, logical `end-4` (RTL-safe). The mobile tab bar is `:524`
`bottom-tabs fixed bottom-0 left-0 right-0 z-40 … lg:hidden`; the page wrapper is `:211`
`relative min-h-screen bg-background pb-16 lg:pb-0`.

**The collision: the FAB and the tab bar share `z-40`, and the wrapper clears 64px while the FAB's
upper edge sits at 80 + 56 = 136px.** Content can therefore pass beneath the FAB. Whether anything
interactive lands there is OBSERVABLE-ONLY. Topology is FIXED; nothing proposed.

### L8 — physical-property baseline — DERIVED, and the record's file count is falsified

Re-derived, not carried. The first pattern `\b(ml|mr|pl|pr)-[0-9]` gave 27/8 — an implementer error
of the assumed-convention class, since the record's pattern includes non-numeric suffixes. Widened
to `\b(ml|mr|pl|pr)-[a-z0-9\[]`: **32 sites / 9 files.** The five missed are all `ml-auto`/`mr-auto`
(`TransactionsPage:374`, `ProfilePage:348,367`, `dialogs.tsx:562,1132`).

**Sites reconcile with the record at exactly 32. Files do not: 9, not 12.** Measured at `a39a0cb`,
the commit where the figure was recorded, the widened pattern gives **32 / 9 — identical to HEAD**.
The baseline has not moved; the record's "12 files" was wrong when written. Variants tried and
rejected: including tests (9), including css (9), all of `apps/web` (10). **Delta: 0 sites.**

`components/ui/` is **0** under both patterns, control `components/pages/` = 30 (widened) / 25
(narrow). The primitives zero is discriminating and holds.

### L9 — the brass-slot element — DERIVED

`SpendForecastWidget.tsx:68`
`<p className="financial-number whitespace-nowrap text-[1.25rem] font-semibold text-accent-strong">`.
Re-derived from the tree: **`text-accent-strong` has exactly ONE use in the entire application** —
this line. All three collisions still hold simultaneously: the rationed brass slot, an L3 overflow
site, and the 1.25rem enlargement clearing the WCAG large-text threshold at 3.39 contrast.
**No option has become available that was not before.** Nothing proposed.

### L10 — charts — declarations DERIVED, labels OBSERVABLE-ONLY

Every chart uses `<ResponsiveContainer width="100%" height="100%">`; **no chart declares a minimum
width.** Containers declare `minHeight: "400px"` (`DashboardPage:815`, `ExpensesPage:1006`). Axis
and tooltip crowding at narrow widths is OBSERVABLE-ONLY. The `style-src 'unsafe-inline'` allowance
exists for these and was not disturbed.

### L11 — the observation list

Eleven checks, each with width, surface, and PASS and FAIL stated separately. **Preconditions: one
tab, fresh load, navigating between pages** — load-bearing because the cross-tab staleness limit is
queued unfixed.

| # | width | surface | PASS | FAIL |
|---|---|---|---|---|
| 1 | 320 | all four nav pages | no horizontal body scroll; cards full-width | page scrolls sideways or a card is cut off |
| 2 | 320 | Edit-transaction and Import preview row grids | four columns visible, name readable | name column near-zero, or row scrolls sideways |
| 3 | 320 | Import preview `minWidth: 340` column | horizontal scroll available AND discoverable | content clipped with no way to reach it |
| 4 | 320 & 390 | the 14 dialogs without `max-h` | fits, or scrolls internally | taller than viewport, actions unreachable |
| 5 | 320 | Home, bottom of a long list | nothing interactive under the FAB | last row's control covered by the FAB |
| 6 | 320 | Profile → 2FA backup codes | both columns readable | codes wrap mid-token or overflow |
| 7 | 320 | Insights money values | full figure visible | clipped, or pushes its card wider |
| 8 | 320 | 32px `size="sm"` buttons | hit reliably first time | repeated mis-taps |
| 9 | 768 | Transactions card↔table swap | table appears cleanly | both render, or neither |
| 10 | 1024 & 1280 | Insights `xl:` panels | side-by-side from 1280 — confirm one column at 1024 is intended | unintended single column on a wide tablet |
| 11 | 320 | any chart | labels legible, tooltip on-screen | labels overlap, tooltip escapes |

---

## Adjacent correction — THE TWELVE-FILES FIGURE IS FALSIFIED

**Operative figure: 32 physical-property sites across 9 files. Delta zero.** Anything citing
twelve files is citing a falsified number.

Two independent routes agree on nine, and the second does not depend on the pattern being right:
1. **Re-measurement** at `a39a0cb`, the commit where the figure was recorded, under a widened
   pattern: 32 sites / 9 files — identical to HEAD.
2. **The record's own enumeration** lists nine file paths while its prose immediately above says
   twelve. The document contradicts itself, and its site count reconciles at 32 across those nine.

**The figure was wrong when written**, not moved by intervening work. **The channel propagated it
twice** — into the track-opening block and into this phase's own L8 mandate — without checking it
against the enumeration directly beneath it in the same document. That is derive-don't-carry's
sharpest form: a figure taken from a document about the artifact rather than from the artifact,
committed in the block that instructed the implementer to re-derive rather than carry.

**Three corrections in three places, none an edit.** The Phase A report and the two blocks that
carried the figure are historical records; the correction travels adjacent, here.

**The primitives zero is unaffected and holds** under both patterns, control returning 30.

## Owed items, supplied

**Commit count** — re-derived, both routes: `git rev-list --count origin/main..HEAD` = **10**,
`git log --oneline origin/main..HEAD | wc -l` = **10**, agreeing. The Phase A report said nine and
was wrong: **the fourth wrong figure for this quantity, one cycle after the same reporter measured
it and wrote that recency is not enumeration.** Standing instruction adopted: **this count is
re-derived by both routes at the top of any report that states it, or it is not stated.**

**L2 gap classes** — supplied in the L2 table above. All six sites use `gap-2` (8px). The 24px term
is three gaps on a four-track grid; the one three-track site (`ImportDialogs.tsx:1913`) has two gaps
and a 192px minimum, not 232px.

**L4 call-site subtraction** — supplied in L4 above. 190 tags, 61 overrides, **exactly one above
threshold** (the FAB at 56px), 54 still below by explicit value, 6 `h-auto` reclassified
OBSERVABLE-ONLY.

**Deploy dependency, per check.** Files changed across the unpushed range: `BudgetPage.tsx`,
`DashboardPage.tsx`, `ExpensesPage.tsx`, `IncomePage.tsx`, `TransactionsPage.tsx`,
`QuickAddContext.tsx`, `cache-invalidation.test.tsx`, and this doc. **Every added or removed line
in those source files is an `invalidateQueries` key argument, a deleted dead invalidation, or a
four-line explanatory comment. Zero lines match `className|style=|<[A-Za-z]|grid-|h-[0-9]|max-w|
whitespace|overflow`** — control: the same pattern finds **9** such lines on `eb036c2`, a commit
that did change layout.

| check | reads | file changed in range? | verdict |
|---|---|---|---|
| 1 | four page layouts | yes (4 pages) — but no layout line | **runnable now** |
| 2 | `ImportDialogs`, `transactions/dialogs` grids | no | **runnable now** |
| 3 | `ImportDialogs` preview table | no | **runnable now** |
| 4 | 14 `DialogContent` sites | no | **runnable now** |
| 5 | `AppShell` FAB + wrapper padding | no | **runnable now** |
| 6 | `TwoFactorSetup` | no | **runnable now** |
| 7 | Insights money spans | no | **runnable now** |
| 8 | `button.tsx` + call sites | yes (call sites) — but no size line | **runnable now** |
| 9 | `TransactionsTable` | no | **runnable now** |
| 10 | `InsightsPage` xl grids | no | **runnable now** |
| 11 | chart containers | yes (2 pages) — but no chart line | **runnable now** |

**All eleven are runnable against the currently live build with no deploy.** The precondition is
satisfied rather than waived: the observed properties are identical in both builds, established
from the diff. **The one-tab fresh-load precondition stands unchanged.**

MOB-R15 — THE OBSERVATION ROUND IS COMPLETE AND ITS EVIDENCE CLASS IS STATED. Nine of eleven
checks observed, TWO OF THEM BY CHECKS THE CHANNEL WROTE BADLY, and the passes are discounted
accordingly. A NEW DEFECT CLASS IS FOUND AND IT IS NOT THE ONE IT WAS FIRST FILED UNDER. A small
measurement rides the proposal cycle. No phase is resequenced.

CADENCE. Issued under test (b) and (c).

PHASE A's L1 THROUGH L11 WERE ACCEPTED AT MOB-R14 AND ALL FOUR OWED ITEMS CAME BACK CLEAN AT
45d507b — the commit count re-derived by both routes with the standing instruction adopted, the L2
gap classes named with ONE OF THE REPORTER'S OWN SITES CORRECTED FROM 232 TO 192 PIXELS, the L4
call-site override gap closed with the two routes reconciled and the one above-threshold member
subtracted, and the deploy-dependency claim ESTABLISHED FROM THE DIFF per check rather than in
aggregate. That last one is why this round happened at all: it turned a deploy into a non-blocker
and the operator observed against the live build the same day.

═══ THE OBSERVATION ROUND — WHAT IT ESTABLISHES AND WHAT IT DOES NOT ═══

THE OPERATOR OBSERVED ON A PHYSICAL PHONE, NOT A SIMULATOR, WHICH IS STRONGER EVIDENCE, and he ran
a better test than the list asked for: HE SWITCHED BETWEEN A MONTH WITH DATA AND A MONTH WITHOUT,
which no check specified. That single unrequested variation produced the most consequential finding
of the round, and it is the reason two separate defect classes are distinguishable below rather than
collapsed into one.

OBSERVED AND PASSING: checks 1 through 6, 8 and 9. NOT OBSERVED: check 7, untested; checks 10 and
11, both requiring a resizable viewport. The unobserved three are UNOBSERVED, not passing.

TWO PASSES ARE DISCOUNTED AND THE FAULT IS THE CHANNEL'S. Check 5 asked whether the FAB covers
anything interactive; check 8 asked whether small buttons can be tapped reliably. BOTH WERE WRITTEN
SO THAT THEIR NEGATIVE CASE DOES NOT DISTINGUISH WHAT THEY CLAIM TO MEASURE.
  CHECK 8 IS THE CLEARER ERROR. One attentive person tapping deliberately hits a 32-pixel control;
  the forty-four-pixel guideline is about ERROR RATES across users, hands and conditions, not about
  whether a careful self-test succeeds. The check's pass and its fail are therefore not different
  worlds, and the L4 measurement — every declared variant below threshold, fifty-four sites below by
  explicit value — STANDS ON ITS OWN AND IS NOT WEAKENED BY THIS PASS.
  CHECK 5 PASSED WHILE THE SCREENSHOTS SHOW THE OPPOSITE. The operator reported the FAB may be
  covering content, and four of the nine captures show it overlapping: a delta chip on Home, the
  final axis tick of the category chart, and card content on Insights. The check asked whether
  anything INTERACTIVE sits beneath it and the overlaps are non-interactive, so the check returned
  true while the underlying concern was real. A check narrower than the concern it was written for
  reports on the narrow thing and reads as reporting on the broad one.
  RECORDED AS A CHANNEL AUTHORING DEFECT, not an observation defect. The operator's screenshots
  carry more information than the checks he was answering, which is the correct way round but is
  not a substitute for checks that discriminate. L11's own mandate required pass and fail stated
  SEPARATELY so a check is discriminating; these two met the form and failed the purpose.
  NO NEW STANDING LINE — this is the existing rule that a check whose negative case equals its
  positive case is not a check, applied to a check the channel wrote rather than one it reviewed.
  The count stays at SIX.

═══ THE OPERATOR'S THREE, CONFIRMED FROM THE CAPTURES ═══

(1) THE FAB OVERLAP IS REAL AND L7 ALREADY HOLDS THE MECHANISM: the page wrapper reserves
sixty-four pixels of bottom clearance while the FAB's upper edge sits at one hundred and thirty-six.
It is a CLEARANCE question, not a POSITION question, and that distinction is load-bearing because
the position is the thing the constraint fixes. The topology does not move.

(2) THE KPI BOUNDARY OBSERVATION IS ACCEPTED AND THERE IS A LAYOUT DEFECT UNDERNEATH IT THAT THE
OPERATOR DID NOT ASK ABOUT. At four digits the money value WRAPS BETWEEN THE PREFIX AND THE NUMBER
— the currency prefix on one line, the figure on the next — and the delta chips wrap too, leaving
adjacent chips at visibly unequal heights. Enclosure is a design question; the wrap is a defect.
The row needs layout work whether or not it gets borders.

(3) PROFILE DISCOVERABILITY IS CONFIRMED: the only route is the hamburger. Navigation is in MOB-1's
charter and this is now an observed instance rather than an inferred one.

═══ THE CHANNEL'S FINDINGS FROM THE CAPTURES ═══

THE CARD-HEADER SQUEEZE MAY BE THE MOST PERVASIVE MOBILE ISSUE IN THE BATCH. Card titles wrap to
three lines inside a narrow column while their subtitles sit beside them with room to spare —
visible on the safe-to-spend card, on top spending, and on expenses by category. A two-column
header split that does not stack at phone width. MEASURE IT: the shared header component, whether
the split is responsive, and every call site. It is one component and therefore possibly one fix.

A DUPLICATE LABEL AND AN ORPHANED SEPARATOR ON THE ACTIVITY ROWS. A category label renders TWICE
in one row, once as text and once as a chip; and a row with no category renders the separator
bullet with nothing following it. Small, and it is the kind of thing that reads as unfinished.

ONE POSITIVE OBSERVATION WORTH RECORDING AS EVIDENCE RATHER THAN AS GOOD NEWS. The September
captures show all four KPIs at zero WITH NO DELTA CHIPS, while the August captures show chips
present. THAT IS THE FRONTEND-FIXES TRACK'S ITEM 4 GUARD OBSERVED WORKING IN PRODUCTION. It closed
recorded explicitly as NOT VERIFIED IN PRODUCTION, because no observed month had zero rows beside a
populated previous month. The operator's month-switch produced exactly that state. A recorded
unverified item is now verified, by an observation nobody planned.

TWO PREVIOUSLY-QUEUED ITEMS ARE NOW OBSERVED LIVE, still queued, not opened: the headline rounding
to a thousands abbreviation directly above the same figure at full precision, and the
twelve-of-twelve months claim over a chart with five flat-zero months.

═══ THE NEW CLASS — MISFILED ONCE BY THE CHANNEL, AND THE CORRECTION MATTERS ═══

THE DEFECT. Viewing a PAST month, the safe-to-spend card renders a per-day figure IDENTICAL to the
whole monthly runway, directly above a zero-days-remaining label — a division guard clamping zero
days to one, so the per-day figure overstates by roughly the length of the month. Around it: an
on-pace projection with a thirty-one-of-thirty-one-days denominator, an ahead-of-pace badge, and
so-far-this-month copy, all about a month that has finished. Elsewhere, forward-looking advice that
a category is climbing and is worth reviewing BEFORE IT GROWS, about August, in September.

THE CHANNEL FILED THIS UNDER ZERO-VERSUS-NO-DATA AND THAT WAS WRONG. The root cause is not a
failure to distinguish zero from absent; it is a failure to distinguish THE SELECTED MONTH from THE
CURRENT MONTH. Present-tense and forward-looking copy is rendered about whatever month is selected.
Filing it with the zero class because it was found beside the zero class would have buried a
distinct cause inside a phase scoped to a different one.
  THE SEVERITY FRAMING IS ALSO CORRECTED. The channel told the operator this appears on an ordinary
  action. It requires a past month to be selected, which is deliberate rather than incidental, and
  the default view is unaffected. IT DOES NOT JUMP THE QUEUE ON FREQUENCY and no phase is
  resequenced for it.
  THE OPERATOR'S SEPTEMBER CAPTURES ARE THE OTHER HALF AND THEY DO BELONG TO THE ZERO CLASS:
  on-track and staying-inside-plan copy on a month with no transactions at all. TWO CLASSES, ONE
  OBSERVATION ROUND, AND THEY ARE KEPT SEPARATE.

THE FINDING THAT MAKES THIS CHEAP TO SIZE: THE APPLICATION ALREADY KNOWS. The needs-attention card
renders a this-month badge on the current month and a year-month badge on a past one — the same
component distinguishes the two correctly IN ITS OWN HEADER and then renders body copy assuming the
present. The signal exists at one site and is unused at the site beside it.

═══ WHAT THIS CYCLE DOES — A MEASUREMENT RIDING THE PROPOSAL, NOT A NEW PHASE ═══

THE RESPONSIVE PROPOSAL PROCEEDS as its own cycle against L1 through L11, now informed by the
observations above. Treat the operator's three and the channel's two as OBSERVED instances to be
addressed within that proposal, not as new scope.

AND MEASURE THE TENSE CLASS IN THE SAME REPORT, REPORT-ONLY, NOTHING PROPOSED FOR IT:
  T1 — ENUMERATE EVERY SURFACE RENDERING PRESENT-TENSE OR FORWARD-LOOKING COPY ABOUT A MONTH. Both
       static strings and computed narrative. Per site: file:line, the string or template, and which
       month value it is rendered against. Reconcile two ways, and DERIVE THE SEARCH VOCABULARY
       FROM THE ARTIFACT — the copy strings and narrative builders themselves — not from a guessed
       list of tense markers. That is the class that has now cost three misses in this project, and
       a tense vocabulary assumed rather than derived is exactly its shape.
  T2 — IS THE CURRENT-MONTH SIGNAL AVAILABLE TO THEM. Establish from source how the badge computes
       the distinction, whether that value is in scope at each T1 site, and whether it is server-
       supplied or client-derived. If some sites cannot reach it, name them and state what reaching
       it would require.
  T3 — THE ZERO-DAYS GUARD. Locate the division producing the per-day figure, show the guard, and
       state exactly what it does at zero days. Show the code; do not describe it.
  T4 — SIZE IT, IN ONE SENTENCE. Is this a handful of strings, or its own phase? That answer is the
       whole point of the measurement and it decides the sequencing, which is the operator's.
  NOTHING IS PROPOSED FOR T1 THROUGH T4 AND NOTHING IS FIXED. A remedy that arrives with the
  measurement forecloses the sequencing decision the measurement exists to inform.

ALSO RECORD, QUEUED AND NOT OPENED: the operator's requirement that CSV and spreadsheet import let
the user MAP THEIR COLUMNS to the application's fields. Operator statement, this cycle. It belongs
with the import surface and is NOT mobile-track work. TRIGGER: the next cycle that opens import.

CONSTRAINTS UNCHANGED. Nothing is fixed, styled, committed or pushed by the measurement half. The
FAB topology does not move. Zero physical-property additions. No convention work, no zero-versus-
no-data work. The e2e suite is not run, repaired, revived or deleted. The queued items stay queued.
Any discovery enlarging the mandate is a STOP-AND-ASK and a REQUEST.

PERSISTENCE. This block persists ALONE — one block per message — appending at fifteen, together
with the operator's observation round recorded as an OPERATOR OBSERVATION against the live build,
taken on a physical device in one session, with the two discounted checks named as discounted and
the three unobserved checks named as unobserved. Sweep the payload under both operative patterns
before appending; the payload's prose opens paragraphs with ruling numbers, a six-instance class of
which one was a genuine wrap, so the sweep is predicted clean rather than assumed clean and a
disagreement HALTS THE WRITE AND IS REPORTED rather than remedied where the text is the channel's.
Predicted payload strict 1 and tripwire 1 agreeing; after the append, strict 15 and tripwire 15,
first 1, last 15, no duplicates, no breaks in 1 to 15, reconciled 14 + 1 = 15 and 15 minus 1 plus
1 = 15, enumeration PRINTED IN FILE ORDER. Derive from what is present; if these figures are wrong,
yours are right and you show the reconciliation. Re-derive the unpushed count by both routes or do
not state it. Provenance RELAYED. Amend the completeness note to record the persisted set, the
tense class as DISTINCT from the zero class with the channel's misfiling recorded, the production
verification of the previously-unverified delta guard, the two discounted checks, and the queued
column-mapping requirement. Docs-only under the standing permanent licence — state the skip and its
reason, prove docs-only by exclusion with the exclusion shown discriminating and its capture UNCUT,
carry the bytes.

---

## MOB-1 RESPONSIVE — the observation round (operator, 2026-09-12)

**EVIDENCE CLASS: OPERATOR OBSERVATION against the LIVE BUILD**, taken on a **physical phone, not a
simulator**, in one session. The deploy precondition was satisfied differently rather than waived —
the eleven checks were established from the diff to read nothing the eleven unpushed commits
touched, so the live build was a valid subject (MOB-R14, per-check table). The one-tab fresh-load
precondition applied.

### Coverage — nine of eleven, and the unobserved are UNOBSERVED not passing

| check | status |
|---|---|
| 1 — 320px, four nav pages | **observed, PASS** |
| 2 — 320px, dialog row grids | **observed, PASS** |
| 3 — 320px, import `minWidth:340` column | **observed, PASS** |
| 4 — dialogs without `max-h` | **observed, PASS** |
| 5 — FAB clearance | **observed, PASS — DISCOUNTED (see below)** |
| 6 — 2FA backup codes | **observed, PASS** |
| 7 — Insights money spans | **NOT OBSERVED — untested** |
| 8 — 32px tap targets | **observed, PASS — DISCOUNTED (see below)** |
| 9 — 768px card↔table swap | **observed, PASS** |
| 10 — 1024/1280 Insights `xl:` panels | **NOT OBSERVED — needs a resizable viewport** |
| 11 — charts at 320px | **NOT OBSERVED — needs a resizable viewport** |

**The operator ran a better test than the list asked for:** he switched between a month WITH data
and a month WITHOUT, which no check specified. That unrequested variation produced the round's most
consequential finding and is why two defect classes below are separable rather than collapsed.

### TWO PASSES ARE DISCOUNTED — CHANNEL AUTHORING DEFECT, not an observation defect

- **Check 8** — one attentive person tapping deliberately hits a 32px control. The 44px guideline is
  about **error rates** across users, hands and conditions, not whether a careful self-test
  succeeds. Its pass and its fail are not different worlds. **The L4 measurement stands on its own
  and is not weakened by this pass.**
- **Check 5** — passed while the screenshots show the opposite. Four of nine captures show the FAB
  overlapping content (a Home delta chip, the category chart's final axis tick, Insights card
  content). The check asked whether anything **interactive** sits beneath it; the overlaps are
  non-interactive, so it returned true while the concern it was written for was real. **A check
  narrower than its concern reports on the narrow thing and reads as reporting on the broad one.**

Both met L11's form — pass and fail stated separately — and failed its purpose. **No new standing
rule:** this is the existing "a check whose negative case equals its positive case is not a check",
applied to a check the channel wrote. Count stays at **SIX**.

### The operator's three, confirmed from the captures

1. **FAB overlap is real**, and L7 already holds the mechanism: wrapper clears 64px, FAB's upper
   edge sits at 136px. **A CLEARANCE question, not a POSITION question** — load-bearing, because
   the position is what the constraint fixes. Topology does not move.
2. **KPI boundary — and a layout defect underneath it the operator did not ask about.** At four
   digits the money value **wraps between the currency prefix and the number**, and the delta chips
   wrap too, leaving adjacent chips at unequal heights. Enclosure is a design question; **the wrap
   is a defect**, and the row needs layout work regardless.
3. **Profile discoverability** — the only route is the hamburger. Navigation is in MOB-1's charter;
   this is now an observed instance rather than an inferred one.

### The channel's two, from the captures

- **The card-header squeeze, possibly the most pervasive mobile issue in the batch.** Card titles
  wrap to three lines in a narrow column while their subtitles sit beside them with room to spare —
  safe-to-spend, top spending, expenses by category. A two-column header split that does not stack
  at phone width. **One shared component, therefore possibly one fix.** To be measured in the
  proposal cycle.
- **A duplicate label and an orphaned separator on activity rows** — a category renders twice (text
  and chip), and a row with no category renders the separator bullet with nothing after it.

### A previously-UNVERIFIED item is now VERIFIED IN PRODUCTION

The September captures show all four KPIs at zero **with no delta chips**; the August captures show
chips present. **That is the frontend-fixes track's Item 4 empty-month delta guard, observed working
in production.** That track closed recording item 4 explicitly as NOT verified in production,
because no observed month had zero rows beside a populated previous month. The operator's
month-switch produced exactly that state. **A recorded unverified item is now verified, by an
observation nobody planned.**

### Two previously-queued items observed live — still queued, not opened

The headline rounding to a thousands abbreviation sitting directly above the same figure at full
precision; and the twelve-of-twelve-months claim over a chart with five flat-zero months.

### THE TENSE CLASS — a NEW class, and NOT the one it was first filed under

**The defect.** On a PAST month the safe-to-spend card renders a per-day figure identical to the
whole monthly runway, directly above a zero-days-remaining label — a division guard clamping zero
days to one, so the per-day figure overstates by roughly the length of the month. Around it: an
on-pace projection with a 31-of-31-days denominator, an ahead-of-pace badge, and "so far this
month" copy, all about a finished month. Elsewhere, forward-looking advice that a category is
climbing and worth reviewing *before it grows* — about August, in September.

**THE CHANNEL FILED THIS UNDER ZERO-VS-NO-DATA AND THAT WAS WRONG.** The root cause is not failing
to distinguish zero from absent; it is **failing to distinguish THE SELECTED MONTH from THE CURRENT
MONTH**. Filing it with the zero class because it was found beside the zero class would have buried
a distinct cause inside a phase scoped to a different one.

**Severity framing also corrected:** it requires a past month to be selected — deliberate, not
incidental — and the default view is unaffected. **It does not jump the queue and no phase is
resequenced.**

**The September captures are the other half and DO belong to the zero class:** on-track and
staying-inside-plan copy on a month with no transactions at all. **Two classes, one observation
round, kept separate.**

**What makes it cheap to size: the application already knows.** The needs-attention card renders a
this-month badge on the current month and a year-month badge on a past one — the same component
distinguishes the two correctly **in its own header** and then renders body copy assuming the
present. The signal exists at one site and is unused at the site beside it.

### Queued by operator statement, not opened

**CSV and spreadsheet import must let the user MAP THEIR COLUMNS to the application's fields.**
Operator statement, this cycle. Belongs with the import surface; **NOT mobile-track work.**
**TRIGGER: the next cycle that opens import.**

MOB-R16 — THE OBSERVATION ROUND'S EVIDENCE IS BOUNDED TO 390 POINTS, NOT 320, AND THAT IS A
CHANNEL ERROR. d50933a is accepted. MOB-1 RESPONSIVE PHASE B IS OPENED AS A PROPOSAL, carrying the
tense measurement. Three items are referred to the operator and one is referred OUT of this phase.

CADENCE. Issued under test (a) and (c). d50933a is accepted and this is its acknowledgement riding
the next substantive block: 15/15 agreeing, enumeration in file order, first 1, last 15, zero
duplicates, zero breaks, both routes at 15, exclusion empty with the control uncut at six paths,
gates skipped with the reason stated, and the unpushed count re-derived by both routes after the
last edit rather than restated.

═══ THE OBSERVATION ROUND IS BOUNDED AT 390 POINTS AND THE RECORD MUST SAY SO ═══

EVERY CHECK IN THE LIST SPECIFIED 320 PIXELS. The operator observed on a physical iPhone at 390
points. Both parties recorded the round as satisfying the list; NEITHER NOTICED THE WIDTHS DID NOT
MATCH. The captures settle it — 1170 by 2532 device pixels at 3x is a 390-point viewport.
  THE OBSERVED PASSES ESTABLISH 390 AND NOT 320. Checks 1 through 6, 8 and 9 are re-labelled
  OBSERVED-AT-390. The 320 case is UNOBSERVED, and it is the case the list was written for
  precisely because it is where the measured tight layouts are likeliest to fail: the dialog row
  templates with a 232-pixel fixed minimum inside a dialog 304 pixels wide at 320, and the
  non-wrapping money values. At 390 the same templates have 86 pixels more to work with.
  THIS IS A CHANNEL AUTHORING DEFECT AND THE SEQUENCE IS WORTH STATING BECAUSE IT IS INSTRUCTIVE.
  The channel specified a width, gave instructions for achieving it in a DESKTOP browser, then
  offered a physical device as a BETTER alternative and said two checks could be skipped on it —
  without noticing that a physical device fixes the viewport at whatever the device is and cannot
  deliver the specified width at all. PHYSICAL-DEVICE EVIDENCE IS STRONGER IN EVERY RESPECT EXCEPT
  THE ONE THE CHECK WAS ABOUT, and the channel traded the controlled variable for realism without
  saying so, which is not a trade a reviewer gets to make silently on the operator's behalf.
  THIS IS THE THIRD CHECK-AUTHORING DEFECT IN ONE OBSERVATION LIST, after the two discounted at
  MOB-R15. All three share a shape: THE CHECK WAS NARROWER OR LOOSER THAN THE PROPERTY IT WAS
  WRITTEN TO SETTLE, and in all three the pass read as settling the broader property. A list whose
  items are individually well-formed can still fail collectively if the mapping from check to claim
  is not itself checked. NO NEW STANDING LINE; the count stays at SIX. This is the existing
  non-discriminating-check rule with the failure located in the SPECIFICATION rather than in the
  instrument.
  A TOP-UP IS RECOMMENDED AND IS THE OPERATOR'S, NOT OWED BY THIS PHASE: four checks at 320 in a
  desktop responsive mode — the four pages, a transaction edit dialog, the settings dialog, and the
  Insights money figures. Those are where 320 and 390 plausibly diverge. THE PROPOSAL PROCEEDS
  WITHOUT IT and marks every 320-dependent item as resting on the L-series source measurement
  rather than on observation.

═══ MOB-1 RESPONSIVE — PHASE B, PROPOSAL ONLY ═══

PRODUCE ONE PROPOSAL. No code, no commit, no push. For each item: the exact change, the file and
line, and the verification instrument. Deviations and discoveries are STOP-AND-ASK.

GROUP BY ROOT CAUSE, NOT BY SYMPTOM. The L-series and the observation round together produced a
symptom list; several symptoms trace to one component. The card-title squeeze appears on at least
three cards and is one shared header; the dialog height problem is fourteen instances of one
missing declaration. A proposal organised by symptom proposes the same fix repeatedly and hides
which changes are actually one change. STATE THE COUNT OF DISTINCT CHANGES ALONGSIDE THE COUNT OF
SITES THEY FIX.

THE BREAKPOINT SKEW SHAPES THE PROPOSAL AND SHOULD BE USED. Eighty-five per cent of responsive
styling sits at one breakpoint, with two uses above it. The application is effectively TWO-STATE,
so this is a question about ONE threshold. Introducing a second or third breakpoint is a
STRUCTURAL change to how the app is styled and it is not authorised here — if any item genuinely
needs one, that item STOPS AND ASKS rather than introducing it in passing.

THE ITEMS, EACH TO BE PROPOSED WITH ITS OWN TREATMENT:
  (i)   THE FAB CLEARANCE. A clearance change, never a position change. The topology is FIXED —
        size, stacking level, logical placement, label, tooltip, sole-trigger status, shortcut — and
        does not move. Propose the clearance; state what it does at every width, including desktop
        where the FAB sits lower and the tab bar is absent.
  (ii)  THE CARD HEADER. One shared component, three or more observed call sites. Propose the stack
        behaviour and the threshold. Enumerate EVERY call site and state what each looks like after,
        because a shared-component change is an app-wide change and its blast radius is the point.
  (iii) THE KPI VALUE WRAP. The currency prefix separating from its figure across a line break is
        a layout defect and is in scope. Propose it. THE DELTA CHIPS WRAPPING TO UNEQUAL HEIGHTS
        beside each other is the same item.
  (iv)  THE DIALOG HEIGHT GAP. Fourteen of twenty-one instances declare no maximum height and no
        internal scroll; two demonstrate the intended pattern. Propose whether the remedy belongs
        in the shared primitive or per-instance, and say which fourteen.
  (v)   THE TABLE AND SCROLLER CASES. The hard 340-pixel column inside a horizontal scroller, and
        any table whose narrow-width strategy L5 found absent.
  (vi)  THE BRASS-SLOT ELEMENT. Its three constraints were re-derived and all still hold; the
        Insights money figures passed AT 390 and are unobserved at 320. PROPOSE NOTHING WITHOUT
        THE 320 OBSERVATION — if the top-up has not happened, this item is DEFERRED AGAIN with that
        stated as the reason, which is an honest deferral rather than a third inconclusive report.

═══ THREE REFERRALS TO THE OPERATOR — PROPOSE OPTIONS, CHOOSE NONE ═══

  (A) TAP TARGET POLICY. Every declared variant is below forty-four pixels; fifty-four call sites
      are below by explicit value; six are content-dependent. The shared size table is used app-wide
      including desktop, so raising it is NOT a mobile-only change. Lay out the options with their
      blast radius each — raise the table globally; add a touch-only or narrow-width minimum; raise
      only the call sites that matter on touch — and state for each how many sites move and what
      desktop looks like after. RECOMMEND ONE IF YOU HAVE A VIEW AND SAY IT IS A RECOMMENDATION.
      The operator rules it.
  (B) KPI ENCLOSURE IS REFERRED TO THE DESIGN TRACK AND IS NOT PROPOSED HERE. The operator raised
      it and he is right that the row reads as unbounded, but KPI rework was RECLASSIFIED AS
      DESIGN-TRACK WORK under the ink-and-brass constraints in the preceding track and that
      reclassification was confirmed by measurement. Enclosure is an accenting decision under a
      rationed palette; it is not a responsive-layout decision. Record the operator's observation
      against that referral so it is not lost, and DO NOT propose borders, fills or elevation here.
      The value wrap at (iii) is the part that is a defect and it is in scope.
  (C) PROFILE DISCOVERABILITY. The only route is the hamburger, now observed as well as derived.
      Any remedy changes NAVIGATION TOPOLOGY, and the bottom tab bar's four entries and the FAB
      are a settled arrangement. Propose options with their consequences — a fifth tab, a header
      affordance, an entry elsewhere — and choose none. The operator rules it.

ONE ITEM IS REFERRED OUT OF THIS PHASE ENTIRELY. The duplicate category label rendering twice in
one activity row, and the separator bullet rendering with nothing after it, are RENDER AND LABEL
defects visible at every width. They are not responsive work and folding them into a responsive
commit would be the scope creep the preceding track's split exists to prevent. CHANNEL
RECOMMENDATION, offered and not adopted: they belong to the CONVENTIONS phase, which already owns
label and empty-state divergences. Queued, not opened, operator's to place.

═══ THE VERIFICATION PROBLEM — STATE IT PER ITEM, DO NOT PAPER OVER IT ═══

THIS IS THE PHASE'S CENTRAL RISK AND IT IS NOT THE LAYOUT WORK. jsdom COMPUTES NO LAYOUT. A test
asserting that a class is present RESTATES THE DIFF and its negative case equals its positive case;
the preceding track shipped a layout item with a DELIBERATE ZERO-TEST GAP for exactly this reason,
and the operator's eyes were the only instrument that ever checked it.
  PER ITEM, NAME THE INSTRUMENT and choose honestly between three: a unit test that genuinely
  discriminates, with its negative case stated; a DELIBERATE COVERAGE GAP, declared as such with the
  reasoning, which is a legitimate answer here and not a failure; or an OPERATOR OBSERVATION, with
  the check written to L11's form — width, surface, and pass and fail stated SEPARATELY.
  THE THIRD OPTION NOW CARRIES A WARNING EARNED THIS CYCLE: three of eleven checks in the last list
  were mis-specified by the channel. WRITE EACH CHECK SO ITS FAIL IS A DIFFERENT WORLD FROM ITS
  PASS, AND SO THE PROPERTY IT SETTLES IS THE PROPERTY IN QUESTION — not a narrower one that will
  read as settling it. State the width explicitly and state how it is to be achieved, because a
  device does not deliver an arbitrary width.
  A PROPOSAL CLAIMING TEST COVERAGE IT CANNOT HAVE IS WORSE THAN ONE DECLARING GAPS.

TEST-IMPACT PREDICTION PER ITEM, with the frontend absolute RE-DERIVED at execution and the movement
stated as a DELTA. Predicted NAMED FORCED EDITS stated, and none is a valid answer. Any red test or
any forced selector or class edit STOPS and asks BEFORE it ships. The three named regression files
stay green AND untouched. A MISS IS A QUESTION, NEVER AN ADJUSTMENT.

═══ THE TENSE MEASUREMENT RIDES THIS SAME REPORT ═══

T1 through T4 as specified in the preceding block, REPORT-ONLY, nothing proposed. Derive the tense
vocabulary FROM THE ARTIFACT — the copy strings and narrative builders — not from an assumed list of
markers; that is the class that has already cost three misses here. Reconcile each enumeration two
ways, and a self-check computed over a search's own output IS NOT the second route. T4's one-sentence
sizing answer is the deliverable that decides sequencing, and sequencing is the operator's.

CONSTRAINTS: zero physical-property additions, the operative baseline being thirty-two sites across
NINE files, delta zero; primitives stay direction-free; no new external origin and no Caddyfile
change — assert it rather than omit it; no renames; pinned strings untouched; the FAB topology
untouched; QuickAdd internals untouchable. No convention work, no zero-versus-no-data work, no cache
work. The e2e suite is not run, repaired, revived or deleted. Queued items stay queued and are not
tidied in passing.

PERSISTENCE. This block persists ALONE — one block per message — appending at sixteen. Sweep the
payload under both operative patterns first; the payload's prose opens paragraphs with ruling
numbers, a six-instance class of which one was a genuine wrap, so the sweep is predicted clean
rather than assumed clean and a disagreement HALTS THE WRITE AND IS REPORTED rather than remedied
where the text is the channel's. Predicted payload strict 1 and tripwire 1 agreeing; after the
append, strict 16 and tripwire 16, first 1, last 16, no duplicates, no breaks in 1 to 16, reconciled
15 + 1 = 16 and 16 minus 1 plus 1 = 16, enumeration PRINTED IN FILE ORDER. Derive from what is
present; if these figures are wrong, yours are right and you show the reconciliation. Re-derive the
unpushed count by both routes or do not state it. Provenance RELAYED. Amend the completeness note to
record the persisted set, the 390-not-320 bound on the observation round with the three unobserved
and the eight re-labelled OBSERVED-AT-390, the third check-authoring defect, and the three referrals
plus the one referral out.

HARD STOP after the proposal. Implementation is a separate cycle and begins only on explicit
approval.

MOB-R17 — THE PROPOSAL IS PARTLY APPROVED. Three items approved, two RETURNED, one deferral
ratified. The tense enumeration is INCOMPLETE and its sizing is withdrawn pending re-measurement.
One persistence commit's evidence is owed. Referral (A) is recommended to the operator.

CADENCE. Issued under test (b).

WHAT IS STRONG IN THIS PROPOSAL AND SHOULD NOT BE LOST IN THE RETURNS. Grouping by root cause
rather than symptom did exactly what it was asked to do: five distinct changes covering roughly
forty-four sites, with the distinct-change count stated beside the site count so a reader can see
which symptoms are one fix. Four of five items DECLARE A COVERAGE GAP and take an operator
observation instead of shipping a class assertion that would restate the diff — that is the honest
answer to the jsdom problem and it was chosen over the comfortable one. Item (ii) CORRECTED THE
MANDATE'S PREMISE: the channel called the card header a React component and it is a CSS rule. Item
(v) reported that L5 found nothing to fix in four of the five surfaces it was asked about, which is
a null result delivered as a null result. And item (iii) NAMED A COST AGAINST ITS OWN PROPOSAL
rather than burying it.

═══ APPROVED ═══

ITEM (i), THE FAB CLEARANCE, IS APPROVED. The arithmetic checks: one hundred and forty-four pixels
clears a one hundred and thirty-six pixel upper edge at phone width, ninety-six clears eighty on
desktop. A clearance change, not a position change, with the topology untouched. The observation
check is DELIBERATELY BROADER THAN LAST ROUND'S and says so — it asks whether the last row can be
read and tapped rather than whether an interactive element sits beneath, which is the correction to
the channel's own defective check applied by the implementer without being asked.
  ONE COST IS NAMED THAT THE PROPOSAL DID NOT NAME, and it is accepted rather than blocking: this
  adds ninety-six pixels of blank space to the bottom of every DESKTOP page where there is
  currently zero. That is a visible change to a surface this phase is not otherwise touching.
  Accepted because the alternative is the position change the constraint forbids, but it is
  recorded so it is not discovered as a surprise.

ITEM (iv), THE DIALOG HEIGHT, IS APPROVED SUBJECT TO ONE PRE-CHECK REPORTED BEFORE THE EDIT. Fixing
it in the shared primitive rather than at fourteen instances is the right call and the reasoning is
right — fourteen edits are fourteen chances to miss one — and the seven that declare their own
maximum override it through the class-merge utility, which knows the conflict group.
  THE PRE-CHECK, AND IT IS A KNOWN FAILURE MODE RATHER THAN A HYPOTHETICAL: a vertical overflow
  container on a dialog shell CLIPS ABSOLUTELY-POSITIONED CHILDREN that escape its bounds — select
  menus, dropdowns, popovers, date pickers. Several of these twenty-one dialogs contain selects.
  ESTABLISH FROM SOURCE whether any popover or menu inside a dialog renders in place rather than in
  a portal, and name the dialogs affected. If any does, that dialog is EXCLUDED from the shared
  change and handled separately, and you say which. If all portal out, say so and proceed — the
  change is then safe and the check cost one command.
  THE FLAGGED TEST RISK IS THE RIGHT FLAG. Twenty-one dialogs render in existing tests and a
  maximum height on the shared primitive is the one change here that could surface a selector
  assumption. Any red test STOPS AND ASKS.

ITEM (v) IS APPROVED WITH ONE QUESTION ANSWERED IN THE SAME REPORT: why two hundred and twenty.
The figure appears without derivation. If it is the measured width the column's content actually
needs, say how it was measured. If it is a judgement, say that instead — a stated judgement is
fine and an undifferentiated figure is not, because the next reader cannot tell which they are
looking at.

ITEM (vi)'s DEFERRAL IS RATIFIED. The three constraints were re-derived from the tree and all still
hold; the element is unobserved at the width that matters. Deferring with the reason stated is the
correct third report, and it is better than a third inconclusive one.

═══ RETURNED — ITEM (ii), THE CARD HEADER ═══

THE DIAGNOSIS IS RIGHT AND THE CHANGE IS PROBABLY RIGHT. It is returned because a one-line change
to a rule used at TWENTY-FOUR SITES, switching them from a row to a column, is proposed WITHOUT THE
CHILD STRUCTURE OF ANY OF THE TWENTY-FOUR BEING STATED.
  WHY THAT IS THE WHOLE QUESTION AND NOT A DETAIL. A row-to-column switch renders differently
  depending on how many children the container has and what they are. A header holding two children
  stacks into title-above-meta, which is the intent. A header holding THREE — an icon, a title and
  a meta block as siblings — stacks the icon onto its own line above the title, which is not the
  intent and would look broken. The captures show an icon adjacent to the title on several cards
  and do not settle whether it is a sibling of the title or nested with it. The proposal enumerates
  the sites and reconciles their count, and then says nothing about what is inside them.
  OWED: per site, the child count and what each child is, and the resulting stacked arrangement.
  Group the twenty-four by structural shape; if they fall into two or three shapes, the answer may
  still be one change plus a small number of exceptions, and that is a fine outcome. What is not
  acceptable is one change applied to twenty-four containers whose contents were never read.
  SECOND OWED ITEM, AND IT IS AN ASSERTION WHERE A MEASUREMENT IS CHEAP. The proposal states that
  the four sites overriding the justification KEEP THEIR OVERRIDE above the threshold. That is a
  cascade-order claim, not a fact about the source: the rule and the utility carry equal
  specificity, so which wins depends on emission order in the COMPILED stylesheet. It is probably
  correct, because those four override successfully today. PROVE IT FROM THE COMPILED CSS at the
  four sites rather than reasoning about it — this project does not act on probably-correct, and
  the whole apparatus exists because of it.
  ALSO STATE WHAT THE ALIGNMENT CHANGE DOES. The rule moves from centred to start-aligned below the
  threshold. That affects icon-to-text alignment wherever an icon is present, independently of the
  stacking question.

═══ RETURNED — ITEM (iii), AND THE REASON IS A CHECK THAT CANNOT SEE ITS OWN NAMED COST ═══

CHANGE 2, DROPPING THE WRAP FROM THE DELTA CHIP, IS APPROVED. It is self-contained, the defect is
observed, and it adds no overflow class.

CHANGE 1, ADDING A NO-WRAP CLASS TO THE FOUR KPI VALUES, IS RETURNED. The proposal names the cost
precisely — this adds two more members to a measured set of eighteen overflow sites, and at the
narrow width a five-digit figure would then CLIP rather than wrap, trading a visible defect for an
invisible one. Naming that was right. But the observation check is written at THREE HUNDRED AND
NINETY PIXELS, and the cost it names occurs at THREE HUNDRED AND TWENTY.
  THE CHECK CANNOT DETECT THE THING THE PROPOSAL FLAGS. That is the FOURTH check-in-this-track
  whose pass does not settle the property in question, and the first authored by the implementer
  rather than the channel — which is worth stating plainly, because three of the four were the
  channel's and a pattern belonging to one party is easier to dismiss than one belonging to both.
  ONE ALTERNATIVE WAS NOT CONSIDERED AND SHOULD BE, because it avoids the trade entirely: reduce
  the type size below the threshold and restore it above — the figure then FITS instead of being
  forbidden to wrap, and no overflow class is added. Cost: the KPI value is visually smaller on a
  phone. Propose both options with their costs and let the operator choose, or recommend one and
  say it is a recommendation. Rejecting the non-breaking-space change to the shared formatter was
  correct and for the right reason: a string consumed at thirty-plus sites and asserted in tests.
  EITHER WAY, THE CHECK FOR THIS ITEM IS WRITTEN AT THE WIDTH WHERE THE RISK LIVES.

═══ THE TENSE ENUMERATION IS INCOMPLETE AND T4 IS WITHDRAWN ═══

FOUR COPY SITES WERE REPORTED. THE OPERATOR'S CAPTURES CONTAIN AT LEAST NINE STRINGS OF THE CLASS,
and the ones absent from the table include a present-tense pace badge, a projection stating a
per-day rate with a full-month denominator, a forward-looking review prompt, a headline predicting
how the month will finish, and a present-tense status pill. None of those is in the reported set.
  THE CAUSE IS THE VOCABULARY'S SCOPE, AND IT IS THE ASSUMED-CONVENTION CLASS A FOURTH TIME. The
  method was sound in form — extract the month-bearing string literals, READ them, take the tense
  markers that actually appear — and its SCOPE was wrong: it enumerated strings that NAME A MONTH,
  while the property under measurement is copy that is PRESENT-TENSE OR FORWARD-LOOKING ABOUT THE
  SELECTED MONTH. Those are different sets, and the strings above sit in the difference. A
  forward-looking claim does not have to mention a month to be wrong about one.
  RECONCILING TWO WAYS DID NOT CATCH IT, AND THAT IS THE PART WORTH KEEPING. Both routes were
  computed over the same month-bearing corpus, so they agreed with each other and with the wrong
  scope. TWO ROUTES OVER ONE CORPUS ARE ONE ROUTE. This is the self-check-over-its-own-output
  finding from the query enumeration, recurring at the level of the CORPUS rather than the
  PATTERN — and it is the more dangerous form, because the arithmetic looks right.
  T4'S SIZING IS WITHDRAWN, NOT DISPUTED. A handful of strings may still be the answer; it is not
  established by an enumeration that missed more sites than it found. THE SEQUENCING DECISION RESTS
  ON T4 AND IS THEREFORE NOT PUT TO THE OPERATOR THIS CYCLE.
  RE-MEASURE. Enumerate the narrative and copy strings rendered on the month-scoped surfaces
  WITHOUT filtering on month tokens — derive the corpus from the SURFACES and their builders, then
  read every string they can emit. Reconcile against a second corpus built a different way, and say
  how the two corpora differ rather than only that their counts agree. The nine strings above are
  a FLOOR supplied from observation, not the target: an enumeration that returns exactly nine has
  probably reproduced the channel's reading rather than measured the code.
  T2 AND T3 ARE ACCEPTED AS MEASURED. The current-month signal exists twice, is client-derived, and
  reaches neither reported site — one as a string rather than a boolean, one as a boolean trapped
  inside a memo and never hoisted. The zero-days guard is shown at its line with the arithmetic:
  clamping to one at zero days makes the per-day figure equal the whole runway, server-side. That
  is the observed defect located exactly.

═══ OWED, AND IT IS A SHORT REPLY ═══

THE PRECEDING BLOCK'S PERSISTENCE EVIDENCE DID NOT REACH THE REPORT. It predicted a payload sweep
of one and one agreeing, a post-append composite of sixteen and sixteen, first one, last sixteen,
no duplicates, no breaks, both reconciliation routes, the enumeration printed in file order, the
exclusion shown discriminating with its capture uncut, the gate skip stated, and the bytes carried.
None arrived. The unpushed count moved from twelve to thirteen, which is CONSISTENT with the commit
having been made and NOT EVIDENCE THAT IT WAS — a consistent figure is not a measurement, which is
this track's most-repeated lesson.
  NOT AN AUTO-RETURN. The three mandatory sections govern an implementation close-out and this was
  a docs commit. Supply the evidence in one reply. If any predicted figure missed, it is a QUESTION.

═══ REFERRALS ═══

(A) TAP TARGETS. The channel RECOMMENDS the touch-only minimum to the operator, agreeing with the
implementer: it is the only option that fixes touch without altering desktop and it introduces no
new breakpoint. ONE CONSEQUENCE TO STATE IN THE PROPOSAL WHEN IT OPENS, and it is why this does not
ride the current commit: raising every control on touch reflows dense toolbars and dialog footers —
the same surfaces this phase is fixing for crowding — so it needs its own observation round rather
than being verified by the checks already written. Operator's decision; nothing is opened.
(B) KPI ENCLOSURE stays referred to the design track. The operator's observation is recorded
against that referral. The value wrap is the defect and is item (iii).
(C) PROFILE DISCOVERABILITY. Three options with their consequences, no recommendation from either
side, correctly — this is navigation topology and the tab row plus the FAB is a settled
arrangement. Operator's decision.
The duplicate label and orphaned separator stay REFERRED OUT to the conventions phase, queued.

═══ WHAT HAPPENS NEXT ═══

ONE REPORT carrying: the persistence evidence owed above; the returned items (ii) and (iii) with
their owed measurements; item (iv)'s portal pre-check; item (v)'s derivation of its figure; and the
re-measured tense enumeration. NO CODE. Items (i) and (iv) are approved but DO NOT SHIP AHEAD of the
returns — one implementation commit carries the approved set once the returns are resolved, because
two commits here means two verification rounds and two operator observation passes for one phase.

CONSTRAINTS UNCHANGED: zero physical-property additions against the operative baseline of thirty-two
sites across NINE files, delta zero; primitives stay direction-free; no new external origin and no
Caddyfile change, asserted rather than omitted; no renames; pinned strings untouched; the FAB
topology untouched; QuickAdd internals untouchable. No convention, zero-versus-no-data or cache work.
The e2e suite is not run, repaired, revived or deleted.

PERSISTENCE. This block persists ALONE, one block per message, appending after the preceding one.
Sweep the payload under both operative patterns first; the payload opens paragraphs with ruling
numbers and phase handles, a six-instance class of which one was a genuine wrap, so the sweep is
predicted clean rather than assumed clean and a disagreement HALTS THE WRITE AND IS REPORTED rather
than remedied where the text is the channel's. Predicted payload strict 1 and tripwire 1 agreeing;
after the append, strict 17 and tripwire 17, first 1, last 17, no duplicates, no breaks in 1 to 17,
reconciled two ways. THAT PREDICTION ASSUMES THE PRECEDING BLOCK IS ALREADY ON DISK AT SIXTEEN; if
it is not, the figures are wrong and yours are right — say so, show the reconciliation, and persist
both. Enumeration PRINTED IN FILE ORDER. Re-derive the unpushed count by both routes or do not state
it. Provenance RELAYED. Amend the completeness note to record the persisted set, the tense
enumeration's scope defect with the two-routes-over-one-corpus finding, the withdrawn sizing, and the
partial approval with its returns. Docs-only under the standing permanent licence — state the skip
and its reason, prove docs-only by exclusion with the exclusion shown discriminating and its capture
UNCUT, carry the bytes.

HARD STOP after the report.

MOB-R18 — ALL RETURNS ARE RESOLVED AND IMPLEMENTATION IS AUTHORISED. Five items ship as one
commit. Item (v) is WITHDRAWN and the channel propagated its defect first. The tense re-measurement
is accepted at fifteen sites and T4 stays withdrawn on the implementer's own motion.

CADENCE. Issued under test (a) — it authorises implementation.

3ecd115's EVIDENCE IS SUPPLIED AND EVERY PREDICTED FIGURE MET: 16/16 agreeing, first 1, last 16,
zero duplicates, zero breaks, both routes at 16, the exclusion empty with the control uncut at six
paths. The preceding block's conditional prediction is discharged — the block WAS on disk at
sixteen, so seventeen holds for this one.

ITEM (ii) IS RESOLVED AND THE PREDICTED BREAK WAS REAL. Twenty-four containers parsed and READ:
nineteen two-block, four icon-and-heading sibling pairs, one single-child. THE FOUR WOULD HAVE
STACKED AN ICON ONTO ITS OWN LINE. One rule plus four exceptions is approved.
  THE CASCADE PROOF IS BETTER THAN THE ONE ASKED FOR AND THE DIFFERENCE MATTERS. The channel asked
  for emission order in the compiled stylesheet, which would have established the fact for TODAY'S
  BUILD ONLY. The implementer established it STRUCTURALLY instead — the rule sits in a components
  layer, utilities are declared in a later layer, and layer precedence decides independently of
  source order and specificity. A structural proof survives a rebuild; an emission-order
  observation does not. The channel asked for the weaker instrument and got the stronger one.
  THE ALIGNMENT QUESTION IS ANSWERED AND CORRECTLY DISMISSED: the centre-to-start change is moot at
  the four icon sites because they keep the row direction.

ITEM (iii) IS RESOLVED. Both options presented with their costs; the recommendation is the
type-size option and the channel AGREES — it removes the trade rather than managing it, and it adds
nothing to the eighteen-member overflow set. The check is rewritten at THE WIDTH WHERE THE RISK
LIVES, which is the defect it was returned for.
  ONE CONSEQUENCE STATED SO IT IS NOT A SURPRISE: the KPI figures are visibly smaller on a phone.
  That is the cost the operator is buying and it is a presentation change to the surface he asked
  about. Accepted. IF HE DISLIKES IT THE FALLBACK IS THE OTHER OPTION, WITH ITS CLIPPING RISK AT
  320, and that is a real choice rather than a reopening.

ITEM (iv) IS RESOLVED AND THE PRE-CHECK EARNED ITS COMMAND. It found a genuine non-portal dropdown
rendering in place, then established that its four consumers sit inside two dialogs that ALREADY
declare the overflow container — so none of the fourteen gaining the declaration contains one, and
no exclusion is needed. A CHECK THAT FINDS THE HAZARD AND THEN CLEARS THE CHANGE ANYWAY IS THE
USEFUL OUTCOME, and it is only distinguishable from a check that found nothing because the finding
was reported. The latent clipping condition in those two pre-existing dialogs is RECORDED AND NOT
OPENED, correctly.

═══ ITEM (v) IS WITHDRAWN, AND THE CHANNEL PROPAGATED THE DEFECT FIRST ═══

THERE IS NO FIGURE TO DERIVE. The three-hundred-and-forty-pixel column sits behind a
minimum-width-1024 gate and NEVER RENDERS AT 320 OR 390. The item was never a phone-width problem.
  THE PROVENANCE IS THE CHANNEL'S AND IT IS STATED PLAINLY. The L5 mandate asked for tables and
  scrollers and the L5 report cited the declaration without its render gate; the channel then read
  that report, put the site on the observation list as a 320 check, and wrote it into the proposal
  mandate as an item to fix — WITHOUT CHECKING THE GATE EITHER. Two parties, three cycles, one
  unchecked conditional. The implementer withdrew the item rather than answer the question the
  channel had asked about it, which is the right move: a derivation for a number that should not
  exist would have been a well-evidenced answer to a question that was void.
  THE CLASS IS DECLARED CORRECTLY — a declaration cited without its render condition is the
  scope-error family, second consecutive cycle. A STRING'S PRESENCE IN A FILE IS NOT ITS PRESENCE
  ON A SCREEN, and every enumeration in a responsive phase is an enumeration of things that may or
  may not render at the width under discussion.
  ONE FOLLOW-ON IS OWED AND IT IS NARROW: any OTHER L-series finding whose site sits behind a
  width, device or feature gate is reported the same way. Do not re-run the L-series. Check the
  findings that ENTERED THIS PROPOSAL and the observation list, and say which if any are gated.
  NO NEW STANDING LINE. The count stays at SIX. This is the derive-from-the-artifact rule applied
  to a conditional rather than to a name, cited not minted.

═══ THE TENSE RE-MEASUREMENT IS ACCEPTED AT FIFTEEN ═══

The corpus was derived FROM THE SURFACES rather than from month tokens — one hundred and twenty-four
user-facing strings across ten files, read — and the second corpus was built STRUCTURALLY from the
narrative builders' return values. FIFTEEN SITES, above the channel's floor of nine, so it is not
reproducing the channel's reading.
  THE SECOND CORPUS CAUGHT ONE THE FIRST MISSED, and that is the whole justification for building it
  differently: a present-tense string matched by no textual marker. THE TWO CORPORA DIFFER AND THE
  REPORT SAYS HOW. Two routes over one corpus are one route; two routes over two corpora built by
  different methods are two.
  T4 STAYS WITHDRAWN ON THE IMPLEMENTER'S OWN MOTION — declining to re-size in the same breath as
  correcting the measurement. That is the right instinct and it is ratified. THE SEQUENCING
  DECISION REMAINS OFF THE OPERATOR'S DESK until a sizing is offered that has survived a cycle.
  ONE OBSERVATION FOR WHENEVER IT IS SIZED, NOT A MANDATE: fifteen copy sites plus a server-side
  guard plus a boolean to hoist in two pages SPANS BOTH PACKAGES, which no mobile-track phase has
  done. That is a fact about its shape rather than an argument about its size.

═══ IMPLEMENTATION — ONE COMMIT ═══

APPROVED AND SHIPPING TOGETHER: (i) the FAB clearance, (ii) one rule plus four exceptions,
(iii) both changes with the type-size option, (iv) the shared-primitive height declaration.
ITEM (v) IS WITHDRAWN AND SHIPS NOTHING. ITEM (vi) STAYS DEFERRED pending the 320 observation.

ONE COMMIT, not two. Two commits means two verification rounds and two operator observation passes
for one phase.

CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS and a close-out missing any is auto-returned: both
verbatim test tails INCLUDING the Test Files summary line with captured exit codes, each command
carrying a resolution proof and a non-matching negative control shown exiting 0; both verbatim
typecheck outputs with exit codes and byte counts; and the baseline movement stated as a DELTA with
its absolute RE-DERIVED AFTER THE LAST EDIT. The api suite is RUN even though no api file is
touched, because the contract test reads the frontend fixture — assert the fixture count and the
allowlist length derived FROM THE FILE. Predicted delta is plus zero tests and plus zero files;
A MISS IS A QUESTION, NEVER AN ADJUSTMENT.
  FOUR OF FIVE ITEMS CARRY A DECLARED COVERAGE GAP and that is the honest answer, not a shortfall:
  jsdom computes no layout, so a class assertion restates the diff and its negative case equals its
  positive case. STATE THE GAP PER ITEM IN THE CLOSE-OUT rather than letting a plus-zero delta read
  as adequacy. A previous phase in this project shipped a layout item with a deliberate zero-test
  gap for exactly this reason and it was the correct call there too.
  ASSERT THE NEGATIVE DELIVERABLES POSITIVELY: zero physical-property additions against the
  operative baseline of thirty-two sites across NINE files with the pattern shown discriminating; no
  Caddyfile change and no new external origin; the standing-rules file untouched; the three named
  regression files green AND untouched, shown by empty status on those paths. Primitives stay
  direction-free — the shared dialog and the stylesheet are both touched, so say so explicitly.
  ONE RISK CARRIED FORWARD FROM THE PROPOSAL: twenty-one dialogs render in existing tests and a
  maximum height on the shared primitive is the one change that could surface a selector assumption.
  ANY RED TEST, OR ANY FORCED SELECTOR OR CLASS EDIT TO A TEST, STOPS AND ASKS BEFORE IT SHIPS.

THE OBSERVATION CHECKS SHIP WITH THE CLOSE-OUT, in L11 form — width, surface, pass and fail stated
SEPARATELY, and each stating HOW the width is achieved, because a physical device does not deliver an
arbitrary width and that assumption cost this track a bounded observation round. Four checks have
been mis-specified in this phase, three by the channel and one by the implementer; write these so
each one's fail is a different world from its pass AND settles the property actually in question.
  THE DESKTOP CONSEQUENCE OF (i) GETS ITS OWN CHECK: ninety-six pixels of bottom clearance appear on
  every desktop page where there is currently zero. That is a visible change to a surface this phase
  is not otherwise touching and it is verified rather than assumed benign.

NOTHING IS PUSHED BY THIS BLOCK. A push is a deploy and it is the operator's. When it happens: diff
against ORIGIN/MAIN rather than local main, enumerate every riding commit, name any that is not this
track's work with its CSP check, and NO UI OBSERVATION IS EVIDENCE UNTIL THE ACTIONS RUN HAS LANDED.

═══ OPEN — TWO OPERATOR DECISIONS, NEITHER BLOCKING ═══

TAP TARGETS: the channel and the implementer both recommend the touch-only minimum. It fixes touch
without altering desktop and needs no new breakpoint. ITS OWN CYCLE WITH ITS OWN OBSERVATION ROUND,
because raising every control on touch reflows the dense toolbars and dialog footers this phase is
fixing — the checks written here cannot verify it.
PROFILE DISCOVERABILITY: three options, no recommendation from either side, correctly. Navigation
topology is the operator's.
KPI ENCLOSURE stays with the design track; the duplicate label and orphaned separator stay referred
out to conventions; the cross-tab regime and the column-mapping requirement stay queued with their
triggers. NONE OF THESE IS OPENED AND A CYCLE PASSING DOES NOT ADOPT ANY RECOMMENDATION.

CONSTRAINTS: no renames, pinned strings untouched, the FAB topology untouched, QuickAdd internals
untouchable. No convention work, no zero-versus-no-data work, no cache work, no tense work. The e2e
suite is not run, repaired, revived or deleted. Queued items stay queued and are not tidied in
passing. Any discovery enlarging this mandate is a STOP-AND-ASK and a REQUEST, never a self-grant.

PERSISTENCE. This block persists ALONE, one block per message, appending at seventeen — and it may
ride the implementation commit's docs half rather than taking a commit of its own, since the
implementation commit follows immediately; if it does, say so and prove the docs half separately
rather than claiming docs-only for a commit that touches code. Sweep the payload under both
operative patterns first; the payload opens paragraphs with ruling numbers and phase handles, a
six-instance class of which one was a genuine wrap, so the sweep is predicted clean rather than
assumed clean and a disagreement HALTS THE WRITE AND IS REPORTED rather than remedied where the text
is the channel's. Predicted payload strict 1 and tripwire 1 agreeing; after the append, strict 17 and
tripwire 17, first 1, last 17, no duplicates, no breaks in 1 to 17, reconciled 16 + 1 = 17 and 17
minus 1 plus 1 = 17, enumeration PRINTED IN FILE ORDER. Derive from what is present; if these figures
are wrong, yours are right and you show the reconciliation. Re-derive the unpushed count by both
routes or do not state it. Provenance RELAYED. Amend the completeness note to record the persisted
set, item (v)'s withdrawal with the channel's prior propagation, the gate-conditional scope class,
the tense re-measurement at fifteen with T4 still withdrawn, and the two open operator decisions.

MOB-R19 — BOTH OPEN OPERATOR DECISIONS ARE RULED. Tap targets take the touch-only route. Profile
discoverability takes a header control, with ONE PRE-CHECK that may falsify the whole approach.
Neither opens now. The implementation commit authorised by the preceding block ships first.

CADENCE. Issued under test (b).

OPERATOR RULINGS, and the two are different classes.
  TAP TARGETS — BY DELEGATION, landing on the recommendation both the channel and the implementer
  made and on nothing else: the touch-only minimum, raising controls on coarse-pointer devices and
  leaving desktop untouched.
  PROFILE DISCOVERABILITY — DIRECT. The operator chose the header control from the three options,
  in his own words, after the channel offered its view when asked. The view offered was the same
  option, so nothing turns on the distinction here, but the ruling is HIS and is recorded as
  direct rather than as a delegation to the channel's preference.

NEITHER IS OPENED BY THIS BLOCK. The implementation commit carrying items (i) through (iv) ships
first, with its close-out and its observation checks. Two phases in flight at once means two
verification rounds interleaved and an operator observation pass that cannot attribute what it sees.

═══ THE HEADER CONTROL — ONE PRE-CHECK THAT MAY MAKE IT UNNECESSARY ═══

THE CHANNEL RAISED THIS AND IT IS NOT RESOLVED, SO IT LEADS THE PHASE RATHER THAN TRAILING IT. The
operator's report was that he would have found Profile had he not known it existed. THAT IS AMBIGUOUS
BETWEEN TWO DEFECTS WITH DIFFERENT REMEDIES: the control is in the wrong place, or the control is in
the right place and the menu containing it gives no indication of what is inside. A third round
button in a corner that already holds two is discoverable only to someone who looks there — which is
the same property the current route has.
  ESTABLISH FROM SOURCE, BEFORE PROPOSING ANY CONTROL: what the header currently renders and how
  each item is labelled; what the menu contains, in order, with its labels and its accessible name;
  and whether Profile is labelled inside it in a way a first-time user would recognise as
  account-and-settings. Report the strings, not a description of them.
  IF THE MENU IS THE DEFECT, SAY SO AND PROPOSE THAT INSTEAD. Relabelling or restructuring a menu
  is cheaper than adding a control, adds nothing to the header, and fixes the cause rather than
  routing around it. THAT OUTCOME IS A SUCCESS OF THIS PRE-CHECK AND NOT A DEVIATION FROM THE
  OPERATOR'S RULING — he ruled on the remedy among three offered options, and this establishes
  whether the problem those options addressed is the problem that exists. If it is, the header
  control proceeds as ruled.
  IF BOTH APPLY, propose both and say which does the work.

WHEN THE HEADER CONTROL IS PROPOSED, IT CARRIES: the icon and its accessible label; its placement
relative to the two existing controls; its size against the touch minimum that the tap-target cycle
will be setting, so the two do not disagree; and what the header row does at 320 with three controls
plus the brand block, MEASURED rather than assumed, since the brand block carries a logo mark and
two lines of text. Logical properties only — the existing header controls are the kind of site that
attracts a physical-property addition, and the standing rule forbids additions with the operative
baseline at thirty-two sites across NINE files, delta zero.
  THE BRAND MARK IS A RATIONED BRASS SLOT. The header is where the ration lives. Do not restyle,
  recolour or re-scale anything already in that row while adding to it.

═══ TAP TARGETS — WHAT THE PHASE MUST ESTABLISH ═══

THE MEASURED STARTING POINT, TO BE RE-DERIVED AT EXECUTION AND NOT CARRIED: every declared variant
in the shared size table is below forty-four pixels, none reaches the next step up, fifty-four call
sites are below by explicit value, six are content-dependent and therefore OBSERVABLE-ONLY, and the
FAB at fifty-six pixels is the sole exception. The declared height IS the rendered height because
the preflight sets border-box — that is DERIVED, and it was upgraded from an observable-only label
by the implementer with the mechanism shown.

THE COARSE-POINTER QUERY IS A MECHANISM THIS CODEBASE HAS NOT USED, AND THAT IS THE PHASE'S RISK.
  ESTABLISH FROM THE ARTIFACT whether any pointer or hover media query already exists anywhere in
  the stylesheet or in the installed framework's variant set, and whether the framework version in
  use exposes a variant for it or whether raw CSS is required. DERIVE THE VARIANT VOCABULARY FROM
  THE INSTALLED PACKAGE, not from what the framework is assumed to offer — that assumption class
  has now cost this project four separate misses, most recently a declaration cited without its
  render gate.
  THE HAZARD, NAMED IN ADVANCE: a coarse-pointer query is a DEVICE-CAPABILITY switch, not a width
  switch. It fires on a touch-capable laptop and does not fire on a narrow desktop window. So it is
  NOT equivalent to the narrow-width threshold the rest of this track uses, and the two will
  disagree on real devices. State plainly which surfaces that affects and whether the divergence is
  acceptable; if it is not, the alternative is a width threshold, which reaches desktop and is what
  the operator's ruling was chosen to avoid. THAT TENSION IS REPORTED, NOT RESOLVED SILENTLY.
  THE CONSEQUENCE ALREADY ON THE RECORD IS THE REASON THIS GETS ITS OWN CYCLE: raising every
  control on touch REFLOWS THE DENSE TOOLBARS AND DIALOG FOOTERS this phase is currently fixing for
  crowding. The checks written for the implementation commit cannot verify it, and a taller control
  inside a dialog that just gained a maximum height interacts with that change. MEASURE THE
  INTERACTION EXPLICITLY.
  THE PINNED FAB IS NOT RESIZED BY THIS. Its fifty-six pixels are part of a FIXED topology and it
  already clears the threshold. If a global change to the size table would move it, that is a
  STOP-AND-ASK.

═══ SEQUENCE, AND IT IS THE OPERATOR'S TO OVERRIDE ═══

CHANNEL RECOMMENDATION, OFFERED AND NOT ADOPTED: the implementation commit ships and deploys and is
observed; then the header control, because its pre-check may collapse it into a cheap menu change;
then tap targets, which is the largest of the three and whose observation round should not be
interleaved with another change to the same surfaces. Both remaining items are within MOB-1
RESPONSIVE and neither displaces the two phases behind it.

THE 320 TOP-UP IS STILL OUTSTANDING AND IS STILL THE OPERATOR'S. The observation round is bounded at
390 points; three checks are unobserved; item (vi) is deferred specifically pending a 320
observation, and item (iii)'s risk lives at 320. NOTHING WAITS ON IT, and every 320-dependent claim
rests on source measurement rather than observation until it happens. Do not treat its absence as a
pass.

CONSTRAINTS, unchanged and binding both remaining items: zero physical-property additions with the
pattern shown discriminating; primitives stay direction-free; no new external origin and no
Caddyfile change, asserted rather than omitted; no renames; pinned strings untouched — including the
FAB's label and tooltip and the two legal test identifiers; the FAB topology untouched; QuickAdd
internals untouchable; the three named regression files green AND untouched. No convention work, no
zero-versus-no-data work, no cache work, no tense work. The e2e suite is not run, repaired, revived
or deleted. Queued items stay queued: the KPI enclosure with the design track, the duplicate label
and orphaned separator with conventions, the cross-tab regime and the import column-mapping
requirement with their triggers. T4's sizing remains WITHDRAWN and the tense sequencing decision is
not on the operator's desk.

NO CODE IS AUTHORISED BY THIS BLOCK. Each remaining item opens with a proposal cycle and a hard stop.

PERSISTENCE. This block persists ALONE, one block per message, appending at eighteen — and it may
ride the implementation commit's docs half if that commit follows immediately; if it does, say so and
prove the docs half separately rather than claiming docs-only for a commit that touches code. Sweep
the payload under both operative patterns first; the payload opens paragraphs with ruling numbers and
phase handles, a six-instance class of which one was a genuine wrap, so the sweep is predicted clean
rather than assumed clean and a disagreement HALTS THE WRITE AND IS REPORTED rather than remedied
where the text is the channel's. Predicted payload strict 1 and tripwire 1 agreeing; after the
append, strict 18 and tripwire 18, first 1, last 18, no duplicates, no breaks in 1 to 18, reconciled
17 + 1 = 18 and 18 minus 1 plus 1 = 18, enumeration PRINTED IN FILE ORDER. THAT ASSUMES THE PRECEDING
BLOCK IS ON DISK AT SEVENTEEN; if it is not, these figures are wrong and yours are right — say so,
show the reconciliation, and persist both. Re-derive the unpushed count by both routes or do not state
it. Provenance RELAYED. Amend the completeness note to record the persisted set, both operator
rulings with their classes, the menu-versus-placement pre-check, the coarse-pointer device-versus-
width divergence, and the recommended sequence as offered-and-not-adopted.

MOB-R20 — THE RESPONSIVE COMMIT IS ACCEPTED. THE CADENCE WIDENS BY OPERATOR INSTRUCTION: five items
run in ONE cycle, with measure, propose and implement collapsed where the surface is enumerable and
the stop-and-ask gates named explicitly in advance. The deploy is recommended BEFORE this cycle's UI
work and the reason is attribution, not caution.

CADENCE. Issued under test (a) and (b). OPERATOR INSTRUCTION, 2026-09-12, DIRECT: larger cycles,
more per cycle, clarity preserved. This block is written to that instruction.

THE COMMIT IS ACCEPTED. All three mandatory sections present and green: both test tails with the
Test Files summary line and captured exit codes, resolution proofs with a non-matching negative
control shown exiting 0, both typechecks at 0 bytes, the api suite run because the contract test
reads the frontend fixture with the count and the empty allowlist derived FROM THE FILE, and the
baseline stated as a delta of plus zero and plus zero as predicted. Physical-property additions zero
with the control finding thirty-two in tree, and the baseline re-derived AFTER THE LAST EDIT at
thirty-two across nine files. Primitives touched and declared touched, both direction-free.

THE NUMBERING HALT IS VINDICATED AND THIS IS THE PART TO KEEP. Both blocks' persistence figures were
written before the block preceding them had landed, so both were stale in the same way and neither
was wrong about its own number. HAD THE IMPLEMENTER PICKED EITHER READING IT WOULD HAVE WRITTEN A
WRONG NUMBER OR A WRONG POSITION PERMANENTLY INTO THE INDEX. It distinguished this case from the
earlier recorded gap on the right ground — that one was unambiguous about WHICH artifact was
missing, this one was ambiguous about WHICH artifact was wrong — and that distinction was the
implementer's, not supplied by the channel. A held block is a smaller risk than a corrupted index.

THE RED IS THE MOST INSTRUCTIVE THING IN THE REPORT. The flagged risk was a dialog selector
assumption; it did not fire. THE ACTUAL RED CAME FROM THE ITEM THE IMPLEMENTER THOUGHT SAFEST — an
invalid JSX comment placed as a sibling expression inside a return, collapsing a whole file's
collection and taking the count from two hundred and sixteen to two hundred and ten. It was fixed in
the implementer's OWN code with no test file edited, shown by an empty status on the test pathspec.
  WHAT IT COSTS THE FLAGGING PRACTICE: nothing. A flag that does not fire is not a wasted flag, and
  the dialog risk was real whether or not it materialised. WHAT IT ADDS: the flagged item gets extra
  attention and the unflagged items get the residue of it, so the marginal defect lands where nobody
  is looking. Running the full suite after the last edit is what caught this, not judgement about
  where the risk was. THE SUITE IS THE INSTRUMENT; THE FLAG IS A PRIOR.
  NO NEW STANDING LINE. The count stays at SIX across four tracks.

THE FOUR DECLARED COVERAGE GAPS ARE ACCEPTED AS THE HONEST ANSWER. jsdom computes no layout, a class
assertion restates the diff, and plus zero is stated as a gap rather than allowed to read as
adequacy. THE OBSERVATION CHECKS ARE THE BEST-WRITTEN SET THIS TRACK HAS PRODUCED: seven checks,
each stating its width AND HOW THE WIDTH IS ACHIEVED, pass and fail as different worlds, a desktop
check for the clearance consequence that this phase did not otherwise touch, and a check covering
the latent non-portal dropdown condition that was recorded and not opened. Four checks were
mis-specified earlier in this phase, three by the channel; these are not.

═══ WHAT THE WIDER CADENCE CHANGES, AND WHAT IT DOES NOT ═══

COLLAPSED: measurement, proposal and implementation run in ONE report per item where the surface is
enumerable from source. The proposal half is still WRITTEN — it is the record of what was decided
and why — but it no longer waits a cycle for approval.
NOT COLLAPSED, AND THESE ARE THE LOAD-BEARING EXCEPTIONS:
  - EVERY NAMED GATE BELOW IS A HARD STOP. A gate is not a caution; it is a point where the report
    ends and waits.
  - ANY RED TEST, and any forced selector or class edit to an existing test, STOPS AND ASKS.
  - ANY DISCOVERY ENLARGING THE MANDATE is a REQUEST, never a self-grant. Wider cycles make this
    MORE important, not less: the further a cycle runs unsupervised, the more a silent self-grant
    compounds before anyone sees it.
  - THE OPERATOR'S OBSERVATION ROUNDS CANNOT BE COLLAPSED. They are the only instrument for layout.
THE COST, STATED PLAINLY: more surface changes per verification round, so a failed observation is
harder to attribute to a cause. That is the trade the operator is buying and it is the reason the
deploy recommendation below is not a formality.

═══ THE DEPLOY — RECOMMENDED BEFORE THIS CYCLE'S UI WORK ═══

CHANNEL RECOMMENDATION, offered and not adopted: PUSH NOW, observe, then let this cycle land on
verified ground. Sixteen commits are unpushed and nothing from this track is live.
  THE REASON IS ATTRIBUTION. Tap targets and the header control touch the SAME SURFACES as the
  commit just accepted — controls, headers, dialog footers. Implementing them before the responsive
  work is observed stacks three unverified layers on one surface, and a failed check then cannot say
  which layer caused it. Deploying first makes each layer separately falsifiable.
  NOTHING IN THIS BLOCK WAITS ON IT. Parts 1 through 5 proceed either way. If the push has not
  happened when the report is written, say so and state which observation checks are therefore
  still outstanding, rather than letting their absence read as a pass.
  WHEN IT HAPPENS: diff against ORIGIN/MAIN, never local main; enumerate every riding commit and
  name any that is not this track's work with its CSP check; NO UI OBSERVATION IS EVIDENCE UNTIL THE
  ACTIONS RUN HAS LANDED, and the report says that it had. Write the deploy record at the close of
  the push, not later.

═══ PART 1 — TAP TARGETS. Measure, propose and implement in one report. ═══

RULED BY DELEGATION: the touch-only route. Raise controls on coarse-pointer devices; desktop
unchanged.

1a. RE-DERIVE THE STARTING POINT AT EXECUTION, do not carry it: the shared size table's variants,
    the call-site distribution by size, the count below forty-four pixels by explicit value, the
    content-dependent ones, and the FAB as the sole exception. The declared height IS the rendered
    height because the preflight sets border-box — that is DERIVED and was established by the
    implementer with the mechanism shown. Reconcile the call-site count two ways.
1b. DERIVE THE MECHANISM FROM THE INSTALLED PACKAGE, not from what the framework is assumed to
    offer. Establish whether a pointer or hover variant exists in the installed version's variant
    set, whether any pointer or hover query already appears anywhere in the stylesheet, and whether
    raw CSS is required. THAT ASSUMPTION CLASS HAS COST THIS PROJECT FOUR MISSES, most recently a
    declaration cited without its render gate.
    ** GATE 1 ** — IF THE VARIANT DOES NOT EXIST in the installed version and raw CSS is required,
    STOP AND REPORT. Introducing a new styling mechanism into this stylesheet is a structural
    change and is not authorised here.
1c. RAISE THE CONTROLS. Every control below the threshold reaches at least forty-four pixels under a
    coarse pointer. Include the raw button elements that declare no height, and the input primitive.
    The six content-dependent ones are reported, not forced.
    ** GATE 2 ** — THE FAB IS NOT RESIZED. Its size is part of a FIXED topology and it already
    clears the threshold. If a change to the shared table would move it, STOP AND ASK.
1d. MEASURE THE INTERACTION WITH WHAT JUST SHIPPED, EXPLICITLY. Taller controls inside a dialog that
    just gained a maximum height and internal scroll: report per dialog whether the footer still
    fits, and whether any toolbar or segmented control reflows to a second line. THIS IS THE
    CROWDING THE RESPONSIVE COMMIT WAS FIXING and a fix that reintroduces it is a regression.
    ** GATE 3 ** — IF ANY SURFACE REFLOWS WORSE THAN BEFORE, stop on that surface, report it, and
    ship the rest.
1e. REPORT THE DEVICE-VERSUS-WIDTH DIVERGENCE rather than resolving it silently. A coarse-pointer
    query is a CAPABILITY switch: it fires on a touch laptop and does not fire on a narrow desktop
    window, so it is NOT equivalent to the width threshold the rest of this track uses. Name the
    surfaces where the two disagree and say whether the divergence is acceptable. The alternative is
    a width threshold, which reaches desktop and is what the ruling was chosen to avoid.
1f. OBSERVATION CHECKS in L11 form — width AND how it is achieved, pass and fail as different
    worlds. At least one must be on a PHYSICAL touch device, because a desktop responsive mode does
    not report a coarse pointer and therefore CANNOT verify this change at all. State that limit.

═══ PART 2 — THE PROFILE HEADER CONTROL. Pre-check, then implement, both outcomes pre-authorised. ═══

RULED DIRECT by the operator: a header control, chosen from three options.

2a. THE PRE-CHECK LEADS, because it may change what the right remedy is. Report the header's current
    contents with every label and accessible name; the menu's contents in order with their labels;
    and whether the profile entry is labelled in a way a first-time user would read as
    account-and-settings. REPORT THE STRINGS, not a description of them.
2b. BOTH OUTCOMES ARE PRE-AUTHORISED SO NO CYCLE IS LOST AND NOTHING IS SUBSTITUTED FOR THE RULING:
    - IF THE MENU IS ADEQUATELY LABELLED: implement the header control as ruled.
    - IF THE MENU'S PROFILE ENTRY IS THE DEFECT: implement the header control AS RULED, and ALSO
      relabel that ONE entry. The relabel is additive, cheap, and fixes the cause; the control is
      what the operator ruled. AUTHORISED NARROWLY — that single entry's label only. A general menu
      restructure is NOT authorised and is a stop-and-ask.
2c. THE CONTROL CARRIES: the icon and its accessible label; placement relative to the two existing
    controls; its size against the threshold Part 1 is setting, so the two do not disagree; and what
    the header row does at 320 with three controls plus the brand block, MEASURED — the brand block
    carries a mark and two lines of text.
    ** GATE 4 ** — IF THE HEADER ROW OVERFLOWS OR CROWDS AT 320 with three controls, STOP AND
    REPORT with the measurement. Do not solve it by shrinking anything already in that row.
2d. THE BRAND MARK IS A RATIONED BRASS SLOT and the header is where the ration lives. Nothing
    already in that row is restyled, recoloured or re-scaled.
2e. Logical properties only. Header control sites are exactly where a physical-property addition
    creeps in; the operative baseline is thirty-two sites across NINE files, delta zero, and the
    rule forbids ADDITIONS.

═══ PART 3 — THE GATE-CONDITIONAL FOLLOW-ON. Owed, narrow, report only. ═══

Any OTHER finding that entered the responsive proposal or the observation list whose site sits behind
a width, device or feature gate. DO NOT RE-RUN THE L-SERIES. Check what entered, and say which if
any are gated. A string's presence in a file is not its presence on a screen.

═══ PART 4 — THE ZERO-VERSUS-NO-DATA AND TENSE MEASUREMENT. Report only, no code. ═══

RUN IN PARALLEL WITH PARTS 1 AND 2, and the reason it is safe to parallelise is specific: a
MEASUREMENT produces no code, so it creates no second verification round and no attribution problem.
Two implementations in flight would; a measurement beside an implementation does not.

4a. THE ZERO CLASS. Seven faces were recorded in the preceding track's Phase A and ONE site was
    fixed — the delta chips, now verified in production by the operator's month-switch. ENUMERATE
    EVERY SITE, deriving the corpus FROM THE SURFACES and their builders, not from a guessed list of
    markers. Reconcile against a SECOND CORPUS BUILT A DIFFERENT WAY and say how the two corpora
    differ. TWO ROUTES OVER ONE CORPUS ARE ONE ROUTE — that finding came from this track's own tense
    enumeration failing exactly that way, with clean arithmetic over the wrong scope.
4b. THE ROOT CAUSE. Establish whether the application can distinguish zero from absent AT THE DATA
    LAYER, or whether the distinction is lost before the components see it. That decides whether the
    class is a presentation fix or a payload change, and it is the question the seven faces have
    never been asked.
4c. RE-SIZE T4, which stands WITHDRAWN on the implementer's own motion. Fifteen tense sites are
    accepted as measured. One sentence: a handful of strings, or its own phase.
4d. STATE THE RELATIONSHIP BETWEEN THE TWO CLASSES. They share surfaces and share narrative
    builders, and the operator's September captures showed on-track copy on a month with no
    transactions — which reads as both at once. Say whether they are one fix or two, and if two,
    whether either is a prerequisite for the other. SEQUENCING IS THE OPERATOR'S and is not
    proposed here.

═══ PART 5 — RECOMMENDED TO THE OPERATOR, NOT AUTHORISED ═══

THE DUPLICATE CATEGORY LABEL and the ORPHANED SEPARATOR BULLET on the activity rows. Both are render
defects at every width, both referred out to the conventions phase, which is two phases away.
CHANNEL RECOMMENDATION: fold them into this cycle. Two string-level defects in files this cycle is
already touching, and the referral was made when the cycle was narrow. NOT AUTHORISED BY THIS BLOCK —
if the operator rules them in, they ship with their own per-site treatment and their own check, not
appended to an approved set.

═══ THE COMMIT AND THE CLOSE-OUT ═══

ONE IMPLEMENTATION COMMIT carries Parts 1 and 2. Parts 3 and 4 are report-only and ride the docs half.
If a gate stops one part, THE OTHER PART STILL SHIPS — say which stopped and why.

CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS; missing any is an auto-return. Both verbatim test
tails with the Test Files summary line and captured exit codes, each command carrying a resolution
proof and a non-matching negative control shown exiting 0; both verbatim typechecks with exit codes
and byte counts; the baseline as a DELTA with its absolute RE-DERIVED AFTER THE LAST EDIT — after the
LAST edit, not the largest, which is what caught this cycle's red. The api suite is RUN because the
contract test reads the frontend fixture. Predicted deltas stated IN ADVANCE per part, and NAMED
FORCED EDITS predicted with none being a valid answer. A MISS IS A QUESTION, NEVER AN ADJUSTMENT.
  ASSERT THE NEGATIVE DELIVERABLES POSITIVELY: zero physical-property additions with the pattern
  shown discriminating; no new external origin and no Caddyfile change; the standing-rules file
  untouched; the three named regression files green AND untouched by empty status on those paths;
  primitives direction-free if touched, and say whether they were.
  DECLARE COVERAGE GAPS PER ITEM. Part 1 is a media-query change that jsdom cannot evaluate at all,
  so its gap is wider than a layout gap — say so rather than letting a plus-zero delta read as
  adequacy.

CONSTRAINTS: no renames; pinned strings untouched including the FAB's label and tooltip and the two
legal test identifiers; the FAB topology untouched; QuickAdd internals untouchable. No convention
work, no cache work, and no ZERO or TENSE work — Part 4 measures and proposes nothing. The e2e suite
is not run, repaired, revived or deleted. Queued items stay queued: the KPI enclosure with the design
track, the cross-tab regime and the import column-mapping requirement with their triggers, item (vi)
deferred pending the 320 observation. THE 320 TOP-UP REMAINS OUTSTANDING and its absence is not a
pass.

PERSISTENCE. This block persists ALONE — one block per message — appending after what is on disk.
DERIVE THE POSITION FROM THE FILE, not from this clause: this track has now had two blocks predict
their own position from a state that had already moved, and one halt spent resolving it. State the
measured position, the payload sweep under both operative patterns with the two figures reported, and
the post-append composite with first, last, duplicates, breaks and both reconciliation routes,
enumeration PRINTED IN FILE ORDER. A disagreement between the two patterns HALTS THE WRITE AND IS
REPORTED, not remedied, where the text is the channel's. Re-derive the unpushed count by both routes
or do not state it. Provenance RELAYED. Amend the completeness note to record the persisted set, the
widened cadence with its collapsed steps and its four named gates, the red's provenance and the
suite-is-the-instrument finding, and the deploy recommendation as offered-and-not-adopted.

MOB-R21 — PART 1 IS ACCEPTED. GATE 4's FIRING IS RATIFIED AND THE TWO APPROVED CHANGES ARE IN
DIRECT CONFLICT. The pre-check enumerated a desktop-only menu and its mobile counterpart is
UNREPORTED. Four parts are authorised in one cycle. The deploy recommendation is ESCALATED on new
evidence.

CADENCE. Issued under test (a) and (b). THE OPERATOR'S WIDER-CADENCE INSTRUCTION IS RECORDED AS
STANDING AND CARRIES INTO THE HANDOFF PROMPT FOR SUCCESSOR CONVERSATIONS: more authorised per block,
implementation collapsed into the measuring cycle where the surface is enumerable, clarity preserved,
and the named gates and stop-and-asks NOT collapsed. That last clause is the condition the instruction
runs on, not a hedge against it — a wider cycle runs further before anyone sees it, so the points where
it must stop are what make the width safe.

PART 1 IS ACCEPTED AND THE IMPLEMENTATION IS BETTER THAN THE MANDATE ASKED FOR. Two declarations on the
shared button and input primitives cover all one hundred and ninety call sites INCLUDING THE SIXTY-ONE
THAT OVERRIDE HEIGHT IN-TAG, which a per-variant change to the size table would have missed entirely.
Using a minimum rather than a fixed height is what makes that work and is also what discharges Gate 2
without a stop-and-ask: a floor raises without capping, so the pinned FAB is untouched by construction
rather than by exclusion.
  GATE 1's CONTROL CORRECTION IS THE BEST INSTRUMENT WORK IN THE REPORT. The first control DID NOT FIRE
  because it searched for a legacy media-query form while the installed version emits range syntax. That
  was noticed, named, and corrected — so the positive result rests on a control shown firing rather than
  standing alone. A non-firing control reads exactly like a true negative, and this is the second time
  in three cycles that an assumed output format nearly produced a confident wrong answer.
  THE VARIANT WAS ESTABLISHED BY COMPILING A PROBE AGAINST THE INSTALLED PACKAGE rather than by grepping
  a bundle. That is deriving the vocabulary from the artifact, on the axis where this project has now
  taken five misses.
  THE COVERAGE GAP IS CORRECTLY STATED AS WIDER THAN A LAYOUT GAP: jsdom cannot evaluate a media query
  at all, so the change is invisible to the suite in BOTH directions, and a desktop responsive mode
  reports a fine pointer and cannot verify it either. The only instrument is a physical touch device.
  THE DEVICE-VERSUS-WIDTH DIVERGENCE IS REPORTED AND NOT RESOLVED, as instructed, and the observation
  that the disagreeing surfaces are exactly the ones this phase has been fixing is the implementer's.
  THE PERSIST-FIRST INVERSION IS ACCEPTED AND NAMED. One step ran before the block was on disk; both
  commits landed in the same turn with the docs half first, and the inversion was declared rather than
  passed over. Accepted because nothing crossed a boundary unpersisted, which is what the rule protects.

PART 3 IS DISCHARGED. Item (v) was the only gated finding and was already withdrawn; everything else
entering the proposal or the observation list carries no width or media gate, with the one file holding
six shown to scope them to a single dialog component.

PART 4 IS CORRECTLY NOT DONE AND THE REFUSAL IS RATIFIED. Delivering a zero-class enumeration, a
data-layer root-cause question, a re-sizing and a two-class relationship thinly, behind two
implementations, would have produced exactly the clean-arithmetic-over-wrong-scope failure that Part 4a
was written to prevent — a failure this track has already paid for once. REPORTED AS NOT DONE RATHER
THAN DONE BADLY IS THE CORRECT CHOICE.
  AND IT IS A CORRECTION TO THE CHANNEL'S READING OF THE WIDER CADENCE. The preceding block reasoned
  that a measurement parallelises safely with an implementation because it produces no code and
  therefore no second verification round. THAT REASONING WAS ABOUT COMMITS AND THE BINDING CONSTRAINT
  IS ATTENTION. Measurement quality degrades when it runs behind implementation in the same report, and
  a degraded measurement is worse than a deferred one because it looks like an answer. WIDER CYCLES MEAN
  MORE IMPLEMENTATION PER CYCLE, NOT MEASUREMENT CRAMMED BEHIND IMPLEMENTATION. Part 4 gets its own
  cycle below with nothing else in it.

═══ GATE 4 IS RATIFIED AND THE CONFLICT IS THE FINDING ═══

THE ARITHMETIC IS CHECKED AND IT HOLDS. Two hundred and eighty available at 320 after the horizontal
padding; forty for the brand mark, twelve for its gap, sixteen between the brand and action blocks, one
hundred and thirty-two for three icon controls at the forty-four-pixel minimum, sixteen for the two gaps
between them — sixty-four remaining for a two-line brand block whose longer line is seventeen characters.
That is under four pixels per character and it does not fit. With today's two controls the same
arithmetic leaves one hundred and sixteen and does fit.
  THE FIXED SUBTOTAL IS DERIVED AND SUFFICIENT, and the report is right that the text width is a
  rendered property jsdom cannot measure — it does not need to be measured, because the residue is
  already too small by a wide margin. A DERIVED IMPOSSIBILITY DOES NOT NEED AN OBSERVATION.
  PART 1 IS WHAT MADE PART 2 INFEASIBLE, AND THIS IS THE THING TO RECORD. Both were approved in the
  same block, by two separate operator rulings, and neither ruling could see the other's consequence.
  The forty-four-pixel minimum is the term that pushes the header over. TWO INDEPENDENTLY CORRECT
  DECISIONS PRODUCED AN INFEASIBLE COMBINATION, and the only reason it surfaced before code was written
  is that the block required the header row be MEASURED at 320 rather than assumed to fit.
  NOTHING IN THE HEADER ROW WAS SHRUNK TO MAKE IT FIT, correctly. The brand mark is a rationed brass
  slot and the ration lives in that row.

THE PRE-CHECK REFUTED THE RULING'S PREMISE, AND THAT IS A SUCCESS. Both the operator's three options and
the channel's framing assumed the mobile header held a dark-mode control, a menu, and room for a third.
IT DOES NOT: the user menu and the command palette are both desktop-gated, so the mobile header holds
two controls and no menu at all. The channel described this to the operator as "a third round button in
a corner you already have two in" — the two are not what the channel said they were.

═══ THE UNREPORTED HALF — OWED, AND IT MAY MAKE PART 2 MOOT ═══

THE PRE-CHECK ENUMERATED A MENU AND THEN ESTABLISHED THAT THE MENU DOES NOT RENDER ON MOBILE. What
renders on mobile in its place is NOT REPORTED. The operator reached the profile page on his phone, so a
route exists and it is unenumerated.
  THIS IS THE DECLARATION-WITHOUT-ITS-RENDER-CONDITION CLASS, one cycle after the item withdrawn for it
  and in the same report that discharged Part 3 for exactly this property. The strings were read from a
  container and the container's render gate was read separately, and the two were not composed.
  OWED, AND IT IS THE LEAD ITEM BELOW: enumerate what the MOBILE header's second control opens — the
  full contents in order, every label and accessible name, and whether a profile entry is among them.
  Report the strings. Then state, for every route to the profile page that exists at phone width, what
  it is and how many steps it takes.
  IF PROFILE ALREADY SITS IN THE MOBILE DRAWER, THE OPERATOR'S PROBLEM IS PROMINENCE AND LABELLING
  RATHER THAN ABSENCE, and the remedy is inside a surface that costs no header space and clears Gate 4
  entirely. That is the outcome the channel expects and it is offered to be falsified.

═══ PART 2 RE-SOLVED — FOUR OPTIONS, PRE-AUTHORISED BY OUTCOME ═══

The operator ruled a header control from three options, none of which is feasible as ruled at 320
alongside Part 1. HIS RULING IS NOT OVERRIDDEN; the options it chose between were built on a premise the
pre-check has now refuted, so the choice is put again with the real premise.

2A. PROFILE IS ALREADY IN THE MOBILE DRAWER. Implement prominence within that drawer — position, and the
    ONE entry's label if it is not already recognisable as account-and-settings. AUTHORISED NARROWLY:
    ordering and one label. A general restructure is a stop-and-ask. No header change, Gate 4 not
    engaged.
2B. PROFILE IS NOT IN THE MOBILE DRAWER. Add it there. AUTHORISED. One entry, matching the drawer's
    existing entry pattern, with its accessible name stated. No header change.
2C. THERE IS NO MOBILE DRAWER AT ALL — the second control is something else entirely. STOP AND REPORT
    with the enumeration. A new mobile navigation surface is structural and is not authorised.
2D. THE HEADER CONTROL AT 320 remains off the table while Gate 4 holds. Do not propose shrinking the
    brand block, hiding the tagline, or reducing the touch minimum to make room — the first two are
    design-track decisions under the brass ration and the third reverses an operator ruling. IF the
    drawer route is implemented and the operator still wants a header control, that is a fresh
    question with the arithmetic already on the record.

═══ PART 5 — CONDITIONAL, AND IT SHIPS ONLY ON AN OPERATOR RULING ═══

The duplicate category label and the orphaned separator bullet on the activity rows. Both were referred
out to the conventions phase when this cycle was narrow. THE CHANNEL RECOMMENDS FOLDING THEM IN and the
operator's ruling is pending.
  IF RULED IN: ship them in the same commit with per-site treatment — file:line, the condition producing
  the duplicate, the condition producing the orphan, and one discriminating test each with its negative
  case stated. These are render defects at every width, so unlike the layout items they ARE testable and
  a declared coverage gap is NOT the right answer here.
  IF NOT RULED IN: untouched, still referred out.

═══ PART 6 — ITS OWN CYCLE, NOTHING ELSE IN IT ═══

THE ZERO-VERSUS-NO-DATA AND TENSE MEASUREMENT, carried forward unchanged and unshortened: enumerate
every zero-class site with the corpus derived FROM THE SURFACES and their builders, reconciled against a
SECOND CORPUS BUILT A DIFFERENT WAY with the difference between the two corpora stated; establish whether
the application can distinguish zero from absent AT THE DATA LAYER, which decides whether the class is a
presentation fix or a payload change; re-size T4, which stands withdrawn; and state whether the two
classes are one fix or two and whether either gates the other. REPORT ONLY, no code, sequencing is the
operator's. RUN IT AS ITS OWN CYCLE AFTER THIS ONE — not appended to it.

═══ THE DEPLOY — ESCALATED FROM A RECOMMENDATION ON NEW EVIDENCE ═══

THE CHANNEL HAS RECOMMENDED THIS TWICE AND THE GROUND HAS CHANGED, SO IT IS RESTATED RATHER THAN
REPEATED. Eighteen commits are unpushed. THREE UNVERIFIED LAYERS NOW SIT ON THE SAME SURFACES: the cache
work, the responsive commit, and the touch minimum. Gate 3 was DEFERRED TO THE OBSERVATION ROUND because
the interaction it tests is rendered — and the implementer's own checks 2 and 3 CANNOT ATTRIBUTE A
FAILURE between the responsive change and the touch change, because both alter the same dialog footers
and toolbars.
  THIS IS NO LONGER CAUTION. It is that the next observation round cannot produce an attributable result.
  A failed check would establish that something is wrong without establishing what, and the remedy would
  then be guesswork on a live surface.
  STILL THE OPERATOR'S, AND NOTHING WAITS ON IT. Every part above proceeds. If the push has not happened
  when the report is written, SAY SO and name which checks are therefore unattributable rather than
  letting their absence read as a pass.

═══ THE COMMIT AND THE CLOSE-OUT ═══

ONE IMPLEMENTATION COMMIT carries the resolved Part 2 and, if ruled in, Part 5. The drawer enumeration
rides the same report. If a gate stops a part, THE OTHER PARTS STILL SHIP and the report says which
stopped and why.

CLOSE-OUT CARRIES THE THREE MANDATORY SECTIONS; missing any is an auto-return. Both verbatim test tails
with the Test Files summary line and captured exit codes, each command with a resolution proof and a
non-matching negative control shown exiting 0; both verbatim typechecks with exit codes and byte counts;
the baseline as a DELTA with its absolute RE-DERIVED AFTER THE LAST EDIT — after the last, not the
largest, which is what caught the previous cycle's red. The api suite is RUN because the contract test
reads the frontend fixture, with the count and the empty allowlist derived FROM THE FILE. Predicted
deltas stated in advance per part; NAMED FORCED EDITS predicted, with none a valid answer. A MISS IS A
QUESTION, NEVER AN ADJUSTMENT.
  ASSERT THE NEGATIVE DELIVERABLES POSITIVELY: zero physical-property additions with the pattern shown
  discriminating against the operative baseline of thirty-two sites across NINE files; no new external
  origin and no Caddyfile change; the standing-rules file untouched; the three named regression files
  green AND untouched by empty status on those paths; primitives direction-free if touched, and say
  whether they were.
  DECLARE COVERAGE GAPS PER ITEM — and note that the Part 2 remedies are MENU CONTENT rather than
  layout, so they are testable and a declared gap is not the right answer for them.

CONSTRAINTS: no renames; pinned strings untouched including the FAB's label and tooltip and the two legal
test identifiers; the FAB topology untouched; QuickAdd internals untouchable; the brass ration holds and
nothing in the header row is restyled, recoloured or re-scaled. No convention work beyond Part 5 if
ruled in, no cache work, no zero or tense work. The e2e suite is not run, repaired, revived or deleted.
Queued items stay queued: the KPI enclosure with the design track, the cross-tab regime and the import
column-mapping requirement with their triggers, item (vi) deferred pending the 320 observation. THE 320
TOP-UP REMAINS OUTSTANDING and its absence is not a pass.

PERSISTENCE. This block persists ALONE — one block per message. DERIVE THE POSITION FROM THE FILE, never
from this clause: this track has had two blocks predict their own position from a state that had already
moved, and a halt spent resolving it. Report the measured position, the payload sweep under both
operative patterns with both figures, and the post-append composite with first, last, duplicates, breaks
and both reconciliation routes, enumeration PRINTED IN FILE ORDER. A disagreement between the patterns
HALTS THE WRITE AND IS REPORTED, not remedied, where the text is the channel's. Re-derive the unpushed
count by both routes or do not state it. Provenance RELAYED. Amend the completeness note to record the
persisted set; the standing wider-cadence instruction with its non-collapsible gates AND its correction
that measurement does not parallelise behind implementation; Gate 4's firing with the two-approved-
changes-in-conflict finding; the refuted premise and the unreported mobile route; and the escalated
deploy recommendation as offered-and-not-adopted.

MOB-R22 — OUTCOME 2A IS ACCEPTED AND THE ROOT CAUSE WAS A LABEL. The position-not-taken reading is
RATIFIED and it is the sharpest judgement in the cycle. Part 6 OPENS as its own cycle, WIDENED to
implement behind a named gate. One reporting form changed unannounced.

CADENCE. Issued under test (a) and (c), under the standing wider-cadence instruction.

THE CYCLE IS ACCEPTED. Three mandatory sections present and green, both suites with the Test Files
summary line and captured exit codes, both typechecks at zero bytes, the api suite run because the
contract test reads the frontend fixture, the baseline moved two hundred and sixteen across
forty-two to two hundred and nineteen across forty-three and RECONCILED TWO WAYS — three test
blocks counted against three tests, with the absence of parameterised cases checked rather than
assumed, which is the step that makes a test count a measurement instead of a guess. Negative
deliverables behind FIRING controls, including a physical-property control shown matching a real
site and NOT matching two near-miss forms.

THE ROOT CAUSE IS A LABEL AND IT EXPLAINS THE OPERATOR'S REPORT EXACTLY. The profile entry existed
at phone width, two steps in, carrying the account holder's first name as its ONLY accessible name.
A control labelled with a person's name does not read as a route to account settings — to a
first-time user it reads as decoration or as a greeting. THE OPERATOR SAID HE WOULD HAVE FOUND IT
HAD HE NOT KNOWN IT EXISTED, and that is precisely what a correctly-placed control with the wrong
label produces.
  THE OPTION SET WE WERE CHOOSING FROM WAS THE WRONG SET. Three placements were offered and ruled
  between; none of them was the defect. The pre-check that refuted the premise, and the enumeration
  that followed it, produced a remedy costing no header space, engaging no gate, and fixing the
  cause. THE RULING IS NOT OVERRIDDEN — it was a ruling about placement, and placement was not the
  problem.

THE POSITION WAS NOT MOVED AND THE REASON IS RIGHT. The authorisation read "ordering and one label."
The entry sits in a footer container rather than in the navigation list, so changing its position
means moving it BETWEEN CONTAINERS, which is a restructure and not a reorder. Reporting that rather
than taking it is the correct reading of a narrow authorisation, and reading a container boundary as
the edge of "ordering" is a judgement the block did not spell out. The secondary point — that a
footer is the conventional home for account controls — is a reason not to want the move anyway, and
it is offered as a reason rather than used as the authorisation.

THE TWO-MUTATION ATTRIBUTION IS THE PART TO KEEP. The first mutation restored the pre-change form
and took all three cases red, which proves the tests fail in the changed world's absence. THAT ALONE
WOULD NOT HAVE PROVEN THE VISIBLE-LABEL ASSERTION DOES ANY WORK — it could have been carried by the
accessible-name assertion beside it. The second mutation retained the accessible name and removed
only the visible label, taking EXACTLY ONE case red with the other two green. THE GREEN IS THE
EVIDENCE: it attributes the failure to one assertion rather than to the set. Both restorations
byte-identical.
  AND THE FIXTURE HELPER DERIVES FROM ITS ARGUMENT rather than reproducing the sibling's hardcoded
  value. A constant would have satisfied the assertion even if the component passed nothing through
  — an instrument sharing its value with what it measures cannot detect a fault in it.

THE RECOVERED PROVENANCE IS RATIFIED AND IT IS THE EVENT OF THIS CYCLE. The session compacted
between the block's arrival and its persistence, leaving a PARAPHRASE as the surviving artifact. A
paraphrase cannot be persisted as a verbatim block, and persisting one would have written a
reconstructed ruling into the permanent record — the class this project rates WORSE than an
uncheckable one, because it is checkable and wrong. The bytes were recovered from the session
transcript, appended by pipe rather than retyped, and the provenance recorded as RECOVERED rather
than as held.
  THE RECONSTRUCTION WAS VERIFIED AGAINST THE FILE, which is the step that turns recovery into
  evidence: the pre-append state was reproduced byte-identically, with a control deleting a
  different span of the same length shown NOT to reproduce it. That control is what separates "my
  reconstruction matches" from "any reconstruction of that size would match."
  NO RULING CROSSES A BOUNDARY, AND THIS IS THAT RULE MEETING A BOUNDARY IT DID NOT CHOOSE. The
  standing form holds: the canonical source of a block is the channel's own emission; the working
  copy is a convenience downstream of it; when it is gone, recover from the emission and SAY
  RECOVERED.

THE THREE ENUMERATING-MOCK FACTORIES ARE A CORRECT SELF-REPORT AND THE LESSON IS IN THE STOPPING.
Two were found by iteration — run, fail, add, repeat — and the third by ENUMERATING every named
import the component takes from each mocked module in one pass, which found it BEFORE it failed.
The first two were wasted cycles and are named as wasted rather than folded into the narrative as
progress. Iteration on a mock factory is a search whose stopping condition is "the last failure
stopped," which is not a stopping condition at all; enumeration has one. This is the
enumerating-factory class and it now has an instance where the two methods ran side by side.

ONE REPORTING FORM CHANGED WITHOUT BEING NAMED, and it is raised because the implementer itself
adopted the rule. The allowlist has been reported as an empty literal in every prior cycle and is
reported this cycle as an empty body. Both claim emptiness and the claim is almost certainly right.
BUT A CONTROL RUNS IN ONE FORM ACROSS CYCLES AND A CHANGE TO ITS FORM IS NAMED IN THE SAME BREATH —
comparability across runs is the entire value of a repeated figure. ONE LINE: was the derivation
changed, or is this the same command reported differently? Not a return.

═══ PART 5 — STILL CONDITIONAL ═══

The duplicate category label and the orphaned separator bullet. No operator ruling has arrived and
the channel's recommendation to fold them in STANDS UNADOPTED — a cycle passing does not adopt it.
IF RULED IN: per-site treatment with the condition producing each defect named, and one
discriminating test each with its negative case stated. These are render defects at every width and
are therefore TESTABLE; a declared coverage gap is not the right answer for them.

═══ PART 6 — OPENED, AND WIDENED TO IMPLEMENT BEHIND ONE GATE ═══

ITS OWN CYCLE WITH NOTHING ELSE IN IT, as ruled when it was deferred. The widening is that it may
IMPLEMENT rather than only report — but only through the gate below, because the root-cause question
decides whether this is a presentation fix or a payload change, and those are not the same size of
work.

6a. ENUMERATE EVERY ZERO-CLASS SITE. Seven faces were recorded in the preceding track's Phase A and
    ONE was fixed — the delta chips, now verified in production by the operator's month-switch.
    DERIVE THE CORPUS FROM THE SURFACES AND THEIR BUILDERS, not from a guessed list of markers.
    RECONCILE AGAINST A SECOND CORPUS BUILT A DIFFERENT WAY and state HOW THE TWO CORPORA DIFFER,
    not merely that their counts agree. TWO ROUTES OVER ONE CORPUS ARE ONE ROUTE — that finding
    came from this track's own tense enumeration failing exactly that way, with clean arithmetic
    over the wrong scope, and the structural second corpus is what caught the site the textual one
    missed.
6b. THE ROOT CAUSE, AND IT IS THE QUESTION THE SEVEN FACES HAVE NEVER BEEN ASKED. Can the
    application distinguish zero from absent AT THE DATA LAYER, or is the distinction lost before
    the components see it? Trace one representative face end to end — payload field, wire type,
    what an absent value serialises as, and what the component receives. SHOW THE CODE AT EACH HOP.
    ** GATE A ** — IF THE DISTINCTION IS LOST AT OR BELOW THE PAYLOAD, STOP AND REPORT. That is a
    contract change spanning both packages, it touches the contract fixture and the allowlist, and
    it is NOT authorised here.
    IF THE DISTINCTION SURVIVES TO THE COMPONENTS, the class is a presentation fix and 6d proceeds.
6c. RE-SIZE T4, which stands withdrawn on the implementer's own motion. Fifteen tense sites are
    accepted as measured. One sentence: a handful of strings, or its own phase.
6d. IMPLEMENT, IF AND ONLY IF GATE A PASSES AND THE SITE COUNT IS TWELVE OR FEWER. Per site: the
    condition that currently renders the wrong thing, the condition that should, and ONE
    DISCRIMINATING TEST with its negative case stated — these are data-conditional render defects,
    not layout, so they are testable in jsdom and a declared coverage gap is NOT the right answer.
    ** GATE B ** — IF THE COUNT EXCEEDS TWELVE, stop and report the enumeration with a proposed
    grouping. A larger set is its own phase and the operator sequences it.
6e. STATE THE RELATIONSHIP BETWEEN THE TWO CLASSES. They share surfaces and share narrative
    builders, and the operator's September captures showed on-track copy on a month with no
    transactions — which reads as both classes at once. One fix or two; and if two, whether either
    gates the other. THE TENSE CLASS IS NOT IMPLEMENTED IN THIS CYCLE regardless of its size —
    sequencing is the operator's and he has not had a surviving sizing to rule on.

═══ THE DEPLOY — STATED AS A COUNT, NOT AS A REPETITION ═══

Twenty commits unpushed. THE CHANNEL HAS MADE THIS RECOMMENDATION THREE TIMES AND WILL NOT MAKE IT A
FOURTH; what follows is the inventory rather than the argument. Waiting on one push and one
observation round: the four responsive items, each carrying a declared coverage gap whose only
instrument is the operator's eyes; the touch minimum, invisible to the suite in both directions and
unverifiable in a desktop responsive mode; Gate 3's interaction between taller controls and the
dialogs that just gained internal scroll, deferred to observation because it is rendered; item (vi),
deferred pending a 320 observation; and eleven written checks across two close-outs. THE THREE
LAYERS SIT ON THE SAME DIALOG FOOTERS AND TOOLBARS, so a failure in the next round is not
attributable between them.
  NOTHING WAITS ON IT. Part 6 proceeds. If the push has not happened when the report is written, say
  so and name which checks remain unattributable rather than letting their absence read as a pass.
  WHEN IT HAPPENS: diff against ORIGIN/MAIN, never local main; enumerate every riding commit and
  name any that is not this track's work with its CSP check; NO UI OBSERVATION IS EVIDENCE UNTIL THE
  ACTIONS RUN HAS LANDED, and the report says that it had.

CONSTRAINTS: no renames; pinned strings untouched including the FAB's label and tooltip and the two
legal test identifiers; the FAB topology untouched; QuickAdd internals untouchable; the brass ration
holds. Zero physical-property additions against the operative baseline of thirty-two sites across
NINE files, with the pattern shown discriminating. No new external origin and no Caddyfile change,
asserted rather than omitted. No convention work beyond Part 5 if ruled in, no cache work, no
responsive work, no tense implementation. The e2e suite is not run, repaired, revived or deleted.
Queued items stay queued: the KPI enclosure with the design track, the cross-tab regime and the
import column-mapping requirement with their triggers. THE 320 TOP-UP REMAINS OUTSTANDING and its
absence is not a pass.

PERSISTENCE. This block persists ALONE — one block per message. DERIVE THE POSITION FROM THE FILE,
never from this clause. Report the measured position, the payload sweep under both operative patterns
with both figures, and the post-append composite with first, last, duplicates, breaks and both
reconciliation routes, enumeration PRINTED IN FILE ORDER. A disagreement between the patterns HALTS
THE WRITE AND IS REPORTED, not remedied, where the text is the channel's. Re-derive the unpushed
count by both routes or do not state it. Provenance RELAYED — and if this block's bytes are lost to a
session boundary before persistence, RECOVER FROM THE EMISSION AND SAY RECOVERED, verifying the
reconstruction against the file with a control as this cycle did. Amend the completeness note to
record the persisted set; the label root cause with the refuted option set; the container-boundary
reading of a narrow authorisation; the two-mutation attribution form; the recovered provenance with
its verification control; the enumerating-factory instance with both methods side by side; and the
deploy inventory.

MOB-R23 — GATE A PASSES, GATE B FIRES, AND THE SEQUENCING IS NOW SETTLED BY EVIDENCE. "Seven faces"
is FALSIFIED and the channel propagated it three times. Group 1 is authorised CONDITIONALLY. The
tense class is its own phase and the zero class gates it.

CADENCE. Issued under test (a) and (b), under the standing wider-cadence instruction.

THE PERSISTENCE IS ACCEPTED. 22/22 agreeing, contiguous, position DERIVED FROM THE FILE rather than
from the clause — which is the correction that ends two cycles of blocks predicting their own
position from a state that had already moved. The payload sweep was SHOWN DISCRIMINATING by
injecting a second header into a copy, so the one-and-one is a measurement rather than a pattern
that might not fire.

THE PROVENANCE CORRECTION IS ACCEPTED AND THE IMPLEMENTER IS RIGHT. The preceding block instructed
that bytes lost to a boundary be marked RECOVERED. Nothing was lost this cycle; the transcript was a
BYTE-EXACT CONDUIT WITH NO TYPING STEP, which is the ordinary relay path and not recovery. THE
DISTINCTION IS WHETHER THE WORKING COPY WAS LOST, not which surface the bytes travelled over.
Marking an ordinary relay as RECOVERED would have inflated the record's count of boundary events and
made the genuine one harder to find.

THE ALLOWLIST FORM IS RESOLVED IN ONE LINE AS ASKED: the derivation changed, the fact did not, and
the substitution was unnamed. Both forms re-run against the same file agree, the standing form is
shown matching once and returning zero against a non-empty allowlist, and it is restored going
forward. A CONTROL RUNS IN ONE FORM ACROSS CYCLES — that rule was adopted by the implementer two
cycles ago and this is it catching its own author.

═══ "SEVEN FACES" IS FALSIFIED AND THE CHANNEL CARRIED IT THREE TIMES ═══

THE ARITHMETIC IS CONFIRMED INDEPENDENTLY FROM THE RECORD. It declares EIGHT findings, then SEVEN as
one root cause, then THE REMAINING FOUR. Seven plus four is eleven. The root-cause sentence
ENUMERATES FOUR EXAMPLES and four plus four closes at eight. THE OPERATIVE FIGURE IS FOUR, and no
corpus was taken from that list — the enumeration was derived from the surfaces, so nothing
downstream inherits the error.
  THE PROVENANCE IS THE CHANNEL'S. "Seven faces" appeared in this track's handoff, and the channel
  repeated it in three consecutive blocks without once opening the record it came from — including in
  the block that instructed the implementer to derive the corpus from the surfaces rather than from
  that list.
  THIS IS THE THIRD INHERITED FIGURE THIS TRACK HAS FALSIFIED, and all three are the same failure:
  thirty-two sites across twelve files, which was nine and was contradicted by the record's own
  enumeration two lines below the prose; a column width whose site sits behind a desktop gate and
  never renders at phone width; and now this. EACH WAS READ FROM A DOCUMENT ABOUT THE ARTIFACT
  RATHER THAN FROM THE ARTIFACT, which is the rule the channel enforces on every block it writes.
  NO NEW STANDING LINE. The count stays at SIX across four tracks. The rule exists; the channel was
  not applying it to itself.
  RECORD THE CORRECTION ADJACENT in this track's file. THE SOURCE RECORD IS A HISTORICAL RECORD AND
  IS NOT EDITED.

═══ GATE A PASSES, AND THE PROOF IS BETTER THAN THE MANDATE ASKED FOR ═══

TWO DATABASE CHECK CONSTRAINTS, both in the initial migration, enforce strictly positive amounts on
transactions and on budgets. ZERO IS THEREFORE AN UNATTAINABLE SUM and both series at zero is
equivalent to no rows. That is an invariant enforced BELOW the application, which no component or
serialiser can violate — stronger than an argument from how the code currently happens to construct
the value, because construction can change and a constraint cannot without a migration.

THE MANDATE'S "ONE REPRESENTATIVE FACE" INSTRUCTION WAS WRONG AND THE IMPLEMENTER SAID SO. There are
TWO FAMILIES with different behaviour: the months family pre-seeds zeros and carries no count or
flag in the payload, losing the distinction in transit but losslessly recoverable at the client; the
budget family never loses it at all, with an absent key and a client-side collapse. ONE TRACE WOULD
HAVE GIVEN THE WRONG ANSWER FOR THE OTHER FAMILY. A representative sample presupposes homogeneity,
and homogeneity is the thing being measured — asking for one representative is asking the
measurement to assume its own result.

═══ GATE B FIRES AND THE GROUPING IS ACCEPTED ═══

SEVENTEEN SITES, above the threshold of twelve, so implementation does not proceed under the
preceding block and the operator sequences it. The grouping is KEYED ON THE SIGNAL EACH GROUP NEEDS
rather than on the page each appears on, which is the right axis: sites needing the same signal are
one change, and sites on the same page needing different signals are not.

THE SHARPEST FINDING IN THE REPORT IS THAT GROUP 1 NEEDS NO NEW DERIVATION. The predicate already
exists, is already passed into the component holding three of its sites, and IS ALREADY APPLIED TO
THE STATUS LABEL AT THE SAME SITE — but not to the percentage, its caption, or the progress bar. The
guard is not missing; it is PARTIALLY APPLIED. That is why the surface can say "over budget" and
"0.0% used" in one card: two renderings of one state, one guarded and one not.

═══ GROUP 1 — AUTHORISED CONDITIONALLY ON AN OPERATOR RULING ═══

TEN SITES. CHANNEL RECOMMENDATION, offered and not adopted: ship Group 1 as its own cycle now. It is
under the threshold on its own count, it introduces no new signal, and it is the majority of the
class. IF THE OPERATOR RULES IT IN, everything needed is below so no cycle is lost.

G1a. PER SITE: file:line, the condition currently rendering, the condition that should, and which
     existing predicate supplies it. Prefer extending the EXISTING partially-applied guard over
     introducing a parallel one — a second predicate for the same state is how this defect was born.
G1b. ONE DISCRIMINATING TEST PER DISTINCT RENDER PATH, not per site. These are DATA-CONDITIONAL
     RENDER defects, testable in jsdom, so a declared coverage gap is NOT the right answer. Each
     test states what it reads IF THE CHANGE HAD NOT LANDED. RED-FIRST with the discriminating value
     captured.
     AND ATTRIBUTE THE RED as this track has twice done well: a mutation taking every case red proves
     the set fails in the changed world's absence and proves nothing about which assertion carries
     which claim. WHERE TWO ASSERTIONS COVER ONE SITE, run a second mutation that breaks only one and
     show exactly one case red with the others green.
G1c. STATE WHAT EACH SITE RENDERS AFTER, in words. A guard can be correct and still leave a blank
     where a sentence should be — suppressing a wrong number is not the same as saying the right
     thing. If any site's correct output is "show nothing", say so explicitly rather than leaving it
     to be discovered on screen.
     ** GATE C ** — IF ANY SITE NEEDS NEW COPY rather than suppression, STOP AND REPORT that site.
     New user-facing sentences are a product decision and are not authorised here. The others ship.
G1d. GROUPS 2 AND 3 ARE NOT TOUCHED. Seven sites across two signals, sequenced by the operator after
     Group 1 lands.

═══ 6c AND 6e — BOTH ACCEPTED, AND 6e SETTLES THE SEQUENCE ═══

THE TENSE CLASS IS ITS OWN PHASE. An independent re-derivation returns sixty-one sites against the
accepted fifteen, and the implementer's reading is right that THE NUMBER IS NOT THE POINT — the
corpus boundary is unsettled, and sizing off an unsettled boundary is exactly the failure this track
has already paid for once. DECLINING TO SIZE IT IS THE CORRECT ANSWER FOR A SECOND CYCLE RUNNING and
it is ratified rather than pushed.

6e IS ACCEPTED AND IT REPLACES A PREFERENCE WITH A FINDING. The zero class GATES the tense class:
both turn on the same predicate; a tense fix alone still asserts present tense about an empty period;
a zero guard alone renders a correct claim in the wrong tense; and THE TENSE REWRITE CANNOT CHOOSE A
TENSE UNTIL SOMETHING TELLS IT THE PERIOD IS EMPTY. The operator's September capture is both classes
firing at one site.
  THE SEQUENCE IS THEREFORE ZERO FIRST, THEN TENSE, and that is no longer the channel's ordering
  preference — it is a dependency established from source. The operator retains the sequencing
  decision; what has changed is that reversing it would mean doing the tense work twice.

═══ TWO INSTRUMENT SELF-REPORTS ═══

THE PATH-MATCHING EXCLUSION IS THE THIRD OF ITS FAMILY and the family is now legible: a tool's output
format carries more than the content being filtered, and a filter applied to the whole line matches
the part nobody was thinking about. Filename prefixes, stripped filenames, and truncation to the
last delimiter — three instances, three different mechanisms, ONE CAUSE: the filter was written
against the intended content rather than against the actual output. IT RETURNED ZERO FROM A
FOUR-STAGE PIPE AND WAS FOUND BY BISECTION, which is the right instrument for a pipeline whose
failure is silent at every stage.

THE TRIPWIRE EARNED ITS KEEP ON LIVE TEXT FOR THE FIRST TIME. Strict returned zero, the tripwire
returned one, and the patterns disagreed on the implementer's own line-wrapping. IT WAS REWRAPPED
RATHER THAN HALTED BECAUSE THE TEXT WAS THE IMPLEMENTER'S — author and editor the same party, so the
licence question does not arise — and both patterns re-measured with the control still firing. The
instrument was adopted on a synthetic probe; this is the first time the real file produced the case
it was built for.

═══ STILL OPEN ═══

PART 5 IS UNRULED FOR A THIRD CYCLE and stays untouched. The recommendation to fold in STANDS
UNADOPTED — cycles passing do not adopt it. If ruled in, per-site treatment with the condition
producing each defect named and one discriminating test each.
THE DEPLOY: twenty-two commits. The inventory was stated in the preceding block and is not restated.
THE 320 TOP-UP is outstanding and its absence is not a pass; item (vi) waits on it.
QUEUED, unchanged, with their triggers: the KPI enclosure with the design track, the cross-tab
regime, the import column-mapping requirement, the month-mismatch product question, the formatter
one-ulp divergence with the conventions phase.

CONSTRAINTS: no renames; pinned strings untouched including the FAB's label and tooltip and the two
legal test identifiers; the FAB topology untouched; QuickAdd internals untouchable; the brass ration
holds. Zero physical-property additions against the operative baseline of thirty-two sites across
NINE files, pattern shown discriminating. No new external origin and no Caddyfile change, asserted
rather than omitted. No convention work beyond Part 5 if ruled in, no cache work, no responsive work,
no tense implementation. The e2e suite is not run, repaired, revived or deleted.

CLOSE-OUT, if Group 1 ships: the three mandatory sections, both suites with the Test Files summary
line and captured exit codes behind resolution proofs and a non-matching negative control shown
exiting 0, both typechecks with exit codes and byte counts, the baseline as a DELTA with its absolute
RE-DERIVED AFTER THE LAST EDIT and reconciled two ways as this cycle did. The api suite is RUN
because the contract test reads the frontend fixture. Predicted deltas in advance; named forced edits
predicted, with none a valid answer. A MISS IS A QUESTION, NEVER AN ADJUSTMENT.

PERSISTENCE. This block persists ALONE. DERIVE THE POSITION FROM THE FILE. Report the measured
position, the payload sweep under both operative patterns with both figures and the sweep shown
discriminating, and the post-append composite with first, last, duplicates, breaks and both
reconciliation routes, enumeration PRINTED IN FILE ORDER. A disagreement between the patterns HALTS
THE WRITE AND IS REPORTED where the text is the channel's. Re-derive the unpushed count by both
routes or do not state it. Provenance RELAYED. Amend the completeness note to record the persisted
set; the four-not-seven correction with the channel's triple propagation and the third-inherited-
figure pattern; Gate A's constraint-level proof and the two-families finding that refuted the
representative-face instruction; Gate B's firing with the three-group keying; the partially-applied-
guard finding; the zero-gates-tense dependency; and the third path-matching instrument failure.

MOB-R24 — THE CYCLE IS ACCEPTED AND THE DEPLOY IS RECORDED. The red-proof instrument failure is the
sharpest finding of this track. An out-of-channel ruling is cited and needs its text. Gate C's D2
goes to the operator. Groups 2 and 3 are authorised.

CADENCE. Issued under test (a) and (c).

THE DEPLOY IS RECORDED. Twenty-three commits pushed, all this track's work with no foreign riders so
no third-party CSP check was owed, no deploy-directory change, no new external origin, zero
migrations. The Actions run completed success on the pushed head. UI OBSERVATION IS EVIDENCE AGAIN
and the operator's round is the next instrument.

THE CYCLE IS ACCEPTED. Seven sites shipped plus the two Part 5 defects. Frontend two hundred and
nineteen across forty-three to two hundred and thirty-four across forty-four, PREDICTION MET EXACTLY
and reconciled two ways — aggregate and per-file. Api unchanged, both typechecks at zero bytes,
fixture and allowlist from the file in the restored standing form, physical properties unchanged at
thirty-two across nine, named regression files untouched.

═══ THE RED-PROOF INSTRUMENT FAILURE ═══

A RED PROOF REPORTED EXIT ONE AND NO TEST HAD RUN. An unquoted two-path variable arrived as a single
argument matching nothing, and the runner exited one on "no test files found" — THE SAME EXIT CODE A
GENUINELY RED TEST PRODUCES. Both red proofs in that batch were no-ops that looked exactly like
success at proving failure.
  THIS IS THE CANONICAL CLASS AT ITS SHARPEST. An empty result is byte-identical to a command that
  did not run — and here the instrument was the one verifying that the OTHER instruments
  discriminate. A red proof that cannot distinguish "the test failed" from "the test never ran"
  proves nothing, and it fails in the reassuring direction.
  IT WAS FOUND AND REDONE WITH LITERAL PATHS, at which point the proofs were real. THE MUTATION
  ATTRIBUTION FOR THAT BATCH RESTS ENTIRELY ON THE REDONE RUNS and the record says so.
  THE DURABLE FORM, ADOPTED: A RED PROOF CARRIES A POSITIVE CONTROL. Before a non-zero exit means
  "the assertion failed", the same invocation is shown CAPABLE OF FINDING AND RUNNING THE TESTS —
  by an unmutated run reporting a test count, or by the runner's own collected-file line. A count is
  the control; an exit code alone is not.
  NO NEW STANDING LINE. The count stays at SIX. This is the existing empty-result rule reaching the
  verification instrument itself, cited not minted.

═══ TWO SELF-CORRECTIONS, BOTH ACCEPTED ═══

B6 AND B7 ARE WITHDRAWN AND THE ARITHMETIC IS RIGHT. The rows are built by mapping over the budgets
themselves, so every row HAS a budget, and the database check constraint guarantees the allocation is
positive — making the zero branch unreachable. GROUP 1 IS EIGHT SITES AND THE CLASS IS FIFTEEN. Gate
B still fires at fifteen. A count corrected downward by its own author, mid-cycle, against its own
earlier report, is the harder direction to move and it is recorded as such.

I5's PREDICATE WAS WIDENED AND THE CATCH IS THE INTERESTING PART. The first form missed a month with
real spend and no budgets; the widened form subsumes it and matches the signal a sibling site
already uses. IT WAS CAUGHT BY ANOTHER COMPONENT'S TEST — one file's assertion firing on a defect in
a different component's guard, because both render on the same page. THAT IS COINCIDENCE, NOT
COVERAGE, and it is worth naming as such: the catch was luck and the lesson is that a guard's
predicate is derived from the signal its siblings use, not invented per site.

EVERY GUARD READING ZERO AS ABSENT CARRIES A COMMENT NAMING THE DATABASE CONSTRAINT that makes zero
unattainable. That is the right instinct and it is the thing that stops a future reader from
"simplifying" a guard whose justification lives two layers down and is invisible at the call site.

THE SIX MUTATIONS ARE ACCEPTED AND THE ONE THAT REDDENED THREE CASES IS REPORTED RATHER THAN
SMOOTHED. One assertion also catches a widget's copy, so only the narrower mutation attributes that
case to its own guard. Naming which mutation attributes which case — rather than reporting that all
mutations produced red — is what makes the set evidence about individual assertions.

═══ AN OUT-OF-CHANNEL RULING IS CITED AND ITS TEXT IS OWED ═══

THE REPORT DECLARES A DEPARTURE FROM G1a "PER YOUR OPTION B RULING". NO SUCH RULING EXISTS IN THIS
CHANNEL. The operator has confirmed he answered questions directly this cycle, which is entirely his
right — he is the operator and he may rule anything at any time, through any surface.
  THE PROBLEM IS RECORD INTEGRITY, NOT AUTHORITY. A ruling that exists only in a side exchange is
  cited in a persisted report and cannot be found by a later reader, who then sees an implementer
  departing from a channel instruction on the strength of an authority with no text. That is
  indistinguishable, in the record, from a self-grant.
  OWED, AND IT IS A PASTE RATHER THAN AN ARGUMENT: the operator's question and his answer, verbatim,
  persisted adjacent with provenance OPERATOR, DIRECT, OUT-OF-CHANNEL. Nothing is re-decided.
  THE SUBSTANCE IS ACCEPTED AND IS BETTER THAN G1a's BLANKET PREFERENCE. G1a said to prefer the
  existing partially-applied guard over a parallel one. THE REPORT'S REASONING IS SHARPER: two
  fields of the SAME payload object cannot disagree with each other, while a separate query can — so
  the same-object field is the stronger guard here, and the general preference was wrong for this
  site. Reversing its own earlier stated reasoning and saying so is the right handling.
  STANDING DISPOSITION: any ruling reaching the implementer outside this channel is persisted with
  its verbatim text and an OUT-OF-CHANNEL provenance before it is acted on in a report.

═══ GATE C FIRES ON D2 — OPERATOR DECISION ═══

The on-track sentence cannot be fixed by suppression without emptying the panel it sits in, so it
needs NEW COPY. Correctly reported and not shipped — new user-facing sentences are a product
decision. TO THE OPERATOR, with the channel recommendation offered and not adopted: on an empty
period the panel should say there is nothing to assess yet rather than that nothing is wrong. "No
categories are over budget" is TRUE and MISLEADING on an account with no budgets, which is the
class's whole shape. THE OPERATOR RULES THE WORDING.

═══ GROUPS 2 AND 3 — AUTHORISED ═══

Seven sites across two signals. Same treatment as Group 1: per site the current condition, the
condition that should render, and which existing signal supplies it; prefer the signal a sibling
site already uses rather than inventing one per site; one discriminating test per distinct render
path with its negative case stated; RED-FIRST WITH A POSITIVE CONTROL ON THE RED PROOF per the
clause above; and state in words what each site renders after, because suppressing a wrong number is
not the same as saying the right thing.
  ** GATE C STILL APPLIES ** — any site needing new copy rather than suppression STOPS and is
  reported. The others ship.
  THE TENSE PHASE REMAINS GATED BEHIND THIS CLASS and is not opened.

CONSTRAINTS unchanged: no renames; pinned strings untouched; the FAB topology untouched; QuickAdd
internals untouchable; zero physical-property additions against thirty-two across nine; no new
external origin and no Caddyfile change, asserted rather than omitted; the e2e suite untouched.
Queued items stay queued.

PERSISTENCE. This block persists ALONE, position DERIVED FROM THE FILE, with the payload sweep under
both patterns shown discriminating and the post-append composite reconciled two ways, enumeration
printed in file order. Persist alongside it: the deploy record with its run identifier and head, the
withdrawn B6 and B7 with the corrected counts, the red-proof control requirement, and the
out-of-channel ruling once its text arrives. Provenance RELAYED. Re-derive the unpushed count by both
routes or do not state it.

MOB-R25 — THE REMOVAL OPENS, STAGE 1 ONLY: HIDE, DO NOT DELETE. Month Snapshot goes; safe-to-spend
goes everywhere it renders; the This Week panel STAYS minus its one safe-to-spend tile. Frontend
only. One report: persist, measure, implement, verify — unless a named gate fires.

CADENCE. Issued under test (a) — it opens a cycle and authorises implementation — and (b).

═══ THE OPERATOR RULING, VERBATIM — provenance OPERATOR, DIRECT, 2026-09-19 ═══

Given to the review channel in the prior conversation and relayed here. Persist it verbatim beside
this block. The two "…" are elisions present in the text as it reached this channel; this channel
cannot restore them and records them as elisions, not as the operator's punctuation.

  (1) "I confirm that i want to remove the Safe-to-spend feature. the whole This Week panel stay
      minus the safe-to-spend tile"
  (2) "I would like to remove the feature/object, 'Month Snapshot' on the insight page. Also, I no
      longer want to see the feature/object 'Safe to Spend Today' anywhere on the app… I want to
      keep the app as simple as possible… we can turn off the feature for a quick fix and later we
      can remove them off our codebase."

The counter was put to him once — safe-to-spend was the app's distinctive idea and a module was
built for it, so simplifying removes differentiation along with complexity — and he ruled anyway.
Recorded, not re-litigated.

═══ SCOPE ═══

REMOVED FROM VIEW: (i) Month Snapshot on Insights, entirely; (ii) every safe-to-spend render in the
app — the Home hero card, the Month Snapshot panel, and the SAFE-TO-SPEND TODAY tile inside This
Week. "Anywhere on the app" is the operator's phrase and the corpus below is built to honour it.
RETAINED: the This Week panel and its remaining contents — weekly insight, weekly pace, spending
delta. THIS DISTINCTION IS LOAD-BEARING. Removing the panel is a defect, not a simplification.
STAGE 1 = HIDE. Component files, api.ts methods, types and their unit tests STAY. Deleting code is
Stage 2, a later cycle, NOT AUTHORISED HERE.
BACKEND UNTOUCHED. No path under apps/api in this commit's diff, asserted with a positive control.
R9 and _getSafeToSpendPayloadCached keep running. Contract fixture and ALLOWLIST untouched.

═══ STEP 0 ═══

hostname; pwd — REPORTED. HEAD and origin/main by SHA. Unpushed count BY TWO ROUTES
(rev-list --count, and status -sb "ahead N"); the channel expects 3, carrying D1, D4, I4
and the persistence of the previous block — a miss is a QUESTION. ENUMERATE
WHAT YOU HOLD: every ruling, gate and outstanding item you believe is live, from your own record,
not confirmed against a list from here.
Baselines re-derived with resolution proofs and a non-matching negative control exiting 0, via the
exact deploy.yml invocations (statera-api / statera-frontend — never statera-web). Expected, not
adopted: frontend 241/45; api hermetic 873/34/61; INTEGRATION 897/10/61 with INTEGRATION="true";
both tsc 0 bytes; fixture 66; ALLOWLIST empty at frontend-contract.test.ts:54; physical-property 32
across 9. Collected-set invariance stated as such: both modes collect 907.

═══ PERSISTENCE — FIRST, BEFORE ANY CODE ═══

This block persists ALONE to docs/modules/phase4-mobile.md, position DERIVED FROM THE FILE (last is
expected to be 24), payload swept under both patterns and shown discriminating, post-append
composite reconciled two ways, enumeration printed in file order. Provenance RELAYED. The operator
ruling above persists with it, verbatim, in the out-of-channel section's form but labelled DIRECT TO
THE REVIEW CHANNEL. Persistence commit before the implementation commit.

═══ PART 1 — THE CORPUS, BY TWO ROUTES ═══

ROUTE A, STRINGS: every user-visible occurrence in apps/web/src non-test — text, aria-label, title,
tooltip, document title, CommandPalette labels and keywords, empty-state and onboarding copy — of
safe-to-spend / safe to spend / free to spend / month snapshot / runway, case-insensitive, with the
search vocabulary DERIVED FROM THE RENDERED STRINGS of the three known surfaces, not assumed.
ROUTE B, GRAPH: from each surface's component, every mount site by import, and every query whose
ONLY consumers are those surfaces.
STATE HOW THE ROUTES DIFFER and what each found that the other did not. Route A cannot see a
surface whose label is data-driven; Route B cannot see a stray string in unrelated copy.
PER SITE: file:line, its RENDER GATE (a declaration is not a render), and what renders after.

═══ PART 2 — ITEM (vi), IDENTITY FROM SOURCE ═══

Confirm from source whether SpendForecastWidget.tsx:68 — the sole text-accent-strong use, the
whitespace-nowrap figure the operator saw overflow its FREE TO SPEND tile at DESKTOP width — sits
inside a removed surface, naming its mount chain.
  INSIDE: item (vi) CLOSES BY REMOVAL; the six-option table is moot. Say so.
  NOT INSIDE: say so plainly. It stays open and is re-derived later against a DESKTOP failure,
  since the deferral's premise that the risk lived at 320 is falsified. Propose nothing this cycle.
BRASS: the removal retires the free-to-spend slot. The ration becomes logo mark and eyebrows. DO NOT
reassign the freed slot, do not delete the accent-strong token (Stage 2), restyle nothing in
the header row.

═══ PART 3 — WHAT GOES DARK, CLASSIFIED, NOT RE-SIZED ═══

For each shipped or open site this track has named — B1–B5, D1–D5, I1–I5 — state INSIDE or OUTSIDE
a removed surface, by render gate. SOME OF THIS CYCLE'S SHIPPED WORK WILL BE HIDDEN; that is
expected, not a regression. Also state: (a) whether the 1,800 FREE TO SPEND figure has any
remaining render path; (b) whether ANY remaining surface still exhibits the R10-current-month vs
R8-selected-month mismatch. REPORT ONLY. THE RE-SIZE OF THE ZERO AND TENSE CLASSES IS NOT THIS
REPORT — it is the next cycle, opened by a later block after this one lands. Measurement does not
parallelise behind implementation.

═══ PART 4 — IMPLEMENT ═══

Mechanism: remove the MOUNTS; leave the components. A query whose only consumers are removed
surfaces is dropped from the page so no request fires for an invisible surface; its api.ts method
stays, so the contract fixture should hold at 66 — predict it, and a move is a QUESTION.
The This Week panel losing a tile may reflow. Reflow is ALLOWED and is observation-only; restyling
the panel to compensate is NOT authorised — name any layout consequence you can see from source.

TESTS. Before editing, state per file: what changes, why, and the predicted count delta WITH ITS
SIGN. The channel's inherited expectation was negative; it assumed deletion. Component-level tests
that render a hidden component directly STAY UNTOUCHED — the component still exists. Page-level
assertions of presence are what change. Derive the sign; do not adopt it.
THE HIDE GETS A DISCRIMINATING TEST: at page level the removed surfaces are ABSENT while, in the
SAME render, the This Week panel's retained elements are PRESENT — so absence cannot be satisfied by
a page that never rendered. RED-FIRST, with the positive control on the red proof (a count, not an
exit code). The three named regression files stay green AND byte-untouched.

═══ GATES — HARD STOPS, NAMED IN ADVANCE ═══

GATE RM-1 — COLLATERAL. If a removed surface also carries something that is NOT safe-to-spend — an
income nudge, a set-your-budget or Open Plan CTA, a data-completeness prompt, anything a user acts
on — STOP on that surface and report it with where else (if anywhere) the affordance exists.
Removing it silently takes a feature the operator did not rule on. Other surfaces proceed.
GATE RM-2 — LEGAL OR PINNED COPY. If safe-to-spend appears in Privacy or Terms text, a pinned
string, or a legal data-testid slot, STOP and report. Legal copy is operator-owned and under
lawyer review.
GATE RM-3 — any red test outside the declared set, any forced edit, any edit to a regression file.
GATE RM-4 — any change reaching apps/api, the contract fixture, the ALLOWLIST, deploy/, or the
Caddyfile.
GATE RM-5 — THE PANEL. If the SAFE-TO-SPEND TODAY tile cannot be removed without restructuring This
Week or losing a retained element, STOP.

═══ CONSTRAINTS, UNCHANGED ═══

No renames. Pinned strings untouched. FAB topology and clearance untouched; QuickAdd internals
untouchable. Logical properties only, zero physical additions, 32 across 9 re-derived AFTER THE
LAST EDIT. components/ui/ untouched and direction-free. No new external origin, no Caddyfile change,
both asserted. The e2e suite is NOT touched — but LIST, report-only, the spec files that reference
the removed surfaces, since this removal rots it further. Queued items stay queued. The push is NOT
authorised by this block.

═══ THE REPORT ═══

Three mandatory sections (CLAUDE.md:436) with Test Files lines, captured exit codes, both tsc, and
the baseline hunk. Parts 1–3 as specified. Per implemented surface: before, after, render gate.
Artifacts piped, never retyped. Any gate that fired is at the TOP of the report.

## Ruling relayed DIRECT TO THE REVIEW CHANNEL — verbatim (provenance: OPERATOR, DIRECT, 2026-09-19)

Persisted in the out-of-channel section's FORM, per MOB-R25, but the provenance is **DIRECT TO THE
REVIEW CHANNEL** — not out-of-channel. The operator gave this to the review channel in the prior
conversation; it reached this channel by relay inside MOB-R25 and is persisted verbatim beside the
block that carries it, so a later reader finds the operator's own words rather than the channel's
paraphrase of them.

The two `…` are **elisions present in the text as it reached this channel.** This channel cannot
restore them and records them as elisions, not as the operator's punctuation.

**(1)**

```
I confirm that i want to remove the Safe-to-spend feature. the whole This Week panel stay minus the safe-to-spend tile
```

**(2)**

```
I would like to remove the feature/object, 'Month Snapshot' on the insight page. Also, I no longer want to see the feature/object 'Safe to Spend Today' anywhere on the app… I want to keep the app as simple as possible… we can turn off the feature for a quick fix and later we can remove them off our codebase.
```

**The counter was put once and the operator ruled anyway** — safe-to-spend was the app's distinctive
idea and a module was built for it, so simplifying removes differentiation along with complexity.
Recorded, not re-litigated.

MOB-R26 — THE CYCLE IS ACCEPTED AND BOTH GATES FIRED CORRECTLY. RM-2 is ratified permanently: legal
copy is not edited in any stage. RM-1 is ratified and resolved — the four affordances RELOCATE, then
the Home hero comes down. Three copy items are held with the operator. The stale shared baseline is
ruled and discharged here.

CADENCE. Issued under test (a) — it closes a cycle and authorises implementation — and (c).

THE CYCLE IS ACCEPTED. The prediction was met exactly at two hundred and forty-two across
forty-five, fixture held at sixty-six, physical properties thirty-two across nine re-derived after
the last edit, regression files byte-untouched, gate RM-4 clear behind a pathspec shown able to
match. Persistence reconciled two ways with the deleted-region reconstruction. THE BEST PART IS THE
INSTRUMENT WORK, and it is worth naming three times over: a physical-property pattern that returned
a plausible partial set, an unquoted glob that printed zero from a command that never ran, and two
enumeration routes disagreeing at twenty-five against twenty-six because the looser one omitted the
em-dash — the last being the header-collision hazard caught by the routes disagreeing rather than by
either route alone. Each was reported as the instrument's fault, not the tree's.

THE NON-ATTRIBUTABLE RED IS THE OTHER THING TO KEEP. A red that fires on a PRESENT assertion because
a heading resolves while the query is still in flight is a red proving nothing about the removal. It
was re-pointed at a digest-dependent element and only then did the red read as absence. A red proof
must fail for the reason under test, not merely fail.

═══ RM-2 — RATIFIED, AND WIDER THAN THIS CYCLE ═══

The Terms clause stays untouched. STANDING FOR THIS TRACK: legal copy is never edited by an
implementation cycle, in Stage 1 or Stage 2, whatever the surfaces do. The clause becomes STALE once
the surfaces go — that is a queue item against the lawyer-review checklist's Terms section, carried
and not acted on. Record it; do not fix it.

═══ RM-1 — RATIFIED, AND RESOLVED: RELOCATE, THEN REMOVE ═══

THE STOP WAS CORRECT AND THE CONSEQUENCE WAS STATED RATHER THAN SMOOTHED — that "Safe to Spend
Today" is still on Home, contrary to the operator's own words, is the gate working. The alternates
being dismissible and completion-gated is the finding that settles it: a user who finished setup and
later deleted a budget would lose the prompt entirely.

AUTHORISED THIS CYCLE: move the four affordances out of the hero, then unmount the hero.
  CONDITIONS, and they are what keep this a move rather than a redesign.
  (1) EXISTING STRINGS CARRIED VERBATIM. No new sentence, no reworded label, no new heading. A move
      is not a copy decision; the moment it needs one it stops.
  (2) THE DESTINATION IS UNCONDITIONAL ON HOME — not behind the setup-progress gate, not behind a
      dialog, not behind a dismiss. That gating is the whole reason the alternates do not cover it.
  (3) THE INCOME NUDGE KEEPS ITS DISMISS BEHAVIOUR AND ITS EXISTING STORAGE KEY. No rename.
  (4) EACH RELOCATED AFFORDANCE GETS A DISCRIMINATING TEST IN THE TWO STATES WHERE THE ALTERNATES
      VANISH: onboarding dismissed, and setup complete with the budget since deleted. Negative case
      stated. Red-first with the positive control being a count.
  (5) THE HERO COMES DOWN IN THE SAME COMMIT, not a later one. A commit that relocates without
      removing leaves two copies of the same prompt on one page.
GATE RM-6 — NEW COPY OR NEW STRUCTURE. If any affordance cannot be relocated without a new string, a
new heading, or a layout container beyond a plain stack in existing page rhythm, STOP on that
affordance, report it, and leave the hero up until it is ruled. The others proceed.

CONFIRM WITH THE HERO'S REMOVAL: sections.tsx:332 "Monthly runway" is one of the two remaining
render paths for the figure the operator saw at eighteen hundred. Say whether it goes with the hero.
The other path is held below.

═══ ITEM (vi) — CLOSED BY REMOVAL ═══

Accepted on the mount chain. The line correction, :68 at the cited commit against :80 at HEAD, is
accepted and its cause is ours: our own guard comment moved it last cycle. Derive-don't-carry,
demonstrated against this channel's own citation.
BRASS: the ration is now logo mark and eyebrows. The accent-strong token survives UNUSED until
Stage 2 — do not delete it, do not reassign the freed slot, restyle nothing.

THE QUERY WAS CORRECTLY NOT DROPPED. The ruling's condition evaluated false and the report showed
which other consumers make it false. That is the conditional being read rather than obeyed.

═══ HELD WITH THE OPERATOR — DO NOT SHIP ═══

Four items, each needing a user-facing sentence, which is a product decision: the Insights prose at
:272 and :282; the lost "days until payday"; and D2, still at Gate C. A later block carries the
wording. Suppressing :272 cleanly is available and is STILL NOT AUTHORISED, because suppressing one
half of a two-sentence passage changes what the other half reads as.

═══ THE STALE SHARED BASELINE — RULED ═══

The report was right to stop and right that the track convention puts per-cycle baselines in the
module file. But the CLAUDE.md frontend line is a LIVE INDEX, and nothing in the convention licenses
a shared index rotting thirty tests and four files behind the tree.
AUTHORISED: in this cycle's commit, update that line to the measured figure, retaining the previous
figure as a prior-baseline clause in the form the file already uses, dated to THIS BLOCK, never the
session clock. The api line moves only if the api figure moves; it did not.
That discharges mandatory section (3) for this cycle: the hunk is the CLAUDE.md diff together with
the module-file baseline line.

═══ CONSTRAINTS AND CLOSE ═══

Stage 1 still means HIDE: components, api methods, types and their own tests stay. Backend
untouched, asserted with a positive control. No renames; pinned strings, FAB topology and
clearance, QuickAdd internals untouched. Logical properties only, thirty-two across nine
re-derived after the LAST edit.
components/ui/ untouched and direction-free. No new external origin, no Caddyfile change, fixture
and allowlist derived from the file. The e2e suite is NOT touched — but re-state, report-only,
that the debt-flow spec targets the hero's aria-label and that this commit rots it further.
THE PUSH IS NOT AUTHORISED BY THIS BLOCK. It comes when the hero is down and the held items are
ruled.
NAMED SO IT IS NOT A SURPRISE AND NOT ANTICIPATED: the operator has ruled that income becomes
USER-ENTERED and that income DETECTION goes. That work touches apps/api, is its own cycle, and is
NOT OPENED HERE. Do not prepare for it.

PERSISTENCE. This block persists ALONE, position DERIVED FROM THE FILE (last is expected to be 25),
payload swept under both patterns with the discrimination shown, post-append composite reconciled
two ways, enumeration printed in file order. Provenance RELAYED. Persist alongside it: RM-2's
standing line on legal copy, the RM-1 disposition, item (vi)'s closure with its line correction,
and the baseline ruling.
THE REPORT: three mandatory sections; per relocated affordance the before, the after and the render
gate; any gate that fired at the TOP. Artifacts piped, never retyped.

## Dispositions carried by the block above — implementer's index, not the channel's text

The four items the block directs to be persisted alongside it all live INSIDE the verbatim block
above; this index exists so a later reader finds them by name rather than by re-reading the block.
Nothing here adds to or reinterprets the ruling.

1. **RM-2 standing line — legal copy is never edited by an implementation cycle**, Stage 1 or
   Stage 2, whatever the surfaces do. See the RM-2 section. The Terms "not advice" clause
   (`legal/TermsPage.tsx:37`) becomes STALE once the safe-to-spend surfaces are gone; that is a
   QUEUE ITEM against the lawyer-review checklist's Terms section — recorded, deliberately not
   acted on.
2. **RM-1 disposition — RELOCATE, THEN REMOVE, in one commit**, under conditions (1)-(5) and
   GATE RM-6. See the RM-1 section.
3. **Item (vi) — CLOSED BY REMOVAL**, on the mount chain, with the `:68`-versus-`:80` line
   correction accepted and its cause attributed to this track's own guard comment from the
   preceding cycle. Brass ration is now logo mark and eyebrows; `--accent-strong` survives UNUSED
   until Stage 2 and is not to be deleted or reassigned.
4. **The stale shared baseline — RULED.** The CLAUDE.md frontend line is a LIVE INDEX and is
   updated to the measured figure in this cycle's commit, retaining the prior figure in the
   file's existing prior-baseline form, dated to THIS BLOCK rather than the session clock. The
   api line moves only if the api figure moves.

MOB-R27 — THE CYCLE IS ACCEPTED AND THE COPY IS RULED. Six strings, operator-selected, verbatim
below. The three blocked affordances relocate with their new sentences and THE HERO COMES DOWN in
the same commit. The Insights prose, the payday counter and D2 all ship here. Gate C is discharged
for D2 only.

CADENCE. Issued under test (a) — it closes a cycle and authorises implementation — and (b).

THE CYCLE IS ACCEPTED. Two hundred and forty-five across forty-five, plus three predicted and plus
three measured, api unchanged, both typechecks at zero bytes, fixture sixty-six, physical properties
thirty-two across nine after the last edit, regression files byte-untouched, every exclusion
behind a positive control that listed the six touched files. The baseline line is discharged as
ruled and cited by block identifier rather than a manufactured date — correct, and the reasoning
is the attribution rule read properly rather than worked around.

RM-6 FIRED CORRECTLY AND BOTH ROUTES WERE SHOWN CLOSED. Carrying the sentences reprints the feature
on Home; dropping them is a copy decision the condition forbids. A stop with both exits named is an
argument, not a refusal.

THE RECONSTRUCTION FINDING IS THE INSTRUMENT LESSON. A malformed command and a failed reconstruction
produced similar-looking output, and the cause was an untrimmed line-count variable carrying leading
whitespace into the next command. The canonical class again: distinguish "the check failed" from
"the check never ran" before reading either.

THE ENUMERATION MISS IS ACCEPTED AND ITS DURABLE FORM IS THE PART TO KEEP. One declared mock-factory
edit, two actual, three reddened tests outside the declared set — found by the suite, not by
judgement. The structural difference is the finding: a factory that SPREADS the real module and
overrides selectively tolerates a new export; one that ENUMERATES its exports cannot. This is the
same shape as the four wholesale-mocked auth files that forced a helper's destination in an earlier
module — CITED, NOT MINTED, and the standing count stays at SIX. THE ORDER IS THE REMEDY: derive the
set of files mocking a module BEFORE adding an export to it, and enumerate that set in the report.

CONDITION (4)'s SECOND STATE WAS WRONG AND THE CORRECTION IS ACCEPTED. Deleting a budget does not
make the alternate vanish by completion — it drops the completed count and the panel returns.
DISMISSAL is what makes it vanish. The channel wrote a state that does not exist; the implementer
measured the real one and drove both cases through the dismissal flag. Recorded as the channel's
error.

═══ THE COPY — OPERATOR SELECTION, IN-SESSION 2026-09-24, RATIFIED HERE ═══

PROVENANCE, STATED PRECISELY BECAUSE THE TWO HALVES HAVE DIFFERENT AUTHORS. The wording was DRAFTED
BY THE REVIEW CHANNEL and SELECTED BY THE OPERATOR through the in-session question mechanism, not
authored by him. This block ratifies it, so it is a channel ruling carrying an operator selection —
not an operator-authored string, and not a self-grant. The verbatim exchange persists beside this
block:

  Q1 "Home — the three blocked prompts. Use my wording?"  → "Use my wording"
  Q2 "Insights — the two surviving safe-to-spend mentions?"  → "Use my wording"
  Q3 "Also approve these two smaller calls?"  → "Both"
     (restore Days until payday; use the D2 wording)

TRANSCRIPTION SEAM, STATED BECAUSE IT CANNOT BE CLOSED: these strings exist in no artifact on disk.
This block is their only source. PASTE THEM, NEVER RETYPE THEM, and pin each one with an assertion
on the exact string so a drifted character goes red rather than unnoticed. Report each rendered
string verbatim, piped from the test output or the source, never re-keyed into prose.

THE SIX STRINGS, WITH THEIR SITES.
  (A2) sections.tsx:374 body, replacing the sentence naming the feature:
       Set your monthly income so your plan and net figures are accurate.
  (A3) sections.tsx:384 body, same treatment:
       Set a budget for this month to see how your spending compares with your plan.
  (A4) sections.tsx:281 error-state body:
       We couldn't load your monthly figures right now.
  (I-a) InsightsPage.tsx:272 — the sentence is DROPPED ENTIRELY, not reworded. The report already
       established the join is built for an empty clause; show the passage before and after,
       verbatim from source.
  (I-b) InsightsPage.tsx:282 — replace the phrase naming the feature so the clause reads:
       before what's left for everything else
       Quote the whole sentence before and after; the replacement is a phrase inside it, and a
       phrase substitution reported without its sentence cannot be checked.
  (D2) sections.tsx:1022-1029, on an EMPTY period only:
       Nothing to assess yet. Add a budget to see how your spending compares.
       The non-empty render is UNCHANGED. The predicate is the one its siblings already use —
       derive it, do not invent a parallel one; that is how this defect class was born.

THE PAYDAY COUNTER — RESTORED. It returns inside This Week under its own heading:
       Days until payday
Same figure, same field, same formatting as before its removal. IF IT NEEDS A NEW DATA SOURCE, A NEW
QUERY OR A NEW COMPUTATION, STOP — restoring a render is authorised; deriving a value is not.

GATE C IS DISCHARGED FOR D2 AND FOR NOTHING ELSE. Any other site needing new copy still stops.

═══ THEN THE HERO COMES DOWN ═══

Affordances 2, 3 and 4 relocate with their new sentences, under MOB-R26's conditions (2), (3) and
(5) UNCHANGED: unconditional on Home, no renames, and the hero unmounts IN THE SAME COMMIT so no
prompt is ever on the page twice.
CONFIRM WITH A POSITIVE CONTROL: after this commit the figure the operator saw at eighteen hundred
has ZERO render paths, the "Monthly runway" render having gone with the hero. Show the control can
match, then show the count is zero.
And state it plainly in the report: "Safe to Spend Today" is now absent from every surface, which is
what the operator ruled on 2026-09-19.

═══ TESTS, GATES, CONSTRAINTS ═══

TESTS. Derive the set of files mocking each touched module FIRST and enumerate it before mounting
anything new. State the predicted delta WITH ITS SIGN before editing. One discriminating test per
distinct render path, negative case stated. RED-FIRST with the positive control being a COUNT, and
the red must fail for the reason under test — a red firing on a present assertion proves nothing,
as this track has now demonstrated twice.
GATE RM-6 STAYS LIVE for any further new string, heading or structure beyond the six ruled above.
GATE RM-7 — GRAMMAR. If dropping the sentence at :272 leaves a dangling connective or an
ungrammatical passage, STOP and report the exact text rather than patching it with an unruled word.
CONSTRAINTS unchanged: Stage 1 hides, so components, api methods, types and their own tests stay;
backend untouched with a positive control; no renames; pinned strings, FAB topology and clearance,
QuickAdd internals untouched; logical properties only, thirty-two across nine re-derived AFTER THE
LAST EDIT; components/ui/ untouched; no new external origin, no Caddyfile change; fixture and
allowlist derived from the file. Update the CLAUDE.md frontend baseline line again, same form, cited
to THIS block.
THE E2E SUITE IS NOT TOUCHED — and re-state, report-only, that the hero's removal now rots the
debt-flow selector that was still resolving last cycle.
THE PUSH IS NOT AUTHORISED BY THIS BLOCK. Income remains NOT OPENED and is not prepared for.

PERSISTENCE. This block persists ALONE, position DERIVED FROM THE FILE (last is expected to be 26),
both sweeps shown discriminating, composite reconciled two ways, enumeration in file order.
Provenance RELAYED. Persist alongside it, in the in-session-selection form: the three questions and
answers verbatim, the six strings, and the condition-(4) correction as the channel's error.
THE REPORT: three mandatory sections; per site the before, the after and the render gate; every
ruled string quoted verbatim from source; any gate that fired at the TOP.

## In-session operator selection — verbatim (provenance: REVIEW CHANNEL drafted, OPERATOR selected, 2026-09-24, ratified by the block above)

**The two halves have different authors and the record says so.** The wording was DRAFTED BY THE
REVIEW CHANNEL and SELECTED BY THE OPERATOR through the in-session question mechanism. It is a
channel ruling carrying an operator selection — not an operator-authored string, and not a
self-grant.

### The exchange, verbatim

```
Q1 "Home — the three blocked prompts. Use my wording?"  → "Use my wording"
Q2 "Insights — the two surviving safe-to-spend mentions?"  → "Use my wording"
Q3 "Also approve these two smaller calls?"  → "Both"
   (restore Days until payday; use the D2 wording)
```

### The six ruled strings — THIS DOCUMENT IS THEIR ONLY ON-DISK SOURCE

They exist in no other artifact. The transcription seam cannot be closed, only bounded: each is
pinned in the suite by an assertion on the exact string, so a drifted character goes RED rather
than unnoticed.

| id | site (re-derived at implementation) | string |
|---|---|---|
| A2 | `sections.tsx` income-setup body | `Set your monthly income so your plan and net figures are accurate.` |
| A3 | `sections.tsx` no-budget body | `Set a budget for this month to see how your spending compares with your plan.` |
| A4 | `sections.tsx` error-state body | `We couldn't load your monthly figures right now.` |
| I-a | `InsightsPage.tsx` pace note | *(no string — the sentence is DROPPED ENTIRELY)* |
| I-b | `InsightsPage.tsx` recurring sentence | `before what's left for everything else` |
| D2 | `sections.tsx` empty-period arm | `Nothing to assess yet. Add a budget to see how your spending compares.` |

The payday counter returns inside This Week under its own heading, `Days until payday`, with the
same figure, field and formatting as before its removal.

**Line numbers in the block above are NOT re-usable.** They were accurate when written and drifted
before implementation — largely by this track's own preceding commit, which added the `IncomeNudge`
export to `sections.tsx`. Every site was re-derived from source at implementation; see the cycle's
report and commit for the measured positions.

### The condition-(4) correction — recorded as the CHANNEL's error

Condition (4) of MOB-R26 named "setup complete with the budget since deleted" as a state where
the alternates vanish. **That state does not exist:** deleting a budget drops `setupCompleteCount`
below `steps.length`, so `SetupProgressPanel` RETURNS rather than vanishing. DISMISSAL
(`setup_guide_dismissed`) is what makes it vanish. The implementer measured the real predicate and
drove both condition-(4) cases through the dismissal flag; the channel has recorded the error as
its own.
