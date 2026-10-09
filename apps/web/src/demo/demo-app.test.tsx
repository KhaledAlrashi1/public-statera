// MOB-R95 C3 — the demo's safety lines, on the real App: no network (a, signed out and signed in), no demo value
// in the real app's cache (c), and no browser-storage key the real app reads (d). Unknown calls (b) are pinned in
// lib/demo/transport.test.ts; here any that happens is recorded (the transport announces every call on window)
// and fails the walk.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const unknownCalls: string[] = []
const demoCalls: string[] = []
const record = (e: Event) => {
  const d = (e as CustomEvent<DemoCallDetail>).detail
  demoCalls.push(`${d.method} ${d.path}`)
  if (d.unknown) unknownCalls.push(`${d.method} ${d.path}`)
}

import App, { queryClient } from "@/App"
import { DEMO_CALL_EVENT, demoRequest, resetDemoState, type DemoCallDetail } from "@/lib/demo/transport"
import { DEMO_STORAGE_PREFIX } from "@/lib/demo/mode"

// What a signed-in user's browser would get back, if anything reached the network.
const SIGNED_IN = { ok: true, user: { id: 7, email: "real@example.com", display_name: "Real", first_name: "Real", last_name: null, totp_enabled: false, created_at: "2026-01-01T00:00:00+00:00" }, flags: {} }

let fetchSpy: ReturnType<typeof vi.spyOn>
const written: string[] = []

beforeEach(() => {
  unknownCalls.length = 0
  demoCalls.length = 0
  window.addEventListener(DEMO_CALL_EVENT, record)
  written.length = 0
  resetDemoState()
  window.localStorage.clear()
  window.sessionStorage.clear()
  queryClient.clear()
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  window.scrollTo = () => {}
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(SIGNED_IN), { status: 200, headers: { "Content-Type": "application/json" } }))
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    written.push(key)
    return setItem.call(this, key, value)
  })
})

afterEach(() => {
  window.removeEventListener(DEMO_CALL_EVENT, record)
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.pushState({}, "", "/")
})

const tab = async (name: RegExp) => {
  const nav = await screen.findByRole("navigation", { name: /primary|main|tabs|bottom/i }).catch(() => null)
  const scope = nav ? within(nav) : screen
  fireEvent.click((await scope.findAllByRole("link", { name }))[0])
}

/** Waits until a screen has asked the demo for each of its data calls (a tap alone proves nothing: each screen
 * loads lazily, and a walk that taps on before it mounts never visits it). */
const visited = (calls: string[]) =>
  waitFor(() => { for (const c of calls) expect(demoCalls).toContain(c) }, { timeout: 8000 })

