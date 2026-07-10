import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ExpensesPage from "./ExpensesPage"

const mocks = vi.hoisted(() => ({
  analyticsApi: {
    dashboardMetrics: vi.fn(),
    expenseBreakdown: vi.fn(),
    expenseMerchantTrend: vi.fn(),
  },
  categoriesApi: {
    list: vi.fn(),
  },
  transactionsApi: {
    search: vi.fn(),
    byCategory: vi.fn(),
    create: vi.fn(),
    suggestions: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
  categoriesApi: mocks.categoriesApi,
  transactionsApi: mocks.transactionsApi,
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    flags: { enable_template_suggestions: false },
  }),
}))

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    autoFillSuggestions: false,
  }),
}))

vi.mock("./expenses/dialogs", () => ({
  SplitTransactionDialog: () => null,
}))

vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({ openQuickAdd: vi.fn(), closeQuickAdd: vi.fn() }),
}))

vi.mock("@/components/ui/category-detail-modal", () => ({
  CategoryDetailModal: () => null,
}))

vi.mock("recharts", () => {
  const Container = ({ children }: { children?: unknown }) => children ?? null
  const Leaf = () => null
  return {
    PieChart: Container,
    Pie: Container,
    Cell: Leaf,
    Tooltip: Container,
    ResponsiveContainer: Container,
    LineChart: Container,
    Line: Leaf,
    ComposedChart: Container,
    Bar: Leaf,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
  }
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <MemoryRouter initialEntries={["/expenses"]}>
      <QueryClientProvider client={queryClient}>
        <ExpensesPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("ExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      ok: true,
      months: ["2026-02"],
      monthly: [{ month: "2026-02", income_kd: 500, expense_kd: 120 }],
      expense_by_category: {
        "2026-02": { Food: 100, Subscription: 20 },
      },
    })

    mocks.analyticsApi.expenseBreakdown.mockResolvedValue({
      ok: true,
      dimension: "category",
      range: "month",
      month: "2026-02",
      total_kd: 0,
      items: [],
    })

    mocks.analyticsApi.expenseMerchantTrend.mockResolvedValue({
      ok: true,
      merchant: "",
      months: [],
      series: [],
    })

    mocks.categoriesApi.list.mockResolvedValue([
      { id: 1, name: "Food" },
      { id: 2, name: "Subscription" },
    ])

    mocks.transactionsApi.search.mockImplementation(async () => ({
      items: [
        {
          id: 900,
          date: "2026-02-10",
          merchant: "Cafe",
          category: "Food",
          name: "Coffee",
          amount_kd: "2.000",
          memo: null,
        },
      ],
      total: -1,
      offset: 0,
      limit: 50,
      has_more: false,
    }))

    mocks.transactionsApi.byCategory.mockImplementation(
      async (params: { category: string; offset?: number }) => {
        if (params.category === "Subscription") {
          if ((params.offset || 0) === 0) {
            return {
              ok: true,
              category: "Subscription",
              items: [
                {
                  id: 501,
                  transaction_id: 501,
                  date: "2026-02-03",
                  merchant: "Netflix",
                  category: "Subscription",
                  name: "Netflix",
                  amount_kd: "4.500",
                  memo: null,
                },
              ],
              has_more: true,
              total: 2,
            }
          }
          return {
            ok: true,
            category: "Subscription",
            items: [
              {
                id: 502,
                transaction_id: 502,
                date: "2026-02-11",
                merchant: "Spotify",
                category: "Subscription",
                name: "Spotify",
                amount_kd: "1.500",
                memo: null,
              },
            ],
            has_more: false,
            total: 2,
          }
        }

        return {
          ok: true,
          category: params.category,
          items: [],
          has_more: false,
          total: 0,
        }
      }
    )
  })

  it("queries recent expenses without legacy item expansion", async () => {
    renderPage()

    fireEvent.click(await screen.findByRole("tab", { name: "Recent" }))

    let recentCall:
      | [{ include_total?: boolean; limit?: number }]
      | undefined

    await waitFor(() => {
      recentCall = mocks.transactionsApi.search.mock.calls.find(
        ([params]: [{ limit?: number; include_total?: boolean }]) =>
          params.limit === 50 && params.include_total === false
      )
      expect(recentCall).toBeDefined()
    })

    expect(recentCall?.[0]).not.toHaveProperty("expand_items")
    expect((await screen.findAllByText("Coffee")).length).toBeGreaterThan(0)
    expect(
      screen.queryByRole("button", { name: /Switch to by-transaction view/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Coffee \+\d+ items/i)).not.toBeInTheDocument()
  })

  it("shows a page-level empty state when no expenses are recorded yet", async () => {
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      ok: true,
      months: ["2026-02"],
      monthly: [{ month: "2026-02", income_kd: 0, expense_kd: 0 }],
      expense_by_category: {
        "2026-02": {},
      },
    })
    mocks.transactionsApi.search.mockResolvedValue({
      items: [],
      total: -1,
      offset: 0,
      limit: 50,
      has_more: false,
    })

    renderPage()

    expect(await screen.findByText("Add your first expense")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Expense" })).toBeInTheDocument()
  })

  it("does not query the removed subscriptions panel", async () => {
    renderPage()

    await waitFor(() => {
      expect(mocks.analyticsApi.dashboardMetrics).toHaveBeenCalled()
    })

    expect(
      mocks.transactionsApi.byCategory.mock.calls.some(
        ([params]: [{ category?: string }]) =>
          params.category === "Subscription"
      )
    ).toBe(false)
    expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument()
  })
})
