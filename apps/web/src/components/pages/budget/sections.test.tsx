import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BudgetChart, BudgetDialog, BudgetHero, BudgetTable, IncomePlanningCard, type BudgetProfileContext } from "./sections"

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
    expect(screen.getByText("Budget vs your income for July 2026")).toBeInTheDocument()
    expect(screen.getByText("45.5%")).toBeInTheDocument()
  })

  it("shows the add-income prompt when profile_context is null (empty account)", () => {
    render(<IncomePlanningCard monthLabel="July 2026" profileContext={null} />)
    expect(screen.getByText(/Set your monthly income in Profile/)).toBeInTheDocument()
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

/**
 * MOB-R50 F1 — the Add/Edit budget dialog saves only to the month the page is showing.
 * Clock pinned to 2026-05-15, so "this month" is 2026-05 and "next month" 2026-06.
 */
describe("MOB-R50 F1 — BudgetDialog saves only to the page's month", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-05-15T09:00:00"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function fillAndSave() {
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Coffee" } })
    fireEvent.change(screen.getByLabelText("Amount (KD)"), { target: { value: "25" } })
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }))
  }

  it("offers no other month in create mode, and posts the page's month", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BudgetDialog open onOpenChange={() => {}} initialMonth="2026-05" mode="create" onSave={onSave} />)
    // WITHOUT the change the Month select is enabled in create mode and offers next month too.
    expect(screen.getByLabelText("Month")).toBeDisabled()
    await fillAndSave()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].month).toBe("2026-05")
  })

  it("does not move a page month outside this/next month onto the current month", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BudgetDialog open onOpenChange={() => {}} initialMonth="2025-11" mode="create" onSave={onSave} />)
    await fillAndSave()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    // WITHOUT the change the dialog clamps 2025-11 to "this month" and this reads "2026-05",
    // so the page's 2025-11 list would be written into 2026-05.
    expect(onSave.mock.calls[0][0].month).toBe("2025-11")
  })
})

/**
 * MOB-R50 F3 — Remaining with no budget. The value reads "—" (MOB-R36 #8 precedent) and the
 * "vs last month" chip is not shown; the chip is also not shown when last month had no budget,
 * because its base is then −(last month's spend) and the percentage measures nothing.
 */
describe("MOB-R50 F3 — BudgetHero Remaining tile", () => {
  const chip = "↓ 125.7% vs last month"
  const base = {
    monthLabel: "October 2026",
    totalBudgetTrendLabel: "",
    totalSpentTrendLabel: "",
    remainingTrendLabel: chip,
  }

  it("shows — and no chip when the month has no budget", () => {
    render(
      <BudgetHero
        {...base}
        totalBudget={0}
        totalSpent={373}
        remaining={-373}
        percentUsed={0}
        isOver
        hasBudget={false}
        hasPreviousBudget
      />
    )
    // WITHOUT the change this reads "−KD 373" with the chip beneath it.
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText(/−KD/)).not.toBeInTheDocument()
    expect(screen.queryByText(chip)).not.toBeInTheDocument()
  })

  it("hides the chip when last month had no budget, and shows it when it had one", () => {
    const props = { ...base, totalBudget: 500, totalSpent: 200, remaining: 300, percentUsed: 40, isOver: false, hasBudget: true }
    const { rerender } = render(<BudgetHero {...props} hasPreviousBudget={false} />)
    // WITHOUT the change the chip renders against a month that had no budget.
    expect(screen.queryByText(chip)).not.toBeInTheDocument()
    rerender(<BudgetHero {...props} hasPreviousBudget />)
    expect(screen.getByText(chip)).toBeInTheDocument()
  })
})
