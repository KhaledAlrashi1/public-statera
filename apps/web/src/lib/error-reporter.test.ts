import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import { ErrorBoundary } from "@/App"
import {
  reportError,
  initErrorReporter,
  __setEnabledForTest,
  __resetReporterForTest,
  __getSuppressedForTest,
  __getSentCountForTest,
} from "./error-reporter"

let fetchMock: ReturnType<typeof vi.fn>

function lastBodyRaw(): string {
  const call = fetchMock.mock.calls.at(-1)
  return call![1].body as string
}
function lastBody(): Record<string, unknown> {
  return JSON.parse(lastBodyRaw())
}
function errWithStack(message: string, stack: string): Error {
  const e = new Error(message)
  e.stack = stack
  return e
}

beforeEach(() => {
  __resetReporterForTest()
  __setEnabledForTest(true)
  fetchMock = vi.fn().mockResolvedValue({ status: 202, ok: true })
  vi.stubGlobal("fetch", fetchMock)
  window.sessionStorage.clear()
})
afterEach(() => {
  __setEnabledForTest(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("error-reporter — env gating (I)", () => {
  it("does NOT report when the production gate is off (real gate under vitest)", () => {
    __setEnabledForTest(null) // fall through to import.meta.env.PROD, which is false under vitest
    reportError(new Error("x"), "onerror")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("error-reporter — CONDITION (ii) client half: closed allowlist", () => {
  it("BLOCKING: props/state carrying a merchant + KWD amount never reach the transmitted body (through the real boundary)", () => {
    function Bomb(_props: { merchant: string; amount: string }): React.ReactElement {
      throw new Error("render failed") // message carries no PII
    }
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(Bomb, { merchant: "Lulu Hypermarket", amount: "12.500" }),
      ),
    )
    consoleErr.mockRestore()

    expect(fetchMock).toHaveBeenCalled()
    const raw = lastBodyRaw()
    expect(raw).not.toContain("Lulu Hypermarket")
    expect(raw).not.toContain("12.500")
    expect(lastBody().kind).toBe("boundary")
  })

  it("builds only allowlisted fields (no location.search/hash, no cookies/props/state keys)", () => {
    reportError(errWithStack("boom", "Error: boom\n    at Foo (a.js:1:1)"), "onerror")
    const body = lastBody()
    // name is "Error" (Error instance), release omitted (no VITE_GIT_SHA under vitest).
    expect(Object.keys(body).sort()).toEqual(
      ["kind", "message", "name", "occurrences", "route", "stack", "ua"].sort(),
    )
  })
})

describe("error-reporter — CONDITION (iv) client half: route", () => {
  it("carries location.pathname only, id-normalized, excluding search and hash", () => {
    window.history.pushState({}, "", "/api/transactions/123?merchant=Lulu#h")
    reportError(new Error("x"), "onerror")
    const route = lastBody().route as string
    expect(route).toBe("/api/transactions/:id")
    expect(route).not.toContain("Lulu")
    expect(route).not.toContain("#h")
  })
})

describe("error-reporter — CONDITION (iii): re-entrancy suppresses during-send only", () => {
  it("suppresses a report generated DURING a send and counts it, but sends two distinct errors", () => {
    // A report generated while a send is executing (fetch synchronously re-enters):
    fetchMock.mockImplementationOnce(() => {
      reportError(new Error("generated during send"), "onerror")
      return Promise.resolve({ status: 202 })
    })
    reportError(errWithStack("first", "Error: first\n at A (a.js:1:1)"), "boundary")
    expect(fetchMock).toHaveBeenCalledTimes(1) // the during-send report was suppressed
    expect(__getSuppressedForTest().reentrancy).toBe(1)

    // Two genuinely distinct errors (separate calls) BOTH send — not a global mutex.
    reportError(errWithStack("alpha", "Error: alpha\n at A (a.js:1:1)"), "boundary")
    reportError(errWithStack("beta", "Error: beta\n at B (b.js:1:1)"), "onerror")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe("error-reporter — self-origin filter (C)", () => {
  it("ignores an error whose top frame is the reporter itself", () => {
    reportError(
      errWithStack("boom", "Error: boom\n    at reportError (/x/error-reporter.ts:9:9)\n    at y"),
      "onerror",
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(__getSuppressedForTest().selfOrigin).toBe(1)
  })
})

describe("error-reporter — dedupe + occurrences (D)", () => {
  it("suppresses duplicates within the TTL and carries an accumulated occurrences count after the window", () => {
    vi.useFakeTimers()
    const mk = () => errWithStack("dup", "Error: dup\n    at Foo (a.js:1:1)")
    reportError(mk(), "onerror") // send, occurrences 1
    reportError(mk(), "onerror") // suppressed (count 1)
    reportError(mk(), "onerror") // suppressed (count 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastBody().occurrences).toBe(1)
    expect(__getSuppressedForTest().dedupe).toBe(2)

    vi.advanceTimersByTime(61_000) // TTL expires
    reportError(mk(), "onerror") // new window → occurrences = 2 + 1
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(lastBody().occurrences).toBe(3)
  })

  it("enforces a session send cap and counts capped drops", () => {
    for (let i = 0; i < 25; i++) {
      reportError(errWithStack(`e${i}`, `Error: e${i}\n at F${i} (a.js:${i}:1)`), "onerror")
    }
    expect(__getSentCountForTest()).toBe(20)
    expect(fetchMock).toHaveBeenCalledTimes(20)
    expect(__getSuppressedForTest().cap).toBe(5)
  })
})

describe("error-reporter — truncation (G)", () => {
  it("keeps the TOP frames and marks truncation, staying under the cap", () => {
    const stack = "TOPFRAME at fault\n" + "x".repeat(6000)
    reportError(errWithStack("big", stack), "onerror")
    const out = lastBody().stack as string
    expect(out.startsWith("TOPFRAME at fault")).toBe(true)
    expect(out).toContain("…[truncated]")
    expect(out.length).toBeLessThan(stack.length)
  })
})

describe("error-reporter — noise filters (E)", () => {
  it('drops a bare "Script error." with no stack, and ResizeObserver loop notices', () => {
    reportError("Script error.", "onerror")
    reportError(new Error("ResizeObserver loop completed with undelivered notifications"), "onerror")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(__getSuppressedForTest().noise).toBe(2)
  })
})

describe("error-reporter — release (J)", () => {
  it("omits release gracefully when VITE_GIT_SHA is undefined (server still accepts)", () => {
    reportError(new Error("x"), "onerror")
    expect("release" in lastBody()).toBe(false)
  })
})

describe("error-reporter — boundary → componentDidCatch → reportError (K, L)", () => {
  it("classifies a chunk-load re-throw as chunk-reload-failed", () => {
    function ChunkBomb(): React.ReactElement {
      throw new Error("Loading chunk 5 failed.")
    }
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
    render(React.createElement(ErrorBoundary, null, React.createElement(ChunkBomb)))
    consoleErr.mockRestore()
    expect(fetchMock).toHaveBeenCalled()
    expect(lastBody().kind).toBe("chunk-reload-failed")
  })
})

describe("error-reporter — self-heal signal (M)", () => {
  it("emits one chunk-self-healed event per surviving key and clears it only after a delay (loop-safe)", () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem("lazy-reload-once:dashboard", "1")
    initErrorReporter()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastBody().kind).toBe("chunk-self-healed")
    // Not cleared synchronously — clearing early could re-arm the one-shot and loop.
    expect(window.sessionStorage.getItem("lazy-reload-once:dashboard")).toBe("1")

    vi.advanceTimersByTime(11_000)
    expect(window.sessionStorage.getItem("lazy-reload-once:dashboard")).toBeNull()
  })
})
