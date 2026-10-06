// MOB-R56 KS1 — on the Expenses page a savings-kind category (the server's kind) has no share of
// the month's expenses. Harness mirrors ExpensesPage.test.tsx; the chart's bars render as buttons
// so one can be clicked, and the detail modal records the props it is given.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import ExpensesPage from "./ExpensesPage"

const mocks = vi.hoisted(() => ({
  analyticsApi: { dashboardMetrics: vi.fn(), expenseBreakdown: vi.fn(), expenseMerchantTrend: vi.fn() },
  categoriesApi: { list: vi.fn() },
  transactionsApi: { search: vi.fn(), byCategory: vi.fn(), create: vi.fn(), suggestions: vi.fn() },
  detailModal: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
  categoriesApi: mocks.categoriesApi,
  transactionsApi: mocks.transactionsApi,
}))
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ flags: { enable_template_suggestions: false } }) }))
vi.mock("@/contexts/PreferencesContext", () => ({ usePreferences: () => ({ autoFillSuggestions: false }) }))
vi.mock("./expenses/dialogs", () => ({ SplitTransactionDialog: () => null }))
vi.mock("@/components/ui/category-detail-modal", () => ({
  CategoryDetailModal: (props: unknown) => {
    mocks.detailModal(props)
    return null
  },
}))
// ExpensesPage imports its chart primitives from the per-primitive wrapper @/lib/recharts.
vi.mock("@/lib/recharts", () => {
  const Container = ({ children }: { children?: unknown }) => children ?? null
  const Leaf = () => null
  // The category chart is a BarChart whose Bar carries the click handler: BarChart hands its data
  // to the Bar rendered inside it, which renders one button per bar.
  let barData: Array<{ name: string }> = []
  const BarChart = ({ data, children }: { data?: Array<{ name: string }>; children?: unknown }) => {
    barData = data ?? []
    return children ?? null
  }
  const Bar = ({ onClick }: { onClick?: (d: { name: string }) => void }) => (
    <>
      {barData.map((d) => (
        <button key={d.name} type="button" onClick={() => onClick?.(d)}>{`slice ${d.name}`}</button>
      ))}
    </>
  )
  return {
    PieChart: Container,
    Pie: Container,
    BarChart,
    Cell: Leaf,
    Tooltip: Container,
    ResponsiveContainer: Container,
    LineChart: Container,
    Line: Leaf,
    ComposedChart: Container,
    Bar,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    ReferenceLine: Leaf,
    Legend: Leaf,
  }
})

describe("Expenses — no share for a savings category (MOB-R56 KS1)", () => {
  it("gives a savings-kind category a null share, and an expense category its share", async () => {
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      ok: true,
      months: ["2026-02"],
      monthly: [{ month: "2026-02", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000" }],
      expense_by_category: { "2026-02": { Groceries: "40.000", "Savings & investing": "30.000" } },
    })
    mocks.analyticsApi.expenseBreakdown.mockResolvedValue({ ok: true, dimension: "category", range: "month", month: "2026-02", total_kd: 0, items: [] })
    mocks.analyticsApi.expenseMerchantTrend.mockResolvedValue({ ok: true, merchant: "", months: [], series: [] })
    mocks.categoriesApi.list.mockResolvedValue([
      { id: 1, name: "Groceries", kind: "expense" },
      { id: 2, name: "Savings & investing", kind: "savings" },
    ])
    mocks.transactionsApi.search.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 50, has_more: false })
    mocks.transactionsApi.byCategory.mockResolvedValue({ ok: true, items: [], has_more: false, total: 0 })

    render(
      <MemoryRouter initialEntries={["/expenses"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ExpensesPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    // Wait for the categories (with their kind) as well as the chart.
    await waitFor(() => expect(mocks.categoriesApi.list).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole("button", { name: "slice Savings & investing" }))
    await waitFor(() => {
      const last = mocks.detailModal.mock.calls.at(-1)?.[0] as { activeCategory: string | null; categoryShare: number | null }
      expect(last.activeCategory).toBe("Savings & investing")
      expect(last.categoryShare).toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: "slice Groceries" }))
    await waitFor(() => {
      const last = mocks.detailModal.mock.calls.at(-1)?.[0] as { activeCategory: string | null; categoryShare: number | null }
      expect(last.activeCategory).toBe("Groceries")
      expect(last.categoryShare).toBe(100)
    })
  })
})
