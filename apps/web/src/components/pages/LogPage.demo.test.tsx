// MOB-R95 C6 — after a save on /log in the demo: "Logged in the demo only. Sign up to keep it." with a Sign up
// link to the sign-up screen. Outside the demo the save moment is unchanged.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
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

describe("/log in the demo (MOB-R95 C6)", () => {
  it("a save says it is kept in the demo only, with a Sign up link", async () => {
    window.history.pushState({}, "", "/demo/log")
    render(<App />)
    fireEvent.click(await screen.findByRole("button", { name: /^Caribou Coffee/ }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole("button", { name: /^Save KD/ }))
    const note = await screen.findByTestId("log-demo-note")
    expect(note).toHaveTextContent("Logged in the demo only. Sign up to keep it.")
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/login")
    expect(screen.getByText("Logged")).toBeInTheDocument()
  }, 20_000)
})
