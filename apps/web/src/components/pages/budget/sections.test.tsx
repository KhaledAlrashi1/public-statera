import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BudgetChart, BudgetHero, BudgetTable, IncomePlanningCard, type BudgetProfileContext } from "./sections"

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

/**
 * MOB-1 Group 1 — zero-versus-no-data on the Plan surfaces.
 *
 * Every case below drives the NO-BUDGET state and asserts what the surface says about a plan the
 * user has not set. Each names what it would read if the change had not landed.
 */
describe("MOB-1 Group 1 — BudgetHero with no budget", () => {
  const heroProps = {
    monthLabel: "July 2026",
    totalBudget: 0,
    totalBudgetTrendLabel: "",
    totalSpent: 682,
    totalSpentTrendLabel: "",
    remaining: -682,
    remainingTrendLabel: "",
    percentUsed: 0,
    isOver: true,
  }

  it("B1 — renders N/A for % Used instead of a 0.0% that describes no plan", () => {
    render(<BudgetHero {...heroProps} hasBudget={false} />)
    // WITHOUT the change this reads "0.0%" beside a real spend of 682.
    expect(screen.getByText("N/A")).toBeInTheDocument()
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument()
  })

  it("B2 — suppresses the utilisation caption rather than claiming 'Over budget this month'", () => {
    render(<BudgetHero {...heroProps} hasBudget={false} />)
    // WITHOUT the change isOver is true (remaining is negative against a zero budget), so this
    // reads "Over budget this month" for a budget that does not exist.
    expect(screen.queryByText("Over budget this month")).not.toBeInTheDocument()
    expect(screen.queryByText("Spending within plan")).not.toBeInTheDocument()
    expect(screen.queryByText("Approaching limit")).not.toBeInTheDocument()
  })

  it("B3 — suppresses the utilisation bar, which has no target to measure against", () => {
    const { container } = render(<BudgetHero {...heroProps} hasBudget={false} />)
    // WITHOUT the change an empty track renders and reads as "nothing spent".
    expect(container.querySelector(".h-2\\.5.w-full.rounded-full")).toBeNull()
  })

  it("CONTROL — with a budget, all three render normally", () => {
    const { container } = render(
      <BudgetHero
        {...heroProps}
        totalBudget={1000}
        totalSpent={500}
        remaining={500}
        percentUsed={50}
        isOver={false}
        hasBudget
      />
    )
    expect(screen.getByText("50.0%")).toBeInTheDocument()
    expect(screen.getByText("Spending within plan")).toBeInTheDocument()
    expect(container.querySelector(".h-2\\.5.w-full.rounded-full")).not.toBeNull()
  })
})

describe("MOB-1 Group 1 — IncomePlanningCard with no budget", () => {
  // Income present, budget absent: the server sends budget_to_income_pct = "0", which is NOT null,
  // so the pre-existing null-guard did not catch it.
  const noBudgetContext = {
    budget_total_kd: "0.000",
    monthly_income_kd: "1500.000",
    budget_to_income_pct: "0",
    payday_day: 1,
  } as unknown as BudgetProfileContext

  it("B4a — renders N/A for Budget / Income rather than a 0.0% about no plan", () => {
    render(<IncomePlanningCard monthLabel="July 2026" profileContext={noBudgetContext} />)
    // WITHOUT the change this reads "0.0%".
    expect(screen.getByText("N/A")).toBeInTheDocument()
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument()
  })

  it("B4b — suppresses the status badge rather than claiming WITHIN INCOME", () => {
    render(<IncomePlanningCard monthLabel="July 2026" profileContext={noBudgetContext} />)
    // WITHOUT the change the badge reads "within income" about a budget that does not exist.
    expect(screen.queryByText("within income")).not.toBeInTheDocument()
  })
})

describe("MOB-1 Group 1 — BudgetChart widest-gap caption", () => {
  it("B5 — names a BUDGETED category, never an unbudgeted one whose whole spend looks like a gap", () => {
    render(
      <BudgetChart
        isLoading={false}
        data={[
          // Unbudgeted: arrives as budget 0 from the lookup miss. Its "gap" is its entire spend,
          // which is larger than the budgeted row's, so WITHOUT the change it wins the reduce and
          // the caption reads "Housing is KD 542.000 over plan" for a category with no plan.
          { category: "Housing", budget: 0, spent: 542, pct: 0 },
          { category: "Groceries", budget: 100, spent: 160, pct: 160 },
        ]}
      />
    )
    expect(screen.getByText(/Groceries is .* over plan/)).toBeInTheDocument()
    expect(screen.queryByText(/Housing is .* over plan/)).not.toBeInTheDocument()
  })
})
