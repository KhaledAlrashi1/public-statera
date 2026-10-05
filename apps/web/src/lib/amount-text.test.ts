// MOB-R63 D / RM-27 — the normalizer's rules, on both kinds of device. A "." device (English,
// region Kuwait: the tester's iPhone) reads "," as a thousands separator in groups of three; a ","
// device reads one separator as the decimal point. Anything else is refused, never stripped.
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseAmountText } from "./amount-text"

afterEach(() => vi.restoreAllMocks())

describe("parseAmountText — digits and separators (MOB-R63 D2)", () => {
  it("reads extended Arabic-Indic digits (U+06F0-U+06F9)", () => {
    expect(parseAmountText("\u06F1\u06F5", ".")).toMatchObject({ kind: "ok", kd: "15.000" })
  })

  it("removes the Arabic thousands separator (U+066C)", () => {
    expect(parseAmountText("\u0661\u066C\u0662\u0663\u0664", ".")).toMatchObject({ kind: "ok", kd: "1234.000" })
  })

  it("removes spaces", () => {
    expect(parseAmountText("1 234.5", ".")).toMatchObject({ kind: "ok", kd: "1234.500" })
  })

  it("refuses letters instead of stripping them", () => {
    expect(parseAmountText("12ab", ".")).toEqual({ kind: "refused" })
  })

  it("refuses more than 3 decimals instead of truncating them", () => {
    expect(parseAmountText("1.2345", ".")).toEqual({ kind: "refused" })
  })

  it("refuses a second decimal point", () => {
    expect(parseAmountText("1.2.3", ".")).toEqual({ kind: "refused" })
  })

  it("treats a lone decimal point as empty", () => {
    expect(parseAmountText(".", ".")).toEqual({ kind: "empty" })
  })
})

describe("parseAmountText — a device that writes decimals with '.'", () => {
  it("reads ',' in groups of three as thousands", () => {
    expect(parseAmountText("12,500.250", ".")).toMatchObject({ kind: "ok", kd: "12500.250" })
  })

  it("refuses a ',' that is not in groups of three", () => {
    expect(parseAmountText("1234,5", ".")).toEqual({ kind: "refused" })
  })

  it("refuses a ',' after the decimal point", () => {
    // The whole part "1,500" is a valid grouping, so only the "," after the point refuses this.
    expect(parseAmountText("1,500.5,0", ".")).toEqual({ kind: "refused" })
  })
})

describe("parseAmountText — a device that writes decimals with ','", () => {
  it("reads one ',' as the decimal point", () => {
    expect(parseAmountText("1,5", ",")).toMatchObject({ kind: "ok", kd: "1.500" })
  })

  it("reads one '.' as the decimal point", () => {
    expect(parseAmountText("1.5", ",")).toMatchObject({ kind: "ok", kd: "1.500" })
  })

  it("refuses more than one separator", () => {
    // Two separators, each followed by few enough digits that no other rule refuses it.
    expect(parseAmountText("1.5,5", ",")).toEqual({ kind: "refused" })
  })

  it("takes the separator from the browser locale when none is passed", () => {
    vi.spyOn(Intl, "NumberFormat").mockImplementation(
      () =>
        ({
          formatToParts: () => [
            { type: "integer", value: "1" },
            { type: "decimal", value: "," },
            { type: "fraction", value: "5" },
          ],
        }) as unknown as Intl.NumberFormat,
    )
    expect(parseAmountText("1,5")).toMatchObject({ kind: "ok", kd: "1.500" })
  })
})
