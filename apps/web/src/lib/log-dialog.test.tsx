// MOB-R105 F2 — at desktop width, New expense opened from inside the app is a dialog over the page she was on;
// an edit, a /log opened directly, and the phone keep the full-screen page. In the dialog there is one close
// control, and Escape and Close both go back.
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
    transactionsApi: { logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() },
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
      <button onClick={() => navigate("/log")}>new</button>
      <button onClick={() => navigate("/log?edit=5")}>edit</button>
      <button onClick={() => navigate("/plan")}>plan</button>
      <button onClick={() => navigate(-1)}>back</button>
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

describe("New expense as a dialog at desktop width (MOB-R105 F2)", () => {
  it("keeps the page she was on behind /log only on a desktop width, for a new expense opened in the app", () => {
    stubWidth(true)
    let background = probe("/plan")
    expect(background()).toBe("none")
    fireEvent.click(screen.getByText("new"))
    expect(background()).toBe("/plan")
    fireEvent.click(screen.getByText("edit"))
    expect(background()).toBe("none")
    cleanup()

    // Opened directly (the router's first location): a page, also when Back returns to it from another page.
    background = probe("/log")
    expect(background()).toBe("none")
    fireEvent.click(screen.getByText("plan"))
    fireEvent.click(screen.getByText("back"))
    expect(background()).toBe("none")
    cleanup()

    // The phone: a page, however it was opened.
    stubWidth(false)
    background = probe("/plan")
    fireEvent.click(screen.getByText("new"))
    expect(background()).toBe("none")
  })

  it("shows the Log form in a dialog with one close control; Escape and Close go back", async () => {
    stubWidth(true)
    const open = () => render(
      <MemoryRouter initialEntries={["/", "/log"]} initialIndex={1}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/" element={<p>Home behind</p>} />
            <Route path="/log" element={<LogDialogContext.Provider value={true}><LogPage /></LogDialogContext.Provider>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    open()
    const dialog = await screen.findByRole("dialog", { name: "New expense" })
    expect(dialog).toHaveAttribute("data-log-frame")
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(await screen.findByText("Home behind")).toBeInTheDocument()
    cleanup()

    open()
    fireEvent.click(await screen.findByRole("button", { name: "Close" }))
    expect(await screen.findByText("Home behind")).toBeInTheDocument()
  })
})
