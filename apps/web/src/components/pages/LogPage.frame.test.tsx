// MOB-R91 B2 — /log is one frame the height of the visible screen (100dvh, 100vh where dvh is unknown) that scrolls
// inside itself, with the page column and the Save bar in it; the document does not scroll. Opened from the Home
// Screen, 100vh is the whole screen (844 on his phone) while 797 shows, which is what made /log slide under the clock.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: {
      logSuggestions: vi.fn().mockResolvedValue([{ name: "Alpha", category: "Coffee", count: 3, items: [], last_amount: null, last_used: null }]),
      create: vi.fn(),
      delete: vi.fn(),
    },
    categoriesApi: { list: vi.fn().mockResolvedValue([{ id: 1, name: "Coffee", kind: "expense", transaction_count: 3 }]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

class FakeVisualViewport extends EventTarget {
  height = 600
  width = 390
  offsetTop = 0
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
const frame = () => document.querySelector<HTMLElement>("[data-log-frame]")

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("/log frame (MOB-R91 B2)", () => {
  it("is one visible-height box that scrolls itself, holding the title and the Save bar; nothing uses 100vh as a minimum", () => {
    renderLog()
    const f = frame()
    expect(f).not.toBeNull()
    const cls = f!.className.split(/\s+/)
    expect(cls).toEqual(expect.arrayContaining(["h-visible", "overflow-y-auto"]))
    expect(f!.querySelector(".min-h-screen")).toBeNull()
    expect(cls).not.toContain("min-h-screen")
    expect(f!.contains(screen.getByRole("heading", { name: "New expense" }))).toBe(true)
    // The Save bar (sticky at the bottom) is inside the frame, so it sticks to the frame's bottom.
    const bar = f!.querySelector(".sticky.bottom-0")
    expect(bar).not.toBeNull()
    expect(bar!.querySelector("button")).not.toBeNull()
  })

  it("h-visible is 100vh then 100dvh, and the body's minimum is the visible height, not 100vh", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8")
    expect(css).toMatch(/\.h-visible \{\s*height: 100vh;\s*height: 100dvh;\s*\}/)
    expect(css).toMatch(/\.min-h-visible \{\s*min-height: 100vh;\s*min-height: 100dvh;\s*\}/)
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8")
    const body = html.split("\n").find((l) => l.includes("<body"))
    expect(body).toContain("min-h-visible")
    expect(body).not.toContain("min-h-screen")
  })

  it("revealing a focused field above the keyboard scrolls the frame, never the window", async () => {
    const vv = new FakeVisualViewport()
    vi.stubGlobal("visualViewport", vv)
    renderLog()
    fireEvent.click(await screen.findByRole("button", { name: /^Place/ }))
    const field = screen.getByRole("textbox", { name: "Search places" })
    field.focus()
    const f = frame()!
    const frameScroll = vi.fn()
    f.scrollBy = frameScroll as unknown as typeof f.scrollBy
    const windowScroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue({ top: 460, bottom: 500, left: 0, right: 390, width: 390, height: 40, x: 0, y: 460, toJSON: () => ({}) } as DOMRect)
    act(() => {
      vv.height = 300
      vv.dispatchEvent(new Event("resize"))
    })
    // visible bottom = 0 + 300 - 12 = 288; the field's bottom is 500, so the frame moves 212.
    expect(frameScroll).toHaveBeenCalledWith(0, 212)
    expect(windowScroll).not.toHaveBeenCalled()
  })
})
