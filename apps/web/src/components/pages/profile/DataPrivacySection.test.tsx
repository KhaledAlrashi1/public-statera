import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"

import DataPrivacySection from "./DataPrivacySection"
import { ApiError } from "@/lib/api"

let mockExport: ReturnType<typeof vi.fn>
let mockToastSuccess: ReturnType<typeof vi.fn>
let mockToastError: ReturnType<typeof vi.fn>

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    accountApi: { dataExport: (...args: unknown[]) => mockExport(...args) },
  }
})

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

function renderSection() {
  return render(
    <MemoryRouter>
      <DataPrivacySection />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockExport = vi.fn()
  mockToastSuccess = vi.fn()
  mockToastError = vi.fn()
})

describe("DataPrivacySection", () => {
  it("renders in-app legal links to /privacy and /terms", () => {
    renderSection()
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveAttribute("href", "/terms")
  })

  it("downloads data and toasts success on export", async () => {
    mockExport.mockResolvedValue(undefined)
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: /^download$/i }))
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("Your data export has started downloading."),
    )
  })

  it("shows a rate-limit message when export returns 429", async () => {
    mockExport.mockRejectedValue(new ApiError("rate limited", 429, undefined))
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: /^download$/i }))
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "You've reached the data-export limit. Please try again later.",
      ),
    )
  })

  it("opens the delete dialog whose 'Continue to verification' points at delete-reauth", async () => {
    renderSection()
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }))
    const continueLink = await screen.findByRole("link", { name: /continue to verification/i })
    expect(continueLink).toHaveAttribute("href", "/api/auth/delete-reauth")
  })
})
