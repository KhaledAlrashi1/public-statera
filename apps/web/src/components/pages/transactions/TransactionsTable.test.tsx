import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import TransactionsTable from "./TransactionsTable"

const mocks = vi.hoisted(() => ({
  transactionsApi: {
    search: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  transactionsApi: mocks.transactionsApi,
}))

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionsTable
        categories={["Groceries"]}
        merchants={["Market"]}
        onEdit={vi.fn()}
        refreshSignal={0}
      />
    </QueryClientProvider>
  )
}

describe("TransactionsTable", () => {
  it("shows an empty-state CTA when there are no transactions yet", async () => {
    mocks.transactionsApi.search.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
      has_more: false,
    })

    const onImport = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionsTable
          categories={["Groceries"]}
          merchants={["Market"]}
          onEdit={vi.fn()}
          onImport={onImport}
          refreshSignal={0}
        />
      </QueryClientProvider>
    )

    expect(await screen.findAllByText("No transactions yet")).toHaveLength(2)
    fireEvent.click(screen.getAllByRole("button", { name: "Import from file" })[0])
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it("shows an inline error and skips search when the date range is inverted", async () => {
    mocks.transactionsApi.search.mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
      has_more: false,
    })

    renderTable()

    await waitFor(() => {
      expect(mocks.transactionsApi.search.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.change(screen.getByTitle("From date"), { target: { value: "2026-02-10" } })

    await waitFor(() => {
      expect(
        mocks.transactionsApi.search.mock.calls.some(
          ([params]: [{ date_from?: string; date_to?: string }]) =>
            params.date_from === "2026-02-10" && params.date_to === undefined
        )
      ).toBe(true)
    })

    fireEvent.change(screen.getByTitle("To date"), { target: { value: "2026-02-01" } })

    expect(await screen.findByText("Start date must be on or before end date.")).toBeInTheDocument()
    expect(
      mocks.transactionsApi.search.mock.calls.some(
        ([params]: [{ date_from?: string; date_to?: string }]) =>
          params.date_from === "2026-02-10" && params.date_to === "2026-02-01"
      )
    ).toBe(false)

    fireEvent.change(screen.getByTitle("To date"), { target: { value: "2026-02-12" } })

    await waitFor(() => {
      expect(
        mocks.transactionsApi.search.mock.calls.some(
          ([params]: [{ date_from?: string; date_to?: string }]) =>
            params.date_from === "2026-02-10" && params.date_to === "2026-02-12"
        )
      ).toBe(true)
    })
  })

  it("does not render a row-level delete button for income transactions", async () => {
    mocks.transactionsApi.search.mockResolvedValue({
      items: [
        {
          id: 11,
          date: "2026-02-10",
          merchant: null,
          category: "Income Salary",
          name: "Salary",
          memo: null,
          amount_kd: "1200.000",
        },
      ],
      total: 1,
      offset: 0,
      limit: 20,
      has_more: false,
    })

    renderTable()

    expect(await screen.findAllByText("Salary")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2)
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("renders a retryable inline error when the activity query fails", async () => {
    mocks.transactionsApi.search
      .mockRejectedValueOnce(new Error("Transactions offline"))
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        offset: 0,
        limit: 20,
        has_more: false,
      })

    renderTable()

    expect(await screen.findByText("Activity unavailable")).toBeInTheDocument()
    expect(screen.getByText("Transactions offline")).toBeInTheDocument()
    const callsBeforeRetry = mocks.transactionsApi.search.mock.calls.length

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(mocks.transactionsApi.search.mock.calls.length).toBeGreaterThan(callsBeforeRetry)
    })
  })
})

/**
 * MOB-1 Part 5 — the mobile card row.
 *
 * The card rendered the category TWICE (as plain text beside the date, and again as a
 * CategoryBadge below), and emitted the separator bullet unconditionally so an uncategorised row
 * showed a bullet with nothing after it. The desktop table renders the category once and has no
 * bullet, so both defects were mobile-card-only.
 *
 * Both layouts are in the DOM under jsdom (they are separated by CSS, which jsdom does not apply),
 * so the category count below is card + table.
 */
describe("MOB-1 Part 5 — mobile card row", () => {
  const oneRow = {
    items: [
      {
        id: 11,
        date: "2026-02-10",
        name: "Market run",
        category: "Groceries",
        merchant: "Market",
        amount_kd: "12.500",
        memo: null,
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
    has_more: false,
  }

  it("renders the category ONCE per layout, not twice in the card", async () => {
    mocks.transactionsApi.search.mockResolvedValue(oneRow)
    renderTable()
    await screen.findAllByText("Groceries")
    // WITHOUT the change this is 3: the card's plain text, the card's badge, and the table's badge.
    expect(screen.getAllByText("Groceries")).toHaveLength(2)
  })

  it("emits no orphaned separator bullet", async () => {
    mocks.transactionsApi.search.mockResolvedValue(oneRow)
    const { container } = renderTable()
    await screen.findAllByText("Groceries")
    // WITHOUT the change this bullet renders between the date and the duplicated category, and
    // renders with nothing after it when a row has no category at all.
    expect(container.querySelector(".h-1.w-1.rounded-full.bg-border")).toBeNull()
  })
})

