import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import IncomePage from "./IncomePage"

const mocks = vi.hoisted(() => ({
  analyticsApi: {
    dashboardMetrics: vi.fn(),
  },
  transactionsApi: {
    search: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    dupCheck: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
  transactionsApi: mocks.transactionsApi,
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock("@/lib/recharts", () => {
  const Container = ({ children }: { children?: unknown }) => children ?? null
  const Leaf = () => null
  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    Bar: Leaf,
    CartesianGrid: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Container,
  }
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <IncomePage />
    </QueryClientProvider>
  )
}

describe("IncomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03"],
      monthly: [],
      expense_by_category: {},
    })
    mocks.transactionsApi.search.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
      has_more: false,
    })
    mocks.transactionsApi.delete.mockResolvedValue(undefined)
    mocks.transactionsApi.create.mockResolvedValue({ ok: true })
    mocks.transactionsApi.dupCheck.mockResolvedValue({ count: 0 })
  })

  it("shows a page-level empty state when no income has been recorded yet", async () => {
    renderPage()

    expect(await screen.findByText("Add your first income source")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Add Income" }).length).toBeGreaterThan(0)
  })
})
