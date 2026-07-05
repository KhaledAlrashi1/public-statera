import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router-dom"

import PrivacyPolicyPage from "./PrivacyPolicyPage"

function renderPage() {
  // No auth wrapper — the page is public (pre-auth). MemoryRouter only satisfies
  // the <Link> used by the shared layout's back-to-sign-in link.
  return render(
    <MemoryRouter>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  )
}

describe("PrivacyPolicyPage", () => {
  it("renders as a public page with the Privacy Policy title", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument()
  })

  it("renders the section scaffolds with visible pending markers", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /data handling/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /your rights/i })).toBeInTheDocument()
    // Structure-only phase: content is deliberately not drafted yet.
    expect(screen.getAllByText(/content pending operator review/i).length).toBeGreaterThan(0)
  })

  // Durable guarantee: the two legally load-bearing factual-commitment slots
  // (10c content-track facts — 365d backup retention, statement files never
  // persisted) must always be present so future edits can't silently drop them.
  it("renders both factual-commitment slots", () => {
    renderPage()
    expect(screen.getByTestId("commitment-backup-retention")).toBeInTheDocument()
    expect(screen.getByTestId("commitment-statement-files")).toBeInTheDocument()
  })

  it("links back to sign in", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })
})
