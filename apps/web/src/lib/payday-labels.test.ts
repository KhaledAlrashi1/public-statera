// MOB-R91 C4 — with a payday that cuts months, a month reads as its dates ("25 Sep – 24 Oct"), with the year once at
// the end when the period is not wholly in the current year; chart ticks read the first day; without a payday,
// every label is the month name, as before.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatMonthYear, monthName } from "./home-summary"
import { periodLabel, periodTick, setPayday } from "./payday-months"
import { labelForYM } from "./utils"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-08T09:00:00Z"))
})
afterEach(() => {
  setPayday(null)
  vi.useRealTimers()
})

describe("payday month labels (MOB-R91 C4)", () => {
  it("dates only, with the year once at the end outside the current year", () => {
    expect(periodLabel(25, "2026-10", 2026)).toBe("25 Sep – 24 Oct")
    expect(periodLabel(25, "2027-01", 2026)).toBe("25 Dec – 24 Jan 2027")
    expect(periodLabel(25, "2026-01", 2026)).toBe("25 Dec – 24 Jan 2026")
    expect(periodLabel(3, "2026-10", 2026)).toBe("3 Oct – 2 Nov")
    expect(periodLabel(null, "2026-10", 2026)).toBeNull()
    expect(periodLabel(1, "2026-10", 2026)).toBeNull()
    expect(periodTick(25, "2026-10")).toBe("25 Sep")
    expect(periodTick(null, "2026-10")).toBeNull()
  })

  it("the shared month formatters follow her payday and are month names without one", () => {
    expect(formatMonthYear("2026-09")).toBe("September 2026")
    expect(monthName("2026-09")).toBe("September")
    expect(labelForYM("2026-09")).toBe("September 2026")
    setPayday(25)
    expect(formatMonthYear("2026-09")).toBe("25 Aug – 24 Sep")
    expect(monthName("2026-09")).toBe("25 Aug – 24 Sep")
    expect(labelForYM("2026-09")).toBe("25 Aug – 24 Sep")
    // Today's month still reads "This Month".
    expect(labelForYM("2026-10")).toBe("This Month")
  })
})
