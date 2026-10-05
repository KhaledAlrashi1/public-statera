import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DashboardHero } from "./sections"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DashboardHero", () => {
  // MOB-R69 C1 — rewritten to the MOB-R68 C4 count-up rule: figures count up from 0 when the
  // month (monthKey) changes; a new value for the SAME month shows at once, with no animation.
  it("counts up from zero on a month change; a same-month value change shows at once", () => {
    let now = 0
    let frameId = 0
    const pending = new Map<number, FrameRequestCallback>()

    vi.spyOn(performance, "now").mockImplementation(() => now)
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }))
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frameId += 1
      pending.set(frameId, cb)
      return frameId
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      pending.delete(id)
    })

    const flushFrame = (ms: number) => {
      now += ms
      const frames = Array.from(pending.entries())
      pending.clear()
      for (const [, cb] of frames) cb(now)
    }
    // The moving digits of the Income tile (hidden from screen readers).
    const shownIncome = () =>
      screen.getByText("Income").parentElement?.querySelector(".font-mono > [aria-hidden='true']")?.textContent

    const hero = (monthKey: string, income: number) => (
      <DashboardHero
        isLoading={false}
        monthLabel={monthKey}
        monthKey={monthKey}
        monthIncome={income}
        monthExpenses={20}
        monthSavings={0}
        monthRemaining={income - 20}
      />
    )

    const { rerender } = render(hero("2026-03", 1000))
    expect(shownIncome()).toBe("KD0.000")
    act(() => flushFrame(1200))
    expect(shownIncome()).toBe("KD1,000.000")

    rerender(hero("2026-03", 1200))
    expect(shownIncome()).toBe("KD1,200.000")
    expect(screen.getByText("KD 1,200.000")).toBeInTheDocument()

    rerender(hero("2026-04", 900))
    expect(shownIncome()).toBe("KD0.000")
    act(() => flushFrame(1200))
    expect(shownIncome()).toBe("KD900.000")
  })

  it("shows a stale analytics warning when dashboard data is older than 30 minutes", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-10T12:45:00Z").getTime())

    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={1200}
        monthExpenses={780}
        monthRemaining={420}
        savingsRate={22}
        dailyPace={{ avgDaily: 26, projected: 806, daysElapsed: 12, daysInMonth: 31 }}
        deltas={null}
        analyticsUpdatedAt="2026-03-10T12:00:00Z"
      />
    )

    expect(screen.getByText("Data may be out of date")).toBeInTheDocument()
    expect(screen.getByText("Updated 45 minutes ago")).toBeInTheDocument()
  })
})

// MOB-R36 — the typed income. Not set wins over overspent; the Income tile's "vs last month" chip is
// removed (under RM-17 flat it would always read 0.0%).
describe("DashboardHero — typed income (MOB-R36)", () => {
  it("income not set: Income reads Not set, Remaining reads —", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={null}
        monthExpenses={250}
        monthRemaining={0}
        monthSavings={30}
        dailyPace={null}
        deltas={null}
      />
    )
    expect(screen.getByText("Not set")).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(1)
    expect(screen.queryByText("KD 0.000")).not.toBeInTheDocument()
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument()
  })

  it("spending above income: Remaining reads Over by KD {amount}", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={1000}
        monthExpenses={1200}
        monthRemaining={0}
        overBy={200}
        savingsRate={-20}
        dailyPace={null}
        deltas={null}
      />
    )
    expect(screen.getByText("Over by KD 200.000")).toBeInTheDocument()
  })

  // MOB-R69 C1 — rewritten: MOB-R68 D4 removed every "vs last month" chip; the footers are shares
  // of income instead.
  it("no tile renders a vs-last-month chip; the footers show shares of income", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={1000}
        monthExpenses={600}
        monthSavings={100}
        monthRemaining={300}
        footers={{ expensesPct: 60, savingsPct: 10, bar: { expensesPct: 60, savingsPct: 10, trackPct: 30, leftPct: 30 } }}
      />
    )
    expect(screen.getByText("60% of income")).toBeInTheDocument()
    expect(screen.getByText("30% of income left")).toBeInTheDocument()
    expect(screen.queryByText(/vs last month/i)).toBeNull()
  })
})
