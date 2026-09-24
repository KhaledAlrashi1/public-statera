/**
 * MOB-F1 — cache-invalidation OUTCOME tests.
 *
 * These deliberately do NOT assert "invalidateQueries was called with key K". That form
 * restates the diff and passes against a key that matches nothing — the defect under repair
 * would survive its own test. Instead each case seeds a REAL QueryClient under a REAL declared
 * query key, performs the user action, and asserts the seeded query's `isInvalidated` state.
 * That routes through the library's actual `partialMatchKey`, which makes it a measurement
 * rather than a restatement.
 *
 * This file carries its own harness on purpose: the existing DashboardPage.test.tsx keeps its
 * QueryClient private inside renderPage() and mocks the sections with inert stubs, so asserting
 * cache state there would have meant editing an existing harness. Nothing in that file is
 * touched by this one.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"
import BudgetPage from "./BudgetPage"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useDashboardPageQueries: vi.fn(),
  dismissBudgetAlert: vi.fn(),
  clearDemoData: vi.fn(),
  saveBudgets: vi.fn(),
  noop: vi.fn(),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({ openQuickAdd: vi.fn(), closeQuickAdd: vi.fn() }),
}))

vi.mock("@/lib/api", () => ({
  authApi: { clearDemoData: (...a: unknown[]) => mocks.clearDemoData(...a) },
  notificationsApi: { dismissBudgetAlert: (...a: unknown[]) => mocks.dismissBudgetAlert(...a) },
}))

vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))

vi.mock("./budget/hooks", () => ({
  findDuplicateCategory: () => null,
  saveBudgets: (...a: unknown[]) => mocks.saveBudgets(...a),
  getBudgets: vi.fn(),
  findMostRecentBudgetsBefore: vi.fn(),
  useBudgetActiveMonths: () => ({
    monthOptions: ["2026-03"],
    activeMonthsError: null,
    refetchActiveMonths: mocks.noop,
    activeMonthsFetching: false,
  }),
  useBudgetPageQueries: () => ({
    categories: [],
    budgetMetrics: undefined,
    budgets: [],
    profileContext: null,
    loadingBudgets: false,
    loadingMetrics: false,
    budgetsFetching: false,
    metricsFetching: false,
    budgetsError: null,
    metricsError: null,
    categoriesError: null,
    refetchBudgets: mocks.noop,
    refetchMetrics: mocks.noop,
    refetchCategories: mocks.noop,
  }),
}))

// BudgetDialog is the save seam for the Item-B case. It renders its trigger unconditionally
// (ignoring `open`) so the test does not have to drive the page's own open/close state; the
// DashboardPage cases above also render this component, where the extra button is unused.
vi.mock("./budget/sections", () => ({
  BudgetDialog: ({
    onSave,
  }: {
    onSave: (v: { month: string; category: string; amount_kd: string }) => Promise<void>
  }) => (
    <button
      type="button"
      onClick={() => void onSave({ month: "2026-03", category: "Food", amount_kd: "10.000" })}
    >
      save budget
    </button>
  ),
  BudgetHero: () => null,
  BudgetChart: () => null,
  BudgetTable: () => null,
  IncomePlanningCard: () => null,
}))

vi.mock("@/components/ui/category-detail-modal", () => ({ CategoryDetailModal: () => null }))

// The two trigger seams this file needs. Every other section is inert.
vi.mock("./dashboard/sections", () => ({
  DashboardHero: () => <div>dashboard hero</div>,
  SetupGuideDialog: () => null,
  SetupProgressPanel: () => null,
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => <div>safe to spend</div>,
  // MOB-R26 RM-1 — required because this factory ENUMERATES its exports rather than spreading
  // the real module: a newly mounted export missing here resolves to undefined and throws.
  // Inert, like every other section in this file.
  IncomeNudge: () => null,
  HomeAttentionCenter: ({
    onDismissBudgetAlert,
  }: {
    onDismissBudgetAlert: (alertKey: string) => void
  }) => (
    <button type="button" onClick={() => onDismissBudgetAlert("alert-1")}>
      dismiss alert
    </button>
  ),
  IncomeExpensesChart: () => null,
  CategoryBreakdownChart: () => null,
  TopExpensesPanel: () => null,
}))

vi.mock("@/components/ui/demo-workspace-banner", () => ({
  DemoWorkspaceBanner: ({ onClearDemoWorkspace }: { onClearDemoWorkspace: () => void }) => (
    <button type="button" onClick={onClearDemoWorkspace}>
      clear demo
    </button>
  ),
}))

const MONTH = "2026-03"

function baseResult(overrides: Record<string, unknown> = {}) {
  return {
    dashboardMetrics: { months: [MONTH], monthly: [], expense_by_category: {} },
    analyticsLoading: false,
    analyticsFetching: false,
    analyticsError: null,
    refetchAnalytics: mocks.noop,
    analyticsUpdatedAt: null,
    analyticsCacheWarning: null,
    profile: null,
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
    // Non-empty so `noDashboardData` is false and the dashboard body — which is what
    // holds HomeAttentionCenter, the dismiss seam — actually renders.
    setupBudgetResp: { items: [{ category: "Food", amount_kd: "10.000" }] },
    setupBudgetLoading: false,
    setupBudgetError: null,
    refetchSetupBudget: mocks.noop,
    budgetAlerts: [],
    budgetAlertsLoading: false,
    accountOverview: undefined,
    accountOverviewLoading: false,
    monthBundleFetching: false,
    monthBundleError: null,
    refetchMonthBundle: mocks.noop,
    ...overrides,
  }
}

/** Render with a QueryClient the test owns, so cache state is assertable. */
function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
  return queryClient
}

