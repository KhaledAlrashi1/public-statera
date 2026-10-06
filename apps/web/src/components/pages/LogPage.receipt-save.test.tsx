// MOB-R70 E6 / F3 — /log's one Save button: never disabled; while something required is missing it
// names it, and a tap opens the first missing line and says "Add {missing} to save" without saving.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

const save = () => screen.getByRole("button", { name: /^(Add an amount|Add a category|Save KD)/ })
const pickCoffee = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Category/ }))
  fireEvent.click(await within(screen.getByRole("group", { name: "Category" })).findByRole("button", { name: "Coffee" }))
}

describe("/log Save names what is missing (MOB-R70 E6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logSuggestions.mockResolvedValue([])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 2 }])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
  })

  it("says what is missing, is never disabled, and says Save KD once ready", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^Amount/ })
    expect(save()).toHaveTextContent("Add an amount and a category")
    expect(save()).toBeEnabled()
    await pickCoffee()
    expect(save()).toHaveTextContent(/^Add an amount$/)
    expect(save()).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "7" })) // Amount opened after the category
    expect(save()).toHaveTextContent("Save KD 7.000")
  })

  it("a category missing alone is named alone", async () => {
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Amount/ }))
    fireEvent.click(screen.getByRole("button", { name: "4" }))
    expect(save()).toHaveTextContent(/^Add a category$/)
  })

  it("a tap while something is missing opens the first missing line, says what to add, and saves nothing", async () => {
    renderLog()
    await screen.findByRole("button", { name: /^Amount/ })
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(save())
    expect(screen.getByText("Add an amount and a category to save")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveAttribute("aria-expanded", "true")
    await waitFor(() => expect(mocks.create).not.toHaveBeenCalled())
  })
})
