// MOB-R56 KS1 — a savings-kind category has no share of the month's expenses, so the detail modal
// shows no "Share of Month" for it.
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CategoryDetailModal } from "./category-detail-modal"

describe("CategoryDetailModal — no share for savings (MOB-R56 KS1)", () => {
  it("shows no Share of Month when the share is null", () => {
    render(
      <CategoryDetailModal
        open
        onClose={vi.fn()}
        activeCategory="Savings & investing"
        selectedMonth="2026-03"
        categoryRows={[]}
        categoryRowsTotal={0}
        categoryHasMore={false}
        onLoadMore={vi.fn()}
        categoryTotal={30}
        categoryShare={null}
        categoryDelta={0}
        categoryDeltaPct={0}
        categoryPrevTotal={30}
        prevMonth="2026-02"
      />,
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.queryByText("Share of Month")).not.toBeInTheDocument()
  })
})
