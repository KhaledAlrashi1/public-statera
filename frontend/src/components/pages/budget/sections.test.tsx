import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BudgetTable } from "./sections"

describe("BudgetTable", () => {
  it("shows an empty-state CTA when no budgets exist yet", () => {
    const onAdd = vi.fn()

    render(
      <BudgetTable
        rows={[]}
        hasBudgets={false}
        searchQuery=""
        setSearchQuery={vi.fn()}
        range="month"
        setRange={vi.fn()}
        onAdd={onAdd}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getAllByText("Set your first budget").length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole("button", { name: "Add your first budget" })[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})
