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
  // MOB-R36 — prop recorders, same pattern as dashboardHero. They record props only; each mock's
  // rendered output is unchanged, so no existing case can see a difference.
  planSetupPrompts: vi.fn(),
  setupProgressPanel: vi.fn(),
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

vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))

vi.mock("./dashboard/sections", () => ({
  DashboardHero: (props: unknown) => {
    mocks.dashboardHero(props)
    return <div>dashboard hero</div>
  },
  SetupGuideDialog: () => null,
  SetupProgressPanel: (props: {
    steps: Array<{ key: string; title: string; done: boolean; actionLabel: string }>
  }) => {
    mocks.setupProgressPanel(props)
    const { steps } = props
    return (
      <div>
        {steps.map((step) => (
          <div key={step.key}>
            <span>{step.title}</span>
            <span>{step.done ? "Done" : step.actionLabel}</span>
          </div>
        ))}
      </div>
    )
  },
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => <div>safe to spend</div>,
  // MOB-R26 RM-1 — the income nudge relocated OUT of SafeToSpendHero to an unconditional
  // position on Home. This factory enumerates its exports, so a mounted export missing from
  // it resolves to undefined and throws; the entry is required by the mount, not optional.
  IncomeNudge: () => <div>income nudge</div>,
  // MOB-R27 — the three relocated prompts. Same closed-list reason as IncomeNudge above.
  PlanSetupPrompts: (props: unknown) => {
    mocks.planSetupPrompts(props)
    return <div>plan setup prompts</div>
  },
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

  // MOB-R40 F1 — ONE owner for the setup asks on Home. While the checklist (SetupProgressPanel)
  // shows, it owns the income and budget asks, so PlanSetupPrompts is not mounted; once it is
  // gone, PlanSetupPrompts carries them. The income nudge is removed outright, and the IncomeNudge
  // mock entry above is what lets "income nudge" absent be observed rather than assumed: if the
  // page still mounted it, the mock would render that text.
  //
  // The negative case can only see the MOUNT and the payload it receives, because this file mocks
  // ./dashboard/sections wholesale. That a not-set payload renders the "Set income" card is pinned
  // against the REAL component in dashboard/plan-setup-prompts.test.tsx.
  const notSetSafeToSpend = {
    income_source: "not_set",
    data_complete: false,
    warnings: ["income_not_set"],
  }

  it("the checklist owns the asks: while it shows, no PlanSetupPrompts card and no nudge", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      safeToSpend: notSetSafeToSpend,
    })

    renderPage()

    // The checklist is showing, with its income step not done.
    expect(screen.getByText("Set your income")).toBeInTheDocument()
    expect(screen.queryByText("plan setup prompts")).not.toBeInTheDocument()
    expect(mocks.planSetupPrompts).not.toHaveBeenCalled()
    expect(screen.queryByText("income nudge")).not.toBeInTheDocument()
  })

  it("NEGATIVE — with the checklist gone and income not set, the Set income card is mounted", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      profile: { setup_guide_dismissed: true },
      safeToSpend: notSetSafeToSpend,
    })

    renderPage()

    expect(screen.queryByText("Set your income")).not.toBeInTheDocument()
    expect(screen.getByText("plan setup prompts")).toBeInTheDocument()
    const props = mocks.planSetupPrompts.mock.calls.at(-1)?.[0] as { safeToSpend?: unknown }
    expect(props.safeToSpend).toEqual(notSetSafeToSpend)
    expect(screen.queryByText("income nudge")).not.toBeInTheDocument()
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
      profile: { setup_guide_dismissed: true },
    })

    renderPage()

    expect(screen.getByText("plan setup prompts")).toBeInTheDocument()
    expect(screen.getByText("alerts")).toBeInTheDocument()
    expect(screen.queryByText("safe to spend")).not.toBeInTheDocument()
  })

  // MOB-R29 Part 2 — "Needs attention" moves BELOW both spending cards.
  //
  // This asserts DOM ORDER, not presence. Presence passes under the old order too, so a
  // presence test would be green before and after and would check nothing. compareDocumentPosition
  // is the instrument: DOCUMENT_POSITION_FOLLOWING means the second node comes after the first
  // in document order, which is exactly the claim.
  //
  // Home renders ONE width-independent ordered list — the outer stack is a plain `space-y-8`
  // with no order-*/reverse utilities anywhere — so this single assertion covers every width.
  // The two spending cards share a `grid lg:grid-cols-2` wrapper, which changes how THEY sit
  // relative to each other, never where the attention section sits relative to them.
  it("renders Needs attention below both spending cards", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      dashboardMetrics: {
        months: ["2026-03"],
        monthly: [{ month: "2026-03", income_kd: "1500.000", expense_kd: "900.000" }],
        expense_by_category: {},
      },
    })

    renderPage()

    const attention = screen.getByText("alerts")
    const incomeVsExpenses = screen.getByText("income chart")
    const expensesByCategory = screen.getByText("category chart")

    const follows = (first: HTMLElement, second: HTMLElement) =>
      Boolean(
        first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
      )

    // Both spending cards precede the attention section.
    expect(follows(incomeVsExpenses, attention)).toBe(true)
    expect(follows(expensesByCategory, attention)).toBe(true)
    // And the two cards keep their own relative order (condition 1).
    expect(follows(incomeVsExpenses, expensesByCategory)).toBe(true)
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
    expect(screen.getByText("Set budget")).toBeInTheDocument()
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

  // MOB-R69 C2 — rewritten: it passed for the wrong reason (undefined is not null). MOB-R68 D4
  // removed every "vs last month" chip, so this renders the REAL hero with the props Home passed and
  // asserts no tile shows one, while the footers prove the hero rendered its tiles.
  it("no KPI tile renders a vs-last-month chip", async () => {
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
      profile: { monthly_income_kd: "1800.000" },
    })

    renderPage()

    const props = mocks.dashboardHero.mock.calls.at(-1)?.[0] as Record<string, unknown>
    const { DashboardHero } = await vi.importActual<typeof import("./dashboard/sections")>("./dashboard/sections")
    const hero = render(<DashboardHero {...(props as Parameters<typeof DashboardHero>[0])} />)
    expect(hero.getByText("14% of income")).toBeInTheDocument()
    expect(hero.queryByText(/vs last month/i)).toBeNull()
  })

  // ── MOB-R36 C4 — the hero reads the TYPED income (profile), mirroring the resolver's declared arm.
  const TWO_MONTHS = {
    months: ["2026-03", "2026-02"],
    monthly: [
      { month: "2026-02", income_kd: "1800.000", expense_kd: "800.000" },
      { month: "2026-03", income_kd: "1800.000", expense_kd: "250.000" },
    ],
    expense_by_category: {},
  }
  type HeroProps = {
    monthIncome: number | null
    deltas: { expensesDelta: number; remainingDelta: number | null; savingsRateDelta: number } | null
  }
  const lastHero = () => mocks.dashboardHero.mock.calls.at(-1)?.[0] as HeroProps

  it("the hero shows the typed income, not the logged R4 sum", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      dashboardMetrics: TWO_MONTHS,
      accountOverview: { total_income_mtd: "1800.000", total_spend_mtd: "250.000" },
      profile: { monthly_income_kd: "1500.000" },
    })
    renderPage()
    expect(lastHero().monthIncome).toBe(1500)
  })

  // MOB-R69 C1 — rewritten: the hero has no deltas (MOB-R68 D4); income not set means no footers.
  it("income not set: the hero gets null income and no footers", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      dashboardMetrics: TWO_MONTHS,
      accountOverview: { total_income_mtd: "1800.000", total_spend_mtd: "250.000" },
      profile: null,
    })
    renderPage()
    expect(lastHero().monthIncome).toBeNull()
    expect((lastHero() as unknown as { footers: unknown }).footers).toBeNull()
  })

  it("the Set income prompt opens the income dialog", async () => {
    mocks.useDashboardPageQueries.mockReturnValue({ ...baseResult, profile: { setup_guide_dismissed: true } })
    renderPage()
    const props = mocks.planSetupPrompts.mock.calls.at(-1)?.[0] as { onOpenIncome?: () => void }
    props.onOpenIncome?.()
    expect(await screen.findByRole("dialog", { name: "Income and payday" })).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalledWith("/profile")
  })

  // MOB-R47 Part A — the checklist step (and guided setup, which is passed the same steps) opens
  // the income dialog instead of sending the user to Profile.
  it("the checklist's Set income step opens the income dialog", async () => {
    mocks.useDashboardPageQueries.mockReturnValue({ ...baseResult, profile: null })
    renderPage()
    const { steps } = mocks.setupProgressPanel.mock.calls.at(-1)?.[0] as {
      steps: Array<{ key: string; onAction: () => void }>
    }
    steps.find((step) => step.key === "income")?.onAction()
    expect(await screen.findByRole("dialog", { name: "Income and payday" })).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalledWith("/profile")
  })

  it("Cancel closes the income dialog and stays on Home", async () => {
    mocks.useDashboardPageQueries.mockReturnValue({ ...baseResult, profile: { setup_guide_dismissed: true } })
    renderPage()
    const props = mocks.planSetupPrompts.mock.calls.at(-1)?.[0] as { onOpenIncome?: () => void }
    props.onOpenIncome?.()
    await screen.findByRole("dialog", { name: "Income and payday" })
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Income and payday" })).toBeNull()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  // MOB-R69 C1 — rewritten: no chips exist (MOB-R68 D4). Overspent, the footers show Expenses over
  // 100% of income while the Remaining bar is capped at 100 and nothing is left (D3).
  it("overspent: Expenses shows 120% of income, the Remaining bar is capped and 0% is left", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      ...baseResult,
      dashboardMetrics: {
        months: ["2026-03", "2026-02"],
        monthly: [
          { month: "2026-02", income_kd: "1800.000", expense_kd: "800.000" },
          { month: "2026-03", income_kd: "1800.000", expense_kd: "1200.000" },
        ],
        expense_by_category: {},
      },
      accountOverview: { total_income_mtd: "1800.000", total_spend_mtd: "1200.000" },
      profile: { monthly_income_kd: "1000.000" }, // March spending 1200 exceeds the typed 1000
    })
    renderPage()
    const hero = lastHero() as unknown as { overBy: number | null; footers: unknown }
    expect(hero.overBy).toBe(200)
    expect(hero.footers).toEqual({
      expensesPct: 120,
      savingsPct: 0,
      bar: { expensesPct: 100, savingsPct: 0, trackPct: 0, leftPct: 0 },
    })
  })

  it("canLoadDemoData: once a typed income exists the demo is not offered; with nothing set it is", () => {
    // The backend's hasFinancialData refuses the demo (409) once the profile holds an income.
    mocks.useDashboardPageQueries.mockReturnValue({ ...baseResult, profile: { monthly_income_kd: "1500.000" } })
    renderPage()
    const withIncome = mocks.setupProgressPanel.mock.calls.at(-1)?.[0] as { demoAction?: unknown }
    expect(withIncome.demoAction ?? null).toBeNull()

    // NEGATIVE — nothing set, no rows, no budgets: the demo IS offered.
    mocks.setupProgressPanel.mockClear()
    mocks.useDashboardPageQueries.mockReturnValue({ ...baseResult, profile: null })
    renderPage()
    const withNothing = mocks.setupProgressPanel.mock.calls.at(-1)?.[0] as { demoAction?: unknown }
    expect(withNothing.demoAction).not.toBeNull()
  })
})
