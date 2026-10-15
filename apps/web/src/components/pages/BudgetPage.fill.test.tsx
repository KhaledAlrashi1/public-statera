/**
 * MOB-R98 B5 — "Fill from my spending" on Plan: the real page and the real sheet; Plan's sections are stubbed
 * (BudgetTable shows the fill button only when the page hands it onFill), the budget calls are mocks.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import BudgetPage from "./BudgetPage"

const mocks = vi.hoisted(() => ({
  budgetMetrics: vi.fn(),
  dashboardMetrics: vi.fn(),
  useBudgetPageQueries: vi.fn(),
  getBudgets: vi.fn(),
  saveBudgets: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: { budgetMetrics: mocks.budgetMetrics, dashboardMetrics: mocks.dashboardMetrics },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError, warning: vi.fn(), info: mocks.toastInfo }),
}))

vi.mock("./budget/hooks", () => ({
  useBudgetPageQueries: () => mocks.useBudgetPageQueries(),
  useBudgetActiveMonths: () => ({ monthOptions: ["2026-05"], activeMonthsError: null, refetchActiveMonths: vi.fn(), activeMonthsFetching: false }),
  getBudgets: (...a: unknown[]) => mocks.getBudgets(...a),
  saveBudgets: (...a: unknown[]) => mocks.saveBudgets(...a),
  findMostRecentBudgetsBefore: vi.fn(),
  findDuplicateCategory: () => null,
}))

vi.mock("./budget/sections", () => ({
  BudgetHero: () => null,
  IncomePlanningCard: () => null,
  BudgetChart: () => null,
  BudgetTable: ({ onFill }: { onFill?: () => void }) =>
    onFill ? (
      <button type="button" onClick={onFill}>
        Fill from my spending
      </button>
    ) : (
      <div>budget table</div>
    ),
  BudgetDialog: () => null,
}))

const CATEGORIES = [
  { id: 1, name: "Dining", kind: "expense" },
  { id: 2, name: "Groceries", kind: "expense" },
  { id: 3, name: "Transport", kind: "expense" },
  { id: 4, name: "Rent", kind: "expense" },
  { id: 5, name: "Salary", kind: "income" },
]

// The three complete periods before 2026-05: Dining 75.000 (usual 63.500), Groceries 30.000 (usual 22.000),
// Transport 15.000 (usual 10.000).
const HISTORY = {
  months: ["2026-02", "2026-03", "2026-04"],
  monthly: [
    { month: "2026-02", income_kd: "0.000", expense_kd: "80.000", savings_kd: "0.000" },
    { month: "2026-03", income_kd: "0.000", expense_kd: "95.500", savings_kd: "0.000" },
    { month: "2026-04", income_kd: "0.000", expense_kd: "280.750", savings_kd: "0.000" },
  ],
  expense_by_category: {
    "2026-02": { Dining: "50.000", Groceries: "20.000", Transport: "10.000" },
    "2026-03": { Dining: "63.500", Groceries: "22.000", Transport: "10.000" },
    "2026-04": { Dining: "70.750", Groceries: "200.000", Transport: "10.000" },
  },
}

function pageQueries(budgets: Array<{ category: string; amount_kd: string }>, income: string | null = null) {
  mocks.useBudgetPageQueries.mockReturnValue({
    categories: CATEGORIES,
    budgetMetrics: { spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} },
    budgets,
    profileContext: income ? { monthly_income_kd: income } : null,
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
}

// A new element each time: rerendering the same element object lets React skip the page.
function makePage(queryClient: QueryClient) {
  return () => (
    <MemoryRouter initialEntries={["/plan"]}>
      <QueryClientProvider client={queryClient}>
        <BudgetPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

async function openSheet() {
  const page = makePage(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  render(page())
  fireEvent.click(await screen.findByRole("button", { name: "Fill from my spending" }))
  return screen.findByRole("dialog", { name: "Fill from my spending" })
}

describe("MOB-R98 B — Fill from my spending", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-05-15T09:00:00"))
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.budgetMetrics.mockResolvedValue({ spent_by_category: {}, range_spent_by_category: {}, avg12_by_category: {} })
    mocks.dashboardMetrics.mockResolvedValue(HISTORY)
    mocks.getBudgets.mockResolvedValue({ items: [], profileContext: null })
    mocks.saveBudgets.mockImplementation(async (_m: string, items: unknown[]) => ({ items, profileContext: null }))
    pageQueries([])
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("is offered on this period and absent once the period is past", async () => {
    // With a budget the page shows the table, and the stub table shows the button whenever it is handed onFill,
    // so this pins the page's own gate. (The empty state's action is replaced wholesale on a past period: C.)
    pageQueries([{ category: "Rent", amount_kd: "300.000" }])
    const page = makePage(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    const { rerender } = render(page())
    expect(await screen.findByRole("button", { name: "Fill from my spending" })).toBeInTheDocument()
    expect(mocks.dashboardMetrics).toHaveBeenCalledWith({ months: 3, until: "2026-04" })

    // The page stays open on 2026-05 while the clock moves two periods on: 2026-05 is now past.
    vi.setSystemTime(new Date("2026-07-15T09:00:00"))
    rerender(page())
    expect(screen.queryByRole("button", { name: "Fill from my spending" })).toBeNull()
    expect(screen.getByText("budget table")).toBeInTheDocument()
  })

  it("shows each row with its suggestion and usual spend, and the total against income", async () => {
    pageQueries([{ category: "Rent", amount_kd: "300.000" }], "1500.000")
    const sheet = await openSheet()

    expect((within(sheet).getByLabelText("Dining budget") as HTMLInputElement).value).toBe("75.000")
    expect((within(sheet).getByLabelText("Groceries budget") as HTMLInputElement).value).toBe("30.000")
    expect((within(sheet).getByLabelText("Transport budget") as HTMLInputElement).value).toBe("15.000")
    expect(within(sheet).getByText("You usually spend KD 63.500")).toBeInTheDocument()
    expect(within(sheet).getByText("You usually spend KD 22.000")).toBeInTheDocument()
    expect(within(sheet).getByText("You usually spend KD 10.000")).toBeInTheDocument()
    expect(within(sheet).getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true)

    // Total = Rent 300.000 saved + 75.000 + 30.000 + 15.000 ticked.
    const summary = within(sheet).getByTestId("fill-summary")
    expect(within(summary).getByText("KD 420.000")).toBeInTheDocument()
    expect(within(summary).getByText("of KD 1,500.000 income")).toBeInTheDocument()
    expect(within(summary).getByText("KD 1,080.000 left each month")).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Add 3 budgets" })).toBeInTheDocument()
  })

  it("does not send an unticked row, and an unreadable ticked amount keeps the sheet open", async () => {
    const sheet = await openSheet()

    fireEvent.change(within(sheet).getByLabelText("Groceries budget"), { target: { value: "abc" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Add 3 budgets" }))
    await Promise.resolve()
    // (The page itself reads the previous month's budgets; the sheet's fresh read is for 2026-05.)
    expect(mocks.getBudgets).not.toHaveBeenCalledWith("2026-05")
    expect(mocks.saveBudgets).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog", { name: "Fill from my spending" })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Groceries" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "Add 2 budgets" }))
    await waitFor(() => expect(mocks.saveBudgets).toHaveBeenCalledTimes(1))
    expect(mocks.saveBudgets).toHaveBeenCalledWith("2026-05", [
      { category: "Dining", amount_kd: "75.000" },
      { category: "Transport", amount_kd: "15.000" },
    ])
  })

  it("sends the period's fresh list unchanged, then the ticked rows as she edited them", async () => {
    // The page's cache shows no budget; the server has Rent.
    mocks.getBudgets.mockResolvedValue({ items: [{ id: 9, month: "2026-05", category: "Rent", amount_kd: "300.000" }], profileContext: null })
    const sheet = await openSheet()

    fireEvent.change(within(sheet).getByLabelText("Dining budget"), { target: { value: "80" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "Add 3 budgets" }))
    await waitFor(() => expect(mocks.saveBudgets).toHaveBeenCalledTimes(1))
    expect(mocks.getBudgets).toHaveBeenCalledWith("2026-05")
    expect(mocks.saveBudgets).toHaveBeenCalledWith("2026-05", [
      { id: 9, month: "2026-05", category: "Rent", amount_kd: "300.000" },
      { category: "Dining", amount_kd: "80.000" },
      { category: "Groceries", amount_kd: "30.000" },
      { category: "Transport", amount_kd: "15.000" },
    ])
  })

  it("does not send a category budgeted between opening the sheet and Add", async () => {
    const sheet = await openSheet()
    mocks.getBudgets.mockResolvedValue({ items: [{ category: "Dining", amount_kd: "60.000" }], profileContext: null })

    fireEvent.click(within(sheet).getByRole("button", { name: "Add 3 budgets" }))
    await waitFor(() => expect(mocks.saveBudgets).toHaveBeenCalledTimes(1))
    expect(mocks.saveBudgets).toHaveBeenCalledWith("2026-05", [
      { category: "Dining", amount_kd: "60.000" },
      { category: "Groceries", amount_kd: "30.000" },
      { category: "Transport", amount_kd: "15.000" },
    ])
  })

  it("the toast counts the rows actually added", async () => {
    const sheet = await openSheet()
    mocks.getBudgets.mockResolvedValue({ items: [{ category: "Dining", amount_kd: "60.000" }], profileContext: null })

    fireEvent.click(within(sheet).getByRole("button", { name: "Add 3 budgets" }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1))
    expect(mocks.toastSuccess).toHaveBeenCalledWith("2 budgets added")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Fill from my spending" })).toBeNull())
  })
})
