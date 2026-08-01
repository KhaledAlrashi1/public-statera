import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FinancialSnapshotHero } from "./sections"
import type { SnapshotResponse } from "@/types/api"

// Q4 (SWEEP-R3): FinancialSnapshotHero is the sole consumer of the R13 SnapshotResponse
// KWD fields, which arrive as 3-decimal STRINGS via formatKd (C2 fix-forward). It had no
// render test (recorded in phase4-c2-snapshot-response-types.md). This adds one, driving
// string values through formatKD + the Number(...) sign-coercion path.

const snapshot: SnapshotResponse = {
  net_position: {
    income_total_kd: "1200.000",
    expense_total_kd: "800.000",
    net_kd: "400.000",
  },
  cash_flow: {
    "30d": { income_kd: "500.000", expense_kd: "620.000", net_kd: "-120.000" },
    "60d": { income_kd: "1000.000", expense_kd: "900.000", net_kd: "100.000" },
    "90d": { income_kd: "1500.000", expense_kd: "1300.000", net_kd: "200.000" },
  },
  accounts: [],
  generated_at: "2026-03-01T00:00:00+00:00",
}

function renderHero() {
  return render(
    <FinancialSnapshotHero
      isLoading={false}
      snapshot={snapshot}
      onOpenBanking={vi.fn()}
      onOpenSpending={vi.fn()}
    />
  )
}

describe("FinancialSnapshotHero — money strings (SWEEP-R3 Q4)", () => {
  it("renders string KWD net position and default 30d cash-flow values", () => {
    renderHero()
    expect(screen.getByText("KD 400.000")).toBeInTheDocument() // net_position.net_kd
    expect(screen.getByText("KD 500.000")).toBeInTheDocument() // 30d income
    expect(screen.getByText("KD 620.000")).toBeInTheDocument() // 30d expense
    expect(screen.getByText("KD -120.000")).toBeInTheDocument() // 30d net (negative)
  })

  it("applies the destructive color to a negative net via Number(net_kd) sign coercion", () => {
    renderHero()
    expect(screen.getByText("KD -120.000").className).toContain("text-destructive")
    expect(screen.getByText("KD 400.000").className).toContain("text-primary")
  })
})
