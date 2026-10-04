// MOB-R56 D4 — a failed Undo says the entry is still saved (S16), never S14's "Couldn't save",
// which would tell her the entry is gone when it is not. Own file: LogPage.test.tsx is existing.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({
  logSuggestions: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  categoriesList: vi.fn(),
}))

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

describe("/log — failed Undo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.logSuggestions.mockResolvedValue([{ name: "PICK", category: "Coffee", count: 1, items: [] }])
    mocks.categoriesList.mockResolvedValue([])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 11 } }, error: null, meta: {} })
    mocks.remove.mockRejectedValue(new Error("network down"))
  })

  it("says the entry is still saved, and keeps Undo available", async () => {
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: "4" }))
    fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole("button", { name: "Undo last" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(11))
    // WITHOUT the change this reads "Couldn't save. Check your connection and try again." (S14).
    expect(await screen.findByText("Couldn't undo. The entry is still saved.")).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't save/)).toBeNull()
    expect(screen.getByRole("button", { name: "Undo last" })).toBeInTheDocument()
  })
})
