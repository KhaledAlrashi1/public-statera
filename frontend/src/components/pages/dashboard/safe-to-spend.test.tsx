import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { SafeToSpendResponse } from "@/types/api"
import { SafeToSpendHero } from "./sections"

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
    total_budget_kd: "800.000",
    debt_minimum_total_kd: "75.000",
    savings_goal_count: 0,
    savings_goal_unscheduled_count: 0,
    savings_goal_monthly_total_kd: "0.000",
    savings_goal_budget_covered_kd: "0.000",
    savings_goal_reserve_kd: "0.000",
    committed_kd: "75.000",
    committed_breakdown_kd: {
      budget_allocations: "800.000",
      debt_minimums: "75.000",
      savings_goal_reserve: "0.000",
      savings_goal_budget_covered: "0.000",
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
        safeToSpend={makeSafeToSpend({ warnings: ["debts_not_set_optional"] })}
        onOpenPlan={onOpenPlan}
      />
    )

    expect(screen.getByText("Safe to Spend Today")).toBeInTheDocument()
    expect(screen.getByText(/KD 7.590 \/ day/)).toBeInTheDocument()
    expect(screen.getByText(/No debt payments are included right now/i)).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: /open plan from safe to spend daily rate/i })
    )
    expect(onOpenPlan).toHaveBeenCalledTimes(1)
  })

  it("shows savings-goal reserve details when goals affect the calculation", () => {
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({
          debt_minimum_total_kd: "0.000",
          savings_goal_count: 2,
          savings_goal_monthly_total_kd: "90.000",
          savings_goal_budget_covered_kd: "25.000",
          savings_goal_reserve_kd: "65.000",
          committed_kd: "65.000",
          remaining_budget_kd: "215.000",
          warnings: ["debts_not_set_optional"],
        })}
        onOpenPlan={vi.fn()}
      />
    )

    expect(screen.getByText("Goal reserve")).toBeInTheDocument()
    expect(screen.getByText("KD 65")).toBeInTheDocument()
    expect(screen.getByText(/KD 25.000 of goal funding is already covered/i)).toBeInTheDocument()
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
})
