// MOB-R55 P3 — the hero's fourth tile is "Savings & investing" (the savings rate is removed).
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DashboardHero } from "./sections"

describe("DashboardHero — Savings & investing tile (MOB-R55 P3)", () => {
  it("shows the month's savings amount and no savings rate", () => {
    render(
      <DashboardHero
        isLoading={false}
        monthLabel="March 2026"
        monthIncome={100}
        monthExpenses={40}
        monthSavings={30}
        monthRemaining={30}
        dailyPace={null}
        deltas={null}
      />,
    )
    const label = screen.getByText("Savings & investing")
    expect(label.parentElement).toHaveTextContent("KD 30.000")
    expect(screen.queryByText("Savings rate")).not.toBeInTheDocument()
  })
})
