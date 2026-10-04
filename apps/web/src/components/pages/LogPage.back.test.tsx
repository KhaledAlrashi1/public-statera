// MOB-R61 D3 — /log's way back: Back returns to the screen the user came from, and a /log opened
// directly (no in-app history entry) goes Home instead of leaving the app.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({
  logSuggestions: vi.fn(),
  categoriesList: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: vi.fn(), delete: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: vi.fn() },
  }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function renderHistory(entries: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<div>home page</div>} />
          <Route path="/plan" element={<div>plan page</div>} />
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe("/log back control (MOB-R61 D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([])
  })

  it("returns to where the user came from, or Home when opened directly", async () => {
    renderHistory(["/plan", "/log"])
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    expect(await screen.findByText("plan page")).toBeInTheDocument()

    cleanup()
    renderHistory(["/log"])
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    expect(await screen.findByText("home page")).toBeInTheDocument()
  })
})
