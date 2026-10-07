// MOB-R81 C7 — a tap on Home's Income tile opens the edit for the typed monthly income (the page wires it
// to IncomeQuickDialog, the path that sets that figure today). Enter and Space work on the focused tile.
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DashboardHero } from "./sections"

function renderHero(onOpenIncome: () => void, monthIncome: number | null = 1800) {
  render(
    <DashboardHero
      isLoading={false}
      monthLabel="October 2026"
      monthKey="2026-10"
      monthIncome={monthIncome}
      monthExpenses={682}
      monthSavings={0}
      monthRemaining={1118}
      onOpenIncome={onOpenIncome}
    />,
  )
}

describe("Home Income tile (MOB-R81 C7)", () => {
  it("a tap on the Income tile opens the monthly income edit", () => {
    const open = vi.fn()
    renderHero(open)
    fireEvent.click(screen.getByRole("button", { name: "Edit monthly income" }))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("Enter and Space on the focused tile open it too; with income not set it reads Set monthly income", () => {
    const open = vi.fn()
    renderHero(open, null)
    const tile = screen.getByRole("button", { name: "Set monthly income" })
    fireEvent.keyDown(tile, { key: "Enter" })
    fireEvent.keyDown(tile, { key: " " })
    expect(open).toHaveBeenCalledTimes(2)
  })
})
