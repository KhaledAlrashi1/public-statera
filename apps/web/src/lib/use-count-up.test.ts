// MOB-R68 C4 / E2 — useCountUp. Frames are driven by a stubbed requestAnimationFrame and clock.
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCountUp } from "./use-count-up"
import { formatKD } from "./utils"

let now = 0
let frameId = 0
const pending = new Map<number, FrameRequestCallback>()

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function flush(ms: number) {
  act(() => {
    now += ms
    const frames = Array.from(pending.values())
    pending.clear()
    for (const cb of frames) cb(now)
  })
}

beforeEach(() => {
  now = 0
  frameId = 0
  pending.clear()
  vi.spyOn(performance, "now").mockImplementation(() => now)
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frameId += 1
    pending.set(frameId, cb)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type Props = { value: string; animateKey: string; ready?: boolean; delayMs?: number }
const render = (initial: Props) =>
  renderHook((p: Props) => useCountUp(p), { initialProps: initial })

describe("useCountUp (MOB-R68 C4)", () => {
  it("under reduced motion, shows the final value at once", () => {
    stubMotion(true)
    const { result } = render({ value: "1234.567", animateKey: "2026-10" })
    expect(result.current.text).toBe("KD 1,234.567")
    expect(result.current.animating).toBe(false)
    expect(pending.size).toBe(0)
  })

  it("on first mount counts up from zero, holding zero through its stagger delay", () => {
    stubMotion(false)
    const { result } = render({ value: "1234.567", animateKey: "2026-10", delayMs: 120 })
    expect(result.current.text).toBe("KD 0.000")
    flush(100)
    expect(result.current.text).toBe("KD 0.000")
    flush(500)
    expect(result.current.animating).toBe(true)
    expect(result.current.text).not.toBe("KD 0.000")
    expect(result.current.text).not.toBe("KD 1,234.567")
  })

  it("ends on exactly the formatter's output for the exact string value", () => {
    stubMotion(false)
    const { result } = render({ value: "1234.567", animateKey: "2026-10" })
    flush(450)
    flush(500)
    expect(result.current.animating).toBe(false)
    expect(result.current.text).toBe(formatKD("1234.567"))
    expect(result.current.text).toBe("KD 1,234.567")
    expect(result.current.finalText).toBe(result.current.text)
  })

  it("a same-month refetch does not animate: the new value shows at once", () => {
    stubMotion(false)
    const { result, rerender } = render({ value: "100.000", animateKey: "2026-10" })
    flush(1000)
    expect(result.current.animating).toBe(false)
    rerender({ value: "250.500", animateKey: "2026-10" })
    expect(result.current.animating).toBe(false)
    expect(result.current.text).toBe("KD 250.500")
    expect(pending.size).toBe(0)
  })

  it("a month change counts up again from zero", () => {
    stubMotion(false)
    const { result, rerender } = render({ value: "100.000", animateKey: "2026-10" })
    flush(1000)
    rerender({ value: "80.000", animateKey: "2026-09" })
    expect(result.current.animating).toBe(true)
    expect(result.current.text).toBe("KD 0.000")
    flush(1000)
    expect(result.current.text).toBe("KD 80.000")
  })

  it("waits for ready, and an interrupted count-up resumes instead of restarting", () => {
    stubMotion(false)
    const { result, rerender } = render({ value: "1000.000", animateKey: "2026-10", ready: false })
    expect(result.current.animating).toBe(false)
    expect(pending.size).toBe(0)
    rerender({ value: "1000.000", animateKey: "2026-10", ready: true })
    expect(result.current.text).toBe("KD 0.000")
    flush(450)
    const amount = (text: string) => Number(text.replace(/[^0-9.]/g, ""))
    const midway = amount(result.current.text)
    expect(midway).toBeGreaterThan(0)
    rerender({ value: "1000.000", animateKey: "2026-10", ready: false })
    rerender({ value: "1000.000", animateKey: "2026-10", ready: true })
    flush(1)
    expect(result.current.text).not.toBe("KD 0.000")
    expect(amount(result.current.text)).toBeGreaterThanOrEqual(midway)
    flush(1000)
    expect(result.current.text).toBe("KD 1,000.000")
  })
})
