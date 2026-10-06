// MOB-R70 E2 / F3 — "Repeat in two taps": up to four of her places as tiles. A tap fills three
// lines — place, its category and an amount — and Save then saves. D is STOPPED, so the amount is
// the place's TOP item's amount (H4); a place with no items fills place and category only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const place = (name: string, category: string | null, items: Array<{ name: string; amount_kd: string }> = []) => ({
  name,
  category,
  count: 1,
  items: items.map((i) => ({ ...i, category })),
})

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

const lineText = (label: RegExp) => screen.getByRole("button", { name: label }).textContent

describe("/log tiles (MOB-R70 E2, H4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.categoriesList.mockResolvedValue([])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
  })

  it("a tile fills place, its category and the top item's amount, and Save then saves", async () => {
    mocks.logSuggestions.mockResolvedValue([
      place("PICK", "Coffee", [{ name: "Americano", amount_kd: "1.250" }, { name: "Latte", amount_kd: "1.750" }]),
    ])
    renderLog()
    const tile = await screen.findByRole("button", { name: /^PICK/ })
    expect(tile).toHaveTextContent("KD 1.250")
    fireEvent.click(tile)
    expect(lineText(/^Place/)).toContain("PICK")
    expect(lineText(/^Category/)).toContain("Coffee")
    expect(lineText(/^Amount/)).toContain("KD 1.250")
    fireEvent.click(screen.getByRole("button", { name: "Save KD 1.250" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ merchant: "PICK", category: "Coffee", amount_kd: "1.250", name: "PICK" })
  })

  it("a place with no items shows no amount and fills place and category only", async () => {
    mocks.logSuggestions.mockResolvedValue([place("Oula", "Fuel")])
    renderLog()
    const tile = await screen.findByRole("button", { name: /^Oula/ })
    expect(tile).not.toHaveTextContent("KD")
    fireEvent.click(tile)
    expect(lineText(/^Place/)).toContain("Oula")
    expect(lineText(/^Category/)).toContain("Fuel")
    expect(lineText(/^Amount/)).toContain("How much")
  })

  it("shows at most four, in the order given, and no section when she has no places", async () => {
    mocks.logSuggestions.mockResolvedValue(["A1", "B2", "C3", "D4", "E5"].map((n) => place(n, "Coffee")))
    const { unmount } = render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const section = (await screen.findByText("Repeat in two taps")).closest("section")!
    const names = Array.from(section.querySelectorAll("button")).map((b) => b.textContent)
    expect(names).toEqual(["AA1", "BB2", "CC3", "DD4"]) // initial square + name
    unmount()

    mocks.logSuggestions.mockResolvedValue([])
    renderLog()
    await screen.findByRole("button", { name: /^Amount/ })
    await waitFor(() => expect(mocks.logSuggestions).toHaveBeenCalledTimes(2))
    expect(screen.queryByText("Repeat in two taps")).toBeNull()
  })
})
