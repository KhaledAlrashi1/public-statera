const FALLBACK_COLOR = "var(--color-muted-foreground)"
const FALLBACK_EXPENSE_COLOR = "oklch(0.6 0.1 200)"

function cssVar(name: string, fallback = FALLBACK_COLOR): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function getChartColors(): string[] {
  return [
    cssVar("--color-chart-1"),
    cssVar("--color-chart-2"),
    cssVar("--color-chart-3"),
    cssVar("--color-chart-4"),
    cssVar("--color-chart-5"),
    cssVar("--color-chart-6"),
    cssVar("--color-chart-7"),
  ]
}

export function getExpenseColors(): string[] {
  const vars = [
    "--color-chart-1",
    "--color-chart-2",
    "--color-chart-3",
    "--color-chart-4",
    "--color-chart-5",
    "--color-chart-6",
    "--color-chart-7",
    "--color-chart-accent-1",
  ]
  return vars.map((v) => cssVar(v, FALLBACK_EXPENSE_COLOR))
}

export const CHART_STROKES = {
  income: "var(--color-chart-income, var(--color-success))",
  expense: "var(--color-chart-expense, var(--color-primary))",
  spendingTrend: "var(--color-chart-4, var(--color-primary))",
  legendText: "var(--color-muted-foreground)",
} as const

export const CHART_FILLS = {
  budget: "var(--color-chart-budget, var(--color-chart-4, var(--color-primary)))",
  spent: "var(--color-chart-expense, var(--color-primary))",
} as const
