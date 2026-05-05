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
})
