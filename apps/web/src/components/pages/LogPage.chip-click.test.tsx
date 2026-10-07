// MOB-R81 B4 — a category chip picks on CLICK. Its pointerdown only prevents the default, so the search
// input keeps focus and the keyboard stays up; a press that turns into a scroll (pointerdown, then
// pointercancel, and no click) picks nothing. Keyboard activation (Enter, Space) arrives as a click.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react"
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

async function openCategory() {
  render(
    <MemoryRouter initialEntries={["/log"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole("button", { name: /^Category/ }))
  return within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Bakery" })
}
const categoryLine = () => screen.getByRole("button", { name: /^Category/ })

describe("/log category chips pick on click (MOB-R81 B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Bakery", kind: "expense", transaction_count: 3 }])
  })

  it("a press that turns into a scroll (pointerdown, pointercancel) picks nothing", async () => {
    const chip = await openCategory()
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.pointerCancel(chip, { button: 0 })
    expect(categoryLine()).not.toHaveTextContent("Bakery")
  })

  it("pointerdown alone does not pick, and its default is prevented so the input keeps focus", async () => {
    const chip = await openCategory()
    const down = createEvent.pointerDown(chip, { button: 0 })
    fireEvent(chip, down)
    expect(down.defaultPrevented).toBe(true)
    expect(categoryLine()).not.toHaveTextContent("Bakery")
  })

  it("mousedown on a chip is default-prevented and does not pick (WebKit's compatibility mousedown)", async () => {
    const chip = await openCategory()
    const down = createEvent.mouseDown(chip, { button: 0 })
    fireEvent(chip, down)
    expect(down.defaultPrevented).toBe(true)
    expect(categoryLine()).not.toHaveTextContent("Bakery")
  })

  it("a tap (pointerdown, then click) picks the chip", async () => {
    const chip = await openCategory()
    fireEvent.pointerDown(chip, { button: 0 })
    fireEvent.click(chip)
    expect(categoryLine()).toHaveTextContent("Bakery")
  })

  it("a click with no pointerdown (Enter or Space on a focused chip) picks the chip", async () => {
    const chip = await openCategory()
    fireEvent.click(chip)
    expect(categoryLine()).toHaveTextContent("Bakery")
  })
})
