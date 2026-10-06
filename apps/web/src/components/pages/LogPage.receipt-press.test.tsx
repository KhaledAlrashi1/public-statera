// MOB-R71 C3 / E4 — a place picked on pointer down ignores only the click from THAT SAME PRESS; the
// next pointerdown clears it, with no timer. So a category tapped right after the pick applies — even
// when the pick's own click never arrived (it can land on nothing once the layout moves).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

describe("/log pointer-down pick (MOB-R71 C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([{ name: "Talabat", category: "Food Delivery", count: 1, items: [] }])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Bakery", kind: "expense", transaction_count: 3 }])
  })

  it("a new place picked on pointer down, then an immediate category tap, applies both", async () => {
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search places" }), { target: { value: "Bread Co" } })
    // Press 1: the pick, on pointer down. Its own click never arrives.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Add “Bread Co” as a new place" }), { button: 0 })
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Bread Co")
    // Press 2, straight after: a category chip in the picker the pick opened.
    const chip = await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Bakery" })
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.click(chip)
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveTextContent("Bakery")
  })
})
