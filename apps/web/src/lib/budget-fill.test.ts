import { describe, expect, it } from "vitest"

import { filsToKd, suggestBudgets, type FillCategory, type FillPeriod } from "./budget-fill"

// MOB-R98 B5 — literal values, channel-computed.
const CATEGORIES: FillCategory[] = [
  { name: "Dining", kind: "expense" },
  { name: "Groceries", kind: "expense" },
  { name: "Salary", kind: "income" },
  { name: "Savings", kind: "savings" },
]

/** One period per value: Dining spends the value (absent when "0"), Groceries 10.000 keeps the period counted. */
function periodsFor(values: string[]): FillPeriod[] {
  return values.map((v) => ({
    expenseKd: "999.000",
    byCategory: v === "0" ? { Groceries: "10.000" } : { Dining: v, Groceries: "10.000" },
  }))
}

function dining(periods: FillPeriod[], budgeted: string[] = []) {
  const row = suggestBudgets({ periods, categories: CATEGORIES, budgeted }).find((r) => r.category === "Dining")
  return row ? filsToKd(row.suggestionFils) : null
}

describe("suggestBudgets (MOB-R98 B1)", () => {
  it("median of three: [50.000, 63.500, 70.750] -> 75.000, usual 63.500", () => {
    const rows = suggestBudgets({ periods: periodsFor(["50.000", "63.500", "70.750"]), categories: CATEGORIES, budgeted: [] })
    const row = rows.find((r) => r.category === "Dining")
    expect(row && filsToKd(row.suggestionFils)).toBe("75.000")
    expect(row && filsToKd(row.usualFils)).toBe("63.500")
  })

  it("a spike does not move the median: [20.000, 22.000, 200.000] -> 30.000", () => {
    expect(dining(periodsFor(["20.000", "22.000", "200.000"]))).toBe("30.000")
  })

  it("a counted period without the category is 0: [0, 30.000, 40.000] -> 35.000", () => {
    expect(dining(periodsFor(["0", "30.000", "40.000"]))).toBe("35.000")
  })

  it("a usual of 0 gives no row: [0, 0, 30.000]", () => {
    expect(dining(periodsFor(["0", "0", "30.000"]))).toBeNull()
  })

  it("mean of two: [40.000, 50.000] -> 55.000", () => {
    expect(dining(periodsFor(["40.000", "50.000"]))).toBe("55.000")
  })

  it("the value of one: [56.750] -> 70.000", () => {
    expect(dining(periodsFor(["56.750"]))).toBe("70.000")
  })

  it("an exact multiple of 5.000 stays: [100.000 x3] -> 115.000", () => {
    expect(dining(periodsFor(["100.000", "100.000", "100.000"]))).toBe("115.000")
  })

  it("rounds up to the next 5.000: [350.000 x3] -> 405.000", () => {
    expect(dining(periodsFor(["350.000", "350.000", "350.000"]))).toBe("405.000")
  })

  it("a period with no expense at all is not counted", () => {
    const periods: FillPeriod[] = [{ expenseKd: "0.000", byCategory: {} }, ...periodsFor(["40.000", "50.000"])]
    // Counted, it would make [0, 40.000, 50.000] -> median 40.000 -> 50.000; not counted, the mean of two.
    expect(dining(periods)).toBe("55.000")
    expect(suggestBudgets({ periods: [periods[0]], categories: CATEGORIES, budgeted: [] })).toEqual([])
  })

  it("a category already budgeted in the selected period gives no row", () => {
    const periods = periodsFor(["50.000", "63.500", "70.750"])
    expect(dining(periods, ["Dining"])).toBeNull()
    expect(dining(periods, ["Groceries"])).toBe("75.000")
  })

  it("an income category gives no row", () => {
    const periods = periodsFor(["50.000", "60.000", "70.000"]).map((p) => ({ ...p, byCategory: { ...p.byCategory, Salary: "100.000" } }))
    expect(suggestBudgets({ periods, categories: CATEGORIES, budgeted: [] }).map((r) => r.category)).not.toContain("Salary")
  })

  it("a savings-kind category gives no row", () => {
    const periods = periodsFor(["50.000", "60.000", "70.000"]).map((p) => ({ ...p, byCategory: { ...p.byCategory, Savings: "200.000" } }))
    expect(suggestBudgets({ periods, categories: CATEGORIES, budgeted: [] }).map((r) => r.category)).not.toContain("Savings")
  })

  it("\"Uncategorized\" gives no row", () => {
    const periods = periodsFor(["50.000", "60.000", "70.000"]).map((p) => ({ ...p, byCategory: { ...p.byCategory, Uncategorized: "80.000" } }))
    const rows = suggestBudgets({ periods, categories: [...CATEGORIES, { name: "Uncategorized", kind: "expense" }], budgeted: [] })
    expect(rows.map((r) => r.category)).toEqual(["Dining", "Groceries"])
  })
})
