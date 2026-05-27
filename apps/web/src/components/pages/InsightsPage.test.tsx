import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import InsightsPage from "./InsightsPage"

const mocks = vi.hoisted(() => ({
  analyticsApi: {
    recurringPatterns: vi.fn(),
    dashboardMetrics: vi.fn(),
    safeToSpend: vi.fn(),
    weeklyDigest: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  analyticsApi: mocks.analyticsApi,
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 7,
      email: "insights@example.com",
      first_name: "Noor",
      last_name: "Test",
      display_name: "Noor Test",
      totp_enabled: false,
      created_at: "2026-03-10T00:00:00Z",
    },
  }),
}))

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  function SelectItem(_props: { value: string; children: React.ReactNode }) {
    return null
  }

  function SelectTrigger(_props: { children?: React.ReactNode; "aria-label"?: string; disabled?: boolean }) {
    return null
  }

  function collectOptions(
    nodes: React.ReactNode,
    refs: {
      options: Array<{ value: string; label: React.ReactNode }>
      triggerProps: { "aria-label"?: string; disabled?: boolean }
    }
  ) {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      if (child.type === SelectItem) {
        refs.options.push({ value: child.props.value, label: child.props.children })
      }
      if (child.type === SelectTrigger) {
        refs.triggerProps = {
          "aria-label": child.props["aria-label"],
          disabled: child.props.disabled,
        }
      }
      if (child.props?.children) {
        collectOptions(child.props.children, refs)
      }
    })
  }

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) {
    const refs = {
      options: [] as Array<{ value: string; label: React.ReactNode }>,
      triggerProps: {} as { "aria-label"?: string; disabled?: boolean },
    }
    collectOptions(children, refs)
    return (
      <div
        aria-label={refs.triggerProps["aria-label"]}
        data-current-value={value}
      >
        {refs.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            disabled={refs.triggerProps.disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  }

  return {
    Select,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
  }
})

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={["/insights"]}>
      <QueryClientProvider client={queryClient}>
        <InsightsPage />
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("InsightsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-15"))
    vi.clearAllMocks()
    window.localStorage.clear()
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    })
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    })

    mocks.analyticsApi.recurringPatterns.mockResolvedValue({
      patterns: [
        {
          name: "Netflix",
          avg_amount_kd: "4.500",
          last_seen: "2026-03-05",
          group: "Subscriptions",
        },
      ],
    })
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03", "2026-02"],
      monthly: [],
      expense_by_category: {},
    })
    mocks.analyticsApi.safeToSpend.mockResolvedValue({
      committed_kd: "50.000",
      remaining_budget_kd: "200.000",
      actual_spend_kd: "100.000",
    })
    mocks.analyticsApi.weeklyDigest.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("persists dismissed recurring commitments per user across revisits", async () => {
    const firstRender = renderPage()

    expect(await screen.findByText("Netflix")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Netflix as non-recurring" }))

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).not.toBeInTheDocument()
    })

    const stored = window.localStorage.getItem("insights-recurring-dismissals:7")
    expect(stored).toContain("netflix")

    firstRender.unmount()
    renderPage()

    await waitFor(() => {
      expect(screen.queryByText("Netflix")).not.toBeInTheDocument()
    })
  })

  it("updates month-scoped insights when a prior month is selected", async () => {
    renderPage()

    await waitFor(() => {
      expect(mocks.analyticsApi.safeToSpend).toHaveBeenCalledWith("2026-03")
    })

    fireEvent.click(await screen.findByRole("button", { name: "2026-02" }))

    await waitFor(() => {
      expect(mocks.analyticsApi.safeToSpend).toHaveBeenCalledWith("2026-02")
    })
  })

  it("shows an empty-state CTA when there is no insight data yet", async () => {
    mocks.analyticsApi.recurringPatterns.mockResolvedValue({
      patterns: [],
    })
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03"],
      monthly: [],
      expense_by_category: {},
    })
    mocks.analyticsApi.safeToSpend.mockResolvedValue({
      committed_kd: "0.000",
      remaining_budget_kd: "0.000",
      actual_spend_kd: "0.000",
    })
    mocks.analyticsApi.weeklyDigest.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText("No insights yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import activity" })).toBeInTheDocument()
  })

})
