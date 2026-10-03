/**
 * MOB-R50 F1 — Plan saves a budget only into the month the page is showing.
 *
 * Own harness on purpose: BudgetPage.test.tsx stubs BudgetDialog as inert text, so reaching
 * onSave there would have meant editing an existing mock. Nothing in that file is touched.
 *
 * The dialog stub posts a month OTHER than the page's ("2099-01"). Before F1, handleSave wrote
 * the page month's list (plus the new row) into whatever month the dialog sent — replacing that
 * other month's budgets. Clock pinned to 2026-05-15, so the page shows 2026-05.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import BudgetPage from "./BudgetPage"

const mocks = vi.hoisted(() => ({
  saveBudgets: vi.fn(),
  noop: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: { budgetMetrics: vi.fn().mockResolvedValue({ spent_by_category: {} }) },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

vi.mock("./budget/hooks", () => ({
  findDuplicateCategory: () => null,
  saveBudgets: (...a: unknown[]) => mocks.saveBudgets(...a),
  getBudgets: vi.fn().mockResolvedValue({ items: [] }),
  findMostRecentBudgetsBefore: vi.fn(),
  useBudgetActiveMonths: () => ({
    monthOptions: ["2026-05"],
    activeMonthsError: null,
    refetchActiveMonths: mocks.noop,
    activeMonthsFetching: false,
  }),
  useBudgetPageQueries: () => ({
    categories: [],
    budgetMetrics: { spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} },
    budgets: [{ category: "Groceries", amount_kd: "200.000" }],
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

vi.mock("./budget/sections", () => ({
  BudgetHero: () => null,
  IncomePlanningCard: () => null,
  BudgetChart: () => null,
  BudgetTable: () => null,
  BudgetDialog: ({
    onSave,
  }: {
    onSave: (v: { month: string; category: string; amount_kd: string }) => Promise<void>
  }) => (
    <button
      type="button"
      onClick={() => void onSave({ month: "2099-01", category: "Food", amount_kd: "10.000" })}
    >
      save budget
    </button>
  ),
}))

describe("MOB-R50 F1 — BudgetPage saves only to the page's month", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-05-15T09:00:00"))
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.saveBudgets.mockResolvedValue({ items: [], profileContext: null })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("posts the page's month with that month's list plus the new row", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={["/plan"]}>
        <QueryClientProvider client={queryClient}>
          <BudgetPage />
        </QueryClientProvider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText("save budget"))

    await waitFor(() => expect(mocks.saveBudgets).toHaveBeenCalledTimes(1))
    // WITHOUT the change the first argument is "2099-01": 2026-05's list written into 2099-01.
    expect(mocks.saveBudgets).toHaveBeenCalledWith("2026-05", [
      { category: "Groceries", amount_kd: "200.000" },
      { category: "Food", amount_kd: "10.000" },
    ])
  })
})
