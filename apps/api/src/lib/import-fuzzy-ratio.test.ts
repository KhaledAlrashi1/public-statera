/**
 * Fixture-based equivalence tests for the difflib.SequenceMatcher.ratio() port
 * in import-lib.ts — TODO(fuzzy-ratio-equivalence-fixture).
 *
 * Two committed fixtures, generated ONCE from CPython's stdlib difflib via
 *   python3 tools/capture-difflib-ratio.py
 * (see the _meta block in each JSON for the pinned Python version):
 *
 *   Set A  fuzzy-ratio.fixture.json         sequenceRatio(a,b) == SequenceMatcher(None,a,b).ratio()
 *                                           EXACT float equality (FR-C4: 2*M/T is IEEE-754
 *                                           double division in both CPython and V8 -> bit-identical;
 *                                           no epsilon, which would mask a real 0.82/0.65 boundary drift)
 *   Set B  fuzzy-similar-name.fixture.json  isSimilarDuplicateName(...) == Flask _is_similar_duplicate_name(...)
 *
 * Do NOT "fix" a failing expectation by editing the fixture — regenerate it with the
 * script (which re-derives every value from difflib) and investigate the port instead.
 * Approved bundle: docs/modules/phase4-fuzzy-ratio-equivalence-fixture.md (FR-A1..A3, FR-C1..C6).
 */
import { describe, it, expect } from "vitest"
import { sequenceRatio, isSimilarDuplicateName } from "./import-lib"
import ratioFixture from "./__fixtures__/fuzzy-ratio.fixture.json"
import nameFixture from "./__fixtures__/fuzzy-similar-name.fixture.json"

type RatioCase = { a: string; b: string; note: string; ratio: number }
type BoundaryCase = { a: string; b: string; ratio_autojunk_true: number; ratio_autojunk_false: number }
type NameCase = { left: string | null; right: string | null; note: string; expected: boolean }

const ratioCases = ratioFixture.cases as RatioCase[]
const boundary = ratioFixture.autojunk_boundary as BoundaryCase
const nameCases = nameFixture.cases as NameCase[]

describe("Set A — sequenceRatio == difflib.SequenceMatcher(None,a,b).ratio() (exact)", () => {
  it.each(ratioCases)("$note :: ($a | $b)", ({ a, b, ratio }) => {
    // EXACT float equality — no epsilon (FR-C4).
    expect(sequenceRatio(a, b)).toBe(ratio)
  })
})

describe("Set A — autojunk boundary (FR-C5): port implements autojunk=False", () => {
  it("port ratio equals difflib autojunk=False on a >=200-char popular-char pair", () => {
    expect(sequenceRatio(boundary.a, boundary.b)).toBe(boundary.ratio_autojunk_false)
  })
  it("the boundary pair genuinely diverges between autojunk modes (fixture integrity)", () => {
    // Documents where the domain guarantee ends: difflib's default (autojunk=True, = Flask's
    // actual call) differs here, but transaction names never reach len>=200 post-normalization.
    expect(boundary.ratio_autojunk_true).not.toBe(boundary.ratio_autojunk_false)
    expect(sequenceRatio(boundary.a, boundary.b)).not.toBe(boundary.ratio_autojunk_true)
  })
})

describe("Set B — isSimilarDuplicateName == Flask _is_similar_duplicate_name", () => {
  it.each(nameCases)("$note :: ($left | $right)", ({ left, right, expected }) => {
    expect(isSimilarDuplicateName(left, right)).toBe(expected)
  })
})
