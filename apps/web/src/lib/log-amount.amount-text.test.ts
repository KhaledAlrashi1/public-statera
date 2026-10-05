// MOB-R63 D / RM-27 — the /log path: normalizeAmount reads through the same normalizer as every
// typed amount box, so it gives the same value for the same text (or none). The test device
// writes decimals with "." (jsdom's default locale, en-US), like the tester's iPhone.
import { describe, expect, it } from "vitest"
import { normalizeAmount } from "./log-amount"

const CASES: ReadonlyArray<[label: string, text: string, expected: string | null]> = [
  ["1.5", "1.5", "1.500"],
  ["1,5", "1,5", null],
  ["1,500", "1,500", "1500.000"],
  ["U+0661 U+066B U+0665", "\u0661\u066B\u0665", "1.500"],
  ["U+0661 U+0665", "\u0661\u0665", "15.000"],
  ["1,250.5", "1,250.5", "1250.500"],
  ["1,2,3", "1,2,3", null],
  ["(empty)", "", null],
]

describe("/log amount text (MOB-R63 D)", () => {
  it.each(CASES)("%s", (_label, text, expected) => {
    expect(normalizeAmount(text)).toBe(expected)
  })
})
