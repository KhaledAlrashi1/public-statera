import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUGGESTED_CATEGORIES } from "@/lib/suggested-names"
import { AddTransactionDialog } from "./dialogs"

// MOB-R46 Part B — the category field is pick-or-type (the user's own categories, then the
// suggested names they do not own) and the merchant field adds suggested merchants after the
// user's own suggestions. Nothing is saved until the transaction is.

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

function renderDialog(categories: string[]) {
  render(
    <AddTransactionDialog
      open
      onOpenChange={vi.fn()}
      categories={categories}
      onSuccess={vi.fn()}
      initialType="expense"
    />
  )
}

function openCategoryOptions() {
  const field = screen.getByLabelText("Category")
  fireEvent.focus(field)
  const listbox = screen.getByRole("listbox")
  return within(listbox).getAllByRole("option").map((o) => o.textContent)
}

async function pickSuggestedMerchant(typed: string, name: string) {
  fireEvent.change(screen.getByLabelText("Merchant"), { target: { value: typed } })
  fireEvent.mouseDown(await screen.findByRole("option", { name: new RegExp(name) }))
}

describe("AddTransactionDialog — suggested names (MOB-R46)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dupCheck.mockResolvedValue({ count: 0 })
    mocks.create.mockResolvedValue({ ok: true })
    mocks.suggestions.mockResolvedValue({ items: [] })
  })

  it("a user with no categories sees the 22 suggested categories", () => {
    renderDialog([])
    expect(openCategoryOptions()).toEqual([...SUGGESTED_CATEGORIES])
  })

  it("lists the user's own categories first, without repeating one as a suggestion", () => {
    renderDialog(["groceries", "Pets"])
    const options = openCategoryOptions()
    expect(options.slice(0, 2)).toEqual(["groceries", "Pets"])
    expect(options.filter((o) => o?.toLowerCase() === "groceries")).toHaveLength(1)
    expect(options).toHaveLength(2 + SUGGESTED_CATEGORIES.length - 1)
  })

  it("sends a typed new category name in the payload", async () => {
    renderDialog([])
    fireEvent.change(screen.getByLabelText("Amount (KD)"), { target: { value: "4.500" } })
    fireEvent.change(screen.getByLabelText("What was this for?"), { target: { value: "Vet visit" } })
    const category = screen.getByLabelText("Category")
    fireEvent.change(category, { target: { value: "Pets" } })

    fireEvent.submit(category.closest("form")!)

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ category: "Pets", name: "Vet visit" }))
  })

  it("picking a suggested merchant fills an empty category with its default", async () => {
    renderDialog([])
    await pickSuggestedMerchant("Tala", "Talabat")
    expect((screen.getByLabelText("Merchant") as HTMLInputElement).value).toBe("Talabat")
    expect((screen.getByLabelText("Category") as HTMLInputElement).value).toBe("Food Delivery")
  })

  it("picking a suggested merchant does not overwrite a chosen category", async () => {
    renderDialog([])
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Gifts & Occasions" } })
    await pickSuggestedMerchant("Tala", "Talabat")
    expect((screen.getByLabelText("Merchant") as HTMLInputElement).value).toBe("Talabat")
    expect((screen.getByLabelText("Category") as HTMLInputElement).value).toBe("Gifts & Occasions")
  })
})
