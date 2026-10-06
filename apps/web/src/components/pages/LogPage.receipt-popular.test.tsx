// MOB-R71 C2 / E4 — with no places of her own, the tile area shows the existing "Popular in Kuwait"
// list as tiles, with no amount, and "Or fill in a new one" below. A tap fills place and category
// only, and Amount becomes the "Next" line.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage, { POPULAR_IN_KUWAIT } from "./LogPage"

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

describe("/log Popular in Kuwait tiles (MOB-R71 C2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([])
  })

  it("shows every entry, in order, as tiles with no amount, with the form below", async () => {
    renderLog()
    const heading = await screen.findByText("Popular in Kuwait")
    const tiles = Array.from(heading.closest("section")!.querySelectorAll("button"))
    expect(tiles).toHaveLength(POPULAR_IN_KUWAIT.length)
    POPULAR_IN_KUWAIT.forEach((p, i) => expect(tiles[i]).toHaveTextContent(p.name))
    tiles.forEach((t) => expect(t).not.toHaveTextContent("KD"))
    const form = screen.getByText("Or fill in a new one")
    expect(heading.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("a tap fills place and category only, and Amount becomes Next", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Talabat/ }))
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Talabat")
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveTextContent("Food Delivery")
    const amount = screen.getByRole("button", { name: /^Amount/ })
    expect(amount).toHaveTextContent("How much")
    expect(amount).toHaveTextContent(/Next$/)
    expect(screen.getByRole("button", { name: "Add an amount" })).toBeInTheDocument()
  })
})
