// MOB-R55 P3 / MOB-R59 KS9, KS10, KS12, KS13 / MOB-R56 KS1 — Home with savings split out of
// expenses. The harness mirrors DashboardPage.test.tsx: the hooks and the sections are mocked, and
// the hero, the category chart and the detail modal record the props Home gives them.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"

const mocks = vi.hoisted(() => ({
  useDashboardPageQueries: vi.fn(),
  dashboardHero: vi.fn(),
  categoryChart: vi.fn(),
  detailModal: vi.fn(),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))
vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))
vi.mock("./dashboard/sections", () => ({
  DashboardHero: (props: unknown) => {
    mocks.dashboardHero(props)
    return null
  },
  SetupGuideDialog: () => null,
  SetupProgressPanel: () => null,
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => null,
  IncomeNudge: () => null,
  PlanSetupPrompts: () => null,
  HomeAttentionCenter: () => null,
  IncomeExpensesChart: () => null,
  CategoryBreakdownChart: (props: unknown) => {
    mocks.categoryChart(props)
    return null
  },
  TopExpensesPanel: () => null,
}))
vi.mock("@/components/ui/category-detail-modal", () => ({
  CategoryDetailModal: (props: unknown) => {
    mocks.detailModal(props)
    return null
  },
}))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))

type Hero = {
  monthExpenses: number
  monthSavings: number
  monthRemaining: number
  overBy: number | null
  deltas: { expensesDelta: number | null; remainingDelta: number | null } | null
}
const lastHero = () => mocks.dashboardHero.mock.calls.at(-1)?.[0] as Hero

// The ruled month (March): income 100, expenses 40, savings 30. February: expenses 20, savings 10.
function queries(overrides: Record<string, unknown> = {}) {
  return {
    dashboardMetrics: {
      months: ["2026-03", "2026-02"],
      monthly: [
        { month: "2026-02", income_kd: "0.000", expense_kd: "20.000", savings_kd: "10.000" },
        { month: "2026-03", income_kd: "0.000", expense_kd: "40.000", savings_kd: "30.000" },
      ],
      expense_by_category: {
        "2026-03": { Groceries: "40.000", "Savings & investing": "30.000" },
        "2026-02": { Groceries: "20.000", "Savings & investing": "10.000" },
      },
    },
    categoryList: [
      { id: 1, name: "Groceries", kind: "expense" },
      { id: 2, name: "Savings & investing", kind: "savings" },
    ],
    accountOverview: { total_income_mtd: "0.000", total_spend_mtd: "40.000", total_savings_mtd: "30.000" },
    profile: { monthly_income_kd: "100.000", setup_guide_dismissed: true },
    analyticsLoading: false,
    analyticsFetching: false,
    analyticsError: null,
    refetchAnalytics: vi.fn(),
    analyticsUpdatedAt: null,
    analyticsCacheWarning: null,
    demoWorkspace: null,
    profileLoading: false,
    profileError: null,
    refetchProfile: vi.fn(),
    safeToSpend: undefined,
    safeToSpendLoading: false,
    categoryRowsPage: undefined,
    categoryRowsPageLoading: false,
    categoryRowsError: null,
    refetchCategoryRows: vi.fn(),
    budgetResp: undefined,
    budgetLoading: false,
    setupBudgetResp: { items: [] },
    setupBudgetLoading: false,
    setupBudgetError: null,
    refetchSetupBudget: vi.fn(),
    budgetAlerts: [],
    budgetAlertsLoading: false,
    accountOverviewLoading: false,
    monthBundleFetching: false,
    monthBundleError: null,
    refetchMonthBundle: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe("Home — savings & investing (MOB-R55 K1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("income 100, expenses 40, savings 30: Savings & investing 30 and Remaining 30", () => {
    mocks.useDashboardPageQueries.mockReturnValue(queries())
    renderPage()
    const hero = lastHero()
    expect(hero.monthExpenses).toBe(40)
    expect(hero.monthSavings).toBe(30)
    expect(hero.monthRemaining).toBe(30)
    expect(hero.overBy).toBeNull()
  })

  it("Over by is expenses + savings - income when above 0, and Remaining is then 0", () => {
    mocks.useDashboardPageQueries.mockReturnValue(queries({ profile: { monthly_income_kd: "60.000", setup_guide_dismissed: true } }))
    renderPage()
    expect(lastHero().overBy).toBe(10)
    expect(lastHero().monthRemaining).toBe(0)
  })

  // MOB-R69 C1 — rewritten: the Remaining chip is gone (MOB-R68 D4). The footers are the month's
  // shares of income in exact fils, and savings is its own segment of the Remaining bar.
  it("the footers count savings as its own share of income", () => {
    mocks.useDashboardPageQueries.mockReturnValue(queries())
    renderPage()
    // March: income 100, expenses 40, savings 30, Remaining 30.
    expect((lastHero() as unknown as { footers: unknown }).footers).toEqual({
      expensesPct: 40,
      savingsPct: 30,
      bar: { expensesPct: 40, savingsPct: 30, trackPct: 30, leftPct: 30 },
    })
  })

  it("the expenses chart has no savings slice, and a savings category shows no share", () => {
    mocks.useDashboardPageQueries.mockReturnValue(queries())
    renderPage()
    const chart = mocks.categoryChart.mock.calls.at(-1)?.[0] as {
      categoryData: Array<{ name: string; value: number }>
      onSliceClick: (name: string) => void
    }
    expect(chart.categoryData).toEqual([{ name: "Groceries", value: 40 }])

    act(() => chart.onSliceClick("Savings & investing"))
    const modal = mocks.detailModal.mock.calls.at(-1)?.[0] as { categoryShare: number | null }
    expect(modal.categoryShare).toBeNull()
  })
})
