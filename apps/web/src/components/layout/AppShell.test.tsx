import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AppShell from "./AppShell"
import { TooltipProvider } from "@/components/ui/tooltip"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openQuickAdd: vi.fn(),
  logout: vi.fn(),
  auth: {
    user: {
      id: 1,
      email: "user@example.com",
      first_name: "Alya",
      last_name: "Test",
      display_name: "Alya Test",
      totp_enabled: false,
      created_at: "2026-03-10T00:00:00Z",
    },
    flags: {
      enable_template_suggestions: false,
      enable_open_banking: false,
    },
  },
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    flags: mocks.auth.flags,
    logout: mocks.logout,
  }),
  getUserFirstName: () => "Alya",
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock("@/contexts/QuickAddContext", () => ({
  QuickAddProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useQuickAdd: () => ({
    openQuickAdd: mocks.openQuickAdd,
    closeQuickAdd: vi.fn(),
  }),
}))

vi.mock("@/lib/useDarkMode", () => ({
  useDarkMode: () => ({
    isDark: false,
    toggleDarkMode: vi.fn(),
  }),
}))

vi.mock("./CommandPalette", () => ({
  default: () => null,
}))

function renderShell(initialEntry = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  // TooltipProvider mirrors App.tsx — AppShell's FAB tooltip (Radix Root) needs it.
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>home screen</div>} />
              <Route path="activity" element={<div>activity screen</div>} />
              <Route path="plan" element={<div>plan screen</div>} />
              <Route path="insights" element={<div>insights screen</div>} />
              <Route path="bank" element={<div>bank screen</div>} />
              <Route path="profile" element={<div>profile screen</div>} />
            </Route>
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.flags.enable_open_banking = false
    window.scrollTo = vi.fn()
  })

  it("opens quick add without navigating away from the current page", () => {
    renderShell("/")

    expect(screen.getByText("home screen")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))

    expect(mocks.openQuickAdd).toHaveBeenCalledWith("expense")
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(screen.getByText("home screen")).toBeInTheDocument()
  })

  it("uses the current income context for quick add without surfacing hidden bank navigation", () => {
    mocks.auth.flags.enable_open_banking = true

    renderShell("/activity?type=income")

    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))

    expect(mocks.openQuickAdd).toHaveBeenCalledWith("income")
    expect(screen.queryByText("Bank")).not.toBeInTheDocument()
  })

  it("surfaces sign out from the header user menu", async () => {
    mocks.logout.mockResolvedValue(undefined)

    renderShell("/")

    fireEvent.click(screen.getByRole("button", { name: "Open user menu" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }))

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledTimes(1)
      expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true })
    })
  })

  it("opens quick add when the L shortcut fires with no modal and no text focus", () => {
    renderShell("/")

    fireEvent.keyDown(document.body, { key: "l" })

    expect(mocks.openQuickAdd).toHaveBeenCalledWith("expense")
  })

  it("suppresses the L shortcut while focus is inside a text-entry control", () => {
    renderShell("/")

    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(document.body, { key: "l" })

    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
    input.remove()
  })

  it("suppresses the L shortcut while a dialog overlay is open", () => {
    renderShell("/")

    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    document.body.appendChild(dialog)

    fireEvent.keyDown(document.body, { key: "l" })

    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
    dialog.remove()
  })

})
