/**
 * MOB-R116 D6 — refunds can take a category's or a period's spending below 0; both charts draw it at 0, never below.
 * The real Recharts draws; only ResponsiveContainer is replaced by a fixed box (jsdom computes no layout), as in
 * income-expenses-chart.domain.test.tsx.
 */
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/recharts", async () => {
  const React = await import("react")
  const actual = await vi.importActual<typeof import("@/lib/recharts")>("@/lib/recharts")
  const ResponsiveContainer = ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
    React.cloneElement(children, { width: 600, height: 300 })
  return { ...actual, ResponsiveContainer }
})

import { CategoryBreakdownChart, IncomeExpensesChart } from "./sections"

function plotBottom(container: HTMLElement) {
  const grid = container.querySelector(".recharts-cartesian-grid-horizontal")
  const ys = [...(grid?.querySelectorAll("line") ?? [])].map((l) => Number(l.getAttribute("y1")))
  return Math.max(...ys)
}

describe("MOB-R116 D6 — clamp at 0 at render", () => {
  it("Income vs Expenses: a period with net refunds is drawn at 0, not below the axis", () => {
    const trend = [
      { month: "2026-08", income: 0, expenses: 100, periodIncome: null },
      { month: "2026-09", income: 0, expenses: -40, periodIncome: null },
      { month: "2026-10", income: 0, expenses: 80, periodIncome: null },
    ]
    const { container } = render(<IncomeExpensesChart isLoading={false} trendData={trend} typedIncome={null} />)
    const bottom = plotBottom(container)
    // The monotone path is "M p0 C c c p1 C c c p2": the points are the first pair and every third pair after it.
    const d = container.querySelector(".recharts-line-curve")?.getAttribute("d") ?? ""
    const pairs = [...d.matchAll(/([-\d.]+),([-\d.]+)/g)].map((m) => Number(m[2]))
    const ys = pairs.filter((_, i) => i === 0 || i % 3 === 0)
    // No tick below KD 0: an unclamped -40 would widen the axis below zero.
    const ticks = [...container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value")].map((t) => t.textContent)
    expect(ticks[0]).toBe("KD 0")
    expect(ys.length).toBe(3)
    // The September point sits on the zero line, which is the plot's bottom when nothing is below 0.
    expect(ys[1]).toBeCloseTo(bottom, 3)
    for (const y of ys) expect(y).toBeLessThanOrEqual(bottom)
  })

  it("Expenses by Category: a category whose refunds outweigh its spending is drawn at 0, not below", () => {
    const { container } = render(
      <CategoryBreakdownChart
        isLoading={false}
        categoryData={[{ name: "Dining", value: 50 }, { name: "Shopping", value: -10 }]}
        onSliceClick={vi.fn()}
      />,
    )
    // jsdom draws no bar paths (animation), but the value axis shows the domain: an unclamped -10 adds "-KD 20".
    const ticks = [...container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")].map((t) => t.textContent)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]).toBe("KD 0")
  })
})
