// MOB-R69 E3 (c)/(d) — /log's category picker lists.
//
// (d) Income-kind categories never appear in /log's EXPENSE picker. The kind is the server's
//     (GET /api/categories `kind`, lib/category-kind.ts on the API: is_income, or a name starting
//     with "income"); there is no second copy of the rule here.
// (c) "Your usual": up to six of HER categories, ranked by her own use — the `transaction_count`
//     GET /api/categories already returns — most used first, ties by name. No backend change.
//     CC's fallback when she has no history (every count 0): her own categories by name, topped up
//     to six from the app's suggested names (lib/suggested-names), which are saved only if used.
import type { Category } from "@/types/api"
import { GENERIC_SAVINGS_CATEGORY, SUGGESTED_CATEGORIES } from "./suggested-names"

export const USUAL_CATEGORY_LIMIT = 6

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" })

/** Her categories that may take an expense: every kind except income. */
export function expenseCategories(list: readonly Category[]): Category[] {
  return list.filter((c) => c.kind !== "income")
}

/** Up to six names for the picker before she types (see the header). */
export function usualCategoryNames(list: readonly Category[], limit = USUAL_CATEGORY_LIMIT): string[] {
  const own = expenseCategories(list)
  const hasHistory = own.some((c) => (c.transaction_count ?? 0) > 0)
  if (hasHistory) {
    return [...own]
      .sort((a, b) => (b.transaction_count ?? 0) - (a.transaction_count ?? 0) || byName(a.name, b.name))
      .slice(0, limit)
      .map((c) => c.name)
  }
  const names = own.map((c) => c.name).sort(byName).slice(0, limit)
  const taken = new Set(list.map((c) => c.name.toLowerCase()))
  for (const s of SUGGESTED_CATEGORIES) {
    if (names.length >= limit) break
    if (s === GENERIC_SAVINGS_CATEGORY || taken.has(s.toLowerCase())) continue
    names.push(s)
  }
  return names
}

/** Everything typing can find: her non-income categories, then suggested names she does not own. */
export function searchableCategoryNames(list: readonly Category[]): string[] {
  const own = expenseCategories(list).map((c) => c.name)
  const taken = new Set(list.map((c) => c.name.toLowerCase()))
  const extra = SUGGESTED_CATEGORIES.filter((s) => s !== GENERIC_SAVINGS_CATEGORY && !taken.has(s.toLowerCase()))
  return [...own, ...extra]
}
