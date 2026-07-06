import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"

import LoginPage from "./LoginPage"

describe("LoginPage", () => {
  it("renders OIDC sign-in link pointing to /api/auth/login", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const link = screen.getByRole("link", { name: /continue with google/i })
    expect(link).toHaveAttribute("href", "/api/auth/login")
  })

  it("renders sign-in heading", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument()
  })

  it("renders public Privacy and Terms footer links", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole("link", { name: /^privacy$/i })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveAttribute("href", "/terms")
  })

  it("shows the deletion confirmation when ?deleted=1 is present", () => {
    render(
      <MemoryRouter initialEntries={["/login?deleted=1"]}>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/your account has been deleted/i)).toBeInTheDocument()
  })

  it("does not show the deletion confirmation without ?deleted=1", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/your account has been deleted/i)).not.toBeInTheDocument()
  })
})
