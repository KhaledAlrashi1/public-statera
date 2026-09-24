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
    expect(screen.getByText(/Based on 6 days/)).toBeInTheDocument()
  })

  // MOB-R25 Stage 1 — the SAFE-TO-SPEND TODAY tile is removed from view while the rest of the
  // This Week panel stays. The two halves are asserted in ONE render deliberately: an
  // absence assertion alone is equally satisfied by a component that rendered nothing at all,
  // so the retained elements are what make the absence discriminating rather than vacuous.
  it("drops the safe-to-spend tile while keeping the rest of This Week", () => {
    render(<WeeklyDigestSection digest={makeDigest()} loading={false} />)

    // ABSENT — the removed tile, by its label and by its figure.
    expect(screen.queryByText(/Safe-to-spend today/i)).not.toBeInTheDocument()
    expect(screen.queryByText("KD 7.590")).not.toBeInTheDocument()
    // The payday countdown lived INSIDE that tile and goes with it (named in the report).
    expect(screen.queryByText(/Days until payday/i)).not.toBeInTheDocument()

    // PRESENT in the SAME render — the retained panel and its remaining contents.
    expect(screen.getByText("This Week")).toBeInTheDocument()
    expect(screen.getByText("Weekly insight")).toBeInTheDocument()
    expect(screen.getByText("Weekly pace")).toBeInTheDocument()
    expect(screen.getByText("Spending delta")).toBeInTheDocument()
    expect(screen.getByText("Top categories this week")).toBeInTheDocument()
  })
})

/**
 * MOB-1 Group 3 — zero-versus-no-data on the weekly Spending delta.
 *
 * With no expenses in EITHER week both sums are "0.000" and delta_pct is 0, which fell through to
 * "Your weekly pace is unchanged." — a pace comparison between two empty weeks. Expenses are
 * strictly positive at the database (chk_transactions_amount_positive, migration 0000), so a zero
 * sum means NO ROWS rather than a week that happened to cost nothing.
 *
 * These cases reuse makeDigest above rather than carrying a second fixture.
 */
describe("MOB-1 Group 3 — WeeklyDigestSection spending delta", () => {
  const UNCHANGED = "Your weekly pace is unchanged."

  it("I4 — says N/A rather than claiming the pace is unchanged between two empty weeks", () => {
    render(
      <WeeklyDigestSection
        digest={makeDigest({ this_week_expense_kd: "0.000", last_week_expense_kd: "0.000", delta_pct: 0 })}
        loading={false}
      />
    )
    // WITHOUT the change delta_pct is 0, so this reads "Your weekly pace is unchanged." and shows
    // "0.0%" for two weeks that have no expenses at all.
    expect(screen.queryByText(UNCHANGED)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.0%/)).not.toBeInTheDocument()
    expect(screen.getByText("N/A")).toBeInTheDocument()
  })

  it("CONTROL — a genuinely unchanged week still says so", () => {
    render(
      <WeeklyDigestSection
        digest={makeDigest({ this_week_expense_kd: "120.000", last_week_expense_kd: "120.000", delta_pct: 0 })}
        loading={false}
      />
    )
    // Real spend in both weeks and a real zero delta: the claim is TRUE here and must survive.
    // Without this case the test above would pass against a component that deleted the sentence.
    expect(screen.getByText(UNCHANGED)).toBeInTheDocument()
  })

  it("CONTROL — one empty week and one with spend still reports a direction", () => {
    render(
      <WeeklyDigestSection
        digest={makeDigest({ this_week_expense_kd: "0.000", last_week_expense_kd: "80.000", delta_pct: -100 })}
        loading={false}
      />
    )
    // Only ONE week is empty, so the comparison is real: spending genuinely fell to nothing.
    expect(screen.getByText("You spent less than last week.")).toBeInTheDocument()
  })
})

