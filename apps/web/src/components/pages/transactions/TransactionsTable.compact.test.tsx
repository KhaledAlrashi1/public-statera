// MOB-R81 C6 — Activity's compact rows (phone layout): one line per entry with a colour square and the
// initial, the place (else the category) over the category, and the amount with KD on the right; income
// as "+KD x" in the success colour on a neutral square. Rows sit under day headers ("Today", "Sun 4 Oct")
// carrying the day's spent total by the "Spent" rule (income listed, never counted). The last day loaded
// may continue on the next page, so its total waits. A row tap edits; checkboxes only in Select mode.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import TransactionsTable from "./TransactionsTable"

const mocks = vi.hoisted(() => ({ transactionsApi: { search: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/api", () => ({ transactionsApi: mocks.transactionsApi }))

const row = (id: number, date: string, name: string, category: string, merchant: string | null, amount: string, counts = false) => ({
  id, date, name, category, merchant, amount_kd: amount, memo: null, source: "manual", source_label: "Manual",
  category_counts_as_income: counts,
})
const ROWS = [
  row(1, "2026-10-07", "Dinner", "Food Delivery", "Talabat", "4.500"),
  row(2, "2026-10-07", "October salary", "Salary", null, "100.000", true),
  row(3, "2026-10-04", "Top-up groceries", "Groceries", "Carrefour", "24.400"),
  row(4, "2026-10-04", "Mobile plan", "Utilities", null, "7.000"),
]

function renderTable({ hasMore = false, selecting = false, onEdit = vi.fn(), onToggleSelect = vi.fn() } = {}) {
  mocks.transactionsApi.search.mockResolvedValue({ items: ROWS, total: hasMore ? 40 : 4, offset: 0, limit: 20, has_more: hasMore })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionsTable
        categories={[]}
        merchants={[]}
        onEdit={onEdit}
        refreshSignal={0}
        transactionType="all"
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onSelectAll={vi.fn()}
        selecting={selecting}
      />
    </QueryClientProvider>,
  )
  return { onEdit, onToggleSelect }
}
// The phone layout's day sections (the desktop table renders the same rows; jsdom draws both).
const days = async () => {
  await screen.findAllByText("Talabat")
  return screen.getAllByTestId("activity-day")
}

describe("Activity compact rows (MOB-R81 C6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it("a row shows the place over the category and the amount with KD", async () => {
    renderTable()
    const [today] = await days()
    const talabat = within(today).getByRole("button", { name: /^Edit Talabat/ })
    expect(talabat).toHaveTextContent("Talabat")
    expect(talabat).toHaveTextContent("Food Delivery")
    expect(within(talabat).getByText("KD 4.500")).toBeInTheDocument()
    expect(within(talabat).getByTestId("activity-row-square")).toHaveTextContent("T")
  })

  it("an income row reads +KD x in the success colour on a neutral square", async () => {
    renderTable()
    const [today] = await days()
    const salary = within(today).getByRole("button", { name: /^Edit Salary/ })
    expect(within(salary).getByText("+KD 100.000")).toHaveClass("text-success")
    expect(within(salary).getByTestId("activity-row-square")).toHaveClass("bg-muted")
  })

  it("rows sit under Today and Sun 4 Oct, each with the day's spent total (income not counted)", async () => {
    renderTable()
    const [today, sunday] = await days()
    expect(within(today).getByRole("heading", { name: "Today" })).toBeInTheDocument()
    expect(within(today).getByTestId("activity-day-total")).toHaveTextContent("KD 4.500")
    expect(within(sunday).getByRole("heading", { name: "Sun 4 Oct" })).toBeInTheDocument()
    expect(within(sunday).getByTestId("activity-day-total")).toHaveTextContent("KD 31.400")
  })

  it("the last day loaded shows no total while more rows remain to load", async () => {
    renderTable({ hasMore: true })
    const [today, sunday] = await days()
    expect(within(today).getByTestId("activity-day-total")).toHaveTextContent("KD 4.500")
    expect(within(sunday).queryByTestId("activity-day-total")).toBeNull()
  })

  it("a row tap edits that entry; there are no checkboxes outside Select mode", async () => {
    const { onEdit } = renderTable()
    const [today] = await days()
    fireEvent.click(within(today).getByRole("button", { name: /^Edit Talabat/ }))
    expect(onEdit).toHaveBeenCalledWith(1)
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
  })

  it("in Select mode each row has a checkbox, and a tap selects instead of editing", async () => {
    const { onEdit, onToggleSelect } = renderTable({ selecting: true })
    const [today] = await days()
    fireEvent.click(within(today).getByRole("checkbox", { name: "Select transaction Dinner" }))
    expect(onToggleSelect).toHaveBeenCalledWith(1)
    expect(onEdit).not.toHaveBeenCalled()
  })
})
