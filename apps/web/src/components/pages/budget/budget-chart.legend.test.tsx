/**
 * MOB-R102 C3 — Budget vs Spending's legend names Budget, On or under and Over, each with its own
 * swatch, and the spent bars take the same two fills the legend shows.
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

describe("MOB-R102 C3 — BudgetChart legend", () => {
  it("lists Budget, On or under and Over with their own swatches, matching the spent bars' fills", () => {
    render(
      <BudgetChart
        isLoading={false}
        data={[
          { category: "Groceries", budget: 100, spent: 100, pct: 100 },
          { category: "Dining", budget: 50, spent: 80, pct: 160 },
        ]}
      />
    )

    const entries = screen.getAllByTestId("legend-entry").map((li) => [li.textContent, li.getAttribute("data-color")])
    expect(entries).toEqual([
      ["Budget", "var(--color-chart-budget, var(--color-chart-4, var(--color-primary)))"],
      ["On or under", "var(--color-success)"],
      ["Over", "var(--color-destructive)"],
    ])
    // The bars: at the budget (Groceries) on the "On or under" fill, over it (Dining) on "Over".
    expect(screen.getAllByTestId("cell").map((c) => c.getAttribute("data-fill"))).toEqual([
      "var(--color-success)",
      "var(--color-destructive)",
    ])
  })
})
