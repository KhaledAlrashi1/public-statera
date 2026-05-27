import type { ComponentProps } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AddExpenseDialog, SplitTransactionDialog } from "./dialogs"

const mocks = vi.hoisted(() => ({
  transactionsApi: {
    get: vi.fn(),
    split: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  transactionsApi: mocks.transactionsApi,
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

function renderAddDialog(
  overrides: Partial<ComponentProps<typeof AddExpenseDialog>> = {}
) {
  const props: ComponentProps<typeof AddExpenseDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    addForm: {
      date: "2026-02-19",
      merchant: "",
      category: "",
      name: "",
      amount_kd: "1.000",
    },
    setAddForm: vi.fn(),
    addErr: null,
    submitAddExpense: vi.fn(),
    categories: ["Food", "Transport"],
    suggestions: [],
    suggestOpen: false,
    setSuggestOpen: vi.fn(),
    suggestLoading: false,
    setSuggestOpenTimeout: vi.fn(),
    ...overrides,
  }

  render(<AddExpenseDialog {...props} />)
  return props
}

function renderSplitDialog(
  overrides: Partial<ComponentProps<typeof SplitTransactionDialog>> = {}
) {
  const props: ComponentProps<typeof SplitTransactionDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    txnId: 77,
    categories: ["Food", "Transport"],
    onSaved: vi.fn(),
    ...overrides,
  }
  render(<SplitTransactionDialog {...props} />)
  return props
}

describe("expenses/dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transactionsApi.split.mockResolvedValue({ ok: true, transactions: [] })
  })

  it("submits add expense on Enter when suggestions are inactive", () => {
    const props = renderAddDialog({
      suggestions: [],
      suggestOpen: false,
    })

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", code: "Enter" })
    expect(props.submitAddExpense).toHaveBeenCalledTimes(1)
  })

  it("applies suggestion values when a suggestion row is clicked", () => {
    const setAddForm = vi.fn()
    const setSuggestOpen = vi.fn()

    renderAddDialog({
      addForm: {
        date: "2026-02-19",
        merchant: "",
        category: "",
        name: "",
        amount_kd: "1.000",
      },
      setAddForm,
      setSuggestOpen,
      suggestOpen: true,
      suggestions: [{ name: "Flat White", category: { id: 1, name: "Food" }, merchant: { id: 1, name: "Cafe" } }],
    })

    fireEvent.click(screen.getByRole("button", { name: /Flat White/i }))
    expect(setAddForm).toHaveBeenCalledWith({
      date: "2026-02-19",
      merchant: "Cafe",
      category: "Food",
      name: "Flat White",
      amount_kd: "1.000",
    })
    expect(setSuggestOpen).toHaveBeenCalledWith(false)
  })

  it("blocks split save when any row is incomplete", async () => {
    mocks.transactionsApi.get.mockResolvedValue({
      ok: true,
      data: {
        item: {
          id: 77,
          date: "2026-02-19",
          merchant: "Cafe",
          category: "Food",
          memo: "Morning",
          name: "Coffee",
          amount_kd: "1.000",
          items: [
            {
              id: 101,
              transaction_id: 77,
              name: "",
              category: "Food",
              amount_kd: "1.000",
              sort_order: 0,
            },
          ],
        },
      },
      error: null,
      meta: {},
    })

    const props = renderSplitDialog()
    await waitFor(() => expect(mocks.transactionsApi.get).toHaveBeenCalledWith(77))

    fireEvent.click(screen.getByRole("button", { name: /Save split/i }))

    expect(
      await screen.findByText("Complete split row 2 with a valid amount.")
    ).toBeInTheDocument()
    expect(mocks.transactionsApi.split).not.toHaveBeenCalled()
    expect(props.onSaved).not.toHaveBeenCalled()
  })

  it("blocks split save when totals do not match the original transaction", async () => {
    mocks.transactionsApi.get.mockResolvedValue({
      ok: true,
      data: {
        item: {
          id: 77,
          date: "2026-02-19",
          merchant: "Cafe",
          category: "Food",
          memo: "Morning",
          name: "Coffee",
          amount_kd: "2.000",
          items: [
            {
              id: 101,
              transaction_id: 77,
              name: "Coffee",
              category: "Food",
              amount_kd: "2.000",
              sort_order: 0,
            },
          ],
        },
      },
      error: null,
      meta: {},
    })

    renderSplitDialog()
    await waitFor(() => expect(mocks.transactionsApi.get).toHaveBeenCalledWith(77))

    const amountInputs = screen.getAllByPlaceholderText("0.000")
    const nameInputs = screen.getAllByPlaceholderText("e.g. Blue-light glasses")
    fireEvent.change(amountInputs[0], { target: { value: "1.500" } })
    fireEvent.change(amountInputs[1], { target: { value: "0.250" } })
    fireEvent.change(nameInputs[1], { target: { value: "Snack" } })

    fireEvent.click(screen.getByRole("button", { name: /Save split/i }))

    expect(
      await screen.findByText("Split amounts must sum to the original transaction total.")
    ).toBeInTheDocument()
    expect(mocks.transactionsApi.split).not.toHaveBeenCalled()
  })

  it("saves split rows by rewriting the transaction into atomic rows", async () => {
    mocks.transactionsApi.get.mockResolvedValue({
      ok: true,
      data: {
        item: {
          id: 77,
          date: "2026-02-19",
          merchant: "Cafe",
          category: "Food",
          memo: "Morning",
          name: "Coffee",
          amount_kd: "3.500",
          items: [],
        },
      },
      error: null,
      meta: {},
    })

    const props = renderSplitDialog()
    await waitFor(() => expect(mocks.transactionsApi.get).toHaveBeenCalledWith(77))

    // Dialog initializes with row 1 = top-level txn fields, row 2 = empty second row.
    // Fill in the second row and adjust the first row's amount before saving.
    const amountInputs = screen.getAllByPlaceholderText("0.000")
    const nameInputs = screen.getAllByPlaceholderText("e.g. Blue-light glasses")
    fireEvent.change(amountInputs[0], { target: { value: "2.000" } })
    fireEvent.change(nameInputs[1], { target: { value: "Snack" } })
    fireEvent.change(amountInputs[1], { target: { value: "1.500" } })

    fireEvent.click(screen.getByRole("button", { name: /Save split/i }))

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1))
    expect(mocks.transactionsApi.split).toHaveBeenCalledWith(77, [
      {
        name: "Coffee",
        category: "Food",
        amount_kd: "2.000",
      },
      {
        name: "Snack",
        category: "Food",
        amount_kd: "1.500",
      },
    ])
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.toast.success).toHaveBeenCalledWith("Transaction split into atomic rows.")
  })
})
