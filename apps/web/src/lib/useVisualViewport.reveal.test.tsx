// MOB-R69 D3/D4 — the visual-viewport hook: a resize changes the height, the reveal step runs after
// the new height is on the element, and without visualViewport nothing is set.
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useVisualViewportVars } from "./useVisualViewport"

class FakeVisualViewport extends EventTarget {
  height = 800
  width = 390
  offsetTop = 0
}

function Probe({ onResize }: { onResize?: () => void }) {
  const style = useVisualViewportVars(true, onResize)
  return <div data-testid="sheet" style={style} />
}

const height = () => screen.getByTestId("sheet").style.getPropertyValue("--vv-height")

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useVisualViewportVars (MOB-R69 D3)", () => {
  it("a visualViewport resize changes the height", () => {
    const vv = new FakeVisualViewport()
    vi.stubGlobal("visualViewport", vv)
    render(<Probe />)
    expect(height()).toBe("800px")
    act(() => {
      vv.height = 420
      vv.dispatchEvent(new Event("resize"))
    })
    expect(height()).toBe("420px")
  })

  it("the reveal step runs after the new height is applied, not before", () => {
    const vv = new FakeVisualViewport()
    vi.stubGlobal("visualViewport", vv)
    const seen: string[] = []
    render(<Probe onResize={() => seen.push(height())} />)
    act(() => {
      vv.height = 420
      vv.dispatchEvent(new Event("resize"))
    })
    expect(seen).toEqual(["420px"])
  })

  it("with no visualViewport the element is left unchanged", () => {
    vi.stubGlobal("visualViewport", undefined)
    render(<Probe />)
    expect(height()).toBe("")
    expect(screen.getByTestId("sheet").getAttribute("style")).toBeNull()
  })
})
