// MOB-R75 D, P3 — saved income is not counted: Insights counts a month toward its 3-month readiness
// by its EXPENSES only. The harness is copied from InsightsPage.test.tsx (an existing file, unedited).
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

describe("InsightsPage — logged income not counted (MOB-R75 P3)", () => {
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

  it("months holding only logged income do not count toward the 3 months Insights needs", async () => {
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03", "2026-02", "2026-01", "2025-12"],
      monthly: [
        { month: "2025-12", income_kd: "500.000", expense_kd: "0.000" },
        { month: "2026-01", income_kd: "500.000", expense_kd: "0.000" },
        { month: "2026-02", income_kd: "500.000", expense_kd: "0.000" },
        { month: "2026-03", income_kd: "0.000", expense_kd: "120.000" },
      ],
      expense_by_category: {},
    })
    renderPage()
    expect(await screen.findByText(/most insights need 3\+ months of data/)).toBeInTheDocument()
  })
})
