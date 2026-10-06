// MOB-R77 C2 — the serializer turns the SQL rule's 0/1 (incomeCategoryFilter() as a select column)
// into category_counts_as_income. Hermetic, so CI sees the field: the table-driven cases against real
// MySQL are in routes/income-flag.integration.test.ts. A driver may hand back the flag as a number or a
// string, and "0" must read false — Boolean("0") would read true.
import { describe, it, expect } from "vitest"
import { serializeTransaction } from "./transaction-lib"

const row = {
  id: 1, date: "2026-09-15", name: "Pay", memo: null, amountKd: "1.000", source: "manual",
  importBatchId: null, categoryId: 2, merchantId: null, categoryName: "Salary", merchantName: null,
}

describe("serializeTransaction — category_counts_as_income (MOB-R77 C2)", () => {
  it("emits true when the rule column is 1", () => {
    expect(serializeTransaction({ ...row, categoryCountsAsIncome: 1 }).category_counts_as_income).toBe(true)
  })

  it("emits false when the rule column is 0", () => {
    expect(serializeTransaction({ ...row, categoryCountsAsIncome: 0 }).category_counts_as_income).toBe(false)
  })

  it("reads a string flag by its value: '0' is false, '1' is true", () => {
    expect(serializeTransaction({ ...row, categoryCountsAsIncome: "0" }).category_counts_as_income).toBe(false)
    expect(serializeTransaction({ ...row, categoryCountsAsIncome: "1" }).category_counts_as_income).toBe(true)
  })
})
