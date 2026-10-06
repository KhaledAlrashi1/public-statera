import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AppShell from "./AppShell"
import { TooltipProvider } from "@/components/ui/tooltip"

// MOB-R69 D1/D4 — every expense entry opens /log. The cases MOB-R61's file does not cover: the
// "L" key on Home, and the Log button on Home and on Plan. The mocks mirror AppShell.log-entry.test.tsx.

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

vi.mock("@/lib/useDarkMode", () => ({
  useDarkMode: () => ({
    isDark: false,
    toggleDarkMode: vi.fn(),
  }),
}))

vi.mock("./CommandPalette", () => ({
  default: () => null,
}))

function renderShell(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>home screen</div>} />
              <Route path="plan" element={<div>plan screen</div>} />
            </Route>
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("Expense entry points open /log (MOB-R69 D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it("the Log button on Home opens /log", () => {
    renderShell("/")
    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
  })

  it("the Log button on Plan opens /log", () => {
    renderShell("/plan")
    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
  })

  it("the L key on Home opens /log", () => {
    renderShell("/")
    fireEvent.keyDown(document, { key: "l" })
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
  })
})
