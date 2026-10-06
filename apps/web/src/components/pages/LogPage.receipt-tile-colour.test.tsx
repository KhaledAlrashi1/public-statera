// MOB-R74 H (E7b, operator selection H1 option (b)) — colour means her places. Popular in Kuwait tiles
// get a neutral square; her place tiles (at most four) take colours from chart-3 to chart-7, never two
// the same, and a place keeps its colour when the tiles reorder.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage, { assignTileColours, POPULAR_TILE_SQUARE, TILE_COLOURS } from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: vi.fn(), delete: vi.fn() },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

// "Pick", "Starbucks" and "Oula" all hash to the same preferred colour (chart-4).
const COLLIDING = ["Pick", "Starbucks", "Oula", "Talabat"]

const squareFill = (el: Element) => [...el.classList].find((c) => c.startsWith("bg-")) ?? ""

describe("/log tile colours (MOB-R74 H)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("her four visible places never share a colour, and keep their colours when reordered", () => {
    const a = assignTileColours(COLLIDING)
    expect(new Set(a.values()).size).toBe(4)
    for (const c of a.values()) expect(TILE_COLOURS).toContain(c)
    const reordered = assignTileColours([...COLLIDING].reverse())
    for (const name of COLLIDING) expect(reordered.get(name)).toBe(a.get(name))
  })

  it("Popular in Kuwait tiles get the neutral square; her place tiles get distinct colours", async () => {
    mocks.logSuggestions.mockResolvedValue([])
    const { unmount } = render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes><Route path="/log" element={<LogPage />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText("Popular in Kuwait")
    const popular = screen.getAllByTestId("log-tile-square")
    expect(popular).toHaveLength(6)
    for (const sq of popular) expect(sq).toHaveClass(...POPULAR_TILE_SQUARE.split(" "))
    unmount()

    mocks.logSuggestions.mockResolvedValue(COLLIDING.map((name) => ({ name, category: "Coffee", count: 1, items: [], last_amount: null, last_used: null })))
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes><Route path="/log" element={<LogPage />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText("Repeat in two taps")
    const fills = screen.getAllByTestId("log-tile-square").map(squareFill)
    expect(fills).toHaveLength(4)
    expect(new Set(fills).size).toBe(4)
    for (const f of fills) expect(TILE_COLOURS).toContain(f)
  })
})
