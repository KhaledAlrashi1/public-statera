import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useDashboardPageQueries: vi.fn(),
  refetchMonthBundle: vi.fn(),
  refetchAnalytics: vi.fn(),
  refetchProfile: vi.fn(),
  refetchSetupBudget: vi.fn(),
  refetchCategoryRows: vi.fn(),
  dashboardHero: vi.fn(),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({
    openQuickAdd: vi.fn(),
    closeQuickAdd: vi.fn(),
  }),
}))

vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))

vi.mock("./dashboard/sections", () => ({
  DashboardHero: (props: unknown) => {
    mocks.dashboardHero(props)
    return <div>dashboard hero</div>
  },
  SetupGuideDialog: () => null,
  SetupProgressPanel: ({
    steps,
  }: {
    steps: Array<{ key: string; title: string; done: boolean; actionLabel: string }>
  }) => (
    <div>
      {steps.map((step) => (
        <div key={step.key}>
          <span>{step.title}</span>
          <span>{step.done ? "Done" : step.actionLabel}</span>
        </div>
      ))}
    </div>
  ),
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => <div>safe to spend</div>,
  HomeAttentionCenter: () => <div>alerts</div>,
  IncomeExpensesChart: () => <div>income chart</div>,
  CategoryBreakdownChart: () => <div>category chart</div>,
  TopExpensesPanel: () => <div>top expenses</div>,
}))

vi.mock("@/components/ui/category-detail-modal", () => ({
  CategoryDetailModal: () => null,
}))

