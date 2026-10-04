// MOB-R53 B5 — the hidden /log page: the two required fields, the amount sent as a normalised
// string, 409 then force on the next Save, Undo sending only the last created id, the beginner
// list, and stats that never touch the network.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage, { LOG_STATS_KEY } from "./LogPage"

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

const press = (keys: string) => {
  for (const k of keys) {
    const name = k === "." ? "Decimal point" : k
    fireEvent.click(screen.getByRole("button", { name }))
  }
}
const saveButton = () => screen.getByRole("button", { name: /^(Save KD|Enter an amount|Pick a place or category)/ })

describe("/log", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.logSuggestions.mockResolvedValue([PICK])
    mocks.categoriesList.mockResolvedValue([{ id: 1, name: "Coffee" }, { id: 2, name: "Groceries" }])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 11 } }, error: null, meta: {} })
    mocks.remove.mockResolvedValue({ ok: true, data: { deleted: true }, error: null, meta: {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("needs an amount and a category before Save is enabled", async () => {
    renderAt()
    await screen.findByText("PICK")
    expect(saveButton()).toHaveTextContent("Enter an amount")
    expect(saveButton()).toBeDisabled()
    press("5")
    expect(saveButton()).toHaveTextContent("Pick a place or category")
    expect(saveButton()).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    expect(saveButton()).toHaveTextContent("Save KD 5.000 · PICK")
    expect(saveButton()).toBeEnabled()
  })

  it("replaces a picked item's usual price on the first key and sends the amount as a 3-decimal string", async () => {
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(screen.getByRole("button", { name: "Americano" }))
    expect(screen.getByTestId("log-amount")).toHaveTextContent("KD 1.250")
    press("2")
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      merchant: "PICK",
      category: "Coffee",
      name: "Americano",
      amount_kd: "2.000",
      force: undefined,
    })
  })

  it("shows the duplicate notice on a 409 and sends force on the next Save", async () => {
    mocks.create
      .mockRejectedValueOnce(new ApiError("dup", 409, "transaction_duplicate_conflict"))
      .mockResolvedValueOnce({ ok: true, data: { item: { id: 5 } }, error: null, meta: {} })
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    press("3")
    fireEvent.click(saveButton())
    expect(await screen.findByText("Already saved for this date. Tap Save again to keep both.")).toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    expect(mocks.create.mock.calls[0][0].force).toBeUndefined()
    expect(mocks.create.mock.calls[1][0].force).toBe("1")
  })

  it("Undo deletes only the id returned by this page's most recent create", async () => {
    mocks.create
      .mockResolvedValueOnce({ ok: true, data: { item: { id: 11 } }, error: null, meta: {} })
      .mockResolvedValueOnce({ ok: true, data: { item: { id: 12 } }, error: null, meta: {} })
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    press("1")
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    press("2")
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole("button", { name: "Undo last" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1))
    expect(mocks.remove).toHaveBeenCalledWith(12)
    // Nothing older can be undone from here, so the button goes away.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo last" })).toBeNull())
    expect(mocks.remove).not.toHaveBeenCalledWith(11)
  })

  it("offers the Popular in Kuwait list when the user has no places, filling only place and category", async () => {
    mocks.logSuggestions.mockResolvedValue([])
    renderAt()
    expect(await screen.findByText("Popular in Kuwait")).toBeInTheDocument()
    for (const name of ["PICK", "Starbucks", "Sultan Center", "Talabat", "Oula", "Careem"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole("button", { name: /^Sultan Center/ }))
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("log-amount")).toHaveTextContent("KD 0")
  })

  it("keeps test stats in sessionStorage and never sends them", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    press("4")
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem(LOG_STATS_KEY) ?? "[]")).toHaveLength(1))
    const [stat] = JSON.parse(window.sessionStorage.getItem(LOG_STATS_KEY)!)
    expect(stat).toMatchObject({ taps: expect.any(Number), suggestion: true })
    await act(async () => {
      renderAt("/log?stats=1")
    })
    expect(screen.getAllByText(/"taps"/).length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
