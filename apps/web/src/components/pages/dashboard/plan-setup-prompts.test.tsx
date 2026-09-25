/**
 * MOB-R27 — PlanSetupPrompts, the three affordances RM-6 blocked last cycle.
 *
 * Every assertion on a ruled sentence uses the EXACT string, not a regex fragment. The six
 * strings ruled by MOB-R27 exist in no artifact except that ruling block and
 * docs/modules/phase4-mobile.md, so the transcription seam cannot be closed — only bounded.
 * An exact-string assertion is the bound: a drifted character goes red here rather than
 * shipping unnoticed. Do not loosen these to /partial match/i.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { SafeToSpendResponse } from "@/types/api"
import { PlanSetupPrompts } from "./sections"

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

describe("PlanSetupPrompts", () => {
  // Path 1 of 5 — loading. Renders NOTHING rather than a skeleton: the hero's skeleton stood in
  // for a figure that no longer exists, so a placeholder would promise something never arriving.
  it("renders nothing while loading", () => {
    const { container } = render(
      <PlanSetupPrompts isLoading safeToSpend={undefined} onOpenPlan={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  // Path 2 of 5 — the payload failed to load. Carries ruled string A4.
  it("renders the ruled error sentence when the payload is missing", () => {
    render(<PlanSetupPrompts isLoading={false} safeToSpend={undefined} onOpenPlan={vi.fn()} />)

    expect(
      screen.getByText("We couldn't load your monthly figures right now.")
    ).toBeInTheDocument()
    // The sentence this replaced named the removed feature; it must not survive anywhere.
    expect(screen.queryByText(/safe-to-spend/i)).not.toBeInTheDocument()
  })

  // Path 3 of 5 — nothing to prompt for. The negative case for the whole component.
  it("renders nothing when the month is already complete", () => {
    const { container } = render(
      <PlanSetupPrompts
        isLoading={false}
        safeToSpend={makeSafeToSpend({ data_complete: true })}
        onOpenPlan={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  // Path 4 of 5 — income missing. Ruled string A2, under the hero's EXISTING heading and button.
  it("renders the ruled income sentence when income needs setup", () => {
    render(
      <PlanSetupPrompts
        isLoading={false}
        safeToSpend={makeSafeToSpend({
          data_complete: false,
          monthly_income_kd: "0.000",
          warnings: ["income_not_set"],
        })}
        onOpenPlan={vi.fn()}
      />
    )

    expect(
      screen.getByText("Set your monthly income so your plan and net figures are accurate.")
    ).toBeInTheDocument()
    expect(screen.getByText("Set your income")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add income" })).toBeInTheDocument()
    expect(screen.queryByText(/Safe to Spend/i)).not.toBeInTheDocument()
  })

  // Path 5 of 5 — income present, budget missing. Ruled string A3.
  it("renders the ruled budget sentence when income is set but the budget is not", () => {
    render(
      <PlanSetupPrompts
        isLoading={false}
        safeToSpend={makeSafeToSpend({ data_complete: false, warnings: [] })}
        onOpenPlan={vi.fn()}
      />
    )

    expect(
      screen.getByText(
        "Set a budget for this month to see how your spending compares with your plan."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("No budget set for this month.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Plan" })).toBeInTheDocument()
    expect(screen.queryByText(/Safe-to-spend/i)).not.toBeInTheDocument()
  })
})
