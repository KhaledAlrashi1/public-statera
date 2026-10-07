// MOB-R87 E1 — the Place picker works like Category's: with nothing typed, her six places by use as chips (no
// category line); typing searches all of them; the place query is kept when another line opens; an Add in either
// picker is state only and is created when she saves the expense (B2); both Add buttons pick on click.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({
  logSuggestions: vi.fn(),
  create: vi.fn(),
  categoriesList: vi.fn(),
  categoriesCreate: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: mocks.categoriesCreate },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const place = (name: string, count: number) => ({ name, category: "Coffee", count, items: [], last_amount: null, last_used: null })
// Seven places; "Zaatar" is used least, so it is the one the six-by-use list leaves out.
const PLACES = [place("Alpha", 9), place("Bravo", 8), place("Charlie", 7), place("Delta", 6), place("Echo", 5), place("Foxtrot", 4), place("Zaatar", 1)]

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

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  mocks.logSuggestions.mockResolvedValue(PLACES)
  mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 3 }])
  mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 5 } } })
})

describe("/log Place picker like Category (MOB-R87 E1)", () => {
  it("with nothing typed shows her six places by use, as chips, without the category line", async () => {
    renderLog()
    await openPlace()
    const group = screen.getByRole("group", { name: "Place" })
    await waitFor(() => expect(within(group).getByRole("button", { name: "Alpha" })).toBeInTheDocument())
    const names = within(group).getAllByRole("button").map((b) => b.textContent)
    expect(names).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"])
    expect(within(group).queryByText("Coffee")).toBeNull()
  })

  it("typing searches all of her places, the seventh included", async () => {
    renderLog()
    const field = await openPlace()
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: "Alpha" })).toBeInTheDocument())
    fireEvent.change(field, { target: { value: "zaa" } })
    expect(within(screen.getByRole("group", { name: "Place" })).getByRole("button", { name: "Zaatar" })).toBeInTheDocument()
  })

  it("keeps the typed place when another line opens", async () => {
    renderLog()
    const field = await openPlace()
    fireEvent.change(field, { target: { value: "Bakery" } })
    fireEvent.click(screen.getByRole("button", { name: /^Amount/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Place/ }))
    expect(screen.getByRole("textbox", { name: "Search places" })).toHaveValue("Bakery")
  })

  it("a new category is created only when she saves the expense", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Amount/ }))
    fireEvent.click(screen.getByRole("button", { name: "4" }))
    fireEvent.click(screen.getByRole("button", { name: /^Category/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Find a category" }), { target: { value: "Pets" } })
    fireEvent.click(screen.getByRole("button", { name: "Add “Pets” as a new category" }))
    expect(mocks.categoriesCreate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Save KD 4\.000/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ category: "Pets" })))
    expect(mocks.categoriesCreate).not.toHaveBeenCalled()
  })

  it("a scroll that starts on the category Add adds nothing (it picks on click)", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Category/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Find a category" }), { target: { value: "Pets" } })
    const add = screen.getByRole("button", { name: "Add “Pets” as a new category" })
    fireEvent.pointerDown(add, { button: 0 })
    fireEvent.mouseDown(add, { button: 0 })
    expect(screen.getByRole("button", { name: /^Category/ })).not.toHaveTextContent("Pets")
    expect(fireEvent.pointerDown(add, { button: 0 })).toBe(false)
  })
})
