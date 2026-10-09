// MOB-R95 C3b, C6 — under /demo a call the demo does not know throws and never reaches the network; a write the
// demo does not keep answers "Sign up to keep your own" as the error a screen shows for a failed save.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, budgetsApi, notificationsApi, transactionsApi } from "@/lib/api"
import { DemoUnknownCallError, resetDemoState } from "./transport"

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetDemoState()
  window.history.pushState({}, "", "/demo")
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.pushState({}, "", "/")
})

describe("the demo transport (MOB-R95 C3b, C6)", () => {
  it("b: a call the demo does not know throws, and fetch is never called", async () => {
    await expect(transactionsApi.dupCheck("2026-10-09", "Coffee", "2.250")).rejects.toBeInstanceOf(DemoUnknownCallError)
    await expect(notificationsApi.listBudgetAlerts()).rejects.toBeInstanceOf(DemoUnknownCallError)
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })

  it("C6: a write the demo does not keep fails with \"Sign up to keep your own\", without the network", async () => {
    const err = await budgetsApi.save("2026-10", []).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toBe("Sign up to keep your own")
    expect((err as ApiError).status).toBe(403)
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })
})
