// MOB-R60 E1 — Home's "Set your income" step no longer sends the user to Profile, so its copy says
// the income is set here and can be changed later in Profile. The harness mirrors
// DashboardPage.savings.test.tsx; the setup checklist records the steps Home gives it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DashboardPage from "./DashboardPage"

const mocks = vi.hoisted(() => ({
  useDashboardPageQueries: vi.fn(),
  dashboardHero: vi.fn(),
  setupProgressPanel: vi.fn(),
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
  SetupGuideDialog: () => null,
  SetupProgressPanel: (props: unknown) => {
    mocks.setupProgressPanel(props)
    return null
  },
  PlanSummaryPanel: () => null,
  SafeToSpendHero: () => null,
  IncomeNudge: () => null,
  PlanSetupPrompts: () => null,
  HomeAttentionCenter: () => null,
  IncomeExpensesChart: () => null,
  CategoryBreakdownChart: () => null,
  TopExpensesPanel: () => null,
}))
vi.mock("@/components/ui/category-detail-modal", () => ({ CategoryDetailModal: () => null }))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))

describe("Home — income step copy (MOB-R60 E1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("describes setting income here, changeable later in Profile", () => {
    mocks.useDashboardPageQueries.mockReturnValue({
      dashboardMetrics: { months: ["2026-03"], monthly: [], expense_by_category: {} },
      profile: null,
      setupBudgetResp: { items: [] },
      budgetAlerts: [],
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={queryClient}>
          <DashboardPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const { steps } = mocks.setupProgressPanel.mock.calls.at(-1)?.[0] as {
      steps: Array<{ key: string; description: string }>
    }
    expect(steps.find((step) => step.key === "income")?.description).toBe(
      "Add your monthly income. You can change it later in Profile.",
    )
  })
})
