// MOB-R70 E13 / F3 — the install guide says why, in one line under the title and above the steps.
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { InstallGuide } from "./InstallGuide"

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("InstallGuide — why (MOB-R70 E13)", () => {
  it("shows the why line between the title and the steps", () => {
    render(<InstallGuide />)
    const title = screen.getByText("Add Statera to your Home Screen")
    const why = screen.getByText("It opens full screen like an app, one tap away. No App Store needed.")
    const steps = screen.getByText("Tap Share, then Add to Home Screen.")
    expect(title.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(why.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
