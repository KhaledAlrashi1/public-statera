import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TwoFactorSetup } from "./TwoFactorSetup"

describe("TwoFactorSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requires backup-code acknowledgement before enabling 2FA", async () => {
    const onSetupConfirm = vi.fn().mockResolvedValue(undefined)

    render(
      <TwoFactorSetup
        enabled={false}
        setupData={{
          qr_data_uri: "data:image/png;base64,abc",
          secret_b32: "ABC123",
          backup_codes: ["code-1", "code-2"],
        }}
        loading={false}
        error=""
        onSetupStart={vi.fn()}
        onSetupConfirm={onSetupConfirm}
        onDisable={vi.fn()}
      />
    )

    expect(screen.getByText(/These codes will not be shown again/i)).toBeInTheDocument()

    const submitButton = screen.getByRole("button", { name: "Enable 2FA" })
    expect(submitButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Enter 6-digit code to confirm"), {
      target: { value: "123456" },
    })
    expect(submitButton).toBeDisabled()

    fireEvent.click(screen.getByRole("checkbox", { name: /I have saved these backup codes/i }))
    expect(submitButton).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Copy all codes" }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("code-1\ncode-2")
    })

    fireEvent.click(submitButton)
    await waitFor(() => {
      expect(onSetupConfirm).toHaveBeenCalledWith("123456")
    })
  })
})
