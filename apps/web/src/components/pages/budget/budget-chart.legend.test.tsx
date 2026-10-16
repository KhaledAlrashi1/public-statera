/**
 * MOB-R102 C3, MOB-R103 B2 — Budget vs Spending's legend names Budget, On track, Close and Over, each
 * with its own swatch, and No budget only when such a bar is drawn; the spent bars take the fills the
 * legend shows.
 *
 * Recharts is mocked because jsdom computes no layout: the Legend's payload and each Cell's fill are
 * captured as props, which is where the colours live.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/recharts", async () => {
  const React = await import("react")
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  const Leaf = () => null
  return {
    BarChart: Pass,
    ResponsiveContainer: Pass,
    Bar: Pass,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Leaf,
    Cell: ({ fill }: { fill?: string }) => React.createElement("i", { "data-testid": "cell", "data-fill": fill }),
    Legend: ({ payload }: { payload?: Array<{ value: string; color?: string }> }) =>
      React.createElement(
        "ul",
        null,
        (payload ?? []).map((entry) =>
          React.createElement("li", { key: entry.value, "data-testid": "legend-entry", "data-color": entry.color }, entry.value),
        ),
      ),
  }
})

import { BudgetChart } from "./sections"

const BUDGET = "var(--color-chart-budget, var(--color-chart-4, var(--color-primary)))"

describe("MOB-R103 B2 — BudgetChart legend", () => {
  it("lists Budget, On track, Close and Over with their own swatches, matching the spent bars' fills", () => {
    render(
      <BudgetChart
        isLoading={false}
        data={[
          { category: "Groceries", budget: 100, spent: 50, pct: 50 },
          { category: "Transport", budget: 100, spent: 100, pct: 100 },
          { category: "Dining", budget: 50, spent: 80, pct: 160 },
        ]}
      />
    )

    const entries = screen.getAllByTestId("legend-entry").map((li) => [li.textContent, li.getAttribute("data-color")])
    expect(entries).toEqual([
      ["Budget", BUDGET],
      ["On track", "var(--color-success)"],
      ["Close", "var(--color-warning)"],
      ["Over", "var(--color-chart-over)"],
    ])
    // Under 90% (Groceries) on "On track", at the budget (Transport) on "Close", over it (Dining) on "Over".
    expect(screen.getAllByTestId("cell").map((c) => c.getAttribute("data-fill"))).toEqual([
      "var(--color-success)",
      "var(--color-warning)",
      "var(--color-chart-over)",
    ])
  })

  it("adds No budget only when a bar with no budget is drawn", () => {
    const { unmount } = render(
      <BudgetChart
        isLoading={false}
        data={[
          { category: "Groceries", budget: 100, spent: 50, pct: 50 },
          { category: "Gifts", budget: 0, spent: 5, pct: 0 },
        ]}
      />
    )
    expect(screen.getAllByTestId("legend-entry").map((li) => li.textContent)).toEqual(["Budget", "On track", "Close", "Over", "No budget"])
    expect(screen.getAllByTestId("legend-entry")[4].getAttribute("data-color")).toBe("var(--color-muted-foreground)")
    expect(screen.getAllByTestId("cell")[1].getAttribute("data-fill")).toBe("var(--color-muted-foreground)")
    unmount()

    // The control: every bar has a budget, so the entry is absent (and the list did render).
    render(<BudgetChart isLoading={false} data={[{ category: "Groceries", budget: 100, spent: 50, pct: 50 }]} />)
    expect(screen.getAllByTestId("legend-entry").map((li) => li.textContent)).toEqual(["Budget", "On track", "Close", "Over"])
  })
})
