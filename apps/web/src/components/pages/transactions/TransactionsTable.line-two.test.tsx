// MOB-R82 C3 — Activity's rows as ruled: with no place, the category over the entry's name (else nothing);
// day headers carry the year only outside the current year.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TransactionsTable from "./TransactionsTable"

const mocks = vi.hoisted(() => ({ transactionsApi: { search: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/api", () => ({ transactionsApi: mocks.transactionsApi }))

const row = (id: number, date: string, name: string, category: string, merchant: string | null) => ({
  id, date, name, category, merchant, amount_kd: "3.000", memo: null, source: "manual", source_label: "Manual",
  category_counts_as_income: false,
})

function renderRows(items: ReturnType<typeof row>[]) {
  mocks.transactionsApi.search.mockResolvedValue({ items, total: items.length, offset: 0, limit: 20, has_more: false })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TransactionsTable categories={[]} merchants={[]} onEdit={vi.fn()} refreshSignal={0} transactionType="all" />
    </QueryClientProvider>,
  )
}

describe("Activity rows as ruled (MOB-R82 C3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it("with no place, the category is line one and the entry's name line two", async () => {
    renderRows([row(1, "2026-10-07", "Mobile plan", "Utilities", null)])
    const button = await screen.findByRole("button", { name: /^Edit Utilities/ })
    const lines = [...button.querySelectorAll("span.block")].map((s) => s.textContent)
    expect(lines).toEqual(["Utilities", "Mobile plan"])
  })

  it("with no place and no name, line two is empty", async () => {
    renderRows([row(2, "2026-10-07", "", "Groceries", null)])
    const button = await screen.findByRole("button", { name: /^Edit Groceries/ })
    expect([...button.querySelectorAll("span.block")].map((s) => s.textContent)).toEqual(["Groceries"])
  })

  it("a day outside the current year carries its year; one inside it does not", async () => {
    renderRows([row(3, "2026-10-04", "a", "Dining", "Pick"), row(4, "2025-10-04", "b", "Dining", "Pick")])
    await screen.findAllByRole("button", { name: /^Edit Pick/ })
    const days = screen.getAllByTestId("activity-day")
    expect(within(days[0]).getByRole("heading")).toHaveTextContent(/^Sun 4 Oct$/)
    expect(within(days[1]).getByRole("heading")).toHaveTextContent(/^Sat 4 Oct 2025$/)
  })
})
