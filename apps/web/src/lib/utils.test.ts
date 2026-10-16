import { describe, expect, it } from "vitest"
import { formatDisplayDate, formatKD, getBudgetUtilizationFill, labelForYM, prevMonth, toYearMonth, today } from "@/lib/utils"

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


  it("handles previous month rollover", () => {
    expect(prevMonth("2026-02")).toBe("2026-01")
    expect(prevMonth("2026-01")).toBe("2025-12")
  })

  it("labels current month as This Month", () => {
    const ym = toYearMonth(today())
    expect(labelForYM(ym)).toBe("This Month")
  })
})

// MOB-R103 B1 — Budget vs Spending's spent bars, in integer fils, budget 100.000 KD = 100000 fils.
describe("getBudgetUtilizationFill", () => {
  it("is green under 90% (spent 89.999 of 100.000)", () => {
    expect(getBudgetUtilizationFill(89999, 100000)).toBe("var(--color-success)")
  })

  it("is amber at 90% (spent 90.000 of 100.000)", () => {
    expect(getBudgetUtilizationFill(90000, 100000)).toBe("var(--color-warning)")
  })

  it("is amber exactly at the budget (spent 100.000 of 100.000)", () => {
    expect(getBudgetUtilizationFill(100000, 100000)).toBe("var(--color-warning)")
  })

  it("is red one fil over the budget (spent 100.001 of 100.000)", () => {
    expect(getBudgetUtilizationFill(100001, 100000)).toBe("var(--color-chart-over)")
  })

  it("is grey with no budget (spent 5.000)", () => {
    expect(getBudgetUtilizationFill(5000, null)).toBe("var(--color-muted-foreground)")
  })
})
