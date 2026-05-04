import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DebtAccountSummary } from "@/types/api"
import { DebtSummaryPanel } from "./sections"

function makeSummary(overrides: Partial<DebtAccountSummary> = {}): DebtAccountSummary {
  return {
    total_balance_kd: "3650.000",
    total_minimum_kd: "145.000",
    account_count: 2,
    ...overrides,
  }
}

describe("DebtSummaryPanel", () => {
  it("renders loading state", () => {
    render(
      <DebtSummaryPanel
        isLoading
        summary={undefined}
        onOpenProfile={vi.fn()}
      />
    )

    expect(
      screen.getByRole("status", { name: /loading debt summary/i })
    ).toBeInTheDocument()
  })

  it("renders summary values when debt data exists", () => {
    render(
      <DebtSummaryPanel
        isLoading={false}
        summary={makeSummary()}
        onOpenProfile={vi.fn()}
      />
    )

    expect(screen.getByText("Debt Summary")).toBeInTheDocument()
    expect(screen.getByText(/KD 3650.000/)).toBeInTheDocument()
    expect(screen.getByText(/KD 145.000/)).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("renders empty state and routes to profile", () => {
    const onOpenProfile = vi.fn()
    render(
      <DebtSummaryPanel
        isLoading={false}
        summary={makeSummary({ account_count: 0 })}
        onOpenProfile={onOpenProfile}
      />
    )

    expect(screen.getByText(/No debt accounts tracked yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Track your debts" }))
    expect(onOpenProfile).toHaveBeenCalledTimes(1)
  })
})
