/**
 * MOB-R73 E5 (operator selection D2) — "Log" lives in the centre of the bottom tab bar, a raised ink
 * circle that covers nothing, and opens /log. The floating FAB is hidden below lg by CSS, which
 * jsdom cannot evaluate; the layout (FAB gone, nothing covered) is measured in Playwright instead.
 * New file: AppShell.test.tsx is a named regression file (stays untouched).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
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
    flags: { enable_template_suggestions: false, enable_open_banking: false },
  },
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mocks.navigate }
})

// AppShell imports BOTH useAuth and getUserFirstName from this module, so both are enumerated.
// getUserFirstName DERIVES from its argument rather than returning a constant: a hardcoded "Alya"
// would satisfy the textContent assertion below even if the component passed nothing at all, which
// would make that half of the test non-discriminating.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    flags: mocks.auth.flags,
    loading: false,
    logout: mocks.logout,
  }),
  getUserFirstName: (u: { first_name?: string } | null | undefined) => u?.first_name ?? "",
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

// useDarkMode reads window.matchMedia, which jsdom does not implement; without this factory every
// case in the file throws "matchMedia is not a function" before AppShell renders anything.
vi.mock("@/lib/useDarkMode", () => ({
  useDarkMode: () => ({
    isDark: false,
    toggleDarkMode: vi.fn(),
  }),
}))

vi.mock("./CommandPalette", () => ({ default: () => null }))

function renderShell(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>home screen</div>} />
              <Route path="profile" element={<div>profile screen</div>} />
              <Route path="activity" element={<div>activity screen</div>} />
            </Route>
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("AppShell bottom bar Log item (MOB-R73 E5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("puts Log in the centre of the tab bar, between Transactions and Plan", () => {
    renderShell()
    const bar = screen.getByRole("navigation", { name: "Tab navigation" })
    const entries = Array.from(bar.querySelectorAll("a, button")).map((e) => e.textContent?.trim())
    expect(entries).toEqual(["Home", "Activity", "Log", "Plan", "Insights"])
  })

  it("opens /log, the expense entry, on any screen — an income view included", () => {
    renderShell("/activity?type=income")
    const bar = screen.getByRole("navigation", { name: "Tab navigation" })
    fireEvent.click(within(bar).getByRole("button", { name: "Log" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
  })
})
