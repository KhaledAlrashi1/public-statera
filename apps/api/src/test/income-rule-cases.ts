// MOB-R75 C3 — ONE table of category names for the income rule, driving the tests of both sides:
// payday-lib's incomeCategoryFilter / expenseCategoryFilter (payday-lib.ts:17/:22) and Activity's
// /search type filter (routes/transactions.ts, income_only / exclude_income).
//
// The rule: a category is income when is_income is set, OR its name starts with "income" (any case).
// "Incomes" is income under the rule as it stands today: LIKE 'income%' matches any name that BEGINS
// with "income", so a longer word starting with it counts too. Recorded, not changed (MOB-R75 C3).

export interface IncomeRuleCase {
  /** Category name as stored. */
  name: string
  /** categories.is_income. */
  isIncome: boolean
  /** What the rule says. */
  income: boolean
  /** Which scratch user holds it: names are unique per user, and "Salary" appears twice. */
  user: "a" | "b"
}

export const INCOME_RULE_CASES: readonly IncomeRuleCase[] = [
  { name: "Salary", isIncome: true, income: true, user: "b" },
  { name: "Income: Salary", isIncome: false, income: true, user: "a" },
  { name: "income", isIncome: false, income: true, user: "a" },
  { name: "INCOME bonus", isIncome: false, income: true, user: "a" },
  { name: "Salary", isIncome: false, income: false, user: "a" },
  { name: "Bills income", isIncome: false, income: false, user: "a" },
  { name: "Incomes", isIncome: false, income: true, user: "a" },
]
