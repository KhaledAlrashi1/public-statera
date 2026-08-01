import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"

// RED-first regression for the money-string consumer sweep (SWEEP-R3).
// R3 `expense_by_category` leaf values arrive on the wire as formatKd STRINGS
// ("100.000"). DashboardPage built `categoryData` from the raw string and handed it
// to the real CategoryBreakdownChart, whose Recharts tooltip formatter calls
// `value.toFixed(3)` — throwing "toFixed is not a function" on a string (the open,
// intermittent dashboard crash). This test drives a string value through the REAL
// chart's formatter path; it fails before the source coercion and passes after.

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useDashboardPageQueries: vi.fn(),
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

vi.mock("./dashboard/hooks", () => ({
  useDashboardPageQueries: (...args: unknown[]) => mocks.useDashboardPageQueries(...args),
}))

vi.mock("@/components/ui/category-detail-modal", () => ({
  CategoryDetailModal: () => null,
}))

// Keep the REAL CategoryBreakdownChart; stub every sibling section so only the
// category chart's formatter path executes (isolating the crash surface).
vi.mock("./dashboard/sections", async (importActual) => {
  const actual = await importActual<typeof import("./dashboard/sections")>()
  const Stub = () => null
  return {
    ...actual,
    DashboardHero: Stub,
    HomeAttentionCenter: Stub,
    IncomeExpensesChart: Stub,
    SafeToSpendHero: Stub,
    SetupGuideDialog: Stub,
    SetupProgressPanel: Stub,
    TopExpensesPanel: Stub,
  }
})

// Recharts mock whose Tooltip INVOKES the real inline formatter with the chart's
// first datum `value` — reproducing the production `value.toFixed(3)` path
// deterministically (a real Recharts tooltip only fires on hover, which jsdom
// cannot drive — the reason this crash escaped every prior test).
vi.mock("@/lib/recharts", async () => {
  const React = await import("react")
  let capturedData: Array<Record<string, unknown>> = []
  const Chart = ({ children, data }: { children?: React.ReactNode; data?: unknown }) => {
    if (Array.isArray(data)) capturedData = data as Array<Record<string, unknown>>
    return React.createElement(React.Fragment, null, children)
  }
  const Tooltip = ({ formatter }: { formatter?: (v: unknown, n: string) => unknown }) => {
    const first = capturedData[0]
    let text = ""
    if (first && formatter) {
      const res = formatter((first as { value: unknown }).value, "Amount")
      text = Array.isArray(res) ? String(res[0]) : String(res)
    }
    return React.createElement("div", { "data-testid": "cat-tooltip" }, text)
  }
  const Leaf = () => null
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  return {
    BarChart: Chart,
    LineChart: Chart,
    ComposedChart: Chart,
    PieChart: Chart,
    ResponsiveContainer: Pass,
    Bar: Leaf,
    Line: Leaf,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    ReferenceLine: Leaf,
    Cell: Leaf,
    Legend: Leaf,
    Pie: Leaf,
    Tooltip,
  }
})

function baseQueries() {
  return {
    dashboardMetrics: {
      months: ["2026-03"],
      // Wire shape: KWD amounts are formatKd STRINGS, not numbers.
      monthly: [{ month: "2026-03", income_kd: "500.000", expense_kd: "140.000" }],
      expense_by_category: { "2026-03": { Food: "100.000", Transport: "40.000" } },
    },
    analyticsLoading: false,
    analyticsFetching: false,
    analyticsError: null,
    refetchAnalytics: vi.fn(),
    analyticsUpdatedAt: null,
    analyticsCacheWarning: null,
    profile: null,
    demoWorkspace: null,
    profileLoading: false,
    profileError: null,
    refetchProfile: vi.fn(),
    safeToSpend: undefined,
    safeToSpendLoading: false,
    debtSummary: undefined,
    debtSummaryLoading: false,
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
    accountOverview: undefined,
    accountOverviewLoading: false,
    monthBundleFetching: false,
    monthBundleError: null,
    refetchMonthBundle: vi.fn(),
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("DashboardPage category chart — money-string coercion (SWEEP-R3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.useDashboardPageQueries.mockReturnValue(baseQueries())
  })

  it("drives a string expense_by_category value through the tooltip formatter and renders KD instead of crashing on .toFixed", () => {
    renderPage()
    // Top category is Food ("100.000" → 100). The formatter must receive a number.
    expect(screen.getByTestId("cat-tooltip")).toHaveTextContent("KD 100.000")
  })
})
