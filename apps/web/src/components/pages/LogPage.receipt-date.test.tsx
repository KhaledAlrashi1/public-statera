// MOB-R70 E5 / F3 — /log's Date line: Statera's own chips, "Today", "Yesterday", then the 12 days
// before as "Sat 3 Oct". A tap applies at once and closes; there is no confirm step; no future day.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function renderLog() {
  render(
    <MemoryRouter initialEntries={["/log"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe("/log date chips (MOB-R70 E5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Monday 5 October 2026, local noon. Only Date is faked, so timers and promises run normally.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0))
    mocks.logSuggestions.mockResolvedValue([{ name: "PICK", category: "Coffee", count: 1, items: [{ name: "Americano", category: "Coffee", amount_kd: "1.250" }] }])
    mocks.categoriesList.mockResolvedValue([])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
  })
  afterEach(() => vi.useRealTimers())

  it("offers Today, Yesterday and the 12 days before, newest first, and nothing later than today", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Date/ }))
    const picker = screen.getByRole("group", { name: "Date" })
    const labels = within(picker).getAllByRole("button").map((b) => b.textContent)
    expect(labels).toEqual([
      "Today", "Yesterday", "Sat 3 Oct", "Fri 2 Oct", "Thu 1 Oct", "Wed 30 Sep", "Tue 29 Sep",
      "Mon 28 Sep", "Sun 27 Sep", "Sat 26 Sep", "Fri 25 Sep", "Thu 24 Sep", "Wed 23 Sep", "Tue 22 Sep",
    ])
    expect(within(picker).getByLabelText("Earlier date")).toHaveAttribute("max", "2026-10-05")
  })

  it("a chip applies at once and closes — no confirm — and the entry saves on that day", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Date/ }))
    fireEvent.click(within(screen.getByRole("group", { name: "Date" })).getByRole("button", { name: "Sat 3 Oct" }))
    expect(screen.queryByRole("group", { name: "Date" })).toBeNull()
    expect(screen.getByRole("button", { name: /^Date/ })).toHaveTextContent("Sat 3 Oct")
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].date).toBe("2026-10-03")
  })
})
