#!/usr/bin/env python3
"""capture-difflib-ratio.py — fixture generator for TODO(fuzzy-ratio-equivalence-fixture).

Emits two committed JSON fixtures that pin the TS port of difflib's
SequenceMatcher.ratio() (apps/api/src/lib/import-lib.ts) against the CPython
stdlib oracle:

  Set A  fuzzy-ratio.fixture.json         sequenceRatio(a,b) == SequenceMatcher(None,a,b).ratio()
  Set B  fuzzy-similar-name.fixture.json  isSimilarDuplicateName(left,right) == _is_similar_duplicate_name(...)

Run from the repo root:

    python3 tools/capture-difflib-ratio.py

The Set B oracle (build_name_key + _normalized_fuzzy_name + _is_similar_duplicate_name)
is copied VERBATIM from the primary port source
personal-finance/backend/{lib/transactions.py,routes/upload.py} (HEAD 202a1548);
byte-identical in personal_statera (HEAD 73583fe). See
docs/modules/phase4-fuzzy-ratio-equivalence-fixture.md §3.1/§3.2.

FR-C4: floats are written with json.dump's default float repr (round-trip-safe) —
no string formatting, rounding, or truncation. Exact float equality in the TS test
is valid only on that basis.

FR-C5: the autojunk boundary entry is verified at generation to actually differ
between autojunk=True and autojunk=False. If it does not, the script aborts (R14 stop)
rather than silently weakening the assertion.
"""
import json
import os
import re
import sys
from difflib import SequenceMatcher

PY = f"CPython {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
GEN_CMD = "python3 tools/capture-difflib-ratio.py"

FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "apps", "api", "src", "lib", "__fixtures__",
)


# ── Flask oracle (verbatim copy — do not edit to "fix" a fixture) ───────────────
def build_name_key(name):  # lib/transactions.py:18-19
    return " ".join((name or "").split()).lower()[:255] or "?"


