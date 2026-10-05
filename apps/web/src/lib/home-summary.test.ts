// MOB-R68 E2 — Home's heading states, eyebrow, sub line and footer percentages.
import { describe, expect, it } from "vitest"

import { homeEyebrow, homeHeading, homeSubLine, percentOfIncome, remainingBar } from "./home-summary"
import { toFils } from "./log-amount"

const CURRENT = "2026-10"

describe("homeHeading (MOB-R68 D2)", () => {
  it("current month, Remaining above 0: October is / on track", () => {
    expect(homeHeading("2026-10", CURRENT, true, 1n)).toEqual({ line1: "October is", line2: "on track" })
  })

  it("current month, Remaining 0: October is / over income", () => {
    expect(homeHeading("2026-10", CURRENT, true, 0n)).toEqual({ line1: "October is", line2: "over income" })
  })

  it("past month, Remaining above 0: September / ended ahead", () => {
    expect(homeHeading("2026-09", CURRENT, true, 5000n)).toEqual({ line1: "September", line2: "ended ahead" })
  })

  it("past month, Remaining 0: September / ended over", () => {
    expect(homeHeading("2026-09", CURRENT, true, 0n)).toEqual({ line1: "September", line2: "ended over" })
  })

  it("income not set: no heading and no sub line", () => {
    expect(homeHeading("2026-10", CURRENT, false, 0n)).toBeNull()
    expect(homeSubLine(false, 0n, "0.000")).toBeNull()
  })
})

describe("homeEyebrow (MOB-R68 D1)", () => {
  it("the current month names the day: October 2026 · day 5 of 31", () => {
    expect(homeEyebrow("2026-10", CURRENT, new Date(2026, 9, 5))).toBe("October 2026 · day 5 of 31")
  })

  it("a past month is closed: September 2026 · closed", () => {
    expect(homeEyebrow("2026-09", CURRENT, new Date(2026, 9, 5))).toBe("September 2026 · closed")
  })
})

describe("homeSubLine (MOB-R68 D2)", () => {
  it("Remaining above 0: KD <Remaining> left after spending and saving.", () => {
    expect(homeSubLine(true, 1234500n, "1234.500")).toBe("KD 1,234.500 left after spending and saving.")
  })

  it("Remaining 0: Spending and saving have reached your income.", () => {
    expect(homeSubLine(true, 0n, "0.000")).toBe("Spending and saving have reached your income.")
  })
})

describe("percentOfIncome (MOB-R68 D3)", () => {
  it("rounds half up to a whole percent", () => {
    expect(percentOfIncome(125n, 1000n)).toBe(13) // 12.5
    expect(percentOfIncome(124n, 1000n)).toBe(12) // 12.4
    expect(percentOfIncome(1n, 3n)).toBe(33) // 33.33
    expect(percentOfIncome(2n, 3n)).toBe(67) // 66.67
  })

  it("works in integer fils: 0.145 of income is 15%, where a float would give 14", () => {
    // 0.145 * 100 is 14.499999999999998 in floating point; the exact value is 14.5.
    expect(Math.round(0.145 * 100)).toBe(14)
    expect(percentOfIncome(toFils("145.000"), toFils("1000.000"))).toBe(15)
  })
})

describe("remainingBar (MOB-R68 D3)", () => {
  it("cumulative edges: the three widths sum to 100", () => {
    // expenses 334, savings 334, remaining 332 of 1000
    const bar = remainingBar(334000n, 334000n, 332000n, 1000000n)
    expect(bar).toEqual({ expensesPct: 33, savingsPct: 34, trackPct: 33, leftPct: 33 })
    expect(bar.expensesPct + bar.savingsPct + bar.trackPct).toBe(100)
  })

  it("over income, the bar total is capped at 100 and nothing is left", () => {
    // expenses 900, savings 300 of income 1000: Remaining is clamped at 0 (K1).
    expect(remainingBar(900000n, 300000n, 0n, 1000000n)).toEqual({
      expensesPct: 90,
      savingsPct: 10,
      trackPct: 0,
      leftPct: 0,
    })
  })

  it("expenses alone above income fill the bar; the Expenses footer itself is not capped", () => {
    expect(remainingBar(1250000n, 100000n, 0n, 1000000n)).toEqual({
      expensesPct: 100,
      savingsPct: 0,
      trackPct: 0,
      leftPct: 0,
    })
    expect(percentOfIncome(1250000n, 1000000n)).toBe(125)
  })
})
