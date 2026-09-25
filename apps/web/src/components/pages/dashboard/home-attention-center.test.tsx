/**
 * MOB-R27 D2 — Gate C discharged for this site only.
 *
 * "You're on track. No categories are over budget right now." is TRUE and MISLEADING on an
 * account with no budgets: nothing is over plan because there is no plan. The empty-period arm
 * now carries the ruled sentence instead, and the NON-EMPTY render is unchanged — which is why
 * the second case here matters as much as the first. A suppression test without its negative
 * case cannot tell "shows the right thing when empty" from "never shows the old thing at all".
 *
 * The ruled sentence is asserted as an EXACT string; see plan-setup-prompts.test.tsx for why.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { HomeAttentionCenter } from "./sections"

function renderCenter(
  budgetPressureItems: Array<{
    category: string
    allocated: number
    spent: number
    usedPct: number
    over: number
  }>
) {
  return render(
    <HomeAttentionCenter
      isLoading={false}
      monthLabel="March 2026"
      overBudgetCount={0}
      overBudgetAmount={0}
      risingCategory={null}
      budgetAlerts={[]}
      alertsLoading={false}
      dismissingAlertId={null}
      budgetPressureItems={budgetPressureItems}
      onDismissBudgetAlert={vi.fn()}
      onOpenPlan={vi.fn()}
      onOpenActivity={vi.fn()}
    />
  )
}

describe("HomeAttentionCenter — zero-versus-no-data on the attention arm", () => {
  it("says there is nothing to assess when no budgets exist", () => {
    // budgetPressureItems is built from budgetResp.items and only SLICED, never filtered, so an
    // empty list means NO BUDGETS rather than budgets that happen to be quiet.
    renderCenter([])

    expect(
      screen.getByText("Nothing to assess yet. Add a budget to see how your spending compares.")
    ).toBeInTheDocument()
    expect(screen.queryByText(/No categories are over budget right now/)).not.toBeInTheDocument()
    expect(screen.queryByText("On track")).not.toBeInTheDocument()
  })

  it("leaves the on-track render unchanged when budgets exist and none are pressured", () => {
    // usedPct below the 0.75 attention threshold, so attentionRows is empty and this still
    // reaches the final arm — but a budget DOES exist, so "on track" is a true statement.
    renderCenter([
      { category: "Food", allocated: 100, spent: 10, usedPct: 0.1, over: 0 },
    ])

    expect(
      screen.getByText("You're on track. No categories are over budget right now.")
    ).toBeInTheDocument()
    expect(screen.getByText("On track")).toBeInTheDocument()
    expect(
      screen.queryByText("Nothing to assess yet. Add a budget to see how your spending compares.")
    ).not.toBeInTheDocument()
  })
})
