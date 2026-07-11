import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DebtAccountSummary } from "@/types/api"
import { PlanSummaryPanel } from "./sections"

function makeSummary(overrides: Partial<DebtAccountSummary> = {}): DebtAccountSummary {
  return {
    total_balance_kd: "3650.000",
    total_minimum_kd: "145.000",
    account_count: 2,
    ...overrides,
  }
}

describe("PlanSummaryPanel", () => {
  it("renders loading state", () => {
    render(
      <PlanSummaryPanel
        isLoading
        summary={undefined}
        onOpenDebt={vi.fn()}
        onOpenGoals={vi.fn()}
      />
    )

    expect(
      screen.getByRole("status", { name: /loading debt summary/i })
    ).toBeInTheDocument()
  })

  it("renders the Debt Summary group with values when debt data exists", () => {
    render(
      <PlanSummaryPanel
        isLoading={false}
        summary={makeSummary()}
        onOpenDebt={vi.fn()}
        onOpenGoals={vi.fn()}
      />
    )

    expect(screen.getByText("Debt Summary")).toBeInTheDocument()
    expect(screen.getByText("KD 3,650.000")).toBeInTheDocument()
    expect(screen.getByText("KD 145.000")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("renders the empty state and routes to the debt tracker", () => {
    const onOpenDebt = vi.fn()
    render(
      <PlanSummaryPanel
        isLoading={false}
        summary={makeSummary({ account_count: 0 })}
        onOpenDebt={onOpenDebt}
        onOpenGoals={vi.fn()}
      />
    )

    expect(screen.getByText(/You haven.*added any debts/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Track your debts" }))
    expect(onOpenDebt).toHaveBeenCalledTimes(1)
  })
})