def _normalized_fuzzy_name(name):  # upload.py:647-650
    normalized = build_name_key(name or "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return " ".join(normalized.split())


def _is_similar_duplicate_name(left, right):  # upload.py:653-675
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


# ── Set A input pairs (post-normalization [a-z0-9 ] domain) ─────────────────────
# Each is (a, b, note). The oracle ratio is computed below; notes document the axis.
SET_A_PAIRS = [
    ("", "", "empty/empty -> 1.0"),
    ("", "abc", "empty/nonempty -> 0.0"),
    ("abc", "", "nonempty/empty -> 0.0"),
    ("starbucks", "starbucks", "identical"),
    ("a", "a", "single-char identical"),
    ("a", "b", "single-char disjoint"),
    ("ab", "ba", "transposition"),
    ("abcd", "abcde", "insert one at end"),
    ("abcde", "abcd", "delete one at end"),
    ("abcde", "abxde", "single replace in middle"),
    ("xabcd", "abcd", "insert one at front"),
    ("aaaa", "aa", "repeated-char shorter"),
    ("aa", "aaaa", "repeated-char longer"),
    ("aaaa", "aaaa", "repeated-char identical"),
    ("abab", "abab", "competing equal blocks identical"),
    ("abab", "baba", "competing equal blocks tie-break"),
    ("ab ab", "ab ab", "space-bearing identical"),
    ("careem", "kareem", "near-miss above 0.82 (~0.833)"),
    ("kareem", "careem", "near-miss above 0.82 reversed"),
    ("lulu", "lulu hypermarket", "prefix subset ~0.4"),
    ("knet", "k n e t", "spaced-out ~0.727"),
    ("abcdef", "abxdef", "single replace ~0.833"),
    ("abcdefgh", "abcdxfgh", "single replace ~0.875"),
    ("abcde", "fghij", "fully disjoint -> 0.0"),
    ("abcdef", "abcxyz", "half replace 0.5"),
    ("sultan center", "sultan centre", "swap near 0.9"),
    ("the sultan center", "sultan center", "prefix-word drop"),
    ("mcdonalds", "macdonalds", "insert one 0.94-ish"),
    ("coffee shop", "coffee store", "shared prefix word"),
    ("grocery", "grocers", "shared stem ~0.857"),
    ("abcdefghij", "abcdeXghij", "single replace long ~0.9"),
    ("aaaabbbb", "bbbbaaaa", "block swap"),
    ("x0y1z2", "x0y1z2", "digits identical"),
    ("order 12345", "order 12346", "trailing digit differ"),
    ("aXbXcXd", "abcd", "interleaved noise ~0.727"),
]

# ── Set A autojunk boundary entry (FR-C5) ───────────────────────────────────────
# Deterministic construction (seed=7) verified to differ between autojunk modes.
def _make_autojunk_pair():
    import random
    rnd = random.Random(7)
    alph = "abcde"  # small alphabet -> chars go "popular" at len>=200
    for _ in range(200000):
        lb = rnd.randint(200, 240)
        b = "".join(rnd.choice(alph) for _ in range(lb))
        la = rnd.randint(180, lb)
        a = list(b[:la])
        for _ in range(rnd.randint(0, 30)):
            p = rnd.randrange(len(a))
            a[p] = rnd.choice(alph)
        a = "".join(a)
        rt = SequenceMatcher(None, a, b, autojunk=True).ratio()
        rf = SequenceMatcher(None, a, b, autojunk=False).ratio()
        if rt != rf:
            return a, b, rt, rf
    return None


def main():
    os.makedirs(FIXTURE_DIR, exist_ok=True)

    # Set A — ratio equivalence (default difflib = Flask's actual call).
    set_a_cases = []
    for a, b, note in SET_A_PAIRS:
        set_a_cases.append({
            "a": a,
            "b": b,
            "note": note,
            "ratio": SequenceMatcher(None, a, b).ratio(),
        })

    boundary = _make_autojunk_pair()
    if boundary is None:
        sys.exit("FR-C5 R14 STOP: could not construct an autojunk-differing pair.")
    ba, bb, brt, brf = boundary
    if not (brt != brf):
        sys.exit("FR-C5 R14 STOP: constructed boundary pair does not differ.")

    set_a = {
        "_meta": {
            "purpose": "sequenceRatio(a,b) == difflib.SequenceMatcher(None,a,b).ratio()",
            "oracle": "difflib.SequenceMatcher(None,a,b).ratio() (default autojunk=True; == Flask's actual call)",
            "python": PY,
            "generated_by": GEN_CMD,
            "float_serialization": "json.dump default float repr (round-trip-safe); no formatting/rounding",
        },
        "cases": set_a_cases,
        "autojunk_boundary": {
            "note": "FR-C5: >=200-char pair where autojunk changes the ratio; the port implements "
                    "autojunk=False. Test asserts port == ratio_autojunk_false AND port != ratio_autojunk_true.",
            "a": ba,
            "b": bb,
            "ratio_autojunk_true": brt,
            "ratio_autojunk_false": brf,
        },
    }

    # Set B — composite similar-name equivalence (raw names, incl. Arabic).
    set_b_pairs = [
        ("The Sultan Center", "the   sultan center", "exact after whitespace collapse"),
        ("STARBUCKS", "starbucks", "exact after lowercase"),
        ("Carrefour", "Carrefour Mall", "substring>=6 short-circuit"),
        ("lulu hypermarket", "lulu hypermarket salmiya", "substring>=6 with extra word"),
        ("abc", "abc def", "<6 substring: overlap ok but ratio<0.65 -> false"),
        ("careem", "kareem", "ratio>=0.82 -> true"),
        ("Careem كريم", "kareem", "mixed Arabic/Latin: Latin survives -> true"),
        ("KNET بنك", "knet", "mixed: Arabic stripped, Latin equal -> true"),
        ("sultan center market", "sultan center store", "overlap-path candidate"),
        ("lulu", "lulu hypermarket", "ratio 0.4 low -> false"),
        ("grocery", "grocers", "stem near threshold"),
        ("coffee shop downtown", "coffee shop uptown", "3-token overlap-path"),
        ("mcdonalds", "burger king", "disjoint -> false"),
        ("بنك الكويت", "بنك الكويت الوطني", "Arabic-only: both normalize empty -> false (FR-C3)"),
        ("بنك الكويت", "بنك الكويت", "identical Arabic: normalizes empty -> false via guard (FR-C3)"),
        (None, "abc", "null left -> false"),
        ("abc", None, "null right -> false"),
        ("", "", "empty/empty -> false"),
        ("", "abc", "empty/nonempty -> false"),
        ("   ", "abc", "whitespace-only left -> false"),
        ("the sultan center", "sultan center the", "token reorder"),
        ("order 12345", "order 12346", "trailing digit differ"),
        ("abcdef", "abcxyz", "half replace 0.5 -> false"),
        ("sultan", "sultan", "short exact -> true"),
    ]
    set_b_cases = [{
        "left": left,
        "right": right,
        "note": note,
        "expected": _is_similar_duplicate_name(left, right),
    } for left, right, note in set_b_pairs]

    set_b = {
        "_meta": {
            "purpose": "isSimilarDuplicateName(left,right) == Flask _is_similar_duplicate_name(left,right)",
            "oracle": "personal-finance backend upload.py:653-675 (verbatim; byte-identical in personal_statera)",
            "python": PY,
            "generated_by": GEN_CMD,
        },
        "cases": set_b_cases,
    }

    a_path = os.path.join(FIXTURE_DIR, "fuzzy-ratio.fixture.json")
    b_path = os.path.join(FIXTURE_DIR, "fuzzy-similar-name.fixture.json")
    with open(a_path, "w", encoding="utf-8") as f:
        json.dump(set_a, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(b_path, "w", encoding="utf-8") as f:
        json.dump(set_b, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Set A: {len(set_a_cases)} ratio cases + 1 autojunk boundary -> {a_path}")
    print(f"  autojunk boundary: len_a={len(ba)} len_b={len(bb)} "
          f"true={brt!r} false={brf!r} differ={brt != brf}")
    print(f"Set B: {len(set_b_cases)} boolean cases -> {b_path}")


if __name__ == "__main__":
    main()
