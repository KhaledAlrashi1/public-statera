const FALLBACK_COLOR = "var(--color-muted-foreground)"
const FALLBACK_EXPENSE_COLOR = "oklch(0.6 0.1 200)"

function cssVar(name: string, fallback = FALLBACK_COLOR): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

// MOB-R102 C2 — tokens, not resolved values. Reading the computed value froze the colours of the
// theme the chart rendered in, so after a theme switch the Rent bar kept light-mode ink on the dark
// card (1.23:1). A var() string follows the theme.
export function getChartColors(): string[] {
  return [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-6)",
    "var(--color-chart-7)",
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
  // MOB-R102 C3 — Budget vs Spending: spent at or under its budget, and over it.
  spentOnOrUnder: "var(--color-success)",
  spentOver: "var(--color-destructive)",
} as const

// MOB-R102 C2 — the hover cursor. Recharts' default is a #ccc literal (1.56:1 on the light card, a
// glaring band on the dark one). An outline in muted ink marks the hovered column without covering
// its bars; on the line chart it is a single line.
export const CHART_CURSOR = {
  bar: { fill: "transparent", stroke: "var(--color-muted-foreground)", strokeWidth: 1 },
  line: { stroke: "var(--color-muted-foreground)", strokeWidth: 1 },
} as const
