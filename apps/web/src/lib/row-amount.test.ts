// MOB-R116 D5 — a row's amount: a refund (negative, not income) is money back, "+KD x" of its magnitude in the
// success colour; spending and income read as they did (MOB-R81 C6).
import { describe, expect, it } from "vitest"

import { isRefundRow, rowAmount } from "./row-amount"

describe("rowAmount (MOB-R116 D5)", () => {
  it("a refund is +KD of its magnitude in the success colour", () => {
    expect(isRefundRow({ amount_kd: "-2.250", category_counts_as_income: false })).toBe(true)
    expect(rowAmount({ amount_kd: "-2.250", category_counts_as_income: false })).toEqual({ text: "+KD 2.250", className: "text-success" })
  })

  it("spending and income are unchanged", () => {
    expect(rowAmount({ amount_kd: "2.250", category_counts_as_income: false })).toEqual({ text: "KD 2.250", className: "text-foreground" })
    expect(rowAmount({ amount_kd: "50.000", category_counts_as_income: true })).toEqual({ text: "+KD 50.000", className: "text-success" })
    expect(isRefundRow({ amount_kd: "2.250" })).toBe(false)
  })
})
