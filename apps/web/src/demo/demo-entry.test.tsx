// MOB-R95 C7 — the way in ("See a demo" on the welcome page, and /demo) and the way out (the bar's Sign up, on
// Home, Activity, Plan and Insights; not on /log, which has its own Save bar).
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import LoginPage from "@/components/pages/LoginPage"
import { resetDemoState } from "@/lib/demo/transport"

beforeEach(() => {
  resetDemoState()
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  window.scrollTo = () => {}
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in the demo"))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.pushState({}, "", "/")
})

describe("the demo's way in and way out (MOB-R95 C7)", () => {
  it("the welcome page offers \"See a demo\", a full page load to /demo", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  })

  it("the bar \"Like it? Keep your own\" with Sign up sits on Home, Activity, Plan and Insights, and not on Log", async () => {
    for (const path of ["/demo", "/demo/activity", "/demo/plan", "/demo/insights"]) {
      window.history.pushState({}, "", path)
      render(<App />)
      const bar = await screen.findByTestId("demo-bar", undefined, { timeout: 5000 })
      expect(bar, path).toHaveTextContent("Like it? Keep your own")
      expect(screen.getByRole("link", { name: "Sign up" }), path).toHaveAttribute("href", "/login")
      expect(window.location.pathname).toBe(path)
      cleanup()
    }
    window.history.pushState({}, "", "/demo/log")
    render(<App />)
    // Log is up once its usual places (the demo's) are on screen.
    expect(await screen.findByRole("button", { name: /^Talabat/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByTestId("demo-bar")).toBeNull()
  }, 30_000)
})
