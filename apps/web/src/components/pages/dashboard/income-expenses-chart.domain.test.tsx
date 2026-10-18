/**
 * MOB-R103 C1/C2 — the y axis always includes the typed-income line.
 *
 * The real Recharts draws here; only ResponsiveContainer is replaced, by a fixed 600x300 box, because
 * jsdom computes no layout and the real container measures 0x0 and draws nothing. Recharts lays the
 * chart out by arithmetic, so the line's y1 and the plot area are real values.
 *
 * Before the fix the line was drawn above the plot (y1 = -123 on the demo): ifOverflow="extendDomain"
 * was ignored, because Recharts reads el.props.yAxisId and React 19's jsx() does not put a class
 * component's defaultProps there.
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

import { IncomeExpensesChart } from "./sections"

// The demo's shape: typed income 1,200.000 above every period's spend (highest 739.525).
const TREND = [
  { month: "2026-07", income: 0, expenses: 614.2, periodIncome: 1200 },
  { month: "2026-08", income: 0, expenses: 739.525, periodIncome: 1200 },
  { month: "2026-09", income: 0, expenses: 560, periodIncome: 1200 },
]

function plotTopAndBottom(container: HTMLElement) {
  const grid = container.querySelector(".recharts-cartesian-grid-horizontal")
  const ys = [...(grid?.querySelectorAll("line") ?? [])].map((l) => Number(l.getAttribute("y1")))
  return { top: Math.min(...ys), bottom: Math.max(...ys), lines: ys.length }
}

describe("MOB-R103 C2 — IncomeExpensesChart y axis", () => {
  it("draws the income line inside the plot when income is above every period's spend", () => {
    const { container } = render(<IncomeExpensesChart isLoading={false} trendData={TREND} typedIncome={1200} />)
    const plot = plotTopAndBottom(container)
    // The instrument: the grid rendered, so a plot area exists to be inside of.
    expect(plot.lines).toBeGreaterThan(1)
    // MOB-R112 D4 — the income is the per-period line now; every point of its path is inside the plot.
    const income = container.querySelector(".income-line path.recharts-curve")
    expect(income).not.toBeNull()
    const ys = [...(income?.getAttribute("d") ?? "").matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => Number(m[2]))
    expect(ys.length).toBe(TREND.length)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(plot.top)
      expect(y).toBeLessThanOrEqual(plot.bottom)
    }
  })
})
