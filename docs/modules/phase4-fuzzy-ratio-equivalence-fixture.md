# TODO(fuzzy-ratio-equivalence-fixture) — approved bundle

Persist-first record (standing rule: proposal + approval + blocking evidence to
`docs/modules/` before any implementation). Implement from this file.

Status: **Phase A APPROVED WITH CONDITIONS (FR-A1..A3, FR-C1..C6), ratified
2026-07-19.** Blocking evidence (FR-C1, FR-C2, FR-C5) gathered and embedded below.

---

## 1. Approval ruling (verbatim, 2026-07-19)

> 2026-07-19 — Ruling: fuzzy-ratio-equivalence-fixture Phase A — APPROVED
> WITH CONDITIONS; in-session selections RATIFIED
>
> FR-A1 (approval): the proposal is approved as scoped — Set A
> (sequenceRatio vs difflib .ratio(), exact float equality, ~30-40 pairs
> incl. the autojunk boundary entry), Set B (isSimilarDuplicateName vs
> the Flask composite, boolean, ~20-25 pairs incl. Arabic/mixed/threshold
> axes), committed JSON fixtures + pinned generator
> (tools/capture-difflib-ratio.py), hermetic placement, D1-D5 as numbered.
>
> FR-A2 (RATIFICATION): the two AskUserQuestion selections of 2026-07-19
> — (i) BOTH fixture sets, (ii) direct export of sequenceRatio +
> isSimilarDuplicateName (+ normalizedFuzzyName) from import-lib.ts — are
> hereby RATIFIED as channel rulings, citable as "FR-A2, 2026-07-19".
> They cease to be pending-ratification in-session selections. D1 folds
> in as chosen-not-deviation, correctly.
>
> FR-A3 (directive correction accepted): the channel's "Arabic axis in
> the ratio fixtures" directive was wrong-shaped — §2 proves the ratio
> never observes non-ASCII. The Set-A/Set-B split is the correct
> placement. Recorded so the correction, not the directive, is the
> inherited record.
>
> FR-C1 (oracle quote, BLOCKING): quote the Flask
> _is_similar_duplicate_name verbatim (file:line) from the primary
> port-source checkout before generating Set B; dual-quote if the two
> checkouts diverge. Set B's equivalence claim is unevidenced without it.
> Include the quote in the persisted bundle.
>
> FR-C2 (name_key scope check, BLOCKING): quote buildNameKey verbatim and
> state explicitly whether NON-ASCII survives it, or whether the stripping
> is solely normalizedFuzzyName's extra .replace. name_key is a PERSISTED
> column with downstream consumers (suggest engine, learn-once priming);
> if Arabic collapses at buildNameKey, that is a finding of its own —
> report it, do not fix it here.
>
> FR-C3 (Arabic-hint limitation, RECORDED): pure-Arabic names normalize
> to empty and short-circuit isSimilarDuplicateName at the guard, so they
> never receive fuzzy duplicate hints (exact dedup unaffected). Record in
> the module doc AND as a Module 11 queue note — Module 11's Arabic
> statement parsing inherits this explicitly. Faithful to Flask; NOT
> fixed here.
>
> FR-C4 (float serialization): fixture floats must be written with
> round-trip-safe serialization (Python json.dump default repr) — no
> string formatting, rounding, or truncation. Exact equality in TS is
> approved ONLY on that basis; state the serialization form in the
> close-out.
>
> FR-C5 (autojunk entry integrity): the boundary pair must be VERIFIED at
> generation to actually differ between autojunk=True and False. If no
> differing pair can be constructed, that is a recorded finding and an
> R14 stop — the assertion may not be silently weakened to equality or
> dropped.
>
> FR-C6 (close-out shape): three sections embedded verbatim; exact +N and
> the per-set fixture counts stated; _meta (generator command + CPython
> version) shown; frontend 166/35 confirmed untouched.
>
> SEQUENCE: FR-C1 + FR-C2 evidence → persist-first (proposal + this
> ruling + that evidence → docs/modules/) → implement → close-out.

---

## 2. Phase A proposal (as approved)

### 2.1 The port, evidenced

TS: `apps/api/src/lib/import-lib.ts:937-979` — `sequenceRatio` / `matchingBlocksSize`
/ `findLongestMatch`. `sequenceRatio(a,b)` = `t=a.length+b.length; if t===0 return 1;
return (2*matchingBlocksSize)/t`. Comment at :937 verbatim:
`// difflib.SequenceMatcher.ratio() faithful port (autojunk off — transaction names are short).`

Python: `SequenceMatcher(None, left_norm, right_norm).ratio()` — see FR-C1 quote §3.1.

Reproduces: full `.ratio()` = `2·M/T`, `M`=Σ longest-match sizes over the recursive
decomposition; `isjunk=None` (no junk); tie-break earliest-i/earliest-j via strict
`k>bestsize`. No `quick_ratio` shortcut. Junk-adjacent extension loops are dead code
under `isjunk=None` and correctly omitted.

