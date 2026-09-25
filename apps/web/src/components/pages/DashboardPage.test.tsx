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
  // MOB-R26 RM-1 — the income nudge relocated OUT of SafeToSpendHero to an unconditional
  // position on Home. This factory enumerates its exports, so a mounted export missing from
  // it resolves to undefined and throws; the entry is required by the mount, not optional.
  IncomeNudge: () => <div>income nudge</div>,
  // MOB-R27 — the three relocated prompts. Same closed-list reason as IncomeNudge above.
  PlanSetupPrompts: () => <div>plan setup prompts</div>,
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
  // Hoisted to describe scope so the RM-1 relocation cases can spread it instead of restating
  // all thirty-odd query fields. Existing cases build their own full objects and are unaffected.
  let baseResult: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    baseResult = {
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

  // MOB-R26 RM-1 condition (4) — the income nudge must reach the user in the two states where
  // the alternates (SetupProgressPanel / SetupGuideDialog) vanish. Both cases assert the nudge
  // is PRESENT while the setup panel is ABSENT in the SAME render, so "nudge present" cannot be
  // satisfied by a page that simply rendered everything.
  //
  // These are page-level MOUNT assertions, deliberately: this file mocks ./dashboard/sections
  // wholesale, so the nudge's own gate, copy and dismissal are unobservable here and are pinned
  // against the REAL component in dashboard/safe-to-spend.test.tsx instead.
  it("mounts the income nudge when onboarding is dismissed on an empty account", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      // setup_guide_dismissed hides the SetupProgressPanel; with no transactions and no budgets
      // this is also the state where SafeToSpendHero itself is gated out (noDashboardData), so
      // before the relocation there was NO income prompt on this page at all.
      profile: { setup_guide_dismissed: true },
      safeToSpend: { income_source: "not_set" },
    })

    renderPage()

    expect(screen.getByText("income nudge")).toBeInTheDocument()
    expect(screen.queryByText("Import or add transactions")).not.toBeInTheDocument()
  })

  it("mounts the income nudge when setup was completed and the budget has since been deleted", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      // Real activity exists, so the hero is NOT gated out here — but the budget is gone
      // (setupBudgetResp empty) and onboarding is dismissed, so the setup panel stays hidden.
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [{ month: "2026-03", income_kd: "1500.000", expense_kd: "900.000" }],
        expense_by_category: {},
      },
      profile: { setup_guide_dismissed: true, monthly_income_kd: "1500.000" },
      safeToSpend: { income_source: "not_set" },
      setupBudgetResp: { items: [] },
    })

    renderPage()

    expect(screen.getByText("income nudge")).toBeInTheDocument()
    expect(screen.queryByText("Import or add transactions")).not.toBeInTheDocument()
  })

  // MOB-R27 — the hero is UNMOUNTED and its three surviving affordances render from
  // PlanSetupPrompts instead. Both halves asserted in the SAME render: "safe to spend" absent
  // cannot be satisfied by a page that failed to render, because the relocated prompts and the
  // rest of the dashboard body are present alongside it.
  it("no longer mounts the safe-to-spend hero and mounts the relocated prompts instead", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      // Real activity, so the dashboard body renders — this is the state in which the hero
      // used to appear. Its absence here is therefore a removal, not a gating accident.
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [{ month: "2026-03", income_kd: "1500.000", expense_kd: "900.000" }],
        expense_by_category: {},
      },
      safeToSpend: { income_source: "not_set", data_complete: false },
    })

    renderPage()

    expect(screen.getByText("plan setup prompts")).toBeInTheDocument()
    expect(screen.getByText("alerts")).toBeInTheDocument()
    expect(screen.queryByText("safe to spend")).not.toBeInTheDocument()
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
