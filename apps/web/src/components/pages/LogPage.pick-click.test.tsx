// MOB-R82 B2/B3 — every pickProps reader on /log picks on CLICK: the Add-a-new-place button, a place search
// result, and an item chip. Pointerdown and mousedown only keep the focus, so a press that turns into a
// scroll (pointerdown, pointercancel, no click) picks nothing; a tap (pointerdown then click) picks once;
// Enter and Space arrive as a click. A pick still fills only fields that are empty or suggested.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
const line = (name: RegExp) => screen.getByRole("button", { name })
async function searchPlace(text: string) {
  fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
  const field = screen.getByRole("textbox", { name: "Search places" })
  field.focus() // the keyboard is up
  fireEvent.change(field, { target: { value: text } })
  return within(screen.getByRole("group", { name: "Place" }))
}
const addPlace = async () => (await searchPlace("Bread Co")).getByRole("button", { name: "Add “Bread Co” as a new place" })
const placeResult = async () => (await searchPlace("tal")).getByRole("button", { name: /^Talabat/ })
async function itemChip() {
  fireEvent.click(await placeResult()) // Talabat is the place; its items are offered under What for
  fireEvent.click(line(/^What for/))
  return within(screen.getByRole("group", { name: "What for" })).getByRole("button", { name: /^Shawarma/ })
}
const scrollPress = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { button: 0 })
  fireEvent.pointerCancel(el, { button: 0 })
}

describe("/log picks on click (MOB-R82 B2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([
      { name: "Talabat", category: "Food Delivery", count: 3, items: [{ name: "Shawarma", category: "Food Delivery", amount_kd: "2.250" }], last_amount: "2.250", last_used: "2026-10-01" },
    ])
    mocks.categoriesList.mockResolvedValue([
      { id: 1, name: "Food Delivery", kind: "expense", transaction_count: 3 },
      { id: 2, name: "Bakery", kind: "expense", transaction_count: 1 },
    ])
  })

  it("a scroll-press on Add a new place adds nothing", async () => {
    renderLog()
    scrollPress(await addPlace())
    expect(line(/^Place/)).not.toHaveTextContent("Bread Co")
  })

  it("a scroll-press on a place result picks nothing", async () => {
    renderLog()
    scrollPress(await placeResult())
    expect(line(/^Place/)).not.toHaveTextContent("Talabat")
  })

  it("a scroll-press on an item chip picks nothing", async () => {
    renderLog()
    scrollPress(await itemChip())
    expect(line(/^What for/)).not.toHaveTextContent("Shawarma")
  })

  it("a tap (pointerdown, then click) on a place result picks it, keyboard up", async () => {
    renderLog()
    const result = await placeResult()
    fireEvent.pointerDown(result, { button: 0 })
    fireEvent.click(result)
    expect(line(/^Place/)).toHaveTextContent("Talabat")
  })

  it("a tap on Add a new place adds it, keyboard up", async () => {
    renderLog()
    const add = await addPlace()
    fireEvent.pointerDown(add, { button: 0 })
    fireEvent.click(add)
    expect(line(/^Place/)).toHaveTextContent("Bread Co")
  })

  it("a tap on an item chip picks it, keyboard down", async () => {
    renderLog()
    const chip = await itemChip()
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.click(chip)
    expect(line(/^What for/)).toHaveTextContent("Shawarma")
  })

  it("Enter or Space on a focused item chip (a click with no pointerdown) picks it once", async () => {
    renderLog()
    const chip = await itemChip()
    ;(document.activeElement as HTMLElement | null)?.blur() // keyboard down
    fireEvent.click(chip)
    expect(line(/^What for/)).toHaveTextContent("Shawarma")
    expect(line(/^Amount/)).toHaveTextContent("KD 2.250")
  })

  it("a pick still fills only empty or suggested fields: her own category stays", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Category/ }))
    fireEvent.click(await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Bakery" }))
    fireEvent.click(await placeResult())
    expect(line(/^Place/)).toHaveTextContent("Talabat")
    expect(line(/^Category/)).toHaveTextContent("Bakery")
  })
})
