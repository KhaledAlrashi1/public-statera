// MOB-R76 E (MOB-R78 C) — Activity's total counts expenses only and reads "Spent" (P4). Saved income is
// listed, never counted: the All and Expense views total the rows the API says are not income; the
// Income view shows no total. The rows mix a flagged "Salary" (income) with two expenses, so a total
// that still counted income, or a label that still read "Total", fails a case.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import TransactionsTable from "./TransactionsTable"

const mocks = vi.hoisted(() => ({ transactionsApi: { search: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/api", () => ({ transactionsApi: mocks.transactionsApi }))

const row = (id: number, category: string, amount: string, counts: boolean) => ({
  id, date: "2026-09-15", name: `${category} row`, category, merchant: null, amount_kd: amount, memo: null,
  source: "manual", source_label: "Manual", category_counts_as_income: counts,
})
const ROWS = [
  row(1, "Salary", "100.000", true),
  row(2, "Groceries", "7.000", false),
  row(3, "Transport", "5.000", false),
]

function renderTable(transactionType: "all" | "expense" | "income") {
  mocks.transactionsApi.search.mockResolvedValue({ items: ROWS, total: 3, offset: 0, limit: 20, has_more: false })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionsTable categories={[]} merchants={[]} onEdit={vi.fn()} refreshSignal={0} transactionType={transactionType} />
    </QueryClientProvider>,
  )
}

describe("Activity total: Spent, expenses only (MOB-R76 E)", () => {
  it("the All view reads Spent and counts expenses only", async () => {
    renderTable("all")
    expect(await screen.findByText(/^Spent:/)).toHaveTextContent("Spent: KD 12.000") // Groceries + Transport, not Salary
  })

  it("the Expense view reads Spent and leaves income out", async () => {
    renderTable("expense")
    expect(await screen.findByText(/^Spent:/)).toHaveTextContent("Spent: KD 12.000")
  })

  it("the Income view shows no total", async () => {
    renderTable("income")
    await screen.findAllByText("+100.000")
    expect(screen.queryByText(/Spent:|Total:/)).toBeNull()
  })

  // MOB-R79 B5 — no empty box where the total was. The same selector finds the box on the Expense view, so
  // its absence on the Income view is the box gone, not a selector that never matches.
  it("the Income view draws no box where the total was", async () => {
    const totalBox = () => document.querySelector('[class*="bg-primary/10"][class*="tabular-nums"]')
    const { unmount } = renderTable("expense")
    await screen.findByText(/^Spent:/)
    expect(totalBox()).not.toBeNull()
    unmount()
    renderTable("income")
    await screen.findAllByText("+100.000")
    expect(totalBox()).toBeNull()
  })
})
