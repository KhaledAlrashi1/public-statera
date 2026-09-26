/**
 * MOB-R33/R36 C3 — the Profile "Monthly income" field.
 *
 * Income is typed-only: the profile's monthly_income_kd is the one figure every income-derived
 * number uses. Before this, Profile had NO way to set it (the section was a read-only
 * "Income Detection" panel fed by R11). These cases pin the field: it shows the stored value,
 * saves the typed string unchanged, clears to null, validates with the ruled message (#7), no
 * longer calls R11, and invalidates the income-bearing queries on save.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  updateProfile: vi.fn(),
  incomePattern: vi.fn(),
  // Stable identities: ProfilePage's loader lists `toast` as a dependency, so a fresh object per
  // render would re-run it forever.
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  auth: {
    user: { id: 1, email: "user@example.com", first_name: "Ali", last_name: "", display_name: "Ali", totp_enabled: false, created_at: "2026-01-01T00:00:00+00:00" },
    refreshUser: vi.fn(),
    logout: vi.fn(),
  },
  prefs: { darkMode: false, setDarkMode: vi.fn() },
}))

vi.mock("@/lib/api", () => ({
  authApi: { profile: mocks.profile, updateProfile: mocks.updateProfile },
  analyticsApi: { incomePattern: mocks.incomePattern },
}))
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }))
vi.mock("@/contexts/PreferencesContext", () => ({ usePreferences: () => mocks.prefs }))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("@/components/auth/TwoFactorSetup", () => ({ TwoFactorSetup: () => null }))
vi.mock("@/components/pages/profile/DataPrivacySection", () => ({ default: () => null }))

import ProfilePage from "./ProfilePage"

function profileResponse(monthlyIncome: string | null) {
  return {
    ok: true,
    user: mocks.auth.user,
    profile: { monthly_income_kd: monthlyIncome, payday_day: null, country: null, timezone: "Asia/Kuwait", email_notifications_enabled: true, setup_guide_seen: false, setup_guide_dismissed: false },
  }
}

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return qc
}

async function incomeField(): Promise<HTMLInputElement> {
  return (await screen.findByLabelText("Monthly income (KD)")) as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile.mockResolvedValue(profileResponse("1500.000"))
  mocks.updateProfile.mockImplementation(async (body: { monthly_income_kd?: string | null }) =>
    profileResponse(body.monthly_income_kd ?? null))
  mocks.incomePattern.mockResolvedValue(null)
})

describe("ProfilePage — Monthly income (MOB-R36 C3)", () => {
  it("shows the stored monthly income in the field", async () => {
    renderPage()
    const field = await incomeField()
    await waitFor(() => expect(field.value).toBe("1500.000"))
  })

  it("Save income sends the typed amount as a string, unchanged", async () => {
    renderPage()
    const field = await incomeField()
    await waitFor(() => expect(field.value).toBe("1500.000"))
    fireEvent.change(field, { target: { value: "1250.500" } })
    fireEvent.click(screen.getByRole("button", { name: "Save income" }))
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: "1250.500" }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Monthly income saved."))
  })

  it("Clear sends null", async () => {
    renderPage()
    const field = await incomeField()
    await waitFor(() => expect(field.value).toBe("1500.000"))
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: null }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Monthly income cleared."))
  })

  it("an invalid amount shows the ruled validation message and does not save", async () => {
    renderPage()
    const field = await incomeField()
    await waitFor(() => expect(field.value).toBe("1500.000"))
    fireEvent.change(field, { target: { value: "12.3456" } })
    fireEvent.click(screen.getByRole("button", { name: "Save income" }))
    expect(await screen.findByText("Enter an amount above zero, with up to 3 decimals.")).toBeInTheDocument()
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })

  it("no longer loads the income-detection pattern (R11 has no caller)", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Monthly income" })).toBeInTheDocument()
    expect(screen.queryByText("Income Detection")).not.toBeInTheDocument()
    expect(mocks.incomePattern).not.toHaveBeenCalled()
  })

  it("saving invalidates the income-bearing queries, and not unrelated ones", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const keys = {
      profile: ["auth-profile", "dashboard"],
      bundle: ["dashboard-bundle", "2026-05"],
      budgets: ["budgets", "2026-05"],
      insights: ["insights", "safe-to-spend", "2026-05"],
      control: ["transactions", "list"],
    }
    for (const k of Object.values(keys)) qc.setQueryData(k, { ok: true })
    renderPage(qc)
    const field = await incomeField()
    await waitFor(() => expect(field.value).toBe("1500.000"))
    fireEvent.change(field, { target: { value: "1250.500" } })
    fireEvent.click(screen.getByRole("button", { name: "Save income" }))
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled())
    const invalidated = (k: readonly unknown[]) => qc.getQueryState(k)?.isInvalidated ?? false
    await waitFor(() => {
      expect(invalidated(keys.profile)).toBe(true)
      expect(invalidated(keys.bundle)).toBe(true)
      expect(invalidated(keys.budgets)).toBe(true)
      expect(invalidated(keys.insights)).toBe(true)
    })
    expect(invalidated(keys.control)).toBe(false)
  })
})
