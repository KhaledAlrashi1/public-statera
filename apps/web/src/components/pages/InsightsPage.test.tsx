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

  // MOB-R25 Stage 1 — Month Snapshot is removed from view, and so is the safe-to-spend tile
  // inside This Week. Both absences are asserted in the SAME render as the retained This Week
  // contents: absence on its own is equally satisfied by a page that failed to render at all,
  // so the PRESENT half is what makes the ABSENT half evidence rather than a tautology.
  it("removes Month Snapshot and the safe-to-spend tile while This Week stays", async () => {
    mocks.analyticsApi.weeklyDigest.mockResolvedValue({
      week_start: "2026-02-23",
      week_end: "2026-03-01",
      this_week_expense_kd: "45.200",
      last_week_expense_kd: "62.000",
      delta_pct: -27.1,
      top_categories: [{ name: "Food", amount_kd: "18.000" }],
      days_until_payday: 27,
      safe_to_spend_today_kd: "7.590",
      days_observed: 6,
    })

    renderPage()

    // PRESENT first — establishes the page actually rendered before anything is claimed absent.
    // Awaited on "Weekly pace" rather than the "This Week" heading: the heading renders while the
    // digest query is still in flight, so asserting on it would pass during the loading state and
    // let the absence checks below run against a page whose panels had not mounted yet.
    expect(await screen.findByText("Weekly pace")).toBeInTheDocument()
    expect(screen.getByText("This Week")).toBeInTheDocument()
    expect(screen.getByText("Spending delta")).toBeInTheDocument()

    // ABSENT — the Month Snapshot panel, by heading and by its tile labels.
    expect(screen.queryByText("Month Snapshot")).not.toBeInTheDocument()
    expect(screen.queryByText("Free to spend")).not.toBeInTheDocument()
    expect(screen.queryByText("Already spent")).not.toBeInTheDocument()

    // ABSENT — the safe-to-spend tile inside the retained This Week panel.
    expect(screen.queryByText(/Safe-to-spend today/i)).not.toBeInTheDocument()
  })

  // MOB-R27 I-a / I-b — the last two safe-to-spend renders on Insights. I-a's sentence is
  // DROPPED entirely; I-b's feature-naming phrase is replaced inside an otherwise unchanged
  // sentence. Both are asserted in one render against a payload that would have produced the
  // OLD text, so "absent" cannot be satisfied by a story that never rendered — the I-b sentence
  // being present is what proves storyOfMonth ran.
  it("drops the free-to-spend prose from the month story", async () => {
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03", "2026-02"],
      monthly: [],
      expense_by_category: {},
    })
    // committed > 0 and remaining > 0 is exactly the branch that used to emit I-a's sentence.
    mocks.analyticsApi.safeToSpend.mockResolvedValue({
      committed_kd: "50.000",
      remaining_budget_kd: "200.000",
      actual_spend_kd: "10.000",
    })

    renderPage()

    // I-b: present, with the ruled phrase and without the one it replaced.
    expect(
      await screen.findByText(/before what's left for everything else/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/free-to-spend money is calculated/)).not.toBeInTheDocument()
    // I-a: the dropped sentence, in the branch that used to render it.
    expect(screen.queryByText(/free to spend after commitments/)).not.toBeInTheDocument()
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

/**
 * MOB-1 Group 1 — the story-of-the-month pace note.
 *
 * `committed_kd` is budget allocations only (R9, post SC-1/2), and budgets are strictly positive at
 * the database (chk_budgets_amount_positive, migration 0000), so 0 means NO BUDGETS rather than a
 * plan totalling nothing. Clock pinned to 2026-03-15 by the shared beforeEach, so the selected
 * month is 2026-03 and the comparison month 2026-02.
 */
describe("MOB-1 Group 1 — story-of-the-month pace note", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-15"))
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.analyticsApi.recurringPatterns.mockResolvedValue({ patterns: [] })
    mocks.analyticsApi.weeklyDigest.mockResolvedValue(null)
    mocks.analyticsApi.dashboardMetrics.mockResolvedValue({
      months: ["2026-03", "2026-02"],
      monthly: [],
      expense_by_category: {
        "2026-03": { Groceries: "160.000" },
        "2026-02": { Groceries: "100.000" },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("I1 — omits the pace note when there are no budgets, rather than claiming commitments overtake one", async () => {
    mocks.analyticsApi.safeToSpend.mockResolvedValue({
      committed_kd: "0.000",
      remaining_budget_kd: "0.000",
      actual_spend_kd: "160.000",
    })

    renderPage()

    // The story itself must still render — otherwise this passes against a page showing nothing.
    expect(await screen.findByText(/Groceries is 60% higher than last month/)).toBeInTheDocument()
    // WITHOUT the change remainingBudget is 0, the else-arm fires, and the sentence continues
    // "Committed spending is now overtaking the rest of this month's budget."
    expect(screen.queryByText(/Committed spending is now overtaking/)).not.toBeInTheDocument()
  })

  // MOB-R27 I-a — this CONTROL was falsified BY THE RULING, not by a defect. It asserted the
  // "You still have … free to spend after commitments." sentence, and I-a drops that sentence
  // entirely. Its PURPOSE survives and is what is preserved here: prove I1's guard suppresses
  // only the no-budget case rather than silencing the pace note altogether. It is therefore
  // re-pointed at the arm that still renders — commitments real, nothing left over — instead of
  // being deleted, which would have removed the only evidence that I1 is not a blanket mute.
  it("CONTROL — with real commitments the pace note still renders", async () => {
    mocks.analyticsApi.safeToSpend.mockResolvedValue({
      committed_kd: "300.000",
      remaining_budget_kd: "0.000",
      actual_spend_kd: "160.000",
    })

    renderPage()

    expect(
      await screen.findByText(/Committed spending is now overtaking the rest of this month's budget/)
    ).toBeInTheDocument()
    // And the dropped sentence does not come back on this arm either.
    expect(screen.queryByText(/free to spend after commitments/)).not.toBeInTheDocument()
  })
})

