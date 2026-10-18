// MOB-R116 D5 — the dashboard's category list shows a refund row in Activity's refund style (the same helper, no new
// strings); a spending row is unchanged.
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CategoryDetailModal } from "./category-detail-modal"

describe("CategoryDetailModal — refund rows (MOB-R116 D5)", () => {
  it("a refund row reads +KD of its magnitude in the success colour; a spend row is unchanged", () => {
    render(
      <CategoryDetailModal
        open
        onClose={vi.fn()}
        activeCategory="Dining"
        selectedMonth="2026-10"
        categoryRows={[
          { id: 1, date: "2026-10-10", merchant: "Caribou Coffee", name: "Refund", amount_kd: "-2.250" },
          { id: 2, date: "2026-10-09", merchant: "Caribou Coffee", name: "Latte", amount_kd: "3.500" },
        ]}
        categoryRowsTotal={2}
        categoryHasMore={false}
        onLoadMore={vi.fn()}
        categoryTotal={1.25}
        categoryShare={null}
        categoryDelta={0}
        categoryDeltaPct={0}
        categoryPrevTotal={1.25}
        prevMonth="2026-09"
      />,
    )
    const refund = screen.getAllByText("+KD 2.250")
    expect(refund.length).toBeGreaterThan(0)
    for (const el of refund) expect(el).toHaveClass("text-success")
    const spend = screen.getAllByText("KD 3.500")
    expect(spend.length).toBeGreaterThan(0)
    for (const el of spend) expect(el).not.toHaveClass("text-success")
    expect(screen.queryByText("KD -2.250")).toBeNull()
  })
})
