// MOB-R107 D6 — Delete from the edit dialog over Activity (desktop width), as ruled in MOB-R87 D1 (d): the edit
// leaves at once, a 6-second Undo toast, then the DELETE. In dialog mode Activity stays mounted underneath
// (MOB-R106 D1), so the list must change by refetch alone: Undo inside 6 s sends no DELETE and the row stays;
// no Undo sends exactly one DELETE at 6 s and the row leaves, with Activity never remounted.
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useEffect } from "react"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "@/components/pages/LogPage"
import { ToastProvider } from "@/components/ui/toaster"
import { transactionsApi } from "@/lib/api"
import { LogDialogContext, useLogBackground } from "./log-dialog"

const { LUNCH } = vi.hoisted(() => ({
  LUNCH: {
    id: 7,
    amount_kd: "2.500",
    category: "Food",
    merchant: "Talabat",
    name: "Lunch",
    date: "2026-10-16",
    category_counts_as_income: false,
  },
}))
let store: Array<typeof LUNCH> = []
let activityMounts = 0

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: {
      logSuggestions: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ data: { item: LUNCH } }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})

// Activity, reduced to what this pins: a list read through the query cache, and the row's Edit.
function Activity() {
  const navigate = useNavigate()
  useEffect(() => {
    activityMounts++
  }, [])
  const { data = [] } = useQuery({ queryKey: ["activity"], queryFn: async () => [...store] })
  return (
    <ul aria-label="Activity">
      {data.map((row) => (
        <li key={row.id}>
          {row.name} KD {row.amount_kd}
          <button type="button" onClick={() => navigate(`/log?edit=${row.id}`)}>Edit</button>
        </li>
      ))}
    </ul>
  )
}

// The two Routes of App.tsx's AppRoutes: the page behind, and /log on top inside LogDialogContext.
function AppLikeRoutes() {
  const location = useLocation()
  const background = useLogBackground()
  return (
    <>
      <Routes location={background ?? location}>
        <Route path="/activity" element={<Activity />} />
        <Route path="/log" element={<LogPage />} />
      </Routes>
      {background ? (
        <LogDialogContext.Provider value={true}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </LogDialogContext.Provider>
      ) : null}
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 1024px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  store = [{ ...LUNCH }]
  activityMounts = 0
  vi.mocked(transactionsApi.delete).mockReset()
  vi.mocked(transactionsApi.delete).mockImplementation(async (id: number) => {
    store = store.filter((row) => row.id !== id)
    return { ok: true, data: null, error: null, meta: {} } as never
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function deleteFromEditDialog() {
  render(
    <MemoryRouter initialEntries={["/activity"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AppLikeRoutes />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  const activity = await screen.findByRole("list", { name: "Activity" })
  await within(activity).findByText(/Lunch/)
  fireEvent.click(within(activity).getByRole("button", { name: "Edit" }))
  const dialog = await screen.findByRole("dialog", { name: "Edit expense" })
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete expense" }))
  // The edit leaves at once; Activity is the same mounted list, the row still in it, the toast up.
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit expense" })).not.toBeInTheDocument())
  expect(within(screen.getByRole("list", { name: "Activity" })).getByText(/Lunch KD 2\.500/)).toBeInTheDocument()
  expect(await screen.findByText("Transaction deleted")).toBeInTheDocument()
}

describe("Delete from the edit dialog over Activity (MOB-R107 D6)", () => {
  it("Undo inside 6 s sends no DELETE; the row stays listed", async () => {
    await deleteFromEditDialog()
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await act(async () => {
      vi.advanceTimersByTime(7000)
    })
    expect(transactionsApi.delete).not.toHaveBeenCalled()
    expect(within(screen.getByRole("list", { name: "Activity" })).getByText(/Lunch KD 2\.500/)).toBeInTheDocument()
    expect(activityMounts).toBe(1)
  })

  it("no Undo: exactly one DELETE at 6 s; the row leaves the list without a remount", async () => {
    await deleteFromEditDialog()
    await act(async () => {
      vi.advanceTimersByTime(5900)
    })
    expect(transactionsApi.delete).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await waitFor(() => expect(transactionsApi.delete).toHaveBeenCalledTimes(1))
    expect(transactionsApi.delete).toHaveBeenCalledWith(7)
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Activity" })).queryByText(/Lunch/)).not.toBeInTheDocument(),
    )
    expect(transactionsApi.delete).toHaveBeenCalledTimes(1)
    expect(activityMounts).toBe(1)
  })
})
