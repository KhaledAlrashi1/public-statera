// MOB-R91 E — Profile fixes: the Timezone section is gone (the stored value and the API stay); Security, the email
// line and the page title say what is true; a toast is an opaque surface, not a 10% wash text shows through.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider, useToast } from "@/components/ui/toaster"

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  auth: {
    user: { id: 1, email: "user@example.com", first_name: "Ali", last_name: "", display_name: "Ali", totp_enabled: false, created_at: "2026-01-01T00:00:00+00:00" },
    refreshUser: vi.fn(),
    logout: vi.fn(),
  },
  prefs: { darkMode: false, setDarkMode: vi.fn() },
}))

vi.mock("@/lib/api", () => ({ authApi: { profile: mocks.profile, updateProfile: vi.fn() } }))
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }))
vi.mock("@/contexts/PreferencesContext", () => ({ usePreferences: () => mocks.prefs }))
vi.mock("@/components/auth/TwoFactorSetup", () => ({ TwoFactorSetup: () => null }))
vi.mock("@/components/pages/profile/DataPrivacySection", () => ({ default: () => null }))

import ProfilePage from "./ProfilePage"

function renderProfile() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile.mockResolvedValue({
    ok: true,
    user: mocks.auth.user,
    profile: { monthly_income_kd: null, payday_day: null, country: null, timezone: "Europe/London", email_notifications_enabled: true },
  })
})

describe("Profile fixes (MOB-R91 E)", () => {
  it("has no Timezone section, even when a timezone is stored", async () => {
    renderProfile()
    await screen.findByText("Emails about: budget alerts.")
    expect(screen.queryByText(/timezone/i)).toBeNull()
    expect(screen.queryByDisplayValue("Europe/London")).toBeNull()
    expect(screen.queryByRole("button", { name: /Save timezone/ })).toBeNull()
  })

  it("Security, email and title say what is true: no password, only the emails it governs, the ruled title", async () => {
    renderProfile()
    expect(await screen.findByText("Emails about: budget alerts.")).toBeInTheDocument()
    expect(screen.getByText("Keep your account safe.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Two-factor authentication" })).toBeInTheDocument()
    expect(screen.getByText("Add a code from an authenticator app when you sign in.")).toBeInTheDocument()
    expect(screen.queryByText(/password/i)).toBeNull()
    expect(screen.queryByText(/consent|savings milestone/i)).toBeNull()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Account and settings")
  })

  it("a toast is opaque: the card colour with the tone mixed in, no see-through wash and no blur", () => {
    let api: ReturnType<typeof useToast> | null = null
    function Grab() {
      api = useToast()
      return null
    }
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    )
    act(() => {
      api!.success("Changes saved")
      api!.error("Couldn't save")
    })
    for (const text of ["Changes saved", "Couldn't save"]) {
      const box = screen.getByText(text).parentElement!
      const cls = box.className.split(/\s+/)
      expect(cls.some((c) => c.startsWith("bg-[color-mix(in_oklab,") && c.endsWith(",var(--color-card))]"))).toBe(true)
      expect(cls.some((c) => /^bg-[a-z]+\/\d+$/.test(c))).toBe(false)
      expect(cls).not.toContain("backdrop-blur-sm")
    }
  })
})
