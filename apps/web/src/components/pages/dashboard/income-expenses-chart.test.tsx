/**
 * MOB-1 Group 2 — zero-versus-no-data on the Income vs Expenses trend.
 *
 * The server zero-FILLS every month in the window before folding in rows
 * (lib/dashboard-snapshot-lib.ts:223-227), so a month with no transactions reaches the component as
 * income 0 / expenses 0. It is distinguishable from a real zero only by INVARIANT: amounts are
 * strictly positive at the database (chk_transactions_amount_positive, migration 0000), so a sum of
 * zero is unattainable from real rows.
 *
 * Recharts is mocked because jsdom computes no layout. The assertions are about the CAPTION, the
 * peak-month sentence, and the average ReferenceLine — not about the drawing.
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
    ReferenceLine: ({ y }: { y?: number }) =>
      React.createElement("div", { "data-testid": "avg-line" }, String(y)),
    Area: Leaf,
    AreaChart: Pass,
    PieChart: Pass,
    Pie: Leaf,
  }
})

import { IncomeExpensesChart } from "./sections"

// Four months: two with real activity, two that are empty because nothing happened in them.
const MIXED = [
  { month: "2026-01", income: 1000, expenses: 800 },
  { month: "2026-02", income: 0, expenses: 0 },
  { month: "2026-03", income: 900, expenses: 1200 },
  { month: "2026-04", income: 0, expenses: 0 },
]

describe("MOB-1 Group 2 — IncomeExpensesChart", () => {
  it("D1 — counts only months that HAVE data, in both the numerator and the denominator", () => {
    render(<IncomeExpensesChart isLoading={false} trendData={MIXED} />)
    // WITHOUT the change this reads "3 of 4": the two empty months satisfy 0 >= 0 and are counted
    // as months that finished with income ahead of expenses.
    expect(screen.getByText("1 of 2 visible months finished with income ahead of expenses.")).toBeInTheDocument()
    expect(screen.queryByText(/3 of 4/)).not.toBeInTheDocument()
  })

  it("D4 — averages expenses over months with data, not over the zero-filled window", () => {
    render(<IncomeExpensesChart isLoading={false} trendData={MIXED} />)
    // (800 + 1200) / 2 = 1000 with the change. WITHOUT it the divisor is 4 and the average is 500
    // — a frugal pace manufactured by two months that never happened.
    expect(screen.getByTestId("avg-line").textContent).toBe("1000")
    // The peak sentence still names the real peak. NOTE: this assertion alone does NOT
    // discriminate — 2026-03 is the peak either way — which is why the average is asserted above.
    expect(screen.getByText(/Highest expense month in view/)).toBeInTheDocument()
    expect(screen.getByText("2026-03")).toBeInTheDocument()
  })

  it("CONTROL — a window where every month has data is unaffected", () => {
    render(
      <IncomeExpensesChart
        isLoading={false}
        trendData={[
          { month: "2026-01", income: 1000, expenses: 800 },
          { month: "2026-02", income: 900, expenses: 1200 },
        ]}
      />
    )
    // Same shape as MIXED's non-empty rows, so the count must be identical — this is what shows
    // the filter removes EMPTY months rather than simply shrinking the window.
    expect(screen.getByText("1 of 2 visible months finished with income ahead of expenses.")).toBeInTheDocument()
  })

  it("CONTROL — an entirely empty window falls back to the existing caption, not '0 of N'", () => {
    render(
      <IncomeExpensesChart
        isLoading={false}
        trendData={[
          { month: "2026-01", income: 0, expenses: 0 },
          { month: "2026-02", income: 0, expenses: 0 },
        ]}
      />
    )
    // WITHOUT the change this reads "2 of 2 visible months finished with income ahead of expenses."
    // on an account with no transactions at all.
    expect(screen.getByText("Compare how income and expenses move together across recent months.")).toBeInTheDocument()
    expect(screen.queryByText(/visible months finished/)).not.toBeInTheDocument()
    // And the peak sentence must not name an empty month as the highest-expense one.
    expect(screen.queryByText(/Highest expense month in view/)).not.toBeInTheDocument()
  })
})
