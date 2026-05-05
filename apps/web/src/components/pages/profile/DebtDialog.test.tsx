import type { ComponentProps } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DebtDialog } from "./DebtDialog"

function renderDebtDialog(
  overrides: Partial<ComponentProps<typeof DebtDialog>> = {}
) {
  const props: ComponentProps<typeof DebtDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    account: null,
    saving: false,
    onSubmit: vi.fn(),
    ...overrides,
  }
  render(<DebtDialog {...props} />)
  return props
}

describe("DebtDialog", () => {
  it("renders create form fields", () => {
    renderDebtDialog()

    expect(screen.getByRole("heading", { name: "Add Debt" })).toBeInTheDocument()
    expect(screen.getByLabelText("Debt name")).toBeInTheDocument()
    expect(screen.getByLabelText("Debt type")).toBeInTheDocument()
    expect(screen.getByLabelText("Balance (KD)")).toBeInTheDocument()
    expect(screen.getByLabelText("Minimum / month (KD)")).toBeInTheDocument()
    expect(screen.getByLabelText("Due day (1-31)")).toBeInTheDocument()
    expect(screen.getByLabelText("Notes (optional)")).toBeInTheDocument()
    expect(screen.queryByLabelText("APR % (optional)")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Debt" })).toBeInTheDocument()
  })

  it("blocks submit when debt name is empty", async () => {
    const onSubmit = vi.fn()
    renderDebtDialog({ onSubmit })

    fireEvent.change(screen.getByLabelText("Debt name"), {
      target: { value: "   " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add Debt" }))

    expect(await screen.findByText("Debt name is required.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
