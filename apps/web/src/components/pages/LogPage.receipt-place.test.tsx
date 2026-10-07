// MOB-R70 E5 / F3 — /log's Place search. Closing the keyboard with nothing typed closes the search; with
// text typed it keeps the search and the text (MOB-R80 B2). A result applies on POINTER DOWN, so the blur
// right after it cannot swallow the pick; a new place opens Category with "What kind of spending is {place}?".
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

const openPlace = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
  return screen.getByRole("textbox", { name: "Search places" })
}

describe("/log place search (MOB-R70 E5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // MOB-R71 C5 — each case starts clean: storage cleared, only Date faked, real timers restored after.
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.useFakeTimers({ toFake: ["Date"] })
    mocks.logSuggestions.mockResolvedValue([{ name: "Talabat", category: "Food Delivery", count: 2, items: [] }])
    mocks.categoriesList.mockResolvedValue([])
  })
  afterEach(() => vi.useRealTimers())


  it("a result picked on pointer down applies even though the field's blur and a stray click follow", async () => {
    renderLog()
    const field = await openPlace()
    field.focus()
    fireEvent.change(field, { target: { value: "tal" } })
    const result = within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^Talabat/ })
    fireEvent.pointerDown(result, { button: 0 })
    fireEvent.blur(field)
    expect(screen.getByRole("button", { name: /^Place/ })).not.toHaveTextContent("Talabat") // MOB-R83 B2: pointerdown alone picks nothing
    fireEvent.click(result) // the pick arrives on click
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Talabat")
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveTextContent("Food Delivery")
    // MOB-R84 B2 — the pick IS the click, so nothing follows it: Amount (missing) is open and still empty;
    // then a deliberate tap on "1" types 1.
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("How much")
    fireEvent.click(screen.getByRole("button", { name: "1" }))
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("KD 1")
  })

  it("a new place opens Category with its question", async () => {
    renderLog()
    const field = await openPlace()
    fireEvent.change(field, { target: { value: "Bakery" } })
    fireEvent.click(screen.getByRole("button", { name: "Add “Bakery” as a new place" }))
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("What kind of spending is Bakery?")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Bakery")
  })
})
