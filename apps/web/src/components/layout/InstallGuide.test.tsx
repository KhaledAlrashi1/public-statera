// MOB-R69 F4 — the install guide: iPhone only, not when opened from the Home Screen, a Safari and a
// Chrome variant, and gone for good on this device after "Got it".
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { INSTALL_GUIDE_KEY, InstallGuide } from "./InstallGuide"

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1"
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"

function as(ua: string, standalone = false) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua)
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("InstallGuide (MOB-R69 F4)", () => {
  it("shows the Safari variant on iPhone Safari", () => {
    as(SAFARI)
    render(<InstallGuide />)
    expect(screen.getByText("Add Statera to your Home Screen")).toBeInTheDocument()
    expect(screen.getByText("Tap Share, then Add to Home Screen.")).toBeInTheDocument()
  })

  it("shows the Chrome variant on Chrome for iPhone", () => {
    as(CHROME)
    render(<InstallGuide />)
    expect(screen.getByText("Tap Share in the address bar, then Add to Home Screen.")).toBeInTheDocument()
  })

  it("is not shown when Statera is opened from the Home Screen", () => {
    as(SAFARI, true)
    render(<InstallGuide />)
    expect(screen.queryByText("Add Statera to your Home Screen")).toBeNull()
  })

  it("is not shown off iPhone", () => {
    as(MAC)
    render(<InstallGuide />)
    expect(screen.queryByText("Add Statera to your Home Screen")).toBeNull()
  })

  it("Got it hides it and it stays hidden on this device", () => {
    as(SAFARI)
    const { unmount } = render(<InstallGuide />)
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(screen.queryByText("Add Statera to your Home Screen")).toBeNull()
    expect(window.localStorage.getItem(INSTALL_GUIDE_KEY)).toBe("true")
    unmount()
    render(<InstallGuide />)
    expect(screen.queryByText("Add Statera to your Home Screen")).toBeNull()
  })
})
