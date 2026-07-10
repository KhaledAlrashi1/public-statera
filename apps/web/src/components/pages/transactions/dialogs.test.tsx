import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AddTransactionDialog } from "./dialogs"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dupCheck: vi.fn(),
  suggestions: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", () => ({
  transactionsApi: {
    create: mocks.create,
    dupCheck: mocks.dupCheck,
    suggestions: mocks.suggestions,
  },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mocks.toast.success,
    error: mocks.toast.error,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

const SAMPLE = [
  { name: "Flat White", category: { id: 1, name: "Food" }, merchant: { id: 1, name: "Cafe" } },
  { name: "Netflix subscription", category: { id: 2, name: "Bills" }, merchant: { id: 2, name: "Netflix" } },
]

function renderDialog(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    categories: ["Food", "Transport"],
    onSuccess: vi.fn(),
    initialType: "expense" as const,
    ...overrides,
  }
  render(<AddTransactionDialog {...props} />)
  return props
}

describe("AddTransactionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dupCheck.mockResolvedValue({ count: 0 })
    mocks.create.mockResolvedValue({ ok: true })
    mocks.suggestions.mockResolvedValue({ items: SAMPLE })
  })

  it("creates an expense on form submit (Enter path)", async () => {
    const props = renderDialog()
    fireEvent.change(screen.getByLabelText("Amount (KD)"), { target: { value: "5.000" } })
    const name = screen.getByLabelText("What was this for?")
    fireEvent.change(name, { target: { value: "Lunch" } })

    fireEvent.submit(name.closest("form")!)

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Lunch", amount_kd: "5.000" })
    )
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false))
  })

  it("applies a clicked suggestion to the merchant and name fields", async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText("What was this for?"), { target: { value: "Fl" } })

    const option = await screen.findByText("Flat White")
    fireEvent.mouseDown(option)

    expect((screen.getByLabelText("What was this for?") as HTMLInputElement).value).toBe("Flat White")
    expect((screen.getByLabelText("Merchant") as HTMLInputElement).value).toBe("Cafe")
  })

  it("navigates suggestions with ArrowDown and accepts the highlighted one with Enter", async () => {
    renderDialog()
    const name = screen.getByLabelText("What was this for?")
    fireEvent.change(name, { target: { value: "aa" } })

    await screen.findByRole("listbox")
    fireEvent.keyDown(name, { key: "ArrowDown" }) // top (0) -> second (1)
    fireEvent.keyDown(name, { key: "Enter" })

    expect((name as HTMLInputElement).value).toBe("Netflix subscription")
    expect(mocks.create).not.toHaveBeenCalled() // Enter accepted the option, did not submit
  })

  it("Escape closes the suggestion dropdown without closing the dialog", async () => {
    const props = renderDialog()
    const name = screen.getByLabelText("What was this for?")
    fireEvent.change(name, { target: { value: "aa" } })

    await screen.findByRole("listbox")
    fireEvent.keyDown(name, { key: "Escape" })

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("keep-open: clears fields, keeps the dialog open, resets validation, and refocuses Amount", async () => {
    const props = renderDialog()
    fireEvent.click(screen.getByLabelText("Keep open for another"))

    const amount = screen.getByLabelText("Amount (KD)") as HTMLInputElement
    const name = screen.getByLabelText("What was this for?") as HTMLInputElement
    fireEvent.change(amount, { target: { value: "5.000" } })
    fireEvent.change(name, { target: { value: "Lunch" } })

    fireEvent.submit(name.closest("form")!)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))

    // Stays open (never closed) and fields cleared for the next entry.
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false)
    await waitFor(() => expect(amount.value).toBe(""))
    expect(name.value).toBe("")

    // Validation pristine: emptying the required fields did NOT prime an error.
    expect(name.getAttribute("aria-invalid")).not.toBe("true")

    // Amount is refocused for rapid batch entry.
    await waitFor(() => expect(document.activeElement).toBe(amount))
  })
})
