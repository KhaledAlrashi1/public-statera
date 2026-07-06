import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"

import TermsPage from "./TermsPage"

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>,
  )
}

describe("TermsPage", () => {
  it("renders as a public page with the Terms of Service title", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /terms of service/i })).toBeInTheDocument()
  })

  it("renders final section content and no pending markers", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /acceptable use/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /limitation of liability/i })).toBeInTheDocument()
    // Content-fill shipped: the structure-only pending markers must be gone.
    expect(screen.queryAllByText(/content pending operator review/i)).toHaveLength(0)
  })

  it("links back to sign in", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })
})
