// MOB-R73 E2 — "never overwrite what she chose" (operator selection D1: everywhere). Each of amount,
// category, place and what for remembers its source: hers (typed or picked by her) or suggested (a
// tile, a Popular tile, place memory, an item chip). A suggestion fills a field only when it is
// empty or still holds a suggestion — never a field she set. The date is never set by a suggestion.
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

const PLACES = [
  { name: "PICK", category: "Coffee", count: 3, items: [{ name: "Americano", category: "Coffee", amount_kd: "1.250" }], last_amount: "1.250", last_used: "2026-10-05" },
  { name: "Talabat", category: "Food Delivery", count: 2, items: [{ name: "Dinner", category: "Food Delivery", amount_kd: "6.000" }], last_amount: "6.000", last_used: "2026-10-04" },
]

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
const pickHerCategory = async (name: string) => {
  fireEvent.click(line(/^Category/))
  fireEvent.click(await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name }))
}
const typeHerAmount = (digits: string) => {
  if (line(/^Amount/).getAttribute("aria-expanded") !== "true") fireEvent.click(line(/^Amount/))
  for (const d of digits) fireEvent.click(screen.getByRole("button", { name: d }))
}

describe("/log never overwrites her choices (MOB-R73 E2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue(PLACES)
    mocks.categoriesList.mockResolvedValue([
      { id: 1, name: "Gifts", kind: "expense", transaction_count: 4 },
      { id: 2, name: "Coffee", kind: "expense", transaction_count: 3 },
    ])
  })

  it("her category survives picking a place from search", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^PICK/ })
    await pickHerCategory("Gifts")
    fireEvent.click(line(/^Place/))
    fireEvent.click(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^Talabat/ }))
    expect(line(/^Place/)).toHaveTextContent("Talabat")
    expect(line(/^Category/)).toHaveTextContent("Gifts")
  })

  it("her category survives a tile tap", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^PICK/ })
    await pickHerCategory("Gifts")
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    expect(line(/^Place/)).toHaveTextContent("PICK")
    expect(line(/^Category/)).toHaveTextContent("Gifts")
  })

  it("her amount survives a tile tap", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^PICK/ })
    typeHerAmount("7")
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    expect(line(/^Amount/)).toHaveTextContent("KD 7.000")
    expect(line(/^Category/)).toHaveTextContent("Coffee") // empty, so the tile still fills it
  })

  it("her amount survives an item chip", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^PICK/ })
    typeHerAmount("9")
    fireEvent.click(line(/^Place/))
    fireEvent.click(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^PICK/ }))
    fireEvent.click(line(/^What for/))
    fireEvent.click(screen.getByRole("button", { name: "Americano · KD 1.250" }))
    expect(line(/^What for/)).toHaveTextContent("Americano")
    expect(line(/^Amount/)).toHaveTextContent("KD 9.000")
  })

  it("a suggestion still replaces a suggestion: a second tile replaces the first tile's fields", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Talabat/ }))
    expect(line(/^Place/)).toHaveTextContent("Talabat")
    expect(line(/^Category/)).toHaveTextContent("Food Delivery")
    expect(line(/^Amount/)).toHaveTextContent("KD 6.000")
  })
})
