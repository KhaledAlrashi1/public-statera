import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { WeeklyDigestResponse } from "@/types/api"
import { WeeklyDigestSection } from "./WeeklyDigestSection"

function makeDigest(overrides: Partial<WeeklyDigestResponse> = {}): WeeklyDigestResponse {
  return {
    week_start: "2026-02-23",
    week_end: "2026-03-01",
    this_week_expense_kd: "45.200",
    last_week_expense_kd: "62.000",
    delta_pct: -27.1,
    top_categories: [
      { name: "Food", amount_kd: "18.000" },
      { name: "Transport", amount_kd: "12.500" },
    ],
    days_until_payday: 27,
    safe_to_spend_today_kd: "7.590",
    days_observed: 6,
    ...overrides,
  }
}

describe("WeeklyDigestSection", () => {
  it("renders loading skeletons", () => {
    const { container } = render(<WeeklyDigestSection digest={undefined} loading />)
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0)
  })

  it("renders empty state when digest data is missing", () => {
    render(<WeeklyDigestSection digest={undefined} loading={false} />)

    expect(screen.getByText(/No data yet/i)).toBeInTheDocument()
  })

  it("renders an error state", () => {
    render(<WeeklyDigestSection digest={undefined} loading={false} error="Digest failed" />)

    expect(screen.getByText("Digest failed")).toBeInTheDocument()
  })

  it("renders digest values", () => {
    render(<WeeklyDigestSection digest={makeDigest()} loading={false} />)

    expect(screen.getByText("23 Feb 2026 to 1 Mar 2026")).toBeInTheDocument()
    expect(screen.getByText(/-27.1%/)).toBeInTheDocument()
    expect(screen.getByText("Food")).toBeInTheDocument()
    expect(screen.getByText("Transport")).toBeInTheDocument()
    expect(screen.getByText(/Days until payday: 27/)).toBeInTheDocument()
    expect(screen.getByText(/Based on 6 days/)).toBeInTheDocument()
  })

  it("renders payday as N/A when unavailable", () => {
    render(
      <WeeklyDigestSection
        digest={makeDigest({ days_until_payday: null, days_observed: 7 })}
        loading={false}
      />
    )
    expect(screen.getByText(/Days until payday: N\/A/)).toBeInTheDocument()
  })
})
