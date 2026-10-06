// MOB-R53 B5 — the hidden /log page: the two required fields, the amount sent as a normalised
// string, 409 then force on the next Save, Undo sending only the last created id, and stats that
// never touch the network. MOB-R70 E (option A, Receipt): rewritten under the F2 grant. MOB-R71 E2:
// the Undo case pins "Undo last" (C1) and the Popular in Kuwait case returns, as tiles (C2).
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
// MOB-R70 E6 — Save is never disabled; it names what is missing until it can save.
const saveButton = () => screen.getByRole("button", { name: /^(Save KD|Add an amount|Add a category)/ })
const openLine = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }))

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

  it("saves only once both an amount and a category are set", async () => {
    renderAt()
    await screen.findByText("PICK")
    fireEvent.click(saveButton())
    expect(mocks.create).not.toHaveBeenCalled()
    press("5") // the tap above opened Amount, the first missing line
    expect(saveButton()).toHaveTextContent("Add a category")
    fireEvent.click(saveButton())
    expect(mocks.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Coffee" })) // Category opened by that tap
    expect(saveButton()).toHaveTextContent("Save KD 5.000")
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  })

  it("replaces a tile's amount on the first key, keeps a picked item as the name, and sends a 3-decimal string", async () => {
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    openLine(/^What for/)
    fireEvent.click(screen.getByRole("button", { name: "Americano · KD 1.250" }))
    openLine(/^Amount/)
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
    fireEvent.click(saveButton())
    expect(await screen.findByText("Already saved for this date. Tap Save again to keep both.")).toBeInTheDocument()
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    expect(mocks.create.mock.calls[0][0].force).toBeUndefined()
    expect(mocks.create.mock.calls[1][0].force).toBe("1")
  })

  it("Undo last, after the moment resets, deletes only the id this page created last, then goes away", async () => {
    mocks.create
      .mockResolvedValueOnce({ ok: true, data: { item: { id: 11 } }, error: null, meta: {} })
      .mockResolvedValueOnce({ ok: true, data: { item: { id: 12 } }, error: null, meta: {} })
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole("button", { name: "Log another" }))
    fireEvent.click(screen.getByRole("button", { name: /^PICK/ }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    // MOB-R71 C1 — the moment resets; a quiet "Undo last" stays on the form.
    fireEvent.click(await screen.findByRole("button", { name: "Log another" }))
    fireEvent.click(screen.getByRole("button", { name: "Undo last" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1))
    expect(mocks.remove).toHaveBeenCalledWith(12)
    expect(mocks.remove).not.toHaveBeenCalledWith(11)
    // Used once, it goes: nothing older can be undone from here.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo last" })).toBeNull())
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent("How much")
  })

  it("offers the Popular in Kuwait list as tiles when the user has no places, filling only place and category", async () => {
    mocks.logSuggestions.mockResolvedValue([])
    renderAt()
    const section = (await screen.findByText("Popular in Kuwait")).closest("section")!
    const names = Array.from(section.querySelectorAll("button")).map((b) => b.textContent)
    // MOB-R71 C2 — the existing list, entries and order unchanged; initial square + name; no amount.
    expect(names).toEqual(["PPICK", "SStarbucks", "SSultan Center", "TTalabat", "OOula", "CCareem"])
    fireEvent.click(screen.getByRole("button", { name: /^Sultan Center/ }))
    expect(screen.getByRole("button", { name: /^Place/ })).toHaveTextContent("Sultan Center")
    expect(screen.getByRole("button", { name: /^Category/ })).toHaveTextContent("Groceries")
    expect(screen.getByRole("button", { name: /^Amount/ })).toHaveTextContent(/How much.*Next/)
  })

  it("keeps test stats in sessionStorage and never sends them", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    renderAt()
    fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
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
