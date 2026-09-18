/**
 * MOB-1 Part 2A — the mobile drawer's route to Profile.
 *
 * This is MENU CONTENT, not layout, so it is testable and a declared coverage gap would be the
 * wrong answer here (MOB-R21). jsdom cannot evaluate the `lg:hidden` that hides the drawer on
 * desktop, but it renders the drawer markup regardless, and the assertions below are about the
 * entry's LABEL and ACCESSIBLE NAME — both of which jsdom reports faithfully.
 *
 * Carried in its own file because AppShell.test.tsx is one of the three named regression files
 * that must stay green AND untouched.
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

// QuickAddProvider is enumerated here because AppShell imports BOTH exports; a factory that
// lists only useQuickAdd makes the other resolve to undefined and every case in this file throws.
vi.mock("@/contexts/QuickAddContext", () => ({
  QuickAddProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useQuickAdd: () => ({ openQuickAdd: mocks.openQuickAdd, closeQuickAdd: vi.fn() }),
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

describe("MOB-1 Part 2A — mobile drawer route to Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("names the drawer's profile entry 'Profile and settings', not the user's name", () => {
    renderShell()
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }))

    // WITHOUT the change the entry's only accessible name is the first name, so this query
    // finds nothing and the test fails on "Unable to find an accessible element".
    const entry = screen.getByRole("button", { name: "Profile and settings" })
    expect(entry).toBeTruthy()
  })

  it("shows 'Profile' as the visible label with the name kept as secondary context", () => {
    renderShell()
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }))

    const entry = screen.getByRole("button", { name: "Profile and settings" })
    // WITHOUT the change the textContent is "Alya" alone — no "Profile".
    expect(entry.textContent).toContain("Profile")
    // The signed-in-as context is retained rather than dropped by the relabel.
    expect(entry.textContent).toContain("Alya")
  })

  it("routes to /profile when the entry is activated", () => {
    renderShell()
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }))
    fireEvent.click(screen.getByRole("button", { name: "Profile and settings" }))

    expect(mocks.navigate).toHaveBeenCalledWith("/profile")
  })
})
