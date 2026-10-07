// MOB-R88 B7 — when Activity's search fails, the panel says "Search isn't working right now." with Retry; the
// server's text (here MySQL's raw syntax error) never reaches the screen, and no "No matches" sits beside it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import TransactionsTable from "./TransactionsTable"

const SERVER_TEXT = "You have an error in your SQL syntax; check the manual near '\\' or `merchants`.`name` LIKE ? ESCAPE '\\'))"
const mocks = vi.hoisted(() => ({ transactionsApi: { search: vi.fn(), get: vi.fn() } }))
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return { ApiError: actual.ApiError, transactionsApi: mocks.transactionsApi }
})

describe("Activity search failure (MOB-R88 B7)", () => {
  it("shows the plain message and Retry, never the server's text, and no count chip", async () => {
    mocks.transactionsApi.search.mockImplementation(async (params: { q?: string }) => {
      if (params.q) throw new ApiError(SERVER_TEXT, 500)
      return { items: [], total: 0, offset: 0, limit: 20, has_more: false }
    })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TransactionsTable categories={[]} merchants={[]} onEdit={vi.fn()} refreshSignal={0} transactionType="all"
          selectedIds={new Set()} onToggleSelect={vi.fn()} onSelectAll={vi.fn()} selecting={false} />
      </QueryClientProvider>,
    )
    fireEvent.change(await screen.findByPlaceholderText("Search activity..."), { target: { value: "A" } })
    expect(await screen.findByText("Search isn't working right now.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
    expect(screen.queryByText(/SQL syntax/)).toBeNull()
    expect(screen.queryByText("No matches")).toBeNull()
  })
})