/** Home, Activity, Plan, Insights; then /log: log an expense, open it to edit, save, open it again, delete. */
async function walkTheDemo() {
  window.history.pushState({}, "", "/demo")
  render(<App />)
  expect(await screen.findByTestId("demo-bar", undefined, { timeout: 5000 })).toHaveTextContent("Like it? Keep your own")
  await visited(["GET /api/analytics/dashboard-metrics", "GET /api/analytics/dashboard-bundle", "GET /api/budgets", "GET /api/categories"])
  expect(await screen.findAllByText(/Dining/, undefined, { timeout: 5000 })).not.toHaveLength(0)

  await tab(/^activity$/i)
  expect(window.location.pathname).toBe("/demo/activity")
  await visited(["GET /api/transactions/search", "GET /api/merchants"])
  expect(await screen.findAllByText("Dinner with friends", undefined, { timeout: 5000 })).not.toHaveLength(0)
  await tab(/^plan$/i)
  expect(window.location.pathname).toBe("/demo/plan")
  await visited(["GET /api/budgets/months", "GET /api/analytics/budget-metrics"])
  expect(await screen.findAllByText(/Groceries/, undefined, { timeout: 5000 })).not.toHaveLength(0)
  await tab(/^insights$/i)
  expect(window.location.pathname).toBe("/demo/insights")
  await visited(["GET /api/analytics/safe-to-spend", "GET /api/analytics/weekly-digest", "GET /api/analytics/recurring-patterns"])
  expect(await screen.findByTestId("demo-bar")).toBeInTheDocument()

  // /log: a new expense, saved into the demo's memory only.
  act(() => window.history.pushState({}, "", "/demo/log"))
  act(() => window.dispatchEvent(new PopStateEvent("popstate")))
  fireEvent.click(await screen.findByRole("button", { name: /^Talabat/ }, { timeout: 5000 }))
  fireEvent.click(await screen.findByRole("button", { name: /^Save KD/ }))
  expect(await screen.findByTestId("log-demo-note")).toHaveTextContent("Logged in the demo only. Sign up to keep it.")
  expect(screen.queryByTestId("demo-bar")).toBeNull()

  // Edit the dinner (its id, from the demo's own search), then delete it.
  const found = demoRequest("/api/transactions/search?q=Dinner%20with%20friends").body as { data: { items: Array<{ id: number }> } }
  const id = found.data.items[0].id
  act(() => window.history.pushState({}, "", `/demo/log?edit=${id}`))
  act(() => window.dispatchEvent(new PopStateEvent("popstate")))
  const save = await screen.findByRole("button", { name: /^Save/ }, { timeout: 5000 })
  fireEvent.click(save)
  act(() => window.history.pushState({}, "", `/demo/log?edit=${id}`))
  act(() => window.dispatchEvent(new PopStateEvent("popstate")))
  fireEvent.click(await screen.findByRole("button", { name: /^Delete/ }, { timeout: 5000 }))
  // The delete waits 6 seconds behind its Undo toast (LogPage deleteEntry); wait for it to land.
  await waitFor(() => expect(demoCalls).toContain(`DELETE /api/transactions/${id}`), { timeout: 8000 })
  expect(demoCalls).toContain("POST /api/transactions")
  expect(demoCalls).toContain(`PATCH /api/transactions/${id}`)
  const after = demoRequest("/api/transactions/search?q=Dinner%20with%20friends").body as { data: { items: unknown[] } }
  expect(after.data.items).toHaveLength(0)
}

describe("the demo (MOB-R95 C3)", () => {
  it("a: walks Home, Activity, Plan, Insights and logs, edits and deletes an expense with no network call", async () => {
    await walkTheDemo()
    await waitFor(() => expect(unknownCalls).toEqual([]))
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  }, 30_000)

  it("a: a signed-in user opening /demo makes no network call either", async () => {
    // Her session would answer /api/auth/me (SIGNED_IN, above); the demo never asks.
    document.cookie = "statera_session=real-session-token; path=/"
    await walkTheDemo()
    expect(fetchSpy).toHaveBeenCalledTimes(0)
    expect(screen.queryByText("real@example.com")).toBeNull()
    document.cookie = "statera_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
  }, 30_000)

  it("c: after the demo, the real app's cache holds nothing from it and real Home shows no demo rows", async () => {
    await walkTheDemo()
    cleanup()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    // The real app, signed in with an empty account.
    window.history.pushState({}, "", "/")
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.startsWith("/api/auth/me")
        ? SIGNED_IN
        : { ok: true, data: { items: [], months: [], monthly: [], expense_by_category: {}, places: [], patterns: [] }, error: null, meta: {} }
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
    })
    render(<App />)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    await waitFor(() => expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0))
    for (const demoValue of ["Dinner with friends", "Talabat", "Lulu Hypermarket", "Mais Alghanim"]) {
      expect(screen.queryByText(demoValue)).toBeNull()
    }
    expect(screen.queryByTestId("demo-bar")).toBeNull()
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toMatch(/Mais Alghanim|Talabat|Lulu/)
  }, 30_000)

  it("d: every browser-storage key the demo writes carries the demo-only prefix", async () => {
    await walkTheDemo()
    expect(written.length).toBeGreaterThan(0)
    expect(written.filter((k) => !k.startsWith(DEMO_STORAGE_PREFIX))).toEqual([])
  }, 30_000)
})