vi.mock("@/components/ui/demo-workspace-banner", () => ({
  DemoWorkspaceBanner: ({ onOpenImport }: { onOpenImport: () => void }) => (
    <button type="button" onClick={onOpenImport}>
      Import real data
    </button>
  ),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    const baseResult = {
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: null,
      analyticsCacheWarning: null,
      profile: null,
      demoWorkspace: null,
      profileLoading: false,
      profileError: null,
      refetchProfile: mocks.refetchProfile,
      safeToSpend: undefined,
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      categoryRowsError: null,
      refetchCategoryRows: mocks.refetchCategoryRows,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      setupBudgetError: null,
      refetchSetupBudget: mocks.refetchSetupBudget,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    }
    mocks.useDashboardPageQueries.mockReturnValue(baseResult)
  })

  it("passes the analytics freshness timestamp to the dashboard hero", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: "2026-03-10T12:00:00Z",
      analyticsCacheWarning: null,
      profile: null,
      demoWorkspace: null,
      profileLoading: false,
      profileError: null,
      refetchProfile: mocks.refetchProfile,
      safeToSpend: undefined,
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      categoryRowsError: null,
      refetchCategoryRows: mocks.refetchCategoryRows,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      setupBudgetError: null,
      refetchSetupBudget: mocks.refetchSetupBudget,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    })

    renderPage()

    expect(mocks.dashboardHero).toHaveBeenCalled()
    expect(mocks.dashboardHero.mock.calls[0]?.[0]).toMatchObject({
      analyticsUpdatedAt: "2026-03-10T12:00:00Z",
    })
  })

  it("shows retry alerts when month bundle or analytics data fail", () => {
    const baseResult = {
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: null,
      analyticsCacheWarning: null,
      profile: null,
      demoWorkspace: null,
      profileLoading: false,
      profileError: null,
      refetchProfile: mocks.refetchProfile,
      safeToSpend: undefined,
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      categoryRowsError: null,
      refetchCategoryRows: mocks.refetchCategoryRows,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      setupBudgetError: null,
      refetchSetupBudget: mocks.refetchSetupBudget,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    }
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      analyticsError: new Error("Analytics offline"),
      monthBundleError: new Error("Bundle offline"),
    })

    renderPage()

    expect(screen.getByText("Month details unavailable")).toBeInTheDocument()
    expect(screen.getByText(/Bundle offline/)).toBeInTheDocument()
    expect(screen.getByText("Historical analytics unavailable")).toBeInTheDocument()
    expect(screen.getByText(/Analytics offline/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry month details" }))
    fireEvent.click(screen.getByRole("button", { name: "Retry analytics" }))

    expect(mocks.refetchMonthBundle).toHaveBeenCalledTimes(1)
    expect(mocks.refetchAnalytics).toHaveBeenCalledTimes(1)
  })

  it("routes demo workspace import actions through the activity import intent", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: null,
      analyticsCacheWarning: null,
      profile: null,
      demoWorkspace: {
        active: true,
        transactions: 42,
        budgets: 4,
        debt_accounts: 1,
        savings_goals: 1,
      },
      profileLoading: false,
      safeToSpend: undefined,
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    })

    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Import real data" }))

    expect(mocks.navigate).toHaveBeenCalledWith("/activity?import=1")
  })

  it("keeps analytics cache degradation hidden from end users", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: null,
      analyticsCacheWarning: "Cache is temporarily unavailable. Analytics may load more slowly while Redis recovers.",
      profile: null,
      demoWorkspace: null,
      profileLoading: false,
      profileError: null,
      refetchProfile: mocks.refetchProfile,
      safeToSpend: undefined,
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      categoryRowsError: null,
      refetchCategoryRows: mocks.refetchCategoryRows,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      setupBudgetError: null,
      refetchSetupBudget: mocks.refetchSetupBudget,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    })

    renderPage()

    expect(screen.queryByText("Analytics cache delayed")).not.toBeInTheDocument()
    expect(screen.queryByText(/Analytics may load more slowly while Redis recovers/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Import or add transactions/i)).toBeInTheDocument()
  })

  it("aligns setup steps to income, activity, and budget onboarding", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [],
        expense_by_category: {},
      },
      analyticsLoading: false,
      analyticsFetching: false,
      analyticsError: null,
      refetchAnalytics: mocks.refetchAnalytics,
      analyticsUpdatedAt: null,
      analyticsCacheWarning: null,
      profile: { monthly_income_kd: "1500.000", timezone: "Asia/Kuwait" },
      demoWorkspace: null,
      profileLoading: false,
      profileError: null,
      refetchProfile: mocks.refetchProfile,
      safeToSpend: { monthly_income_kd: null },
      safeToSpendLoading: false,
      debtSummary: undefined,
      debtSummaryLoading: false,
      categoryRowsPage: undefined,
      categoryRowsPageLoading: false,
      categoryRowsError: null,
      refetchCategoryRows: mocks.refetchCategoryRows,
      budgetResp: undefined,
      budgetLoading: false,
      setupBudgetResp: { items: [] },
      setupBudgetLoading: false,
      setupBudgetError: null,
      refetchSetupBudget: mocks.refetchSetupBudget,
      budgetAlerts: [],
      budgetAlertsLoading: false,
      accountOverview: undefined,
      accountOverviewLoading: false,
      monthBundleFetching: false,
      monthBundleError: null,
      refetchMonthBundle: mocks.refetchMonthBundle,
    })

    renderPage()

    expect(screen.getByText("Set your income")).toBeInTheDocument()
    expect(screen.getByText("Import or add transactions")).toBeInTheDocument()
    expect(screen.getByText("Set your first budget")).toBeInTheDocument()
    expect(screen.getByText("Add Activity")).toBeInTheDocument()
    expect(screen.getByText("Set Budget")).toBeInTheDocument()
    expect(screen.getByText("Done")).toBeInTheDocument()
  })

  it("shows a page-level empty state when onboarding is dismissed and no dashboard data exists", () => {
    window.localStorage.setItem("onboarding-dismissed", "true")

    renderPage()

    expect(screen.getByText("Import activity to unlock Home")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import activity" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open guided setup" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Import activity" }))

    expect(mocks.navigate).toHaveBeenCalledWith("/activity?import=1")
  })

  // heroDeltas already suppresses the chips when the PREVIOUS period is empty
  // (prevMonthKpis returns null). The same treatment applied to the CURRENT
  // period keeps a -100% delta caused by absent rows from rendering as a green
  // "100.0% vs last month" success pill on the inverted Expenses tile.
  it("suppresses the hero deltas when the selected month has no rows", () => {
    // Reuse the beforeEach fixture rather than restating ~35 unrelated fields.
    const base = mocks.useDashboardPageQueries() as Record<string, unknown>
    mocks.useDashboardPageQueries.mockReturnValue({
      ...base,
      dashboardMetrics: {
        months: ["2026-03", "2026-02"],
        monthly: [
          { month: "2026-02", income_kd: "1800.000", expense_kd: "500.000" },
          { month: "2026-03", income_kd: "0.000", expense_kd: "0.000" },
        ],
        expense_by_category: {},
      },
      accountOverview: { total_income_mtd: "0.000", total_spend_mtd: "0.000" },
    })

    renderPage()

    const props = mocks.dashboardHero.mock.calls.at(-1)?.[0] as { deltas: unknown }
    expect(props.deltas).toBeNull()
  })

  // Control for the case above: with rows in the selected month the chips must
  // still render, so the guard cannot pass by suppressing everything.
  it("still passes hero deltas when the selected month has rows", () => {
    const base = mocks.useDashboardPageQueries() as Record<string, unknown>
    mocks.useDashboardPageQueries.mockReturnValue({
      ...base,
      dashboardMetrics: {
        months: ["2026-03", "2026-02"],
        monthly: [
          { month: "2026-02", income_kd: "1800.000", expense_kd: "500.000" },
          { month: "2026-03", income_kd: "1800.000", expense_kd: "250.000" },
        ],
        expense_by_category: {},
      },
      accountOverview: { total_income_mtd: "1800.000", total_spend_mtd: "250.000" },
    })

    renderPage()

    const props = mocks.dashboardHero.mock.calls.at(-1)?.[0] as { deltas: unknown }
    expect(props.deltas).not.toBeNull()
  })
})
