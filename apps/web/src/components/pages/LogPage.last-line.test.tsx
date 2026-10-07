// MOB-R78 F3 — after a save, one line above Save says what Undo would remove: "Last: KD 2.500 · Talabat"
// (the amount as Save showed it; the place, else the category) and a text button "Undo". It updates on the
// next save and goes after an Undo (Undo reaches one save, as before).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn(), remove: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: mocks.remove },
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

// Saves, then leaves the save moment with "Log another", back on the form where the line lives.
const saveAndReturn = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
  fireEvent.click(await screen.findByRole("button", { name: "Log another" }))
}
// Amount 2.500 in Coffee, no place.
const enterCoffee = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Amount/ }))
  for (const k of ["2", "Decimal point", "5"]) fireEvent.click(screen.getByRole("button", { name: k }))
  fireEvent.click(screen.getByRole("button", { name: /^Category/ }))
  fireEvent.click(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: "Coffee" }))
}

describe("/log the Last: line and Undo (MOB-R78 F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    mocks.logSuggestions.mockResolvedValue([{ name: "Talabat", category: "Food Delivery", count: 1, items: [{ name: "Burger", category: "Food Delivery", amount_kd: "3.750" }] }])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 2 }])
    mocks.create.mockResolvedValueOnce({ ok: true, data: { item: { id: 31 } }, error: null, meta: {} })
    mocks.create.mockResolvedValueOnce({ ok: true, data: { item: { id: 32 } }, error: null, meta: {} })
    mocks.remove.mockResolvedValue({ ok: true, data: { deleted: true }, error: null, meta: {} })
  })

  it("after a save, says the amount and the place, with an Undo button", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Talabat/ }))
    expect(screen.getByRole("button", { name: /^Save KD/ })).toHaveTextContent("Save KD 3.750")
    expect(screen.queryByText(/^Last:/)).toBeNull()
    await saveAndReturn()
    expect(screen.getByText(/^Last:/)).toHaveTextContent("Last: KD 3.750 · Talabat")
    expect(screen.getByRole("button", { name: "Undo last" })).toHaveTextContent(/^Undo$/) // visible "Undo", name "Undo last" (MOB-R79 D2)
  })

  it("with no place, names the category", async () => {
    renderLog()
    await enterCoffee()
    await saveAndReturn()
    expect(screen.getByText(/^Last:/)).toHaveTextContent("Last: KD 2.500 · Coffee")
  })

  it("updates on the next save", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Talabat/ }))
    await saveAndReturn()
    await enterCoffee()
    await saveAndReturn()
    expect(screen.getAllByText(/^Last:/)).toHaveLength(1)
    expect(screen.getByText(/^Last:/)).toHaveTextContent("Last: KD 2.500 · Coffee")
  })

  it("Undo deletes the last save, and the line goes", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Talabat/ }))
    await saveAndReturn()
    fireEvent.click(screen.getByRole("button", { name: "Undo last" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(31))
    await waitFor(() => expect(screen.queryByText(/^Last:/)).toBeNull())
    expect(screen.queryByRole("button", { name: "Undo last" })).toBeNull()
  })
})
