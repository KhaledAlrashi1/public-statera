import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MonthDeltaCard, type MonthDeltaRow } from "./MonthDeltaCard"

function makeRow(overrides: Partial<MonthDeltaRow> = {}): MonthDeltaRow {
  return {
    category: "Dining",
    this_month_kd: 120,
    last_month_kd: 80,
    delta_kd: 40,
    delta_pct: 50,
    ...overrides,
  }
}

describe("MonthDeltaCard", () => {
  it("shows loading state", () => {
    const { container } = render(<MonthDeltaCard rows={[]} loading error={null} />)
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0)
  })

  it("shows empty state", () => {
    render(<MonthDeltaCard rows={[]} loading={false} error={null} />)
    expect(screen.getByText(/Not enough month-over-month data yet/i)).toBeInTheDocument()
  })

  it("renders delta rows with signed values", () => {
    render(
      <MonthDeltaCard
        rows={[
          makeRow({ category: "Dining", delta_kd: 40, delta_pct: 50 }),
          makeRow({ category: "Fuel", this_month_kd: 30, last_month_kd: 50, delta_kd: -20, delta_pct: -40 }),
        ]}
        loading={false}
        error={null}
      />
    )

    expect(screen.getByText("Dining")).toBeInTheDocument()
    expect(screen.getByText("Fuel")).toBeInTheDocument()
    expect(screen.getByText("(+50%)")).toBeInTheDocument()
    expect(screen.getByText("(-40%)")).toBeInTheDocument()
  })

  // MOB-R50 F4 — a percent change against last month's 0 is not a percentage: the row keeps its
  // KD shift and shows no percentage. The base-80 row is the control that percentages still show.
  it("shows no percentage for a category with no spending last month", () => {
    render(
      <MonthDeltaCard
        rows={[
          makeRow({ category: "Rent", this_month_kd: 300, last_month_kd: 0, delta_kd: 300, delta_pct: 100 }),
          makeRow({ category: "Dining", delta_kd: 40, delta_pct: 50 }),
        ]}
        loading={false}
        error={null}
      />
    )
    // WITHOUT the change the Rent row reads "(+100%)".
    expect(screen.queryByText("(+100%)")).not.toBeInTheDocument()
    expect(screen.getByText("(+50%)")).toBeInTheDocument()
  })
})
