// MOB-R83 C4 — the category Add button reads "Add “X” as a new category" with the + icon, and no literal "+",
// matching the place Add button.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn() }))
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

describe("/log category Add label (MOB-R83 C4)", () => {
  it("reads Add “X” as a new category, with the + icon and no literal +", async () => {
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Bakery", kind: "expense", transaction_count: 1 }])
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole("button", { name: /^Category/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Find a category" }), { target: { value: "Pets" } })
    const add = screen.getByRole("button", { name: "Add “Pets” as a new category" })
    expect(add.querySelector("svg")).not.toBeNull()
    expect(add.textContent).not.toContain("+")
  })
})
