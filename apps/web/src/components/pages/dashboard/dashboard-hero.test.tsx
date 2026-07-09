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
