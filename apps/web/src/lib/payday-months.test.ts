// MOB-R91 C3 — the client follows the same payday months as the server (rule (c)): today's month, the editable
// months, the month options and Home's day count all move with her payday, and are the calendar month without one.
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { homeEyebrow } from "./home-summary"
import { getPayday, periodBoundsForKey, periodKeyForDate, setPayday, shiftKey } from "./payday-months"
import { currentMonthKeyNow, isEditableMonth, kuwaitNow } from "./utils"
import { useBudgetMonthOptions } from "@/components/pages/budget/hooks"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-24T22:30:00Z")) // 25 Oct 2026, 01:30 in Kuwait
})
afterEach(() => {
  setPayday(null)
  vi.useRealTimers()
})

describe("payday months on the client (MOB-R91 C3)", () => {
  it("cuts as the server does: 25 → 24 Oct in 2026-10, 25 Oct in 2026-11; 3 → 2 Oct in 2026-09, 3 Oct in 2026-10", () => {
    expect(periodKeyForDate(25, "2026-10-24")).toBe("2026-10")
    expect(periodKeyForDate(25, "2026-10-25")).toBe("2026-11")
    expect(periodKeyForDate(3, "2026-10-02")).toBe("2026-09")
    expect(periodKeyForDate(3, "2026-10-03")).toBe("2026-10")
    expect(periodBoundsForKey(31, "2027-03")).toEqual({ start: "2027-02-28", end: "2027-03-30" })
    expect(periodBoundsForKey(null, "2027-02")).toEqual({ start: "2027-02-01", end: "2027-02-28" })
    expect(shiftKey("2026-12", 1)).toBe("2027-01")
  })

  it("every payday is gap-free across 24 months, February included, and each period holds its own first and last day", () => {
    for (let p = 1; p <= 31; p++) {
      let prevEnd: string | null = null
      for (let i = 0; i < 24; i++) {
        const key = shiftKey("2026-01", i)
        const { start, end } = periodBoundsForKey(p, key)
        if (prevEnd !== null) {
          const dayAfter = new Date(Date.parse(`${prevEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
          expect(`${p} ${key} ${start}`).toBe(`${p} ${key} ${dayAfter}`)
        }
        expect(`${p} ${periodKeyForDate(p, start)} ${periodKeyForDate(p, end)}`).toBe(`${p} ${key} ${key}`)
        prevEnd = end
      }
    }
  })

  it("today's month and the editable months follow her payday, and are the calendar month without one", () => {
    expect(getPayday()).toBeNull()
    expect(currentMonthKeyNow()).toBe("2026-10")
    expect(isEditableMonth("2026-10")).toBe(true)
    expect(isEditableMonth("2026-12")).toBe(false)
    act(() => setPayday(25))
    expect(currentMonthKeyNow()).toBe("2026-11")
    expect(isEditableMonth("2026-10")).toBe(false)
    expect(isEditableMonth("2026-12")).toBe(true)
    act(() => setPayday(1))
    expect(currentMonthKeyNow()).toBe("2026-10")
  })

  it("Plan's month options start at today's month by her payday and update when it changes", () => {
    const { result } = renderHook(() => useBudgetMonthOptions(3))
    expect(result.current).toEqual(["2026-10", "2026-09", "2026-08"])
    act(() => setPayday(25))
    expect(result.current).toEqual(["2026-11", "2026-10", "2026-09"])
  })

  it("Home's eyebrow counts the period's days under a payday, the calendar month's without one", () => {
    expect(homeEyebrow("2026-10", "2026-10", kuwaitNow())).toBe("October 2026 · day 25 of 31")
    setPayday(25)
    // 25 Oct is day 1 of 25 Oct – 24 Nov (31 days).
    expect(homeEyebrow("2026-11", "2026-11", kuwaitNow())).toMatch(/ · day 1 of 31$/)
  })
})
