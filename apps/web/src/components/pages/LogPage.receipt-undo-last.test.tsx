// MOB-R71 C1 / E4 — after the save moment resets, a quiet "Undo last" stays on the form until the
// next save or until she leaves /log. It deletes only the row this page created last (MOB-R53), and
// goes away once used. A failed attempt says the entry is still saved and keeps it (MOB-R56 D4).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage, { SAVE_MOMENT_MS } from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn(), remove: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: mocks.remove },
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

describe("/log Undo last (MOB-R71 C1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    mocks.logSuggestions.mockResolvedValue([{ name: "PICK", category: "Coffee", count: 1, items: [{ name: "Americano", category: "Coffee", amount_kd: "1.250" }] }])
    mocks.categoriesList.mockResolvedValue([])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 31 } }, error: null, meta: {} })
    mocks.remove.mockResolvedValue({ ok: true, data: { deleted: true }, error: null, meta: {} })
  })

  it("is absent before a save; after the moment resets on its own it stays, and once used it goes", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    expect(screen.queryByRole("button", { name: "Undo last" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
    await screen.findByTestId("log-save-moment")
    // The moment resets by itself after about 2.6 s; nothing is tapped.
    const undoLast = await screen.findByRole("button", { name: "Undo last" }, { timeout: SAVE_MOMENT_MS + 1500 })
    expect(screen.queryByTestId("log-save-moment")).toBeNull()
    fireEvent.click(undoLast)
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(31))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo last" })).toBeNull())
  }, 8000)

  it("a failed Undo last says the entry is still saved and stays available", async () => {
    mocks.remove.mockRejectedValue(new Error("network down"))
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Log another" }))
    fireEvent.click(screen.getByRole("button", { name: "Undo last" }))
    expect(await screen.findByText("Couldn't undo. The entry is still saved.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Undo last" })).toBeInTheDocument()
  })
})
