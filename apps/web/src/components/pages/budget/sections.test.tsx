import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BudgetTable, IncomePlanningCard, type BudgetProfileContext } from "./sections"

describe("BudgetTable", () => {
  it("shows an empty-state CTA when no budgets exist yet", () => {
    const onAdd = vi.fn()

    render(
      <BudgetTable
        rows={[]}
        hasBudgets={false}
        searchQuery=""
        setSearchQuery={vi.fn()}
        range="month"
        setRange={vi.fn()}
        onAdd={onAdd}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getAllByText("Set your first budget").length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole("button", { name: "Add your first budget" })[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})

describe("IncomePlanningCard — profile_context string fields (typed-drift regression)", () => {
  // Regression for the 2026-07-10 budgets-page crash. The backend serializes
  // profile_context KWD/decimal fields as STRINGS (Decimal.toFixed — see
  // apps/api/src/routes/budgets.ts:114-123), but the frontend annotated them
  // number|null. At runtime budget_to_income_pct arrives as "45.5", the
  // monthly_income_kd string ("1500.000") defeats the `=== null` early-return so
  // the card renders, and `"45.5".toFixed(1)` threw "toFixed is not a function".
  // These fixtures are STRINGS on purpose (the wire shape), cast past the
  // (now-corrected) annotation to pin the real runtime contract.
  const incomeBearingContext = {
    budget_total_kd: "300.000",
    monthly_income_kd: "1500.000",
    budget_to_income_pct: "45.5",
    payday_day: 1,
  } as unknown as BudgetProfileContext

  it("renders the income-context card and its pct for a string-valued profile_context", () => {
    render(<IncomePlanningCard monthLabel="July 2026" profileContext={incomeBearingContext} />)
    // The card must actually render (guard-defeat: a string income is !== null),
    // not merely avoid throwing — its presence is part of the contract.
    expect(screen.getByText("Income Context")).toBeInTheDocument()
    expect(screen.getByText("Budget vs detected income for July 2026")).toBeInTheDocument()
    expect(screen.getByText("45.5%")).toBeInTheDocument()
  })

  it("shows the add-income prompt when profile_context is null (empty account)", () => {
    render(<IncomePlanningCard monthLabel="July 2026" profileContext={null} />)
    expect(screen.getByText(/Add income transactions/)).toBeInTheDocument()
  })
})
