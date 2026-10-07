// MOB-R87 D — editing a saved row on the Log screen (/log?edit=<id>): prefill, the What-for rule, the exact PATCH body
// (never memo), delete with Undo and no confirm, Split, and an income row's picker.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Transaction } from "@/types/api"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  split: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { get: mocks.get, update: mocks.update, delete: mocks.del, logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn() },
    categoriesApi: {
      list: vi.fn().mockResolvedValue([
        { id: 1, name: "Groceries", kind: "expense", transaction_count: 5 },
        { id: 2, name: "Dining", kind: "expense", transaction_count: 3 },
        { id: 3, name: "Income: Salary", kind: "income", transaction_count: 6 },
        { id: 4, name: "Income: Bonus", kind: "income", transaction_count: 1 },
      ]),
      create: vi.fn(),
    },
  }
})
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("./transactions/dialogs", () => ({
  SplitTransactionDialog: (p: { open: boolean; txnId: number | null }) => {
    mocks.split(p)
    return p.open ? <div role="dialog" aria-label="Split transaction">{`split ${p.txnId}`}</div> : null
  },
}))

import LogPage from "./LogPage"

function row(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 7, date: "2025-03-03", name: "Weekly groceries", merchant: "Lulu", category: "Groceries", amount_kd: "46.700",
    memo: "keep me", category_counts_as_income: false, ...over,
  } as Transaction
}

function renderEdit(r: Transaction) {
  mocks.get.mockResolvedValue({ ok: true, data: { item: r } })
  render(
    <MemoryRouter initialEntries={[`/log?edit=${r.id}`]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
          <Route path="/activity" element={<p>Activity page</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const line = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockResolvedValue({ ok: true, data: { item: row() } })
  mocks.del.mockResolvedValue({ ok: true, data: { deleted: true } })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("/log edit mode (MOB-R87 D)", () => {
  it("prefills the row, titles it Edit expense, and hides the tiles", async () => {
    renderEdit(row())
    expect(await screen.findByRole("heading", { level: 1, name: "Edit expense" })).toBeInTheDocument()
    await waitFor(() => expect(line("Amount")).toHaveTextContent("KD 46.700"))
    expect(line("Category")).toHaveTextContent("Groceries")
    expect(line("Place")).toHaveTextContent("Lulu")
    expect(line("What for")).toHaveTextContent("Weekly groceries")
    expect(line("Date")).toHaveTextContent("3 Mar 2025")
    expect(screen.queryByText(/Repeat in two taps|Popular in Kuwait/)).toBeNull()
  })

  it("What for is empty when the name is the place, and saving keeps that name", async () => {
    renderEdit(row({ name: "Lulu" }))
    await waitFor(() => expect(line("Place")).toHaveTextContent("Lulu"))
    expect(line("What for")).toHaveTextContent("Item or note")
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalled())
    expect(mocks.update.mock.calls[0][1].name).toBe("Lulu")
  })

  it("an expense row saves exactly amount_kd, category, name, merchant and date — never memo", async () => {
    renderEdit(row())
    await waitFor(() => expect(line("Category")).toHaveTextContent("Groceries"))
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    const [id, body] = mocks.update.mock.calls[0]
    expect(id).toBe(7)
    expect(Object.keys(body).sort()).toEqual(["amount_kd", "category", "date", "merchant", "name"])
    expect(body).toEqual({ amount_kd: "46.700", category: "Groceries", name: "Weekly groceries", merchant: "Lulu", date: "2025-03-03" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Changes saved")
    expect(await screen.findByText("Activity page")).toBeInTheDocument()
  })

  it("an income row is titled Edit income and saves the same five keys, never memo", async () => {
    renderEdit(row({ id: 9, name: "Monthly salary", merchant: "Acme Co.", category: "Income: Salary", amount_kd: "1800.000", category_counts_as_income: true }))
    expect(await screen.findByRole("heading", { level: 1, name: "Edit income" })).toBeInTheDocument()
    await waitFor(() => expect(line("Category")).toHaveTextContent("Income: Salary"))
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    const [id, body] = mocks.update.mock.calls[0]
    expect(id).toBe(9)
    expect(Object.keys(body).sort()).toEqual(["amount_kd", "category", "date", "merchant", "name"])
    expect(body.category).toBe("Income: Salary")
  })

  it("Delete asks nothing, shows Undo, and Undo keeps the row", async () => {
    renderEdit(row())
    await waitFor(() => expect(line("Category")).toHaveTextContent("Groceries"))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith("Transaction deleted.", expect.objectContaining({ label: "Undo" }))
    const undo = mocks.toast.success.mock.calls.find((c) => c[0] === "Transaction deleted.")![1] as { onClick: () => void }
    undo.onClick()
    await act(async () => {
      vi.advanceTimersByTime(7000)
    })
    expect(mocks.del).not.toHaveBeenCalled()
  })

  it("Delete without Undo removes the row after 6 seconds, not before", async () => {
    renderEdit(row())
    await waitFor(() => expect(line("Category")).toHaveTextContent("Groceries"))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await act(async () => {
      vi.advanceTimersByTime(5999)
    })
    expect(mocks.del).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(mocks.del).toHaveBeenCalledWith(7)
  })

  it("Split opens today's split dialog on this row", async () => {
    renderEdit(row())
    await waitFor(() => expect(line("Category")).toHaveTextContent("Groceries"))
    expect(screen.queryByRole("dialog", { name: "Split transaction" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Split" }))
    expect(screen.getByRole("dialog", { name: "Split transaction" })).toHaveTextContent("split 7")
  })

  it("an income row's category picker lists her income categories only, and offers no Add", async () => {
    renderEdit(row({ id: 9, name: "Monthly salary", merchant: "Acme Co.", category: "Income: Salary", amount_kd: "1800.000", category_counts_as_income: true }))
    await waitFor(() => expect(line("Category")).toHaveTextContent("Income: Salary"))
    fireEvent.click(line("Category"))
    const group = screen.getByRole("group", { name: "Category" })
    await waitFor(() => expect(within(group).getByRole("button", { name: "Income: Bonus" })).toBeInTheDocument())
    expect(within(group).getByRole("button", { name: "Income: Salary" })).toBeInTheDocument()
    expect(within(group).queryByRole("button", { name: "Groceries" })).toBeNull()
    fireEvent.change(within(group).getByLabelText("Find a category"), { target: { value: "Gro" } })
    expect(within(group).queryByRole("button", { name: "Groceries" })).toBeNull()
    expect(within(group).queryByRole("button", { name: /^Add/ })).toBeNull()
  })
})
