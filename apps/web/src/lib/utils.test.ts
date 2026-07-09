import { describe, expect, it } from "vitest"
import { formatDisplayDate, formatKD, isIncome, labelForYM, prevMonth, toYearMonth, today } from "@/lib/utils"

describe("utils", () => {
  it("formats KD amounts with 3 decimals and thousands grouping", () => {
    expect(formatKD(12)).toBe("KD 12.000")
    expect(formatKD("3.5")).toBe("KD 3.500")
    expect(formatKD("bad")).toBe("KD 0.000")
    expect(formatKD(1960)).toBe("KD 1,960.000")
    expect(formatKD("3650")).toBe("KD 3,650.000")
    expect(formatKD(-12345.6)).toBe("KD -12,345.600")
  })

  it("formats ISO dates as day-first display strings", () => {
    expect(formatDisplayDate("2026-07-28")).toBe("28 Jul 2026")
    expect(formatDisplayDate("2026-03-01")).toBe("1 Mar 2026")
    expect(formatDisplayDate("2026-02-23T10:20:30Z")).toBe("23 Feb 2026")
    expect(formatDisplayDate("")).toBe("")
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date")
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
