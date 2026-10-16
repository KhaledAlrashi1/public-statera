/**
 * MOB-R103 C2/C3 — Income vs Expenses: the legend names Income (when the income is drawn), Expenses
 * and Average, and the line starts at the first period with any expense or income.
 *
 * Recharts is mocked because jsdom computes no layout: the Legend's payload and the LineChart's data
 * are captured as props, which is where they live.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/recharts", async () => {
  const React = await import("react")
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  const Leaf = () => null
  return {
    LineChart: ({ data, children }: { data?: Array<{ month: string }>; children?: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-testid": "line-chart", "data-months": (data ?? []).map((d) => d.month).join(",") },
        children,
      ),
    BarChart: Pass,
    ComposedChart: Pass,
    ResponsiveContainer: Pass,
    Line: Leaf,
    Bar: Leaf,
    Cell: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    CartesianGrid: Leaf,
    Tooltip: Leaf,
    Legend: ({ payload }: { payload?: Array<{ value: string; color?: string }> }) =>
      React.createElement(
        "ul",
        null,
        (payload ?? []).map((entry) =>
          React.createElement("li", { key: entry.value, "data-testid": "legend-entry", "data-color": entry.color }, entry.value),
        ),
      ),
    ReferenceLine: Leaf,
    Area: Leaf,
    AreaChart: Pass,
    PieChart: Pass,
    Pie: Leaf,
  }
})

import { IncomeExpensesChart } from "./sections"

const TREND = [
  { month: "2026-01", income: 0, expenses: 0 },
  { month: "2026-02", income: 0, expenses: 0 },
  { month: "2026-03", income: 0, expenses: 300 },
  { month: "2026-04", income: 0, expenses: 0 },
  { month: "2026-05", income: 0, expenses: 500 },
]

describe("MOB-R103 C2 — IncomeExpensesChart legend", () => {
  it("names Income, Expenses and Average when the income is set, and drops Income when it is not", () => {
    const { unmount } = render(<IncomeExpensesChart isLoading={false} trendData={TREND} typedIncome={1000} />)
    expect(screen.getAllByTestId("legend-entry").map((li) => [li.textContent, li.getAttribute("data-color")])).toEqual([
      ["Income", "var(--color-chart-income, var(--color-success))"],
      ["Expenses", "var(--color-chart-expense, var(--color-primary))"],
      ["Average", "var(--color-muted-foreground)"],
    ])
    unmount()

    render(<IncomeExpensesChart isLoading={false} trendData={TREND} typedIncome={null} />)
    expect(screen.getAllByTestId("legend-entry").map((li) => li.textContent)).toEqual(["Expenses", "Average"])
  })
})

describe("MOB-R103 C3 — IncomeExpensesChart first period", () => {
  it("starts at the first period with any expense or income, keeping later empty periods", () => {
    const { unmount } = render(<IncomeExpensesChart isLoading={false} trendData={TREND} typedIncome={1000} />)
    expect(screen.getByTestId("line-chart").getAttribute("data-months")).toBe("2026-03,2026-04,2026-05")
    unmount()

    // Logged income alone starts the line too.
    render(
      <IncomeExpensesChart
        isLoading={false}
        trendData={[{ month: "2026-01", income: 0, expenses: 0 }, { month: "2026-02", income: 400, expenses: 0 }, { month: "2026-03", income: 0, expenses: 200 }]}
        typedIncome={1000}
      />
    )
    expect(screen.getByTestId("line-chart").getAttribute("data-months")).toBe("2026-02,2026-03")
  })
})
