import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isEditableMonth, kuwaitNow, today } from "./utils"

let tz: string | undefined
beforeEach(() => {
  tz = process.env.TZ
  process.env.TZ = "UTC"
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-31T21:30:00Z"))
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = tz
})

describe("Kuwait clock on the screens (MOB-R84 C5)", () => {
  it("the device (UTC) says 31 Oct; kuwaitNow's local fields say Sun 1 Nov 00:30", () => {
    expect(new Date().getDate()).toBe(31)
    const k = kuwaitNow()
    expect([k.getFullYear(), k.getMonth() + 1, k.getDate(), k.getDay(), k.getHours(), k.getMinutes()]).toEqual([2026, 11, 1, 0, 0, 30])
  })

  it("today() is Kuwait's calendar day", () => {
    expect(today()).toBe("2026-11-01")
  })

  it("the editable budget months follow Kuwait: November and December, not October", () => {
    expect(isEditableMonth("2026-11")).toBe(true)
    expect(isEditableMonth("2026-12")).toBe(true)
    expect(isEditableMonth("2026-10")).toBe(false)
  })
})
