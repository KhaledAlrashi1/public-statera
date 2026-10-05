// MOB-R56 KS7 / MOB-R59 KS11 / MOB-R55 P5 — Plan: Remaining and % Used are over expense budgets
// and expense spending; a savings-kind category's budget is a target shown as "{spent} of {budget}".
// The harness mirrors BudgetPage.test.tsx; BudgetHero records its props.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

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
  budgetHero: vi.fn(),
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
  BudgetHero: (props: unknown) => {
    mocks.budgetHero(props)
    return <div>budget hero</div>
  },
  IncomePlanningCard: () => <div>income planning</div>,
  BudgetChart: () => <div>budget chart</div>,
  BudgetTable: () => <div>budget table</div>,
  BudgetDialog: ({ open }: { open: boolean }) => (open ? <div>budget dialog</div> : null),
}))

describe("Plan — savings budgets (MOB-R56 KS7)", () => {
  it("Remaining and % Used leave the savings budget and its spending out", async () => {
    vi.clearAllMocks()
    mocks.budgetHooks.useBudgetPageQueries.mockReturnValue({
      categories: [
        { id: 1, name: "Groceries", kind: "expense" },
        { id: 2, name: "Savings & investing", kind: "savings" },
      ],
      budgetMetrics: {
        spent_by_category: { Groceries: 40, "Savings & investing": 30 },
        range_spent_by_category: {},
        avg12_by_category: {},
      },
      budgets: [
        { category: "Groceries", amount_kd: "100.000" },
        { category: "Savings & investing", amount_kd: "50.000" },
      ],
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
    mocks.analyticsApi.budgetMetrics.mockResolvedValue({ spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} })
    mocks.budgetHooks.getBudgets.mockResolvedValue({ items: [] })
    mocks.budgetHooks.findMostRecentBudgetsBefore.mockResolvedValue({ month: null, items: [] })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <QueryClientProvider client={queryClient}>
          <BudgetPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText("budget hero")
    const hero = mocks.budgetHero.mock.calls.at(-1)?.[0] as { totalSpent: number; remaining: number; percentUsed: number }
    expect(hero.totalSpent).toBe(40)
    expect(hero.remaining).toBe(60)
    expect(hero.percentUsed).toBe(40)
  })

  it("a savings row shows {spent} of {budget}, with no % used and no remaining", async () => {
    // The real table (this file mocks ./budget/sections for the page above).
    const { BudgetTable } = await vi.importActual<typeof import("./budget/sections")>("./budget/sections")
    render(
      <BudgetTable
        rows={[{ idx: 0, cat: "Savings & investing", allocated: 50, spent: 30, avg: 0, remaining: 20, pct: 60, isSavings: true }]}
        hasBudgets
        searchQuery=""
        setSearchQuery={vi.fn()}
        range="month"
        setRange={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        isEditable={false}
      />,
    )
    expect(screen.getAllByText("KD 30.000 of KD 50.000").length).toBeGreaterThan(0)
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument()
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  })
})
