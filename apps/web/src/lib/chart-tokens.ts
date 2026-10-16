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
  // MOB-R103 B — Budget vs Spending's spent bars: under 90% of the budget, from 90% up to the budget,
  // over it, and spending in a category with no budget.
  spentOnTrack: "var(--color-success)",
  spentClose: "var(--color-warning)",
  // MOB-R104 B2 — its own chart token (index.css), not --color-destructive, which the rest of the app reads.
  spentOver: "var(--color-chart-over)",
  noBudget: "var(--color-muted-foreground)",
} as const

// MOB-R102 C2 — the hover cursor. Recharts' default is a #ccc literal (1.56:1 on the light card, a
// glaring band on the dark one). On the line chart it is a single line in muted ink. MOB-R105 E1 — on
// the bar charts a soft band behind the hovered column, fill only, no stroke (index.css), in place of
// R102's outline.
export const CHART_CURSOR = {
  bar: { fill: "var(--color-chart-cursor-band)", stroke: "none" },
  line: { stroke: "var(--color-muted-foreground)", strokeWidth: 1 },
} as const
