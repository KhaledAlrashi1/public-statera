// MOB-R77 C6 — the Activity table reads whether a row counts as income from the API
// (category_counts_as_income, computed by the API's one rule) and keeps no copy of the rule. The rows
// below are chosen so the field and the old name regex DISAGREE: a flagged "Salary" and "Incomes" count
// as income, and "Income: Gift" carries false — so a table that still read the name would fail each case.
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
  row(2, "Incomes", "5.000", true),
  row(3, "Income: Gift", "7.000", false),
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

describe("Activity table: income comes from the API (MOB-R77 C6)", () => {

  it("the Expense view total leaves those rows out", async () => {
    renderTable("expense")
    expect(await screen.findByText(/Spent:/)).toHaveTextContent("7.000") // Income: Gift only
  })

  it("each row's amount is styled by the field, in both layouts", async () => {
    renderTable("all")
    await screen.findAllByText("+KD 100.000")
    expect(screen.getAllByText("+KD 100.000")).toHaveLength(2)
    expect(screen.getAllByText("+KD 5.000")).toHaveLength(2)
    expect(screen.getAllByText("KD 7.000").filter((el) => el.dataset.testid !== "activity-day-total")).toHaveLength(2) // the row amounts; the phone day header also totals that day
  })

  it("the category badge is coloured by the field, in both layouts", async () => {
    renderTable("all")
    await screen.findAllByText("+KD 100.000")
    const badges = (name: string) =>
      screen.getAllByText(name).filter((el) => el.tagName === "SPAN" && el.className.includes("rounded-full"))
    expect(badges("Salary").map((b) => b.className.includes("text-success"))).toEqual([true]) // the badge is desktop only (MOB-R83 C2)
    { const r = screen.getByRole("button", { name: "Edit Salary, +KD 100.000" }); expect(r).toHaveTextContent("Salary"); expect(r.querySelector(".text-success")).toHaveTextContent("+KD 100.000") } // the phone row: category text, income style
    expect(badges("Incomes").map((b) => b.className.includes("text-success"))).toEqual([true]) // the badge is desktop only (MOB-R83 C2)
    { const r = screen.getByRole("button", { name: "Edit Incomes, +KD 5.000" }); expect(r).toHaveTextContent("Incomes"); expect(r.querySelector(".text-success")).toHaveTextContent("+KD 5.000") } // the phone row: category text, income style
    expect(badges("Income: Gift").map((b) => b.className.includes("text-success"))).toEqual([false]) // the badge is desktop only (MOB-R83 C2)
    { const r = screen.getByRole("button", { name: "Edit Income: Gift, KD 7.000" }); expect(r).toHaveTextContent("Income: Gift"); expect(r.querySelector(".text-success")).toBeNull() } // the phone row: category text, income style
  })
})
