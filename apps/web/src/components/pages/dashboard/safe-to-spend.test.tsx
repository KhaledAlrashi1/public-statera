import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SafeToSpendResponse } from "@/types/api"
import { IncomeNudge, SafeToSpendHero } from "./sections"

function makeSafeToSpend(
  overrides: Partial<SafeToSpendResponse> = {}
): SafeToSpendResponse {
  return {
    month: "2026-02",
    cycle_start: "2026-02-01",
    cycle_end: "2026-02-28",
    days_elapsed: 10,
    days_remaining: 18,
    monthly_income_kd: "1200.000",
    income_auto_detected: true,
    income_source: "detected_from_transactions",
    total_budget_kd: "800.000",
    committed_kd: "800.000",
    committed_breakdown_kd: {
      budget_allocations: "800.000",
    },
    actual_spend_kd: "120.000",
    remaining_budget_kd: "205.000",
    daily_rate_kd: "7.590",
    data_complete: true,
    warnings: [],
    ...overrides,
  }
}

describe("SafeToSpendHero", () => {
  // The dismissal case writes income_nudge_dismissed, and IncomeNudge reads that key at mount.
  // Without this the nudge cases would pass or fail according to their order in the file.
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("renders loading state", () => {
    render(
      <SafeToSpendHero
        isLoading
        safeToSpend={undefined}
        onOpenPlan={vi.fn()}
      />
    )

    expect(
      screen.getByRole("status", { name: /loading safe-to-spend/i })
    ).toBeInTheDocument()
  })

  it("renders complete state and opens plan when daily rate is clicked", () => {
    const onOpenPlan = vi.fn()
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend()}
        onOpenPlan={onOpenPlan}
      />
    )

    expect(screen.getByText("Safe to Spend Today")).toBeInTheDocument()
    expect(screen.getByText(/KD 7.590 \/ day/)).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: /open plan from safe to spend daily rate/i })
    )
    expect(onOpenPlan).toHaveBeenCalledTimes(1)
  })

  it("renders set-income prompt and routes to income entry when income is not detected", () => {
    const onOpenIncome = vi.fn()
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({
          data_complete: false,
          monthly_income_kd: null,
          income_auto_detected: false,
          warnings: ["income_not_set"],
        })}
        onOpenPlan={vi.fn()}
        onOpenIncome={onOpenIncome}
      />
    )

    expect(screen.getByText("Set your income")).toBeInTheDocument()
    expect(screen.getByText(/Categorize a paycheck or other inflow as Income/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Add income" }))
    expect(onOpenIncome).toHaveBeenCalledTimes(1)
  })

  it("treats zero monthly income as incomplete and shows the same prompt", () => {
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({
          data_complete: false,
          monthly_income_kd: "0.000",
          income_auto_detected: false,
          warnings: ["income_not_set"],
        })}
        onOpenPlan={vi.fn()}
      />
    )

    expect(screen.getByText("Set your income")).toBeInTheDocument()
  })

  // Arm 3 of the branch chain (sections.tsx:380) has exactly one cause: income
  // resolved AND the month's budget total = 0. Arm 2 absorbs every income-absent
  // case, because warnings.includes("income_not_set") and monthlyIncome <= 0 are
  // provably equivalent — resolveIncomeForPeriod returns null or strictly > 0.
  // The copy therefore names the budget, not income.
  it("names the missing budget, not income, when income is resolved but no budget exists", () => {
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({
          data_complete: false,
          monthly_income_kd: "1800.000",
          income_auto_detected: false,
          income_source: "declared_in_profile",
          total_budget_kd: "0.000",
          committed_kd: "0.000",
          committed_breakdown_kd: { budget_allocations: "0.000" },
          warnings: ["budgets_not_set"],
        })}
        onOpenPlan={vi.fn()}
      />
    )

    expect(screen.getByText("No budget set for this month.")).toBeInTheDocument()
    expect(
      screen.getByText(/Safe-to-spend compares your income against your planned budget/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/No income detected yet/i)).not.toBeInTheDocument()
  })

  // MOB-R26 RM-1 — these two cases are RE-POINTED, not rewritten: the nudge moved out of
  // SafeToSpendHero to the IncomeNudge export, so the same assertions now render the component
  // at its new home. Fixtures and expectations are unchanged, which is what makes them evidence
  // that the move preserved behaviour rather than merely that something still renders.
  it("shows income nudge when income_source is not_set", () => {
    render(
      <IncomeNudge
        safeToSpend={makeSafeToSpend({ income_source: "not_set" })}
        onOpenPlan={vi.fn()}
      />
    )
    expect(screen.getByText(/Set your monthly income/i)).toBeInTheDocument()
  })

  it("does not show income nudge when income_source is detected_from_transactions", () => {
    render(
      <IncomeNudge
        safeToSpend={makeSafeToSpend({ income_source: "detected_from_transactions" })}
        onOpenPlan={vi.fn()}
      />
    )
    expect(
      screen.queryByText(/Set your monthly income/i)
    ).not.toBeInTheDocument()
  })

  // RM-1 condition (3) — the dismissal must keep its behaviour AND its existing storage key.
  // The key is asserted by its literal name because a rename is invisible to a test that only
  // checks the nudge disappeared: the component would still hide, and every returning user who
  // had already dismissed it would silently see it again.
  it("dismissal hides the nudge and writes the existing income_nudge_dismissed key", () => {
    render(
      <IncomeNudge
        safeToSpend={makeSafeToSpend({ income_source: "not_set" })}
        onOpenPlan={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Dismiss income reminder" }))

    expect(screen.queryByText(/Set your monthly income/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem("income_nudge_dismissed")).toBe("1")
  })
})
