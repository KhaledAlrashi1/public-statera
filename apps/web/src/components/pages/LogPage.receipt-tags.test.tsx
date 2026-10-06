// MOB-R70 E4 / F3 — /log's line tags: Amount and Category say "Required" while empty, the FIRST
// missing one says "Next" instead (Category when a place is chosen and Category is empty, else
// Amount, else Category), Place and What for say "Optional", and a filled line says nothing.
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

const line = (label: RegExp) => screen.getByRole("button", { name: label })
const tagOf = (label: RegExp) => {
  const text = line(label).textContent ?? ""
  return ["Next", "Required", "Optional"].find((t) => text.endsWith(t)) ?? null
}
const tags = () => ({
  amount: tagOf(/^Amount/),
  category: tagOf(/^Category/),
  place: tagOf(/^Place/),
  what: tagOf(/^What for/),
  date: tagOf(/^Date/),
})

describe("/log line tags (MOB-R70 E4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 2 }])
  })

  it("with nothing filled: Amount is Next, Category Required, Place and What for Optional, Date none", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^Amount/ })
    expect(tags()).toEqual({ amount: "Next", category: "Required", place: "Optional", what: "Optional", date: null })
  })

  it("a chosen place with no category moves Next to Category, ahead of the missing Amount", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search places" }), { target: { value: "Bakery" } })
    fireEvent.click(screen.getByRole("button", { name: "Add “Bakery” as a new place" }))
    expect(tags()).toEqual({ amount: "Required", category: "Next", place: null, what: "Optional", date: null })
  })

  it("a valid amount moves Next to Category; once both are filled no line carries a tag but the optional ones", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Amount/ }))
    fireEvent.click(screen.getByRole("button", { name: "5" }))
    expect(tags()).toEqual({ amount: null, category: "Next", place: "Optional", what: "Optional", date: null })
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }))
    const picker = screen.getByRole("group", { name: "Category" })
    fireEvent.click(await within(picker).findByRole("button", { name: "Coffee" }))
    expect(tags()).toEqual({ amount: null, category: null, place: "Optional", what: "Optional", date: null })
  })
})
