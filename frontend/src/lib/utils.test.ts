import { describe, expect, it } from "vitest"
import { formatKD, isIncome, labelForYM, prevMonth, toYearMonth, today } from "@/lib/utils"

describe("utils", () => {
  it("formats KD amounts with 3 decimals", () => {
    expect(formatKD(12)).toBe("KD 12.000")
    expect(formatKD("3.5")).toBe("KD 3.500")
    expect(formatKD("bad")).toBe("KD 0.000")
  })

  it("detects income categories robustly", () => {
    expect(isIncome("income")).toBe(true)
    expect(isIncome("Income: Salary")).toBe(true)
    expect(isIncome("Income Salary")).toBe(true)
    expect(isIncome(" groceries ")).toBe(false)
  })

  it("handles previous month rollover", () => {
    expect(prevMonth("2026-02")).toBe("2026-01")
    expect(prevMonth("2026-01")).toBe("2025-12")
  })

  it("labels current month as This Month", () => {
    const ym = toYearMonth(today())
    expect(labelForYM(ym)).toBe("This Month")
  })
})
