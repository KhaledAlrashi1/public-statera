import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AddTransactionDialog } from "./dialogs"

// MOB-R61 C1/C2/C4 — QuickAdd on phones: the dialog is sized to the visual viewport, the footer
// sits outside the fields' scroll region, a focused field is scrolled into view, and the
// non-amount fields carry attributes that discourage Safari's AutoFill bar. Layout only: the save
// path, amount parsing and posted fields are covered by dialogs.test.tsx and stay unchanged.

vi.mock("@/lib/api", () => ({
  transactionsApi: {
    create: vi.fn(),
    dupCheck: vi.fn(),
    suggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

function renderDialog(initialType: "expense" | "income" = "expense") {
  render(
    <AddTransactionDialog
      open
      onOpenChange={vi.fn()}
      categories={["Groceries"]}
      onSuccess={vi.fn()}
      initialType={initialType}
    />
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("AddTransactionDialog — phone layout (MOB-R61)", () => {
  it("non-amount fields carry autocomplete off and their input type", () => {
    renderDialog("expense")
    for (const label of ["Merchant", "What was this for?", "Category"]) {
      const field = screen.getByLabelText(label)
      expect(field.getAttribute("autocomplete"), label).toBe("off")
    }
    const date = screen.getByLabelText("Date")
    expect(date.getAttribute("type")).toBe("date")
    expect(date.getAttribute("autocomplete")).toBe("off")

    fireEvent.click(screen.getByRole("button", { name: "Income" }))
    const incomeName = screen.getByLabelText("Name")
    expect(incomeName.getAttribute("type")).toBe("text")
    expect(incomeName.getAttribute("autocomplete")).toBe("off")
    const incomeDate = screen.getByLabelText("Date")
    expect(incomeDate.getAttribute("type")).toBe("date")
    expect(incomeDate.getAttribute("autocomplete")).toBe("off")
  })

  it("is sized to the visual viewport and keeps the footer outside the fields' scroll region", () => {
    const listeners: string[] = []
    vi.stubGlobal("visualViewport", {
      offsetTop: 120,
      height: 400,
      addEventListener: (type: string) => listeners.push(type),
      removeEventListener: () => {},
    })
    renderDialog("expense")

    const dialog = screen.getByRole("dialog")
    expect(dialog.style.getPropertyValue("--vv-top")).toBe("120px")
    expect(dialog.style.getPropertyValue("--vv-height")).toBe("400px")
    expect(listeners).toContain("resize")

    const fields = dialog.querySelector("[data-quickadd-fields]")
    expect(fields).not.toBeNull()
    expect(fields!.className).toContain("max-sm:overflow-y-auto")
    expect(fields!.contains(screen.getByLabelText("Amount (KD)"))).toBe(true)
    for (const name of ["Cancel", "Add Expense"]) {
      const button = screen.getByRole("button", { name })
      expect(fields!.contains(button), name).toBe(false)
    }
    expect(fields!.contains(screen.getByLabelText("Keep open for another"))).toBe(false)
  })

  it("scrolls a focused field into view", async () => {
    const scrolled: Element[] = []
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this)
    })
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    })
    try {
      renderDialog("expense")
      // The dialog focuses Amount on open (a frame later); wait for that so it cannot take
      // focus back from the field this test focuses.
      await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Amount (KD)")))
      const date = screen.getByLabelText("Date")
      date.focus()
      await waitFor(() => expect(scrolled).toContain(date))
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" })
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})
