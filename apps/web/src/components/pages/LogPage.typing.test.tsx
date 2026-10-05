// MOB-R69 E4/E5 — /log typing from a physical keyboard, through the RM-27 normalizer. The jsdom
// default is a touch device (no matchMedia): keypad shown, keys still typed. The computer case
// stubs matchMedia so the amount becomes a text field.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const typeKeys = (keys: string, target: Element | Document = document) => {
  for (const k of keys) fireEvent.keyDown(target, { key: k })
}
const readout = () => screen.getByTestId("log-amount")
const saveButton = () => screen.getByRole("button", { name: /^(Save KD|Enter an amount|Pick a place or category)/ })

describe("/log — typing an amount (MOB-R69 E4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.logSuggestions.mockResolvedValue([PICK])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee" }])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 11 } }, error: null, meta: {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("digits append and Backspace removes", async () => {
    renderAt()
    await screen.findByRole("button", { name: /^PICK/ })
    typeKeys("12")
    expect(readout()).toHaveTextContent("KD 12.000")
    fireEvent.keyDown(document, { key: "Backspace" })
    expect(readout()).toHaveTextContent("KD 1.000")
  })

  it('"1,500" typed shows KD 1,500.000 and Enter saves it', async () => {
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    typeKeys("1,500")
    expect(readout()).toHaveTextContent("KD 1,500.000")
    fireEvent.keyDown(document, { key: "Enter" })
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].amount_kd).toBe("1500.000")
  })

  it('"1,5" typed is refused and nothing saves', async () => {
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    typeKeys("1,5")
    expect(screen.getByText("Can't read this amount.")).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    fireEvent.keyDown(document, { key: "Enter" })
    fireEvent.click(saveButton())
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("Enter saves only when Save is enabled", async () => {
    renderAt()
    await screen.findByRole("button", { name: /^PICK/ })
    typeKeys("7")
    expect(saveButton()).toBeDisabled() // no place or category yet
    fireEvent.keyDown(document, { key: "Enter" })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("keys are ignored while another text field has focus", async () => {
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: "+ Other" }))
    const other = screen.getByRole("textbox", { name: "What was it?" })
    other.focus()
    typeKeys("5", other)
    expect(readout()).toHaveTextContent("KD 0")
    expect(readout()).not.toHaveTextContent("KD 5")
  })

  it("on a computer the amount is a text field with no keypad", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("pointer: fine"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    expect(screen.queryByRole("button", { name: "Decimal point" })).toBeNull()
    const field = screen.getByRole("textbox", { name: "Amount (KD)" })
    fireEvent.change(field, { target: { value: "1,500" } })
    expect(readout()).toHaveTextContent("KD 1,500.000")
    fireEvent.keyDown(field, { key: "Enter" })
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].amount_kd).toBe("1500.000")
  })
})
