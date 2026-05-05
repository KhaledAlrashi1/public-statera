import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { RecurringPattern } from "@/types/api"
import { RecurringBillsCard } from "./RecurringBillsCard"

function makePattern(overrides: Partial<RecurringPattern> = {}): RecurringPattern {
  return {
    name: "Netflix",
    frequency: "monthly",
    avg_amount_kd: "3.250",
    last_seen: "2026-02-14",
    confidence: "high",
    occurrences: 3,
    group: "Subscriptions",
    ...overrides,
  }
}

describe("RecurringBillsCard", () => {
  it("shows loading state", () => {
    const { container } = render(<RecurringBillsCard patterns={[]} loading onOpenActivity={vi.fn()} />)
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0)
  })

  it("shows empty state", () => {
    render(<RecurringBillsCard patterns={[]} loading={false} onOpenActivity={vi.fn()} />)
    expect(screen.getByText(/detect recurring bills automatically/i)).toBeInTheDocument()
  })

  it("renders top patterns and monthly commitment", () => {
    const patterns: RecurringPattern[] = [
      makePattern({ name: "Netflix", avg_amount_kd: "3.250", frequency: "monthly" }),
      makePattern({ name: "Spotify", avg_amount_kd: "2.000", frequency: "monthly", last_seen: "2026-02-13" }),
      makePattern({ name: "Gym", avg_amount_kd: "5.500", frequency: "weekly", last_seen: "2026-02-20", occurrences: 6 }),
    ]
    render(<RecurringBillsCard patterns={patterns} loading={false} onOpenActivity={vi.fn()} />)

    expect(screen.getByText(/Total monthly commitment:/i)).toBeInTheDocument()
    expect(screen.getByText("Netflix")).toBeInTheDocument()
    expect(screen.getByText("Spotify")).toBeInTheDocument()
    expect(screen.getByText("Gym")).toBeInTheDocument()
  })

  it("calls activity callback", () => {
    const onOpenActivity = vi.fn()
    render(
      <RecurringBillsCard
        patterns={[makePattern()]}
        loading={false}
        onOpenActivity={onOpenActivity}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Open Activity/i }))
    expect(onOpenActivity).toHaveBeenCalledTimes(1)
  })
})
