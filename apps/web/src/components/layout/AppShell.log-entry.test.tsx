import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AppShell from "./AppShell"
import { TooltipProvider } from "@/components/ui/tooltip"

// MOB-R61 D2 — /log is the main expense entry: the FAB (and "L", which shares its handler) opens
// /log for an expense and keeps QuickAdd for income. New file per the standing rule; the mocks and
// the render mirror AppShell.test.tsx's.

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

function renderShell(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>home screen</div>} />
              <Route path="activity" element={<div>activity screen</div>} />
              <Route path="income" element={<div>income screen</div>} />
            </Route>
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("AppShell FAB destination (MOB-R61 D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it("opens /log, not QuickAdd, for an expense", () => {
    renderShell("/activity?type=expense")

    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))

    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
  })

  it("keeps QuickAdd for income", () => {
    renderShell("/income")

    fireEvent.click(screen.getByRole("button", { name: "Log transaction" }))

    expect(mocks.openQuickAdd).toHaveBeenCalledWith("income")
    expect(mocks.navigate).not.toHaveBeenCalledWith("/log")
  })
})
