// MOB-R87 C1 — Profile ends with a "Layout check" link to /log?layout=1, so the readout is reachable in the installed app.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  auth: {
    user: { id: 1, email: "user@example.com", first_name: "Ali", last_name: "", display_name: "Ali", totp_enabled: false, created_at: "2026-01-01T00:00:00+00:00" },
    refreshUser: vi.fn(),
    logout: vi.fn(),
  },
  prefs: { darkMode: false, setDarkMode: vi.fn() },
}))

vi.mock("@/lib/api", () => ({
  authApi: { profile: vi.fn().mockResolvedValue({ ok: true, user: null, profile: null }), updateProfile: vi.fn() },
}))
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }))
vi.mock("@/contexts/PreferencesContext", () => ({ usePreferences: () => mocks.prefs }))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("@/components/auth/TwoFactorSetup", () => ({ TwoFactorSetup: () => null }))
vi.mock("@/components/pages/profile/DataPrivacySection", () => ({ default: () => null }))

import ProfilePage from "./ProfilePage"

describe("Profile — Layout check link (MOB-R87 C1)", () => {
  it("is present and goes to /log?layout=1", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole("link", { name: "Layout check" })).toHaveAttribute("href", "/log?layout=1")
  })
})
