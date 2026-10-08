// MOB-R89 D (R88 H4) — the four legacy paths always redirect: /transactions -> /activity?type=all,
// /expenses -> /activity?type=expense, /budget -> /plan, /income -> /activity?type=income. Rendered through the real App
// and its route table; only the session gate, the shell and the destination pages are stand-ins.
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
  return { default: () => { const l = useLocation(); return <div>{`activity at ${l.pathname}${l.search}`}</div> } }
})
vi.mock("@/components/pages/BudgetPage", async () => {
  const { useLocation } = await import("react-router-dom")
  return { default: () => { const l = useLocation(); return <div>{`plan at ${l.pathname}${l.search}`}</div> } }
})

import App from "./App"

describe("legacy paths redirect (MOB-R89 D)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/")
    vi.unstubAllGlobals()
  })

  it.each([
    ["/transactions", "activity at /activity?type=all"],
    ["/expenses", "activity at /activity?type=expense"],
    ["/budget", "plan at /plan"],
    ["/income", "activity at /activity?type=income"],
  ])("%s lands on its target", async (from, landed) => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    window.history.replaceState(null, "", from)
    render(<App />)
    expect(await screen.findByText(landed)).toBeInTheDocument()
  })
})
