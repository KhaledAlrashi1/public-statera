// MOB-R86 D2 — /log?layout=1 shows the layout readout over the real /log; without the parameter there is none.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe("/log layout readout (MOB-R86 D2)", () => {
  it("shows the readout with ?layout=1, over the real /log", () => {
    renderAt("/log?layout=1")
    const readout = screen.getByTestId("log-layout-readout")
    expect(readout).toHaveTextContent("innerHeight")
    expect(readout).toHaveTextContent("scrollingElement.scrollHeight")
    expect(readout).toHaveTextContent("display-mode standalone")
    expect(readout).toHaveTextContent("strip none")
    expect(screen.getByRole("heading", { name: "New expense" })).toBeInTheDocument()
  })

  it("renders no readout without the parameter", () => {
    renderAt("/log")
    expect(screen.queryByTestId("log-layout-readout")).toBeNull()
    expect(screen.getByRole("heading", { name: "New expense" })).toBeInTheDocument()
  })
})
