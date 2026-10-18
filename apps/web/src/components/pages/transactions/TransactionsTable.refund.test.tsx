// MOB-R118 C1 — a refund row's category text reads "<category> · Refund" in both layouts: the 390 list's line and the
// 1280 table's category column. Spend and income rows unchanged.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TransactionsTable from "./TransactionsTable"

const mocks = vi.hoisted(() => ({ transactionsApi: { search: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/api", () => ({ transactionsApi: mocks.transactionsApi }))

const row = (id: number, name: string, category: string, merchant: string | null, amount_kd: string, income = false) => ({
  id, date: "2026-10-07", name, category, merchant, amount_kd, memo: null, source: "manual", source_label: "Manual",
  category_counts_as_income: income,
})

const items = [
  row(1, "Caribou refund", "Coffee", "Caribou Coffee", "-2.250"),
  row(2, "Gift card back", "Shopping", null, "-5.000"),
  row(3, "Latte", "Coffee", "Starbucks", "1.250"),
  row(4, "Salary", "Income", null, "500.000", true),
]

function renderRows() {
  mocks.transactionsApi.search.mockResolvedValue({ items, total: items.length, offset: 0, limit: 20, has_more: false })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TransactionsTable categories={[]} merchants={[]} onEdit={vi.fn()} refreshSignal={0} transactionType="all" />
    </QueryClientProvider>,
  )
}

describe("Activity refund rows (MOB-R118 C1)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it("the 390 list: the category line of a refund reads \"<category> · Refund\"; spend and income lines unchanged", async () => {
    renderRows()
    const lines = async (name: RegExp) =>
      [...(await screen.findByRole("button", { name })).querySelectorAll("span.block")].map((s) => s.textContent)
    expect(await lines(/^Edit Caribou Coffee/)).toEqual(["Caribou Coffee", "Coffee · Refund"])
    expect(await lines(/^Edit Shopping/)).toEqual(["Shopping · Refund", "Gift card back"])
    expect(await lines(/^Edit Starbucks/)).toEqual(["Starbucks", "Coffee"])
    expect(await lines(/^Edit Income/)).toEqual(["Income", "Salary"])
  })

  it("the 1280 table: a refund's category column reads \"<category> · Refund\"; spend and income unchanged", async () => {
    renderRows()
    await screen.findByRole("button", { name: /^Edit Caribou Coffee/ })
    const categoryCells = [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[3]?.textContent)
    expect(categoryCells).toEqual(["Coffee · Refund", "Shopping · Refund", "Coffee", "Income"])
  })
})
