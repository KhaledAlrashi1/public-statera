import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import DeleteAccountConfirmPage from "./DeleteAccountConfirmPage"
import { ApiError } from "@/lib/api"

let mockDelete: ReturnType<typeof vi.fn>
let mockReset: ReturnType<typeof vi.fn>

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    accountApi: { deleteAccount: (...args: unknown[]) => mockDelete(...args) },
  }
})

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ resetAuthState: mockReset }),
}))

function renderPage(path = "/delete-account/confirm") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/delete-account/confirm" element={<DeleteAccountConfirmPage />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/profile" element={<div>Profile page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function typeConfirm(value: string) {
  fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value } })
}

function deleteButton() {
  return screen.getByRole("button", { name: /permanently delete/i })
}

beforeEach(() => {
  mockDelete = vi.fn()
  mockReset = vi.fn()
})

describe("DeleteAccountConfirmPage", () => {
  it("keeps the delete button disabled until DELETE is typed exactly", () => {
    renderPage()
    expect(deleteButton()).toBeDisabled()
    typeConfirm("delete") // wrong case
    expect(deleteButton()).toBeDisabled()
    typeConfirm("DELETE")
    expect(deleteButton()).toBeEnabled()
  })

  it("on success, resets auth state and navigates to /login?deleted=1", async () => {
    mockDelete.mockResolvedValue({ deleted: true })
    renderPage()
    typeConfirm("DELETE")
    fireEvent.click(deleteButton())
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument())
    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  it("on 410 DELETE_INTENT_GONE, shows expired view with a Start over path to /profile", async () => {
    mockDelete.mockRejectedValue(new ApiError("gone", 410, "DELETE_INTENT_GONE"))
    renderPage()
    typeConfirm("DELETE")
    fireEvent.click(deleteButton())
    await waitFor(() => expect(screen.getByText(/verification expired/i)).toBeInTheDocument())
    expect(mockReset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /start over/i }))
    await waitFor(() => expect(screen.getByText("Profile page")).toBeInTheDocument())
  })

  it("on 403 ACCOUNT_INACTIVE, shows already-deleted view with a sign-in path", async () => {
    mockDelete.mockRejectedValue(new ApiError("inactive", 403, "ACCOUNT_INACTIVE"))
    renderPage()
    typeConfirm("DELETE")
    fireEvent.click(deleteButton())
    await waitFor(() => expect(screen.getByText(/already deleted/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /go to sign in/i }))
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument())
  })

  it("on 500 deletion_failed, shows an inline error and allows retry", async () => {
    mockDelete
      .mockRejectedValueOnce(new ApiError("fail", 500, "deletion_failed"))
      .mockResolvedValueOnce({ deleted: true })
    renderPage()
    typeConfirm("DELETE")
    fireEvent.click(deleteButton())
    await waitFor(() => expect(screen.getByText(/something went wrong deleting/i)).toBeInTheDocument())
    // Still on the confirm form (recoverable) — retry succeeds.
    expect(deleteButton()).toBeEnabled()
    fireEvent.click(deleteButton())
    await waitFor(() => expect(screen.getByText("Login page")).toBeInTheDocument())
    expect(mockReset).toHaveBeenCalledTimes(1)
  })
})
