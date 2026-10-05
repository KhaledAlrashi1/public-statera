// MOB-R59 D1/D2, MOB-R60 D1 — the generic "Savings & investing" entry is offered, and hidden once
// the user owns a savings-kind category (the server's kind, passed in as a flag).
import { describe, expect, it } from "vitest"
import { categoryOptions } from "./suggested-names"

describe("categoryOptions — generic savings entry (MOB-R59 D1/D2)", () => {
  it("offers Savings & investing to a user without a savings-kind category", () => {
    expect(categoryOptions(["Groceries"], false)).toContain("Savings & investing")
  })

  it("hides it when the user owns a savings-kind category", () => {
    const options = categoryOptions(["Groceries", "Savings"], true)
    expect(options).not.toContain("Savings & investing")
    expect(options).toContain("Savings")
  })
})
