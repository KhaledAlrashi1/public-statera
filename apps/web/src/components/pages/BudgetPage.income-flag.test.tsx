// MOB-R77 C6 — Plan's budget category list leaves out the categories the API says count as income
// (GET /api/categories counts_as_income), with no copy of the rule. The categories are chosen so the
// field and the old name regex DISAGREE. The harness mirrors BudgetPage.savings.test.tsx.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import BudgetPage from "./BudgetPage"

const mocks = vi.hoisted(() => ({
  analyticsApi: { budgetMetrics: vi.fn() },
  budgetHooks: {
    useBudgetPageQueries: vi.fn(),
    useBudgetActiveMonths: vi.fn(),
    getBudgets: vi.fn(),
    saveBudgets: vi.fn(),
    findMostRecentBudgetsBefore: vi.fn(),
    findDuplicateCategory: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({ analyticsApi: mocks.analyticsApi }))
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))
vi.mock("./budget/hooks", () => ({
  useBudgetPageQueries: (...args: unknown[]) => mocks.budgetHooks.useBudgetPageQueries(...args),
  useBudgetActiveMonths: () => mocks.budgetHooks.useBudgetActiveMonths(),
  getBudgets: (...args: unknown[]) => mocks.budgetHooks.getBudgets(...args),
  saveBudgets: (...args: unknown[]) => mocks.budgetHooks.saveBudgets(...args),
  findMostRecentBudgetsBefore: (...args: unknown[]) => mocks.budgetHooks.findMostRecentBudgetsBefore(...args),
  findDuplicateCategory: (...args: unknown[]) => mocks.budgetHooks.findDuplicateCategory(...args),
}))
vi.mock("./budget/sections", () => ({
  BudgetHero: () => <div>budget hero</div>,
  IncomePlanningCard: () => <div>income planning</div>,
  BudgetChart: () => <div>budget chart</div>,
  BudgetTable: () => <div>budget table</div>,
  BudgetDialog: () => null,
}))

describe("Plan — budget categories (MOB-R77 C6)", () => {
  it("leaves out the categories the API says count as income, and only those", async () => {
    vi.clearAllMocks()
    mocks.budgetHooks.useBudgetPageQueries.mockReturnValue({
      categories: [
        { id: 1, name: "Groceries", kind: "expense", counts_as_income: false },
        { id: 2, name: "Salary", kind: "income", counts_as_income: true },
        { id: 3, name: "Incomes", kind: "income", counts_as_income: true },
        { id: 4, name: "Income: Gift", kind: "expense", counts_as_income: false },
      ],
      budgetMetrics: { spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} },
      budgets: [],
      profileContext: null,
      loadingBudgets: false,
      loadingMetrics: false,
      budgetsFetching: false,
      metricsFetching: false,
      budgetsError: null,
      metricsError: null,
      categoriesError: null,
      refetchBudgets: vi.fn(),
      refetchMetrics: vi.fn(),
      refetchCategories: vi.fn(),
    })
    mocks.budgetHooks.useBudgetActiveMonths.mockReturnValue({
      monthOptions: ["2026-03"], activeMonthsError: null, refetchActiveMonths: vi.fn(), activeMonthsFetching: false,
    })
    mocks.analyticsApi.budgetMetrics.mockResolvedValue({ spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} })
    mocks.budgetHooks.getBudgets.mockResolvedValue({ items: [] })
    mocks.budgetHooks.findMostRecentBudgetsBefore.mockResolvedValue({ month: null, items: [] })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <MemoryRouter initialEntries={["/plan"]}>
        <QueryClientProvider client={queryClient}>
          <BudgetPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText("budget hero")
    const options = [...container.querySelectorAll("#budget-cats option")].map((o) => o.getAttribute("value"))
    expect(options).toEqual(["Groceries", "Income: Gift"])
  })
})
