// MOB-R106 D1 — at desktop width, an edit opened from Activity (its row tap, the one way into an edit) is the same
// dialog over Activity; Escape goes back to Activity. An edit from anywhere else, an edit URL opened directly, and
// the phone keep the full-screen page.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import LogPage from "@/components/pages/LogPage"
import { LogDialogContext, useLogBackground } from "./log-dialog"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: {
      logSuggestions: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({
        data: {
          item: {
            id: 7,
            amount_kd: "2.500",
            category: "Food",
            merchant: "Talabat",
            name: "Lunch",
            date: "2026-10-16",
            category_counts_as_income: false,
          },
        },
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function stubWidth(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query === "(min-width: 1024px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
afterEach(() => vi.unstubAllGlobals())

function Probe() {
  const navigate = useNavigate()
  const background = useLogBackground()
  return (
    <>
      <p data-testid="background">{background ? background.pathname : "none"}</p>
      <button onClick={() => navigate("/log?edit=7")}>edit</button>
    </>
  )
}
function probe(initial: string) {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
  return () => screen.getByTestId("background").textContent
}

describe("Edit as a dialog over Activity at desktop width (MOB-R106 D1)", () => {
  it("keeps Activity behind an edit only on a desktop width, opened from Activity inside the app", () => {
    stubWidth(true)
    let background = probe("/activity")
    fireEvent.click(screen.getByText("edit"))
    expect(background()).toBe("/activity")
    cleanup()

    // From any other page an edit stays a page.
    background = probe("/plan")
    fireEvent.click(screen.getByText("edit"))
    expect(background()).toBe("none")
    cleanup()

    // An edit URL opened directly: a page.
    background = probe("/log?edit=7")
    expect(background()).toBe("none")
    cleanup()

    // The phone: a page.
    stubWidth(false)
    background = probe("/activity")
    fireEvent.click(screen.getByText("edit"))
    expect(background()).toBe("none")
  })

  it("shows the edit form in a dialog named Edit expense; Escape goes back to Activity", async () => {
    stubWidth(true)
    render(
      <MemoryRouter initialEntries={["/activity", "/log?edit=7"]} initialIndex={1}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/activity" element={<p>Activity behind</p>} />
            <Route path="/log" element={<LogDialogContext.Provider value={true}><LogPage /></LogDialogContext.Provider>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const dialog = await screen.findByRole("dialog", { name: "Edit expense" })
    expect(dialog).toHaveAttribute("data-log-frame")
    expect(await screen.findByRole("button", { name: "Delete expense" })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(await screen.findByText("Activity behind")).toBeInTheDocument()
  })
})
