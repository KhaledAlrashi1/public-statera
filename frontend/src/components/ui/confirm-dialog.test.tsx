import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialog } from "./confirm-dialog"

describe("ConfirmDialog", () => {
  it("blocks rapid double-clicks on confirm even before the caller sets loading", () => {
    const onConfirm = vi.fn()

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete transaction?"
        message="Delete this transaction?"
        onConfirm={onConfirm}
      />
    )

    const confirmButton = screen.getByRole("button", { name: "Delete" })
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled()
  })
})
