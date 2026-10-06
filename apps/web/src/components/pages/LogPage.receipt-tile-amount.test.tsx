// MOB-R71 C7 / E4 — the amount a tile shows and fills, in this order: the place's last_amount
// (MOB-R70 D); if absent or null, its TOP item's amount (the first item, not any later one); else no
// amount. Popular in Kuwait tiles never show an amount (covered in LogPage.receipt-popular.test.tsx).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
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

const items = [
  { name: "Latte", category: "Coffee", amount_kd: "1.750" },
  { name: "Americano", category: "Coffee", amount_kd: "1.250" },
]

describe("/log tile amount, in order (MOB-R71 C7)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.categoriesList.mockResolvedValue([])
    mocks.logSuggestions.mockResolvedValue([
      // last_amount wins over the top item, even when it matches no item.
      { name: "PICK", category: "Coffee", count: 3, items, last_amount: "2.100", last_used: "2026-10-04" },
      // null last_amount: the top item's amount (1.750), never a later item's.
      { name: "Caribou", category: "Coffee", count: 2, items, last_amount: null, last_used: null },
      // nothing to show.
      { name: "Oula", category: "Fuel", count: 1, items: [], last_amount: null, last_used: null },
    ])
  })

  it("shows last_amount, else the top item's amount, else none — and a tap fills that amount", async () => {
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const pick = await screen.findByRole("button", { name: /^PICK/ })
    expect(pick).toHaveTextContent("KD 2.100")
    expect(pick).not.toHaveTextContent("KD 1.750")
    const caribou = screen.getByRole("button", { name: /^Caribou/ })
    expect(caribou).toHaveTextContent("KD 1.750")
    expect(caribou).not.toHaveTextContent("KD 1.250")
    expect(screen.getByRole("button", { name: /^Oula/ })).not.toHaveTextContent("KD")
    fireEvent.click(pick)
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("KD 2.100")
  })
})
