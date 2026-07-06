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

  it("renders final section content and no pending markers", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /what we collect/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /your rights/i })).toBeInTheDocument()
    // Content-fill shipped: the structure-only pending markers must be gone.
    expect(screen.queryAllByText(/content pending operator review/i)).toHaveLength(0)
  })

  // Durable guarantee: the two legally load-bearing factual-commitment slots
  // must carry their CONTENT (not just be present) so a future edit can't
  // silently drop or weaken them.
  it("renders both factual-commitment slots with their committed content", () => {
    renderPage()
    const backup = screen.getByTestId("commitment-backup-retention")
    expect(backup).toHaveTextContent("365")
    expect(backup).toHaveTextContent(/re-apply all account deletions/i)

    const files = screen.getByTestId("commitment-statement-files")
    expect(files).toHaveTextContent(/never stored/i)
  })

  it("links back to sign in", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })
})
