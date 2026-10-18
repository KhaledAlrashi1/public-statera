// MOB-R116 D1/D2/D5 — /log's "Spent · Refund · Income" switch. Refund is the Spent screen (same tiles, place, category,
// amount, date), titled "New refund" (hidden) with its own line, and saves the Spent body plus kind "refund". Editing a
// refund (stored negative) shows its magnitude, is titled "Edit refund", PATCHes the magnitude, and has no Split.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

const mocks = vi.hoisted(() => ({ logSuggestions: vi.fn(), categoriesList: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn() }))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: mocks.logSuggestions, create: mocks.create, get: mocks.get, delete: vi.fn(), update: mocks.update },
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
          <Route path="/activity" element={<p>Activity page</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const kindSwitch = () => screen.getByRole("group", { name: "Entry type" })
const save = () => screen.getByRole("button", { name: /^(Add|Save KD)/ })
const refundRow = {
  id: 7, date: "2026-10-10", name: "Caribou Coffee", merchant: "Caribou Coffee", category: "Coffee", amount_kd: "-2.250",
  memo: null, category_counts_as_income: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-17T09:00:00Z"))
  mocks.logSuggestions.mockResolvedValue([
    { name: "Starbucks", category: "Coffee", count: 3, items: [], last_amount: "1.250", last_used: "2026-10-10" },
  ])
  mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 2 }])
  mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
  mocks.update.mockResolvedValue({ ok: true, data: { item: refundRow } })
})
afterEach(() => vi.useRealTimers())

describe("/log Spent · Refund · Income (MOB-R116 D1)", () => {
  it("the switch has three segments; Refund keeps the Spent screen, with its hidden title and its line", async () => {
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    expect(within(kindSwitch()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Spent", "Refund", "Income"])
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Refund" }))
    expect(within(kindSwitch()).getByRole("button", { name: "Refund" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { level: 1, name: "New refund" })).toHaveClass("sr-only")
    expect(screen.getByText("Money back from a place. Lowers your spending.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Starbucks/ })).toBeInTheDocument()
    for (const label of ["Amount", "Category", "Place", "Date"]) expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument()
  })

  it("a refund saves exactly the Spent body plus kind \"refund\"", async () => {
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Refund" }))
    fireEvent.click(screen.getByRole("button", { name: /Starbucks/ }))
    fireEvent.click(save())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(JSON.stringify(mocks.create.mock.calls[0][0])).toBe(
      '{"date":"2026-10-17","merchant":"Starbucks","category":"Coffee","name":"Starbucks","amount_kd":"1.250","kind":"refund"}',
    )
  })

  it("category_is_income shows its own message, not the duplicate-date one", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    mocks.create.mockRejectedValueOnce(new ApiError("That category is an income category.", 409, "category_is_income"))
    renderLog()
    await screen.findByRole("button", { name: /Starbucks/ })
    fireEvent.click(within(kindSwitch()).getByRole("button", { name: "Refund" }))
    fireEvent.click(screen.getByRole("button", { name: /Starbucks/ }))
    fireEvent.click(save())
    expect(await screen.findByText('Your "Coffee" category is for income, so this refund can\'t go there.')).toBeInTheDocument()
    expect(screen.queryByText(/Already saved for this date/)).toBeNull()
  })
})

describe("/log editing a refund (MOB-R116 D2, D5)", () => {
  it("shows the magnitude, is titled Edit refund, and PATCHes the magnitude", async () => {
    mocks.get.mockResolvedValue({ ok: true, data: { item: refundRow } })
    renderLog("/log?edit=7")
    expect(await screen.findByRole("heading", { level: 1, name: "Edit refund" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("KD 2.250"))
    expect(screen.getByRole("button", { name: /^Amount/ })).not.toHaveTextContent("-")
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0][1]).toEqual({ amount_kd: "2.250", category: "Coffee", name: "Caribou Coffee", merchant: "Caribou Coffee", date: "2026-10-10" })
  })

  it("a refund row has no Split; Delete stays", async () => {
    mocks.get.mockResolvedValue({ ok: true, data: { item: refundRow } })
    renderLog("/log?edit=7")
    await screen.findByRole("heading", { level: 1, name: "Edit refund" })
    await waitFor(() => expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("KD 2.250"))
    expect(screen.queryByRole("button", { name: /^Split this/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Delete refund" })).toBeInTheDocument()
  })
})

describe("/log editing a refund into an income category (MOB-R117 C4)", () => {
  it("shows Log's refund line on category_is_income, not the connection one", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
    mocks.get.mockResolvedValue({ ok: true, data: { item: refundRow } })
    mocks.update.mockRejectedValueOnce(new ApiError("That category is an income category.", 409, "category_is_income"))
    renderLog("/log?edit=7")
    await screen.findByRole("heading", { level: 1, name: "Edit refund" })
    await waitFor(() => expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("KD 2.250"))
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    expect(await screen.findByText('Your "Coffee" category is for income, so this refund can\'t go there.')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't save. Check your connection and try again.")).toBeNull()
  })
})
