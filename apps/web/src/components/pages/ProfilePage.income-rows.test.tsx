// MOB-R91 C1 — Profile shows income and payday as two rows; Edit opens the "Income and payday" sheet, which
// starts from the stored values.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("@/components/auth/TwoFactorSetup", () => ({ TwoFactorSetup: () => null }))
vi.mock("@/components/pages/profile/DataPrivacySection", () => ({ default: () => null }))

import ProfilePage from "./ProfilePage"

function renderProfile(profile: { monthly_income_kd: string | null; payday_day: number | null }) {
  mocks.profile.mockResolvedValue({ ok: true, user: mocks.auth.user, profile: { ...profile, email_notifications_enabled: true } })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const row = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!

beforeEach(() => vi.clearAllMocks())

describe("Profile — income and payday rows (MOB-R91 C1)", () => {
  it("shows both values, and Not set / the calendar month when none is set", async () => {
    renderProfile({ monthly_income_kd: "1500.000", payday_day: 25 })
    expect(await within(row("Monthly income")).findByText("KD 1,500.000")).toBeInTheDocument()
    expect(within(row("Payday")).getByText("25th")).toBeInTheDocument()
  })

  it("with nothing set: Not set and 1st · calendar month; Edit opens the sheet at those values", async () => {
    renderProfile({ monthly_income_kd: null, payday_day: null })
    expect(await within(row("Monthly income")).findByText("Not set")).toBeInTheDocument()
    expect(within(row("Payday")).getByText("1st · calendar month")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const sheet = await screen.findByRole("dialog", { name: "Income and payday" })
    expect((within(sheet).getByLabelText("Payday") as HTMLSelectElement).value).toBe("1")
    expect(within(sheet).getByLabelText("Monthly income")).toHaveValue("")
  })
})
