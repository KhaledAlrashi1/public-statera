// MOB-R55 P1 (amended MOB-R57 C) — the one savings rule, as a table. The SQL fragments are pinned
// against this same function on a real database in category-kind.integration.test.ts.
import { describe, expect, it } from "vitest"
import { categoryKind } from "./category-kind"

const CASES: ReadonlyArray<[name: string | null, isIncome: boolean, expected: string]> = [
  ["  savings ", false, "savings"],
  ["SAVINGS", false, "savings"],
  ["Investing", false, "savings"],
  ["Savings & investing", false, "savings"],
  ["Savings account", false, "expense"],
  ["Income: Salary", true, "income"],
  ["Groceries", false, "expense"],
  [null, false, "expense"],
  ["Savings", true, "income"],
  // MySQL's TRIM removes spaces only; the TypeScript rule matches it, so a tab is not trimmed.
  ["savings\t", false, "expense"],
]

describe("categoryKind (MOB-R55 P1)", () => {
  it.each(CASES)("%j (is_income %s) is %s", (name, isIncome, expected) => {
    expect(categoryKind(name, isIncome)).toBe(expected)
  })
})
