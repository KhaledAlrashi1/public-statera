// MOB-R59 D1/E9 (provisional, RM-26) — /log's category picker offers the generic "Savings &
// investing" entry, and hides it once the user owns a savings-kind category (the server's kind).
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

async function pickerChips(categories: unknown[]) {
  mocks.categoriesList.mockResolvedValue(categories)
  render(
    <MemoryRouter initialEntries={["/log"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole("button", { name: "Category" }))
  const dialog = await screen.findByRole("dialog", { name: "Find a category" })
  // The user's own row is listed once the categories have loaded.
  await within(dialog).findByRole("button", { name: "Groceries" })
  return within(dialog).getAllByRole("button").map((b) => b.textContent)
}

describe("/log category picker — generic savings entry (MOB-R59 E9)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
  })

  it("offers Savings & investing to a user without a savings-kind category", async () => {
    const chips = await pickerChips([{ id: 1, name: "Groceries", kind: "expense" }])
    expect(chips).toContain("Savings & investing")
  })

  it("hides it when the user owns a savings-kind category", async () => {
    const chips = await pickerChips([
      { id: 1, name: "Groceries", kind: "expense" },
      { id: 2, name: "Investing", kind: "savings" },
    ])
    expect(chips).not.toContain("Savings & investing")
    expect(chips).toContain("Investing")
  })
})
