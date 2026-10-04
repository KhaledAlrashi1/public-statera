import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CommandPalette from "./CommandPalette"

// MOB-R61 D2 — the palette's "Add Expense" opens /log, the main expense entry; "Add Income" keeps
// QuickAdd.

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openQuickAdd: vi.fn(),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({
    openQuickAdd: mocks.openQuickAdd,
    closeQuickAdd: vi.fn(),
  }),
}))

function renderPalette() {
  const onOpenChange = vi.fn()
  render(
    <MemoryRouter>
      <CommandPalette open onOpenChange={onOpenChange} />
    </MemoryRouter>
  )
  return onOpenChange
}

describe("CommandPalette log entry (MOB-R61 D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens /log for Add Expense and keeps QuickAdd for Add Income", () => {
    const onOpenChange = renderPalette()
    fireEvent.click(screen.getByRole("button", { name: /Add Expense/ }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    cleanup()
    vi.clearAllMocks()
    renderPalette()
    fireEvent.click(screen.getByRole("button", { name: /Add Income/ }))
    expect(mocks.openQuickAdd).toHaveBeenCalledWith("income")
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
