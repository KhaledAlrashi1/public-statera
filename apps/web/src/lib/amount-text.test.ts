// MOB-R63 D / RM-27 — the normalizer's rules, on both kinds of device. A "." device (English,
// region Kuwait: the tester's iPhone) reads "," as a thousands separator in groups of three; a ","
// device reads one separator as the decimal point. Anything else is refused, never stripped.
import { afterEach, describe, expect, it, vi } from "vitest"
import { caretAfterRegroup, groupedKd, parseAmountText, regroupTyped } from "./amount-text"

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

// MOB-R105 D1 — the grouped box: it moves only the commas it wrote itself.
describe("regroupTyped — the grouped box (MOB-R105 D1)", () => {
  it("groups what she types, keeping the decimals as typed", () => {
    expect(regroupTyped("150", true, "1500", ".")).toEqual({ text: "1,500", owned: true })
    expect(regroupTyped("1,500.2", true, "1,500.25", ".")).toEqual({ text: "1,500.25", owned: true })
    expect(regroupTyped("", true, "1500.250", ".")).toEqual({ text: "1,500.250", owned: true })
  })

  it("moves its own commas when she deletes a digit", () => {
    // "1,500" with the 5 deleted: the box's comma no longer sits on a group, so it regroups.
    expect(regroupTyped("1,500", true, "1,00", ".")).toEqual({ text: "100", owned: true })
  })

  it("keeps a comma she typed exactly where she put it, for the normalizer to read or refuse", () => {
    expect(regroupTyped("1", true, "1,", ".")).toEqual({ text: "1,", owned: false })
    expect(regroupTyped("1,", false, "1,5", ".")).toEqual({ text: "1,5", owned: false })
    expect(parseAmountText("1,5", ".")).toEqual({ kind: "refused" })
    // Her own commas, once they make a group of three, read like the box's.
    expect(regroupTyped("1,50", false, "1,500", ".")).toEqual({ text: "1,500", owned: true })
  })

  it("does not group on a device that writes decimals with ','", () => {
    expect(regroupTyped("150", true, "1500", ",")).toEqual({ text: "1500", owned: true })
    expect(groupedKd("1500.000", ",")).toBe("1500.000")
    expect(groupedKd("1500.000", ".")).toBe("1,500.000")
    // Letters and Arabic-Indic digits are left as typed.
    expect(regroupTyped("150", true, "1500a", ".")).toEqual({ text: "1500a", owned: true })
    expect(regroupTyped("", true, "\u0661\u0665\u0660\u0660", ".").text).toBe("\u0661\u0665\u0660\u0660")
  })

  it("keeps the caret after the same digit when a comma appears", () => {
    // "150|" + "0" -> "1500|" -> "1,500|"; and a digit typed after the 1 of "1,500" -> "12|,500" -> "12,|500".
    expect(caretAfterRegroup("1500", 4, "1,500")).toBe(5)
    expect(caretAfterRegroup("12,500", 2, "12,500")).toBe(2)
    expect(caretAfterRegroup("1,2500", 3, "12,500")).toBe(2)
  })
})
