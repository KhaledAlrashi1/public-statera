// MOB-R88 G — "Layout check" is an in-memory flag, off by default. While on, the layout readout shows on Activity
// (and on /log), and it lists elements whose right edge is past innerWidth.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setLayoutCheck } from "@/lib/layout-check"
import { LogLayoutReadout } from "./LogLayoutReadout"

vi.mock("@/lib/api", () => ({
  authApi: { profile: vi.fn().mockResolvedValue({ ok: true, profile: null }), clearDemoData: vi.fn() },
  categoriesApi: { list: vi.fn().mockResolvedValue([]) },
  merchantsApi: { list: vi.fn().mockResolvedValue([]) },
  transactionsApi: { bulkDelete: vi.fn() },
}))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }))
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))
vi.mock("./transactions/TransactionsTable", () => ({ default: () => null }))
vi.mock("./transactions/SettingsDialog", () => ({ default: () => null }))
vi.mock("./transactions/ImportDialogs", () => ({ ImportDialog: () => null, PreviewImportDialog: () => null }))
vi.mock("./transactions/BulkEditDialog", () => ({ BulkEditDialog: () => null }))

import TransactionsPage from "./TransactionsPage"

function renderActivity() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/activity"]}>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  act(() => setLayoutCheck(false))
  vi.restoreAllMocks()
})

describe("Layout check (MOB-R88 G)", () => {
  it("is off by default: Activity shows no readout", () => {
    renderActivity()
    expect(screen.queryByTestId("log-layout-readout")).toBeNull()
  })

  it("while on, Activity shows the readout", () => {
    act(() => setLayoutCheck(true))
    renderActivity()
    expect(screen.getByTestId("log-layout-readout")).toHaveTextContent("innerWidth")
  })

  it("lists an element wider than the screen (a forced 500px child at 390)", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390)
    const wide = document.createElement("div")
    wide.className = "too-wide grid extra"
    document.body.appendChild(wide)
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === wide) return { left: 0, right: 500, width: 500, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      return real.call(this)
    })
    render(<LogLayoutReadout />)
    expect(screen.getByTestId("log-layout-readout")).toHaveTextContent("wider: div.too-wide.grid left 0 right 500")
    wide.remove()
  })

  it("shows /log's frame (scrollHeight, clientHeight, scrollTop) and what 100vh, 100dvh and 100svh measure (MOB-R91 B3)", () => {
    const frame = document.createElement("div")
    frame.setAttribute("data-log-frame", "")
    document.body.appendChild(frame)
    vi.spyOn(frame, "scrollHeight", "get").mockReturnValue(1200)
    vi.spyOn(frame, "clientHeight", "get").mockReturnValue(797)
    frame.scrollTop = 40
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const h = (this as HTMLElement).style?.height
      const height = h === "100vh" ? 844 : h === "100dvh" ? 797 : h === "100svh" ? 797 : null
      if (height !== null) return { left: 0, right: 0, width: 0, top: 0, bottom: height, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      return real.call(this)
    })
    render(<LogLayoutReadout />)
    const readout = screen.getByTestId("log-layout-readout")
    expect(readout).toHaveTextContent("frame scrollHeight 1200 · clientHeight 797 · scrollTop 40")
    expect(readout).toHaveTextContent("100vh 844 · 100dvh 797 · 100svh 797")
    frame.remove()
  })

  it("says \"frame none\" where there is no /log frame (Activity)", () => {
    render(<LogLayoutReadout />)
    expect(screen.getByTestId("log-layout-readout")).toHaveTextContent("frame none")
  })
})