Deliberately NOT reproduced: `autojunk` (Python default `autojunk=True`). Inert within
the domain — autojunk only fires for `len(b) ≥ 200` (`ntest = len(b)//100 + 1`,
popular-char culling), and post-normalization transaction names are short `[a-z0-9 ]`
strings far under 200, so `autojunk=True ≡ autojunk=False` for every real input →
port equals Flask for the domain. See the autojunk mechanics note §3.3.

### 2.2 Where it bites

`sequenceRatio` called only at `import-lib.ts:991` inside `isSimilarDuplicateName`,
reached from `buildFuzzyHints` at :1035 (row vs existing DB candidate) and :1056 (row
vs batch row). Inputs are normalized by `normalizedFuzzyName` (:980-984): `buildNameKey`
→ `.replace(/[^a-z0-9]+/g," ")` → single-spaced. **The ratio only ever sees `[a-z0-9 ]`;
Arabic/non-ASCII is stripped before it (see FR-C2 §3.2).** Thresholds gating a hint
(:988-997): exact-equal; `shorter.length≥6 && longer.includes(shorter)`; `ratio≥0.82`;
else `tokenOverlap≥0.6 && ratio≥0.65`. Cost of a wrong answer: **preview hint only**
(`likely_dup:true` + advisory message); never blocks or auto-dedupes (real dedup is the
exact-triplet + `import_row_hash` layers). Non-destructive both directions.

### 2.3 Fixture design (as approved)

Generator (committed): `tools/capture-difflib-ratio.py`, emits both JSONs from stdlib
`difflib`. `_meta` pins CPython version + the generation command. `.ratio()` values are
CPython-3.x-stable for these inputs (`quick_ratio` unused).

