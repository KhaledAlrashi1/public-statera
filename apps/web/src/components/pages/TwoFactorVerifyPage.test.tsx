import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import TwoFactorVerifyPage from "./TwoFactorVerifyPage"
import { ApiError } from "@/lib/api"

let mockVerify: ReturnType<typeof vi.fn>
let mockToastWarning: ReturnType<typeof vi.fn>

vi.mock("@/contexts/AuthContext", () => ({
  // Only verifyTwoFactor is mocked; TwoFactorVerifyPage doesn't read other useAuth
  // fields. If that changes, expand the mock.
  useAuth: () => ({ verifyTwoFactor: mockVerify }),
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ warning: mockToastWarning }),
}))

function renderPage(path = "/auth/2fa-verify") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/2fa-verify" element={<TwoFactorVerifyPage />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/delete-account/confirm" element={<div>Delete confirm</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function enterCodeAndSubmit(code = "123456") {
  fireEvent.change(screen.getByLabelText(/authenticator code/i), { target: { value: code } })
  fireEvent.click(screen.getByRole("button", { name: /verify/i }))
}

beforeEach(() => {
  mockVerify = vi.fn()
  mockToastWarning = vi.fn()
})

describe("TwoFactorVerifyPage", () => {
  it("renders code input and submit button", () => {
    renderPage()
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /verify/i })).toBeInTheDocument()
  })

  it("on success without intent, navigates to /", async () => {
    mockVerify.mockResolvedValue({ warning: undefined, backupCodesRemaining: undefined })
    renderPage()
    enterCodeAndSubmit()
    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument())
  })

  it("on success with ?intent=delete, navigates to /delete-account/confirm", async () => {
    mockVerify.mockResolvedValue({ warning: undefined, backupCodesRemaining: undefined })
    renderPage("/auth/2fa-verify?intent=delete")
    enterCodeAndSubmit()
    await waitFor(() => expect(screen.getByText("Delete confirm")).toBeInTheDocument())
  })

  it("on BACKUP_CODES_LOW, shows count toast then navigates to /", async () => {
    mockVerify.mockResolvedValue({ warning: "BACKUP_CODES_LOW", backupCodesRemaining: 2 })
    renderPage()
    enterCodeAndSubmit()
    await waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(
        "Only 2 backup codes remaining — generate new ones from Profile.",
      ),
    )
    await waitFor(() => expect(screen.getByText("Dashboard")).toBeInTheDocument())
  })

  it("on 410 PENDING_2FA_GONE, navigates to /login", async () => {
    mockVerify.mockRejectedValue(new ApiError("No pending 2FA session.", 410, "PENDING_2FA_GONE"))
    renderPage()
    enterCodeAndSubmit("000000")
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument())
  })

  it("on 401 PENDING_2FA_RESTART, navigates to /login", async () => {
    mockVerify.mockRejectedValue(
      new ApiError("Too many failed attempts.", 401, "PENDING_2FA_RESTART"),
    )
    renderPage()
    enterCodeAndSubmit("000000")
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument())
  })

  it("on invalid code (recoverable INVALID_TOTP_CODE), shows inline error and stays on page", async () => {
    mockVerify.mockRejectedValue(
      new ApiError("Invalid authentication code.", 401, "INVALID_TOTP_CODE"),
    )
    renderPage()
    enterCodeAndSubmit("000000")
    await waitFor(() => expect(screen.getByText(/incorrect code/i)).toBeInTheDocument())
    expect(screen.queryByText("Login page")).not.toBeInTheDocument()
  })
})
