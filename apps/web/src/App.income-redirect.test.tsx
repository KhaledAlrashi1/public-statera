// MOB-R75 D, P5 — /income redirects to Activity's Income view (/activity?type=income); the row-derived
// Income page is retired. Rendered through the real App and its real route table; only the session
// gate, the shell and the destination page are stand-ins, so the redirect itself is the app's own.
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: 1 }, isLoading: false, flags: {} }),
}))
vi.mock("@/components/auth/ProtectedRoute", async () => {
  const { Outlet } = await import("react-router-dom")
  return { default: () => <Outlet /> }
})
vi.mock("@/components/layout/AppShell", async () => {
  const { Outlet } = await import("react-router-dom")
  return { default: () => <Outlet /> }
})
vi.mock("@/components/pages/TransactionsPage", async () => {
  const { useLocation } = await import("react-router-dom")
  return {
    default: () => {
      const l = useLocation()
      return <div>activity at {`${l.pathname}${l.search}`}</div>
    },
  }
})
vi.mock("@/components/pages/IncomePage", () => ({ default: () => <div>the old income page</div> }))

import App from "./App"

describe("/income (MOB-R75 P5)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/")
    vi.unstubAllGlobals()
  })

  it("lands on Activity's Income view, not the old Income page", async () => {
    // jsdom has no matchMedia; a provider in the real App reads it.
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    window.history.replaceState(null, "", "/income")
    render(<App />)
    expect(await screen.findByText("activity at /activity?type=income")).toBeInTheDocument()
    expect(screen.queryByText("the old income page")).toBeNull()
  })
})
