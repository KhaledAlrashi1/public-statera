// MOB-R74 G (E2b, operator selection G1) — a tile tap is her choice of place. It sets the place to
// the tile's place (her places or Popular), keeps every other field she set herself, fills only empty
// or suggested fields from the tile, and never changes the date.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  { name: "Starbucks", category: "Coffee", count: 3, items: [{ name: "Latte", category: "Coffee", amount_kd: "1.900" }], last_amount: "1.900", last_used: "2026-10-05" },
  { name: "Talabat", category: "Food Delivery", count: 2, items: [], last_amount: null, last_used: null },
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

describe("/log a tile tap is her choice of place (MOB-R74 G)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0))
    mocks.logSuggestions.mockResolvedValue(PLACES)
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Gifts", kind: "expense", transaction_count: 4 }])
  })
  afterEach(() => vi.useRealTimers())

  it("she picked Talabat, then taps Starbucks: the place becomes Starbucks and her category stays", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^Starbucks/ })
    fireEvent.click(line(/^Category/))
    fireEvent.click(await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Gifts" }))
    fireEvent.click(line(/^Place/))
    fireEvent.click(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^Talabat/ }))
    expect(line(/^Place/)).toHaveTextContent("Talabat")
    fireEvent.click(screen.getByRole("button", { name: /^Starbucks/ }))
    expect(line(/^Place/)).toHaveTextContent("Starbucks")
    expect(line(/^Category/)).toHaveTextContent("Gifts")
    expect(line(/^Amount/)).toHaveTextContent("KD 1.900") // empty, so the tile fills it
  })

  it("a Popular tile replaces the place but keeps the category she picked", async () => {
    mocks.logSuggestions.mockResolvedValue([])
    renderLog()
    await screen.findByText("Popular in Kuwait")
    fireEvent.click(line(/^Category/))
    fireEvent.click(await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Gifts" }))
    fireEvent.click(screen.getByRole("button", { name: /^Oula/ }))
    expect(line(/^Place/)).toHaveTextContent("Oula")
    expect(line(/^Category/)).toHaveTextContent("Gifts") // not Oula's Fuel
  })

  it("a tile tap never changes the date", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^Starbucks/ })
    fireEvent.click(line(/^Date/))
    fireEvent.click(within(screen.getByRole("group", { name: "Date" })).getByRole("button", { name: "Sat 3 Oct" }))
    fireEvent.click(screen.getByRole("button", { name: /^Starbucks/ }))
    expect(line(/^Date/)).toHaveTextContent("Sat 3 Oct")
  })
})
