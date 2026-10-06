/**
 * MOB-R73 E8 — the Home menu button keeps no ring after a page load (operator C7). The ring was a
 * PROGRAMMATIC focus: the drawer's "return focus on close" effect also ran on mount, when drawerOpen
 * starts false. Focus now returns to the menu button only on a real open -> closed change.
 * New file: AppShell.test.tsx is a named regression file (stays untouched).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
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

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>home screen</div>} />
              <Route path="profile" element={<div>profile screen</div>} />
            </Route>
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("AppShell menu button focus (MOB-R73 E8)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("does not take focus on load, and still gets it back when the drawer closes", () => {
    renderShell()
    const menu = screen.getByRole("button", { name: "Open navigation menu" })
    expect(menu).not.toHaveFocus()
    fireEvent.click(menu)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(menu).toHaveFocus()
  })
})
