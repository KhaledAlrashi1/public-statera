/**
 * MOB-R52 F6 — Home computes no percent change against last month's 0.
 *
 * Fixture: February has income rows and NO expenses at all (so the previous-month KPIs exist —
 * prevMonthKpis needs income or expenses — yet the Expenses base is 0); March spends 600 on Rent,
 * a category with no February spend. Before F6 both comparisons fabricated 100%.
 *
 * Own harness on purpose: DashboardPage.test.tsx mocks HomeAttentionCenter as inert text, so
 * reading its props there would have meant editing an existing mock. No existing test is edited.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"

const mocks = vi.hoisted(() => ({
  useDashboardPageQueries: vi.fn(),
  dashboardHero: vi.fn(),
  homeAttentionCenter: vi.fn(),
  noop: vi.fn(),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({ openQuickAdd: vi.fn(), closeQuickAdd: vi.fn() }),
}))

vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))

vi.mock("./dashboard/sections", () => ({
  DashboardHero: (props: unknown) => {
    mocks.dashboardHero(props)
    return null
  },
  HomeAttentionCenter: (props: unknown) => {
    mocks.homeAttentionCenter(props)
    return null
  },
  SetupGuideDialog: () => null,
  SetupProgressPanel: () => null,
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => null,
  IncomeNudge: () => null,
  PlanSetupPrompts: () => null,
  IncomeExpensesChart: () => null,
  CategoryBreakdownChart: () => null,
  TopExpensesPanel: () => null,
}))

vi.mock("@/components/ui/category-detail-modal", () => ({ CategoryDetailModal: () => null }))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))

function queries() {
  return {
    dashboardMetrics: {
      months: ["2026-03", "2026-02"],
      monthly: [
        { month: "2026-02", income_kd: "1800.000", expense_kd: "0.000" },
        { month: "2026-03", income_kd: "1800.000", expense_kd: "600.000" },
      ],
      expense_by_category: { "2026-03": { Rent: "600.000" }, "2026-02": {} },
    },
    analyticsLoading: false,
    analyticsFetching: false,
    analyticsError: null,
    refetchAnalytics: mocks.noop,
    analyticsUpdatedAt: null,
    analyticsCacheWarning: null,
    profile: { monthly_income_kd: "2000.000", setup_guide_dismissed: true },
    demoWorkspace: null,
    profileLoading: false,
    profileError: null,
    refetchProfile: mocks.noop,
    safeToSpend: undefined,
    safeToSpendLoading: false,
    categoryRowsPage: undefined,
    categoryRowsPageLoading: false,
    categoryRowsError: null,
    refetchCategoryRows: mocks.noop,
    budgetResp: undefined,
    budgetLoading: false,
    setupBudgetResp: { items: [{ category: "Rent", amount_kd: "700.000" }] },
    setupBudgetLoading: false,
    setupBudgetError: null,
    refetchSetupBudget: mocks.noop,
    budgetAlerts: [],
    budgetAlertsLoading: false,
    accountOverview: { total_income_mtd: "1800.000", total_spend_mtd: "600.000" },
    accountOverviewLoading: false,
    monthBundleFetching: false,
    monthBundleError: null,
    refetchMonthBundle: mocks.noop,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("MOB-R52 F6 — DashboardPage, percent change from a zero base", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.useDashboardPageQueries.mockReturnValue(queries())
  })

  it("gives the hero no Expenses percentage when last month had no expenses", () => {
    renderPage()
    const { deltas } = mocks.dashboardHero.mock.calls.at(-1)?.[0] as {
      deltas: { expensesDelta: number | null; remainingDelta: number | null } | null
    }
    // The comparison exists (February has income rows) — otherwise null below proves nothing.
    expect(deltas).not.toBeNull()
    // WITHOUT the change this is 100: a "+100%" chip against February's 0 expenses.
    expect(deltas?.expensesDelta).toBeNull()
  })

  it("gives the rising category no percentage when it had no spending last month", () => {
    renderPage()
    const { risingCategory } = mocks.homeAttentionCenter.mock.calls.at(-1)?.[0] as {
      risingCategory: { name: string; deltaAmount: number; deltaPct: number | null } | null
    }
    expect(risingCategory?.name).toBe("Rent")
    expect(risingCategory?.deltaAmount).toBe(600)
    // WITHOUT the change this is 100: "(100.0%)" beside a category that is new this month.
    expect(risingCategory?.deltaPct).toBeNull()
  })
})
