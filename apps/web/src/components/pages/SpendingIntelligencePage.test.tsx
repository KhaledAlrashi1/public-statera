import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import SpendingIntelligencePage from "./SpendingIntelligencePage"

const mocks = vi.hoisted(() => ({
  analyticsApi: {
    spendingIntelligence: vi.fn(),
  },
  navigate: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock("@/lib/recharts", () => {
  const Container = ({ children }: { children?: unknown }) => children ?? null
  const Leaf = () => null
  return {
    BarChart: Container,
    Bar: Leaf,
    CartesianGrid: Leaf,
    Legend: Leaf,
    ResponsiveContainer: Container,
    Tooltip: Container,
    XAxis: Leaf,
    YAxis: Leaf,
  }
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <MemoryRouter initialEntries={["/spending-intelligence"]}>
      <QueryClientProvider client={queryClient}>
        <SpendingIntelligencePage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("SpendingIntelligencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps summary cards in loading state instead of rendering empty-data copy immediately", () => {
    mocks.analyticsApi.spendingIntelligence.mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getByText("Lead merchant")).toBeInTheDocument()
    expect(screen.queryByText("No merchant data")).not.toBeInTheDocument()
    expect(screen.queryByText("No month-over-month movement")).not.toBeInTheDocument()
  })

  it("shows a retry alert on fatal load failure without falling back to empty-data copy", async () => {
    mocks.analyticsApi.spendingIntelligence.mockRejectedValue(new Error("Backend offline"))

    renderPage()

    expect(await screen.findByText("Insights unavailable")).toBeInTheDocument()
    expect(screen.getByText(/Backend offline/i)).toBeInTheDocument()
    expect(screen.queryByText("No merchant data")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry insights" }))

    await waitFor(() => {
      expect(mocks.analyticsApi.spendingIntelligence).toHaveBeenCalledTimes(2)
    })
  })

  it("shows a page-level empty state with CTA when no spending intelligence data exists yet", async () => {
    mocks.analyticsApi.spendingIntelligence.mockResolvedValue({
      month: "2026-03",
      prev_month: "2026-02",
      top_merchants: [],
      category_benchmarks: [],
      category_deltas: [],
      recurring_bills: [],
    })

    renderPage()

    expect(await screen.findByText("No spending patterns yet")).toBeInTheDocument()
    expect(screen.queryByText("No merchant data")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Review transactions" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/activity?type=all")
  })
})
