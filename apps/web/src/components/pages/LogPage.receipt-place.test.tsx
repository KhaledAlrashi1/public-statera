// MOB-R70 E5 / F3 — /log's Place search. Closing the keyboard without choosing closes the search and
// drops the text; a result applies on POINTER DOWN, so the keyboard closing (blur) right after it
// cannot swallow the pick; a new place opens Category with "What kind of spending is {place}?".
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

  it("closing the keyboard without choosing closes the search and drops the text", async () => {
    renderLog()
    const field = await openPlace()
    field.focus()
    fireEvent.change(field, { target: { value: "zz" } })
    fireEvent.blur(field)
    expect(screen.queryByRole("textbox", { name: "Search places" })).toBeNull()
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Shop or app")
    // A tap on the line inside 400 ms of the blur is the same tap that closed it; a later one opens.
    vi.setSystemTime(Date.now() + 1000)
    const reopened = await openPlace()
    expect(reopened).toHaveValue("")
  })

  it("a result picked on pointer down applies even though the field's blur and a stray click follow", async () => {
    renderLog()
    const field = await openPlace()
    field.focus()
    fireEvent.change(field, { target: { value: "tal" } })
    const result = within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: /^Talabat/ })
    fireEvent.pointerDown(result, { button: 0 })
    fireEvent.blur(field)
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Talabat")
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveTextContent("Food Delivery")
    // The pick moved the layout: Amount (missing) is open now. The click that ends the same tap lands
    // on whatever is under the finger — here a keypad key — and must not count as a key press.
    fireEvent.click(screen.getByRole("button", { name: "1" }))
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("How much")
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
