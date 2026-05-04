import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RecurringCommitmentsCard, type RecurringCommitmentRow } from "./RecurringCommitmentsCard"

function makeRow(overrides: Partial<RecurringCommitmentRow> = {}): RecurringCommitmentRow {
  return {
    name: "Netflix",
    avg_amount_kd: 3.25,
    expected_day: 14,
    next_expected_date: "Mar 14",
    status: "Due soon",
    group: "Subscriptions",
    ...overrides,
  }
}

describe("RecurringCommitmentsCard", () => {
  it("shows loading state", () => {
    const { container } = render(
      <RecurringCommitmentsCard
        rows={[]}
        loading
        onDismiss={vi.fn()}
        onOpenActivity={vi.fn()}
      />
    )
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0)
  })

  it("shows empty state", () => {
    render(
      <RecurringCommitmentsCard
        rows={[]}
        loading={false}
        onDismiss={vi.fn()}
        onOpenActivity={vi.fn()}
      />
    )
    expect(screen.getByText(/surface recurring commitments automatically/i)).toBeInTheDocument()
  })

  it("renders grouped recurring rows and handles dismiss", () => {
    const onDismiss = vi.fn()
    render(
      <RecurringCommitmentsCard
        rows={[
          makeRow({ name: "Netflix", group: "Subscriptions", status: "Due soon" }),
          makeRow({ name: "K-Electric", group: "Utilities", status: "Overdue" }),
        ]}
        loading={false}
        onDismiss={onDismiss}
        onOpenActivity={vi.fn()}
      />
    )

    expect(screen.getByText("Subscriptions")).toBeInTheDocument()
    expect(screen.getByText("Utilities")).toBeInTheDocument()
    expect(screen.getByText("Netflix")).toBeInTheDocument()
    expect(screen.getByText("K-Electric")).toBeInTheDocument()
    expect(screen.getByText("Overdue")).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole("button", { name: /Dismiss .+ as non-recurring/i })[0])
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
