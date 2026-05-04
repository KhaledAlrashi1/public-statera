import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import RegisterPage from "./RegisterPage"

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    register: mocks.register,
  }),
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mocks.register.mockResolvedValue(undefined)
  })

  it("redirects new users to the workspace choice step after registration", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new-user@example.com" },
    })
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: "Ali" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith(
        "new-user@example.com",
        "password123",
        "Ali",
        undefined
      )
    })
    expect(window.sessionStorage.getItem("pending-workspace-choice")).toBe("1")
    expect(mocks.navigate).toHaveBeenCalledWith("/welcome", { replace: true })
  })

  it("blocks passwords shorter than 8 characters on the client", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new-user@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "short" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument()
    expect(mocks.register).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
