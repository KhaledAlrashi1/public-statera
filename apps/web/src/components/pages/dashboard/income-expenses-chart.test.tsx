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

// Four months: two with real activity, two that are empty because nothing happened in them.
const MIXED = [
  { month: "2026-01", income: 1000, expenses: 800 },
  { month: "2026-02", income: 0, expenses: 0 },
  { month: "2026-03", income: 900, expenses: 1200 },
  { month: "2026-04", income: 0, expenses: 0 },
]

describe("MOB-1 Group 2 — IncomeExpensesChart", () => {
  it("D1 — counts only months that HAVE data, in both the numerator and the denominator", () => {
    render(<IncomeExpensesChart isLoading={false} trendData={MIXED} typedIncome={1000} />)
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
        typedIncome={1000}
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

// MOB-R36/R37 — RM-17 flat: the typed income is drawn as ONE reference line against expenses, not
// as a per-month series. Fixture: logged incomes 2000 and 2000, expenses 800 and 1400, typed income
// 1000 — so the expense average is 1100, which differs from the typed income. The caption compares
// the TYPED income: 1000 >= 800 but 1000 < 1400, so "1 of 2". The old code has no income line and
// uses the logged incomes, reading "2 of 2" — red for the reason under test.
const TYPED_FIXTURE = [
  { month: "2026-01", income: 2000, expenses: 800 },
  { month: "2026-02", income: 2000, expenses: 1400 },
]

describe("MOB-R36 — IncomeExpensesChart typed-income reference line", () => {
  it("draws the typed income as a reference line and compares months against it", () => {
    render(<IncomeExpensesChart isLoading={false} trendData={TYPED_FIXTURE} typedIncome={1000} />)
    expect(screen.getByTestId("income-line").textContent).toBe("1000")
    expect(screen.getByTestId("avg-line").textContent).toBe("1100")
    expect(screen.getByText("1 of 2 visible months finished with income ahead of expenses.")).toBeInTheDocument()
  })

  it("NEGATIVE — with income not set there is no income line and the not-set caption shows", () => {
    render(<IncomeExpensesChart isLoading={false} trendData={TYPED_FIXTURE} typedIncome={null} />)
    expect(screen.queryByTestId("income-line")).not.toBeInTheDocument()
    expect(screen.getByTestId("avg-line").textContent).toBe("1100")
    expect(screen.getByText("Set your monthly income in Profile to see it on this chart.")).toBeInTheDocument()
    expect(screen.queryByText(/visible months finished/)).not.toBeInTheDocument()
  })

  // MOB-R38 (1) / MOB-R40 F4(b) — #12. The second sentence names the income line, which is drawn
  // only when the income is set. Substring matchers, because the sentences share their <p> with
  // the peak-month text. The dashed-line sentence is asserted PRESENT in the null case, so the
  // absence of the solid-line sentence cannot be satisfied by a paragraph that never rendered.
  it("#12 — the solid-line sentence renders only when the income is set", () => {
    const { unmount } = render(
      <IncomeExpensesChart isLoading={false} trendData={TYPED_FIXTURE} typedIncome={1000} />
    )
    expect(screen.getByText(/The dashed line shows your average monthly spending\./)).toBeInTheDocument()
    expect(screen.getByText(/The solid line is your monthly income\./)).toBeInTheDocument()
    unmount()

    render(<IncomeExpensesChart isLoading={false} trendData={TYPED_FIXTURE} typedIncome={null} />)
    expect(screen.getByText(/The dashed line shows your average monthly spending\./)).toBeInTheDocument()
    expect(screen.queryByText(/The solid line is your monthly income\./)).not.toBeInTheDocument()
  })
})
