// MOB-R53 B5 — the /log keypad amount: normalisation, both digit caps, and exact totals.
import { describe, expect, it } from "vitest"
import { normalizeAmount, pressDecimal, pressDelete, pressDigit, sumKd } from "./log-amount"

const type = (keys: string) =>
  [...keys].reduce((s, k) => (k === "." ? pressDecimal(s) : k === "<" ? pressDelete(s) : pressDigit(s, k)), "")

describe("log amount", () => {
  it("normalises to 3 decimals for the API", () => {
    expect(normalizeAmount("1.25")).toBe("1.250")
    expect(normalizeAmount("1.")).toBe("1.000")
    expect(normalizeAmount("12")).toBe("12.000")
  })

  it("treats an empty or zero amount as no amount", () => {
    expect(normalizeAmount("")).toBeNull()
    expect(normalizeAmount("0.")).toBeNull()
    expect(normalizeAmount("0.000")).toBeNull()
  })

  it("caps the integer part at 6 digits", () => {
    expect(type("1234567")).toBe("123456")
  })

  it("caps the decimals at 3", () => {
    expect(type("1.2345")).toBe("1.234")
  })

  it("adds the decimal point once, and a leading point becomes 0.", () => {
    expect(type(".")).toBe("0.")
    expect(type("5..5")).toBe("5.5")
  })

  it("replaces a lone 0 with the next digit, and Delete removes the last key", () => {
    expect(type("07")).toBe("7")
    expect(type("12<")).toBe("1")
  })

  it("sums totals exactly in fils, never as floats", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(sumKd(["0.100", "0.200"])).toBe("0.300")
    expect(sumKd(["999999.999", "0.001"])).toBe("1000000.000")
    expect(sumKd([])).toBe("0.000")
  })
})
