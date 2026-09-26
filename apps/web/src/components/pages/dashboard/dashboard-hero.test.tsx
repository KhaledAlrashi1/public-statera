import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DashboardHero } from "./sections"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DashboardHero", () => {
  it("shows a motivational state when the month is under budget", () => {
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
      />
    )

    expect(screen.getByText("You're doing well this month")).toBeInTheDocument()
    expect(screen.getByText(/You've kept KD 420 in reserve so far/i)).toBeInTheDocument()
  })

  it("animates from the current displayed value when months switch quickly", () => {
    let now = 0
    let frameId = 0
    const pending = new Map<number, FrameRequestCallback>()

    vi.spyOn(performance, "now").mockImplementation(() => now)
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

    const { rerender } = render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={100}
        monthExpenses={20}
        monthRemaining={80}
        savingsRate={22}
        dailyPace={{ avgDaily: 2, projected: 62, daysElapsed: 12, daysInMonth: 31 }}
        deltas={null}
      />
    )

    expect(screen.getByText("KD 100.000")).toBeInTheDocument()

    rerender(
      <DashboardHero
        isLoading={false}
        monthLabel="April 2026"
        monthIncome={200}
        monthExpenses={20}
        monthRemaining={180}
        savingsRate={22}
        dailyPace={{ avgDaily: 2, projected: 62, daysElapsed: 12, daysInMonth: 30 }}
        deltas={null}
      />
    )

    act(() => {
      flushFrame(300)
    })
    expect(screen.getByText("KD 187.500")).toBeInTheDocument()

    rerender(
      <DashboardHero
        isLoading={false}
        monthLabel="May 2026"
        monthIncome={300}
        monthExpenses={20}
        monthRemaining={280}
        savingsRate={22}
        dailyPace={{ avgDaily: 2, projected: 62, daysElapsed: 12, daysInMonth: 31 }}
        deltas={null}
      />
    )

    act(() => {
      flushFrame(100)
    })
    expect(screen.getByText("KD 234.896")).toBeInTheDocument()
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
  it("income not set: Income reads Not set, Remaining and Savings rate read —", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={null}
        monthExpenses={250}
        monthRemaining={0}
        savingsRate={null}
        dailyPace={null}
        deltas={null}
      />
    )
    expect(screen.getByText("Not set")).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(2)
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

  it("the Income tile has no vs-last-month chip; the Expenses tile still does", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={1000}
        monthExpenses={600}
        monthRemaining={400}
        savingsRate={40}
        dailyPace={null}
        // incomeDelta is what the OLD hero rendered as the Income chip; 0 is what RM-17 flat gives.
        deltas={{ incomeDelta: 0, expensesDelta: 10, remainingDelta: 5, savingsRateDelta: 2 }}
      />
    )
    expect(screen.getByText("10.0% vs last month")).toBeInTheDocument()
    expect(screen.queryByText("0.0% vs last month")).not.toBeInTheDocument()
  })
})
