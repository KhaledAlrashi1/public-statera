// MOB-R98 B1 — "Fill from my spending": the one rule that turns her last three complete periods into budget
// suggestions. Pure, in integer fils (1 KD = 1000 fils): no parseFloat, no Number on an amount string.
//
//   History   the last 3 complete periods before the current one, from dashboard-metrics (monthly[].expense_kd
//             and expense_by_category, dashboard-snapshot-lib.ts:241-263). The caller asks for months=3 and
//             until = the period before today's (shiftKey, payday-months.ts:50, from currentMonthKeyNow,
//             utils.ts:159); the server builds those keys with buildMonthWindow (analytics-helpers.ts:43).
//   Counted   a period counts only if it holds any expense, read as the server's expense total for it
//             (expense_kd > 0: not income, not savings-kind). n = counted periods, 0 to 3.
//   Usual     per category over the counted periods, a period without its spend being 0 (a net refund too):
//             the median of 3, the mean of 2, the value of 1.
//   Suggest   usual x 115 / 100, rounded UP to a multiple of 5.000 KD; an exact multiple stays.
//   No row    n = 0; usual = 0; already budgeted in the selected period; not an expense-kind category under
//             the server's rule (the categories list's `kind`, categoryKind at category-kind.ts:31-34, served
//             by GET /api/categories at categories.ts:82; income and savings-kind both fall here, and so does a
//             name missing from her list); "Uncategorized".

export type FillPeriod = {
  /** The server's expense total for the period ("1234.500"). */
  expenseKd: string
  /** expense_by_category for the period: category name -> "123.450". */
  byCategory: Record<string, string>
}

export type FillCategory = { name: string; kind?: "income" | "savings" | "expense" }

export type FillRow = {
  category: string
  /** The usual spend, rounded half up to the fil (a mean of 2 can fall on half a fil). */
  usualFils: number
  suggestionFils: number
}

export const FILL_UPLIFT_PERCENT = 115
export const FILL_STEP_FILS = 5000
export const FILL_HISTORY_PERIODS = 3
const UNCATEGORIZED = "Uncategorized"

/** "123.450" -> 123450; "-1.5" -> -1500; anything else -> null. Exact, from the string. */
export function kdToFils(kd: string | null | undefined): number | null {
  const m = /^(-)?([0-9]+)(?:\.([0-9]{1,3}))?$/.exec(String(kd ?? "").trim())
  if (!m) return null
  const fils = Number(m[2]) * 1000 + Number((m[3] ?? "").padEnd(3, "0"))
  return m[1] ? -fils : fils
}

/** 75000 -> "75.000"; -1500 -> "-1.500". */
export function filsToKd(fils: number): string {
  const sign = fils < 0 ? "-" : ""
  const abs = Math.abs(fils)
  return `${sign}${(abs - (abs % 1000)) / 1000}.${String(abs % 1000).padStart(3, "0")}`
}

/** ceil(a / b) for a >= 0, b > 0 integers, by remainder: no float division. */
function ceilDiv(a: number, b: number): number {
  const r = a % b
  return (a - r) / b + (r === 0 ? 0 : 1)
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/** n: the periods that count (expense_kd > 0). MOB-R100 C2 picks the sheet's no-row line from it. */
export function countFillPeriods(periods: FillPeriod[]): number {
  return countedPeriods(periods).length
}

function countedPeriods(periods: FillPeriod[]): FillPeriod[] {
  return periods.filter((p) => (kdToFils(p.expenseKd) ?? 0) > 0)
}

export function suggestBudgets({
  periods,
  categories,
  budgeted,
}: {
  periods: FillPeriod[]
  categories: FillCategory[]
  /** Category names that already have a budget in the selected period. */
  budgeted: string[]
}): FillRow[] {
  const counted = countedPeriods(periods)
  const n = counted.length
  if (n === 0) return []

  const expenseNames = new Set(categories.filter((c) => c.kind === "expense").map((c) => c.name))
  const budgetedKeys = new Set(budgeted.map(nameKey))
  const names = new Set(counted.flatMap((p) => Object.keys(p.byCategory)))

  const rows: FillRow[] = []
  for (const name of names) {
    if (name === UNCATEGORIZED || !expenseNames.has(name) || budgetedKeys.has(nameKey(name))) continue
    const values = counted.map((p) => Math.max(0, kdToFils(p.byCategory[name]) ?? 0)).sort((a, b) => a - b)
    // Twice the usual, so a mean of 2 stays an integer.
    const usual2 = n === 3 ? values[1] * 2 : n === 2 ? values[0] + values[1] : values[0] * 2
    if (usual2 === 0) continue
    const steps = ceilDiv(usual2 * FILL_UPLIFT_PERCENT, 2 * 100 * FILL_STEP_FILS)
    rows.push({ category: name, usualFils: ceilDiv(usual2, 2), suggestionFils: steps * FILL_STEP_FILS })
  }
  return rows.sort((a, b) => b.suggestionFils - a.suggestionFils || a.category.localeCompare(b.category))
}