- **Set A** — `sequenceRatio` vs `SequenceMatcher(None,a,b).ratio()` (default =
  Flask's actual call). Post-normalization `[a-z0-9 ]` pairs. Axes: empty/empty (→1.0),
  empty/nonempty (→0.0), identical, single-char, transposition, insert/delete/replace
  opcode mixes, repeated-char (multi-index `b2j` path), equal-size competing blocks
  (tie-break), near-miss straddlers around 0.82 and 0.65 (just-above/below), **plus one
  autojunk boundary entry** (≥200-char pair; generator emits both `autojunk=True` and
  `=False`; test asserts `port == autojunk=False` AND `port != autojunk=True`). ~30-40.
- **Set B** — `isSimilarDuplicateName` vs Flask `_is_similar_duplicate_name` (boolean,
  raw names). Axes: exact after case/whitespace, `≥6`-substring short-circuit (+ `<6`
  negative), `ratio≥0.82` positives, overlap-path positives, negatives just under each
  threshold, Arabic-only (→false via guard), mixed Arabic/Latin (Latin-only survives),
  null/empty. ~20-25.

Equality: Set A exact float, no epsilon (M,T integers; `2·M/T` is IEEE-754 double
division in both CPython and V8 → bit-identical; verified `4/11, 10/13, 16/21, 6/11`
identical in node and python3). Set B boolean. No epsilon anywhere (would mask a real
divergence at the 0.82/0.65 boundary).

### 2.4 Placement + deltas

Hermetic unit test, NO `INTEGRATION` gate. New: `apps/api/src/lib/import-fuzzy-ratio.test.ts`
(`it.each` per pair). Fixtures: `apps/api/src/lib/__fixtures__/fuzzy-ratio.fixture.json`
(A) + `fuzzy-similar-name.fixture.json` (B). Exports added to `import-lib.ts`:
`sequenceRatio`, `isSimilarDuplicateName`, `normalizedFuzzyName` (FR-A2 — chosen, not a
deviation). API baseline 675/18/50 → +1 file, +N passed (N = fixture-pair count), skipped
unchanged. Frontend 166/35 untouched (backend-only).

### 2.5 Deviations (numbered)

- D1 — new exports. RATIFIED as chosen (FR-A2), folds in as chosen-not-deviation.
- D2 — committed-JSON fixtures + generator vs the repo's inline-hardcoded convention.
  Justified: dozens of machine-generated pairs; TODO named JSON data + pinned generator.
- D3 — Set A oracle = default difflib (autojunk=True = Flask's real call) for domain
  pairs; one boundary entry captures both modes to document the "autojunk off" deviation.
- D4 — Set B added beyond the literal "ratio" scope to cover Arabic/mixed/threshold axes
  the ratio alone can never observe post-normalization (FR-A3 confirms this placement).
- D5 — Python-version pinning documentary, not load-bearing (`.ratio()` stable across 3.x).

---

## 3. Blocking evidence

### 3.1 FR-C1 — Flask `_is_similar_duplicate_name` verbatim

Primary port source: `personal-finance/backend/routes/upload.py:647-675` (HEAD 202a1548).
**Byte-identical** in `personal_statera/backend/routes/upload.py:818-846` (HEAD 73583fe) —
confirmed via `diff` (IDENTICAL). Single oracle, no divergence.

```python
def _normalized_fuzzy_name(name: str | None) -> str:
    normalized = build_name_key(name or "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return " ".join(normalized.split())


def _is_similar_duplicate_name(left: str | None, right: str | None) -> bool:
    left_norm = _normalized_fuzzy_name(left)
    right_norm = _normalized_fuzzy_name(right)
    if not left_norm or not right_norm:
        return False
    if left_norm == right_norm:
        return True

    shorter, longer = sorted((left_norm, right_norm), key=len)
    if len(shorter) >= 6 and shorter in longer:
        return True

    ratio = SequenceMatcher(None, left_norm, right_norm).ratio()
    if ratio >= 0.82:
        return True

    left_tokens = set(left_norm.split())
    right_tokens = set(right_norm.split())
    if not left_tokens or not right_tokens:
        return False

    overlap = len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))
    return overlap >= 0.6 and ratio >= 0.65
```

### 3.2 FR-C2 — `buildNameKey` scope check (FINDING)

TS `apps/api/src/lib/name-key.ts:14-21`:

```ts
export function buildNameKey(name: string | null | undefined): string {
  const joined = (name ?? "")
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return ([...joined].slice(0, 255).join("")) || "?"
}
```

Python `build_name_key` (`.../lib/transactions.py:18-19`, byte-identical in both checkouts):

```python
def build_name_key(name: str) -> str:
    return " ".join((name or "").split()).lower()[:255] or "?"
```

**FINDING (reported, NOT fixed here per FR-C2):** `buildNameKey` does **NOT** strip
non-ASCII. It only collapses whitespace, lowercases (a no-op for Arabic), and truncates
to 255 code points. **Non-ASCII, including Arabic, SURVIVES `buildNameKey` intact.** The
`[a-z0-9]`-only stripping that removes Arabic is solely `normalizedFuzzyName`'s extra
`.replace(/[^a-z0-9]+/g," ")` (Python `re.sub(r"[^a-z0-9]+", " ", ...)`) — a fuzzy-match-only
transform. Consequence: the **persisted `name_key` column preserves the full Arabic name**,
so exact-triplet dedup, the suggest engine, and learn-once priming operate on the real
Arabic text and are unaffected by the fuzzy-layer stripping. Only the fuzzy *preview hint*
is Arabic-blind (FR-C3). Both TS and Python strip Arabic at the same `_normalized_fuzzy_name`
layer, so Set B's equivalence claim holds. This finding is favorable (no data loss in the
persisted column); recorded for the record, not remediated in this module.

### 3.3 FR-C5 — autojunk boundary pair VERIFIED

Autojunk mechanics (CPython difflib `__chain_b` / `find_longest_match`): popular chars
(`len(idxs) > n//100+1` when `n≥200`) are removed from `b2j` so they can't *seed* a match,
but `bjunk` is empty under `isjunk=None`, so the match-extension loops still absorb them
when contiguous. A genuine ratio difference therefore requires a small alphabet at `len≥200`
where culling popular chars reshapes the greedy longest-match decomposition.

**Verified differing pair (deterministic, seed=7):** `len_a=181, len_b=220`,
`autojunk=True → 0.034912718204488775` vs `autojunk=False → 0.8179551122194514`
(differ=True). The generator will pin one such verified pair and assert
`port == autojunk=False AND port != autojunk=True`. If a future regeneration cannot
construct a differing pair, that is an R14 stop (not a silent weakening to equality).

---

## 4. FR-C3 — Arabic-hint limitation (RECORDED)

Pure-Arabic names normalize to `""` (via `normalizedFuzzyName`) and short-circuit
`isSimilarDuplicateName` at the `if (!l || !r) return false` guard, so **pure-Arabic names
never receive fuzzy duplicate preview hints**. Exact dedup (triplet + `import_row_hash`) is
unaffected — those operate on the Arabic-preserving `name_key` (FR-C2). Faithful to Flask
(same guard). NOT fixed here. **Module 11 queue note:** Module 11's Arabic statement parsing
inherits this — fuzzy-hint coverage for Arabic names is an open design item there, not a
regression.

---

## 5. Implementation checklist (from this file, on approval — DONE gate)

1. `tools/capture-difflib-ratio.py` — deterministic generator, `_meta` with CPython
   version + command, `json.dump` default float repr (FR-C4), FR-C5 assert-differs guard.
2. `apps/api/src/lib/__fixtures__/fuzzy-ratio.fixture.json` (Set A) +
   `fuzzy-similar-name.fixture.json` (Set B).
3. Export `sequenceRatio`, `isSimilarDuplicateName`, `normalizedFuzzyName` from
   `import-lib.ts`.
4. `apps/api/src/lib/import-fuzzy-ratio.test.ts` — hermetic, `it.each`.
5. Close-out with the three mandatory sections (FR-C6).
