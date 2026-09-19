/**
 * MOB-1 Group 1 — the Month Snapshot guidance line.
 *
 * With no data for the month all three money props arrive as 0, and the first arm of the guidance
 * chain fires on `remaining_kd <= 0` — asserting that committed spending is overtaking a budget the
 * user has not set. Amounts are strictly positive at the database
 * (chk_transactions_amount_positive / chk_budgets_amount_positive, migration 0000), so a zero total
 * is unattainable from real rows and therefore means ABSENT rather than "all three happened to be
 * nothing".
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SpendForecastWidget } from "./SpendForecastWidget"

const OVERTAKING = /Committed spending is now overtaking/
const AHEAD = /ahead of pace/

describe("MOB-1 Group 1 — SpendForecastWidget guidance", () => {
  it("I5 — says nothing when the month has no data, rather than claiming commitments are overtaking", () => {
    render(<SpendForecastWidget committed_kd={0} remaining_kd={0} spent_kd={0} loading={false} />)
    // WITHOUT the change remaining_kd <= 0 is true at zero, so this reads
    // "Committed spending is now overtaking the rest of this month's budget."
    expect(screen.queryByText(OVERTAKING)).not.toBeInTheDocument()
    expect(screen.queryByText(AHEAD)).not.toBeInTheDocument()
  })

  it("I5b — says nothing when there are no budgets but real spend, a non-zero total", () => {
    render(<SpendForecastWidget committed_kd={0} remaining_kd={0} spent_kd={160} loading={false} />)
    // This is the case a zero-TOTAL guard misses and a zero-COMMITMENTS guard catches: the month
    // has data, so total is 160, but there are no commitments for anything to overtake. It was
    // found by the InsightsPage I1 test, which renders this widget on the same page.
    expect(screen.queryByText(OVERTAKING)).not.toBeInTheDocument()
    expect(screen.queryByText(AHEAD)).not.toBeInTheDocument()
  })

  it("CONTROL — with real figures the guidance still renders", () => {
    render(<SpendForecastWidget committed_kd={100} remaining_kd={400} spent_kd={250} loading={false} />)
    // remaining >= committed, so the healthy arm is the one that should fire. Without this case the
    // test above would pass against a component that had simply deleted the guidance line.
    expect(screen.getByText(AHEAD)).toBeInTheDocument()
  })

  it("CONTROL — a genuinely overtaken month still says so", () => {
    render(<SpendForecastWidget committed_kd={500} remaining_kd={0} spent_kd={250} loading={false} />)
    // Non-zero total, remaining 0: this is a REAL zero, not an absent one, and must keep its claim.
    expect(screen.getByText(OVERTAKING)).toBeInTheDocument()
  })
})
