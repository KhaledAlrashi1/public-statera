// MOB-R112 D6/D7 — /log's "Spent · Income" switch: new entries only; Income mode shows the three
// tiles (Bonus, Commission, Other), no places and no Salary tile, and saves with kind "income". An
// expense save sends exactly what it sent before (D7): no kind key.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn(), get: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, get: mocks.get, delete: vi.fn(), update: vi.fn() },
    categoriesApi: { list: mocks.categoriesList, create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function renderLog(path = "/log") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const kindSwitch = () => screen.getByRole("group", { name: "Entry type" })
const save = () => screen.getByRole("button", { name: /^(Add|Save KD)/ })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-17T09:00:00Z"))
  mocks.logSuggestions.mockResolvedValue([
    { name: "Starbucks", category: "Coffee", count: 3, items: [], last_amount: "1.250", last_used: "2026-10-10" },
  ])
  mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 2 }])
  mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
})
afterEach(() => vi.useRealTimers())

describe("/log Spent · Income (MOB-R112 D6)", () => {
  it("Income mode shows Bonus, Commission and Other; no Salary tile, no places, no Category, Place or What for", async () => {
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    expect(within(kindSwitch()).getByRole("button", { name: "Spent" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Income" }))
    expect(within(kindSwitch()).getByRole("button", { name: "Income" })).toHaveAttribute("aria-pressed", "true")
    const tiles = within(screen.getByRole("region", { name: "What kind of income" })).getAllByRole("button")
    expect(tiles.map((t) => t.textContent)).toEqual(["Bonus", "Commission", "Other"])
    expect(screen.queryByRole("button", { name: /Salary/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Starbucks/ })).toBeNull()
    for (const label of ["Category", "Place", "What for"]) expect(screen.queryByRole("button", { name: new RegExp(`^${label}`) })).toBeNull()
    expect(screen.getByRole("button", { name: /^Amount/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Date/ })).toBeInTheDocument()
  })

  it("Bonus saves with kind income, its category as its name, and no place", async () => {
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Income" }))
    fireEvent.click(screen.getByRole("button", { name: "Bonus" }))
    for (const k of ["5", "0"]) fireEvent.click(screen.getByRole("button", { name: k }))
    fireEvent.click(save())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toEqual({
      date: "2026-10-17", category: "Bonus", name: "Bonus", amount_kd: "50.000", force: undefined, kind: "income",
    })
  })

  it("Other saves as \"Other income\"", async () => {
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Income" }))
    fireEvent.click(screen.getByRole("button", { name: "Other" }))
    fireEvent.click(screen.getByRole("button", { name: "7" }))
    fireEvent.click(save())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ category: "Other income", name: "Other income", kind: "income" })
  })

  // MOB-R113 C7 — a spending category named "Bonus" exists: the server refuses with 409
  // category_not_income and never flips it. The message names the category and says why; it is not
  // the duplicate-date message the generic 409 branch shows.
  it("category_not_income shows its own message, not the duplicate-date one", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    mocks.create.mockRejectedValueOnce(new ApiError("That category is not an income category.", 409, "category_not_income"))
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Income" }))
    fireEvent.click(screen.getByRole("button", { name: "Bonus" }))
    fireEvent.click(screen.getByRole("button", { name: "5" }))
    fireEvent.click(save())
    expect(await screen.findByText('Your "Bonus" category is for spending, so this income can\'t go there.')).toBeInTheDocument()
    expect(screen.queryByText(/Already saved for this date/)).toBeNull()
  })

  it("edit mode has no switch", async () => {
    mocks.get.mockResolvedValue({
      ok: true,
      data: { item: { id: 7, date: "2026-10-10", name: "Latte", merchant: "Starbucks", category: "Coffee", amount_kd: "1.250", memo: null, category_counts_as_income: false } },
    })
    renderLog("/log?edit=7")
    expect(await screen.findByRole("heading", { level: 1, name: "Edit expense" })).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Entry type" })).toBeNull()
  })
})

describe("/log expense save is unchanged (MOB-R112 D7)", () => {
  it("a Spent save sends the same body as before: no kind key", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /Starbucks/ }))
    fireEvent.click(save())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    const sent = mocks.create.mock.calls[0][0]
    expect("kind" in sent).toBe(false)
    // The body as the R112 D7 "before" capture recorded it at the fetch boundary.
    expect(JSON.stringify(sent)).toBe('{"date":"2026-10-17","merchant":"Starbucks","category":"Coffee","name":"Starbucks","amount_kd":"1.250"}')
  })
})
