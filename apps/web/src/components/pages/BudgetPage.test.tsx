import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BudgetPage from "./BudgetPage"

const mocks = vi.hoisted(() => ({
  analyticsApi: {
    budgetMetrics: vi.fn(),
  },
  budgetHooks: {
    useBudgetPageQueries: vi.fn(),
    useBudgetActiveMonths: vi.fn(),
    getBudgets: vi.fn(),
    saveBudgets: vi.fn(),
    findMostRecentBudgetsBefore: vi.fn(),
    findDuplicateCategory: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
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
  BudgetDialog: ({ open }: { open: boolean }) => (open ? <div>budget dialog</div> : null),
}))

vi.mock("./budget/GoalsTab", () => ({
  GoalsTab: () => <div>goals tab</div>,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={["/plan"]}>
      <QueryClientProvider client={queryClient}>
        <BudgetPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("BudgetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // BudgetPage persists the active tab to localStorage; clear it so tab state
    // does not leak between tests (the goals-tab test would otherwise pin "goals").
    window.localStorage.clear()

    mocks.analyticsApi.budgetMetrics.mockResolvedValue({
      spent_by_category: {},
      range_spent_by_category: {},
      avg12_by_category: {},
    })
    mocks.budgetHooks.useBudgetPageQueries.mockReturnValue({
      categories: [],
      budgetMetrics: {
        spent_by_category: {},
        range_spent_by_category: {},
        avg12_by_category: {},
      },
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
      monthOptions: ["2026-03"],
      activeMonthsError: null,
      refetchActiveMonths: vi.fn(),
      activeMonthsFetching: false,
    })
    mocks.budgetHooks.getBudgets.mockResolvedValue({ items: [] })
    mocks.budgetHooks.saveBudgets.mockResolvedValue({ items: [] })
    mocks.budgetHooks.findMostRecentBudgetsBefore.mockResolvedValue({ month: null, items: [] })
    mocks.budgetHooks.findDuplicateCategory.mockReturnValue(null)
  })

  it("shows a page-level empty state when no budgets exist yet", async () => {
    renderPage()

    expect(await screen.findByText("Set your first budget plan")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add your first budget" })).toBeInTheDocument()
    expect(screen.queryByText("budget chart")).not.toBeInTheDocument()
    expect(screen.queryByText("budget table")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Add your first budget" }))

    expect(screen.getByText("budget dialog")).toBeInTheDocument()
  })

  it("renders the Goals & Debt tab without crashing on an empty account", async () => {
    // Both-tabs empty-account coverage (companion to the budget-tab empty-state
    // test above). profileContext is null + budgets [] per the beforeEach fixture.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={["/plan?tab=goals"]}>
        <QueryClientProvider client={queryClient}>
          <BudgetPage />
        </QueryClientProvider>
      </MemoryRouter>
    )

    expect(await screen.findByText("goals tab")).toBeInTheDocument()
    expect(screen.queryByText("Set your first budget plan")).not.toBeInTheDocument()
  })

  it("surfaces active-month query failures in the planning warning banner", async () => {
    mocks.budgetHooks.useBudgetActiveMonths.mockReturnValue({
      monthOptions: ["2026-03"],
      activeMonthsError: new Error("Month options offline"),
      refetchActiveMonths: vi.fn(),
      activeMonthsFetching: false,
    })

    renderPage()

    expect(await screen.findByText("Planning data unavailable")).toBeInTheDocument()
    expect(screen.getByText(/Month options offline/)).toBeInTheDocument()
  })
})
