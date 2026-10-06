/**
 * MOB-R75 D, P1 — saved income is not counted. The chart's "months with data" now counts a month by
 * its EXPENSES only, so a month holding only logged income is not a visible month in the caption.
 * Recharts is mocked as in income-expenses-chart.test.tsx (jsdom computes no layout).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/recharts", async () => {
  const React = await import("react")
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  const Leaf = () => null
  return {
    LineChart: Pass,
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
    Legend: Leaf,
    // ReferenceLine carries `y={expenseAverage}` and is the ONLY surface that value reaches.
    // Rendering it as a Leaf made the D4 assertion non-discriminating: the first attempt asserted
    // the peak month instead, which is 2026-03 with or without the fix. Captured so the average
    // itself can be asserted.
    // MOB-R36/R37 — two ReferenceLines now: the dashed expense average and the solid typed-income
    // line. Rendering both as "avg-line" would make them one testid — an instrument sharing a
    // mechanism with what it measures — so the mock tells them apart by the className the
    // component sets on the income line.
    ReferenceLine: ({ y, className }: { y?: number; className?: string }) =>
      React.createElement(
        "div",
        { "data-testid": className === "income-reference-line" ? "income-line" : "avg-line" },
        String(y),
      ),
    Area: Leaf,
    AreaChart: Pass,
    PieChart: Pass,
    Pie: Leaf,
  }
})

import { IncomeExpensesChart } from "./sections"

describe("Income vs Expenses — logged income not counted (MOB-R75 P1)", () => {
  it("a month with only logged income is not a visible month", () => {
    render(
      <IncomeExpensesChart
        isLoading={false}
        typedIncome={1000}
        trendData={[
          { month: "2026-08", income: 500, expenses: 0 },
          { month: "2026-09", income: 0, expenses: 300 },
        ]}
      />,
    )
    expect(screen.getByText("1 of 1 visible months finished with income ahead of expenses.")).toBeInTheDocument()
  })
})