const invalidated = (qc: QueryClient, key: unknown[]) =>
  qc.getQueryState(key)?.isInvalidated ?? false

describe("MOB-F1 cache invalidation — outcomes, not spies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.dismissBudgetAlert.mockResolvedValue(undefined)
    mocks.clearDemoData.mockResolvedValue({ transactions_cleared: 0, budgets_cleared: 0 })
    mocks.useDashboardPageQueries.mockReturnValue(baseResult())
  })

  it("dismissing a budget alert invalidates the dashboard bundle that serves the alert list", async () => {
    const qc = renderWithClient()
    // The real declared key from dashboard/hooks.ts:45.
    qc.setQueryData(["dashboard-bundle", MONTH], { ok: true })
    expect(invalidated(qc, ["dashboard-bundle", MONTH])).toBe(false)

    fireEvent.click(screen.getByText("dismiss alert"))

    await waitFor(() => {
      expect(invalidated(qc, ["dashboard-bundle", MONTH])).toBe(true)
    })
  })

  it("dismissing a budget alert does NOT invalidate an unrelated query", async () => {
    // CONTROL KEY: ["merchants"] — declared at TransactionsPage.tsx:80. The only filter the
    // dismiss path issues is ["dashboard-bundle"], and "merchants" shares no first segment
    // with it, so this key is outside that filter. Without this case, the assertion above
    // would also be satisfied by a blanket invalidateQueries() that swept everything.
    const qc = renderWithClient()
    qc.setQueryData(["dashboard-bundle", MONTH], { ok: true })
    qc.setQueryData(["merchants"], [])

    fireEvent.click(screen.getByText("dismiss alert"))

    await waitFor(() => {
      expect(invalidated(qc, ["dashboard-bundle", MONTH])).toBe(true)
    })
    expect(invalidated(qc, ["merchants"])).toBe(false)
  })

  it("a financial write invalidates the Insights weekly digest, not just Insights safe-to-spend", async () => {
    mocks.useDashboardPageQueries.mockReturnValue(
      baseResult({ demoWorkspace: { active: true, transaction_count: 1 } })
    )
    const qc = renderWithClient()

    // LOAD-BEARING SEEDING — do not narrow this key.
    // ["insights","weekly-digest"] (InsightsPage.tsx:144) carries safe_to_spend_today_kd, the
    // same figure, from the same server builder, as ["insights","safe-to-spend"]. The filter
    // was deliberately widened to ["insights"] so the pair moves together; narrowing it to
    // ["insights","safe-to-spend"] would refresh one and not the other and reproduce the
    // Home-vs-Insights divergence MOB-0 was opened to investigate. This case is the only
    // thing pinning that breadth decision — if it is "simplified", the decision is unguarded.
    qc.setQueryData(["insights", "weekly-digest"], { ok: true })
    expect(invalidated(qc, ["insights", "weekly-digest"])).toBe(false)

    fireEvent.click(screen.getByText("clear demo"))

    await waitFor(() => {
      expect(invalidated(qc, ["insights", "weekly-digest"])).toBe(true)
    })
  })
})

/** Render BudgetPage with a QueryClient the test owns. */
function renderBudgetWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter initialEntries={["/plan"]}>
      <QueryClientProvider client={queryClient}>
        <BudgetPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
  return queryClient
}

describe("MOB-F1 Item B — budget writes reach the setup-progress query", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.saveBudgets.mockResolvedValue({ items: [] })
  })

  it("a budget save invalidates setup-progress EVEN WHEN its month differs from the write's", async () => {
    const qc = renderBudgetWithClient()

    // The real declared key from dashboard/hooks.ts:81, seeded under a DIFFERENT month than
    // the write targets. That difference is the point: `setupMonth` is DashboardPage's own
    // state and the write's month is BudgetPage's, so the two are independent and can differ.
    // A month-pinned filter would match only when they coincide and fail silently otherwise —
    // this defect's own mechanism one segment over. The filter is therefore month-agnostic.
    qc.setQueryData(["budgets", "setup-progress", "2026-01"], { items: [] })
    // CONTROL KEY: ["merchants"] — declared at TransactionsPage.tsx:80. The save handler's
    // filters are budgets / budget-metrics / dashboard-bundle / insights; "merchants" shares
    // no first segment with any of them, so it must survive. Without it, the assertion above
    // would also be satisfied by a blanket invalidateQueries() sweeping everything.
    qc.setQueryData(["merchants"], [])

    expect(invalidated(qc, ["budgets", "setup-progress", "2026-01"])).toBe(false)

    fireEvent.click(screen.getByText("save budget"))

    // WITHOUT the change the filter is ["budgets", "2026-03"], whose index 1 compares a month
    // string against the literal "setup-progress" and can never match: this reads false.
    await waitFor(() => {
      expect(invalidated(qc, ["budgets", "setup-progress", "2026-01"])).toBe(true)
    })
    expect(invalidated(qc, ["merchants"])).toBe(false)
  })
})
