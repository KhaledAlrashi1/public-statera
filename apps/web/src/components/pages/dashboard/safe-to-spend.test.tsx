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

  it("shows income nudge when income_source is not_set", () => {
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({ income_source: "not_set" })}
        onOpenPlan={vi.fn()}
      />
    )
    expect(screen.getByText(/Set your monthly income/i)).toBeInTheDocument()
  })

  it("does not show income nudge when income_source is detected_from_transactions", () => {
    render(
      <SafeToSpendHero
        isLoading={false}
        safeToSpend={makeSafeToSpend({ income_source: "detected_from_transactions" })}
        onOpenPlan={vi.fn()}
      />
    )
    expect(
      screen.queryByText(/Set your monthly income/i)
    ).not.toBeInTheDocument()
  })
})
