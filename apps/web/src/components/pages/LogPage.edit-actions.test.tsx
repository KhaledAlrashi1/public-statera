// MOB-R88 E — the edit screen's actions card: "Split this expense" then "Delete expense" as whole rows under the
// fields (Delete runs today's 6-second deferred delete with Undo), and no subtitle while editing.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { get: mocks.get, update: vi.fn(), delete: mocks.del, logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn() },
    categoriesApi: { list: vi.fn().mockResolvedValue([{ id: 1, name: "Groceries", kind: "expense", transaction_count: 2 }]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("./transactions/dialogs", () => ({ SplitTransactionDialog: () => null }))

import LogPage from "./LogPage"

const ROW = { id: 7, date: "2025-03-03", name: "Weekly groceries", merchant: "Lulu", category: "Groceries", amount_kd: "46.700", memo: "keep me", category_counts_as_income: false }
const SUBTITLE = "Amount and category are all you need."

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
          <Route path="/activity" element={<p>Activity page</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({ ok: true, data: { item: ROW } })
  mocks.del.mockResolvedValue({ ok: true, data: { deleted: true } })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("/log edit actions card (MOB-R88 E)", () => {
  it("lists Split this expense, then Delete expense, as rows in their own card", async () => {
    renderAt("/log?edit=7")
    const card = await screen.findByRole("region", { name: "Actions" })
    await waitFor(() => expect(within(card).getAllByRole("button").every((b) => !(b as HTMLButtonElement).disabled)).toBe(true))
    expect(within(card).getAllByRole("button").map((b) => b.textContent)).toEqual(["Split this expense", "Delete expense"])
  })

  it("the Delete row runs today's deferred delete: Undo toast, DELETE after 6 seconds, no confirm", async () => {
    renderAt("/log?edit=7")
    const del = await screen.findByRole("button", { name: "Delete expense" })
    await waitFor(() => expect(del).not.toBeDisabled())
    vi.useFakeTimers()
    fireEvent.click(del)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith("Transaction deleted.", expect.objectContaining({ label: "Undo" }))
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })
    expect(mocks.del).toHaveBeenCalledWith(7)
  })

  it("shows no subtitle while editing, and the subtitle on New expense", async () => {
    renderAt("/log?edit=7")
    expect(await screen.findByRole("heading", { level: 1, name: "Edit expense" })).toBeInTheDocument()
    expect(screen.queryByText(SUBTITLE)).toBeNull()
    cleanup()
    renderAt("/log")
    expect(await screen.findByText(SUBTITLE)).toBeInTheDocument()
  })
})
