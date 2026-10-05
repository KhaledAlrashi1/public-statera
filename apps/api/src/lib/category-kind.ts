// MOB-R55 P1 (amended MOB-R57 C) — ONE RULE, ONE PLACE for a category's kind.
//
//   income   the existing backend income rule, unchanged (payday-lib.ts incomeCategoryFilter:
//            is_income IS TRUE, or the lower-cased name starts with "income");
//   savings  otherwise, when the name, trimmed of spaces and lower-cased, is exactly "savings",
//            "investing" or "savings & investing";
//   expense  everything else (including a category-less transaction).
//
// The TypeScript function and the SQL fragments below are the same rule; a parity test pins them
// against each other on a real database (category-kind.integration.test.ts). Two details keep them
// identical: the trim removes SPACES only (MySQL's TRIM), and the savings comparison is byte-exact
// (COLLATE utf8mb4_bin), so the column's accent-insensitive collation cannot widen it. Income
// detection keeps its existing (collation-dependent) LIKE: K1 does not change income (P4, KS8).

import { sql } from "drizzle-orm"
import { categories } from "../db/schema/categories"
import { incomeCategoryFilter } from "./payday-lib"

export type CategoryKind = "income" | "savings" | "expense"

export const SAVINGS_CATEGORY_NAMES: readonly string[] = ["savings", "investing", "savings & investing"]

/** A non-income category's name test: space-trimmed, lower-cased, exact match. */
export function isSavingsCategoryName(name: string | null | undefined): boolean {
  const key = (name ?? "").replace(/^ +| +$/g, "").toLowerCase()
  return SAVINGS_CATEGORY_NAMES.includes(key)
}

export function categoryKind(name: string | null | undefined, isIncome: boolean | null | undefined): CategoryKind {
  if (isIncome === true || (name ?? "").toLowerCase().startsWith("income")) return "income"
  return isSavingsCategoryName(name) ? "savings" : "expense"
}

function savingsNameSql() {
  return sql`(LOWER(TRIM(COALESCE(${categories.name}, ''))) COLLATE utf8mb4_bin IN ('savings', 'investing', 'savings & investing'))`
}

/** Savings-kind rows: not income, and a savings name. */
export function savingsCategoryFilter() {
  return sql<number>`(NOT ${incomeCategoryFilter()} AND ${savingsNameSql()})`
}

/** Expense-kind rows only: not income and not savings. Use for every EXPENSE TOTAL (P2). */
export function expenseOnlyCategoryFilter() {
  return sql<number>`(NOT ${incomeCategoryFilter()} AND NOT ${savingsNameSql()})`
}
