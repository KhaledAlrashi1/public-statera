// MOB-R69 E3 / E5 — /log's category picker: no automatic keyboard on touch devices, her usual
// categories first by her own use, and no income-kind category in the expense picker. MOB-R70 E5:
// rewritten under the F2 grant — the picker opens inline under the Category line (a group, not a dialog).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({
  logSuggestions: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  categoriesList: vi.fn(),
  categoriesCreate: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, delete: mocks.remove },
    categoriesApi: { list: mocks.categoriesList, create: mocks.categoriesCreate },
  }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import { ApiError } from "@/lib/api"

const PICK = { name: "PICK", category: "Coffee", count: 3, items: [{ name: "Americano", category: "Coffee", amount_kd: "1.250" }] }

function renderAt(path = "/log") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
          <Route path="/activity" element={<div>activity page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function openPicker(categories: unknown[]) {
  mocks.categoriesList.mockResolvedValue(categories)
  renderAt()
  await screen.findByRole("button", { name: /^PICK/ })
  fireEvent.click(screen.getByRole("button", { name: /^Category/ }))
  return screen.findByRole("group", { name: "Category" })
}
const chips = (picker: HTMLElement) => within(picker).getAllByRole("button").map((b) => b.textContent)

const RANKED = [
  { id: 1, name: "Coffee", kind: "expense", transaction_count: 3 },
  { id: 2, name: "Groceries", kind: "expense", transaction_count: 9 },
  { id: 3, name: "Fuel", kind: "expense", transaction_count: 5 },
  { id: 4, name: "Rent", kind: "expense", transaction_count: 1 },
  { id: 5, name: "Gifts", kind: "expense", transaction_count: 2 },
  { id: 6, name: "Dining", kind: "expense", transaction_count: 7 },
  { id: 7, name: "Zakat", kind: "expense", transaction_count: 0 },
  { id: 8, name: "Investing", kind: "savings", transaction_count: 4 },
  { id: 9, name: "Income: Salary", kind: "income", transaction_count: 12 },
]

describe("/log category picker (MOB-R69 E3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([PICK])
  })
  afterEach(() => vi.unstubAllGlobals())

  it("on a touch device the search field is not focused when the picker opens", async () => {
    const dialog = await openPicker(RANKED)
    expect(within(dialog).getByRole("textbox", { name: "Find a category" })).not.toHaveFocus()
  })

  it("on a computer the search field takes focus", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("pointer: fine"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const dialog = await openPicker(RANKED)
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Find a category" })).toHaveFocus())
  })

  it("shows up to six of her categories, most used first; typing finds the rest", async () => {
    const dialog = await openPicker(RANKED)
    await within(dialog).findByRole("button", { name: "Groceries" })
    expect(chips(dialog)).toEqual(["Groceries", "Dining", "Fuel", "Investing", "Coffee", "Gifts"])
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Find a category" }), { target: { value: "zak" } })
    expect(chips(dialog)).toContain("Zakat")
  })

  it("never offers an income-kind category, before or while typing", async () => {
    const dialog = await openPicker(RANKED)
    await within(dialog).findByRole("button", { name: "Groceries" })
    expect(chips(dialog)).not.toContain("Income: Salary")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Find a category" }), { target: { value: "income" } })
    expect(chips(dialog).filter((c) => c === "Income: Salary")).toHaveLength(0)
  })
})
