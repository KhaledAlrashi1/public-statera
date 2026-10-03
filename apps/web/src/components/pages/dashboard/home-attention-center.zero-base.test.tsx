/**
 * MOB-R52 F6 — Home states no percent change against last month's 0.
 *
 * A category new this month has no previous spend, so its rise has no percentage; DashboardPage
 * passes deltaPct null for it. The +KD amount and the existing sentence stay; only the
 * percentage drops (removal only, no new copy). Own file: no existing test is edited.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { HomeAttentionCenter } from "./sections"

describe("MOB-R52 F6 — HomeAttentionCenter rising category from a zero base", () => {
  it("shows the KD rise but no percentage when last month had no spending there", () => {
    render(
      <HomeAttentionCenter
        isLoading={false}
        monthLabel="March 2026"
        overBudgetCount={0}
        overBudgetAmount={0}
        risingCategory={{ name: "Rent", deltaAmount: 600, deltaPct: null }}
        budgetAlerts={[]}
        alertsLoading={false}
        dismissingAlertId={null}
        budgetPressureItems={[]}
        onDismissBudgetAlert={vi.fn()}
        onOpenPlan={vi.fn()}
        onOpenActivity={vi.fn()}
      />
    )
    // The rising arm rendered — otherwise the absence below proves nothing.
    expect(screen.getByText("Rent is climbing faster than last month.")).toBeInTheDocument()
    // WITHOUT the change the percentage span renders "(0.0%)" from Math.abs(null).
    expect(screen.queryByText(/%\)/)).not.toBeInTheDocument()
  })
})
