// MOB-R101 B — the layout readout on /log?layout=1: it lists elements whose right edge is past innerWidth and
// shows /log's frame. These three cases moved here from layout-check.test.tsx (MOB-R88 G, MOB-R91 B3), deleted
// with Profile's "Layout check" link and its flag; the readout itself stays on /log?layout=1. Only the last
// title changed: it dropped "(Activity)", which no longer shows the readout.
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LogLayoutReadout } from "./LogLayoutReadout"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("LogLayoutReadout", () => {
  it("lists an element wider than the screen (a forced 500px child at 390)", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390)
    const wide = document.createElement("div")
    wide.className = "too-wide grid extra"
    document.body.appendChild(wide)
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === wide) return { left: 0, right: 500, width: 500, top: 0, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      return real.call(this)
    })
    render(<LogLayoutReadout />)
    expect(screen.getByTestId("log-layout-readout")).toHaveTextContent("wider: div.too-wide.grid left 0 right 500")
    wide.remove()
  })

  it("shows /log's frame (scrollHeight, clientHeight, scrollTop) and what 100vh, 100dvh and 100svh measure (MOB-R91 B3)", () => {
    const frame = document.createElement("div")
    frame.setAttribute("data-log-frame", "")
    document.body.appendChild(frame)
    vi.spyOn(frame, "scrollHeight", "get").mockReturnValue(1200)
    vi.spyOn(frame, "clientHeight", "get").mockReturnValue(797)
    frame.scrollTop = 40
    const real = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const h = (this as HTMLElement).style?.height
      const height = h === "100vh" ? 844 : h === "100dvh" ? 797 : h === "100svh" ? 797 : null
      if (height !== null) return { left: 0, right: 0, width: 0, top: 0, bottom: height, height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      return real.call(this)
    })
    render(<LogLayoutReadout />)
    const readout = screen.getByTestId("log-layout-readout")
    expect(readout).toHaveTextContent("frame scrollHeight 1200 · clientHeight 797 · scrollTop 40")
    expect(readout).toHaveTextContent("100vh 844 · 100dvh 797 · 100svh 797")
    frame.remove()
  })

  it("says \"frame none\" where there is no /log frame", () => {
    render(<LogLayoutReadout />)
    expect(screen.getByTestId("log-layout-readout")).toHaveTextContent("frame none")
  })
})
