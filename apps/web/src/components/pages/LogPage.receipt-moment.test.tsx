// MOB-R70 E7 / F3 — /log's save moment. Brass squares burst only on the FIRST save of the day on this
// device (a localStorage date, the browser's clock); reduced motion shows a static check, no draw,
// no burst; screen readers hear "Logged, KD {amount}".
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"
import { LOG_FIRST_SAVE_KEY } from "@/lib/log-entry"

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

function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

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

async function saveTile() {
  fireEvent.click(await screen.findByRole("button", { name: /^PICK/ }))
  fireEvent.click(screen.getByRole("button", { name: /^Save KD/ }))
  return screen.findByTestId("log-save-moment")
}

describe("/log save moment (MOB-R70 E7)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.logSuggestions.mockResolvedValue([{ name: "PICK", category: "Coffee", count: 1, items: [{ name: "Americano", category: "Coffee", amount_kd: "1.250" }] }])
    mocks.categoriesList.mockResolvedValue([])
    mocks.create.mockResolvedValue({ ok: true, data: { item: { id: 1 } }, error: null, meta: {} })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // MOB-R94 C5 — the day is Kuwait's: the runner's clock is pinned either side of Kuwait midnight (21:00Z).
  it.each([
    ["2026-10-08T20:59:00Z", "2026-10-08"],
    ["2026-10-08T21:00:00Z", "2026-10-09"],
  ])("bursts on the first save of the day, records the day, and not on the next save (at %s, day %s)", async (instant, day) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(instant))
    motion(false)
    renderLog()
    await saveTile()
    expect(screen.getByTestId("log-burst")).toBeInTheDocument()
    expect(window.localStorage.getItem(LOG_FIRST_SAVE_KEY)).toBe(day)
    expect(screen.getByRole("status")).toHaveTextContent("Logged, KD 1.250")
    expect(screen.getByText("KD 1.250 · PICK")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Log another" }))
    await saveTile()
    expect(screen.queryByTestId("log-burst")).toBeNull()
    expect(screen.getByTestId("log-check")).toHaveClass("log-check-draw")
  })

  it("a stored date from an earlier day still bursts", async () => {
    motion(false)
    window.localStorage.setItem(LOG_FIRST_SAVE_KEY, "2000-01-01")
    renderLog()
    await saveTile()
    expect(screen.getByTestId("log-burst")).toBeInTheDocument()
  })

  it("reduced motion: a static check, no draw, no burst — and the moment still says Logged", async () => {
    motion(true)
    renderLog()
    await saveTile()
    expect(screen.getByTestId("log-check")).not.toHaveClass("log-check-draw")
    expect(screen.queryByTestId("log-burst")).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Logged, KD 1.250")
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  })
})
