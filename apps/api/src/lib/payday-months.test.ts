// MOB-R91 C2 — payday months, rule (c): a payday of 2–15 names a month by the month its period starts in, 16–31 by
// the month after; null or 1 is the calendar month and every helper returns exactly what the calendar code did.
import { MySqlDialect } from "drizzle-orm/mysql-core"
import { afterEach, describe, expect, it, vi } from "vitest"

import { currentMonthKey, ymExpr } from "./analytics-helpers"
import { versionedCacheKey } from "./analytics-cache-version"
import { currentPeriodKey, paydayActive, periodBoundsForKey, periodKeyExpr, periodKeyForDate } from "./payday-lib"

const render = (expr: ReturnType<typeof periodKeyExpr>) => new MySqlDialect().sqlToQuery(expr)

afterEach(() => {
  vi.useRealTimers()
})

describe("payday months (MOB-R91 C2)", () => {
  it("cuts on the payday: 25 → 24 Oct is 2026-10 and 25 Oct is 2026-11; 3 → 2 Oct is 2026-09 and 3 Oct is 2026-10", () => {
    expect(periodBoundsForKey(25, "2026-10")).toEqual({ start: "2026-09-25", end: "2026-10-24" })
    expect(periodKeyForDate(25, "2026-10-24")).toBe("2026-10")
    expect(periodKeyForDate(25, "2026-10-25")).toBe("2026-11")
    expect(periodBoundsForKey(3, "2026-10")).toEqual({ start: "2026-10-03", end: "2026-11-02" })
    expect(periodKeyForDate(3, "2026-10-02")).toBe("2026-09")
    expect(periodKeyForDate(3, "2026-10-03")).toBe("2026-10")
    // A day past a short month's end is that month's last day.
    expect(periodBoundsForKey(31, "2027-03")).toEqual({ start: "2027-02-28", end: "2027-03-30" })
  })

  it("no payday, or the 1st, is the calendar month", () => {
    for (const p of [null, undefined, 1]) {
      expect(paydayActive(p)).toBe(false)
      expect(periodBoundsForKey(p, "2027-02")).toEqual({ start: "2027-02-01", end: "2027-02-28" })
      expect(periodKeyForDate(p, "2027-02-28")).toBe("2027-02")
    }
  })

  it("every payday is gap-free across 24 months, February included: each period starts the day after the last ends", () => {
    for (let p = 1; p <= 31; p++) {
      let prevEnd: string | null = null
      for (let i = 0; i < 24; i++) {
        const key = `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
        const { start, end } = periodBoundsForKey(p, key)
        if (prevEnd !== null) {
          const dayAfter = new Date(Date.parse(`${prevEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
          expect(`${p} ${key} ${start}`).toBe(`${p} ${key} ${dayAfter}`)
        }
        expect(periodKeyForDate(p, start)).toBe(key)
        expect(periodKeyForDate(p, end)).toBe(key)
        prevEnd = end
      }
    }
  })

  it("the SQL is ymExpr itself with no payday; with one it names the day as a literal, so SELECT and GROUP BY match", () => {
    expect(periodKeyExpr(null)).toBe(ymExpr)
    expect(periodKeyExpr(1)).toBe(ymExpr)
    const q = render(periodKeyExpr(25))
    expect(q.params).toEqual([])
    expect(q.sql).toContain("LEAST(25, DAY(LAST_DAY(")
    expect(q.sql).toContain("THEN 1 ELSE 0 END) MONTH")
    expect(render(periodKeyExpr(3)).sql).toContain("THEN 0 ELSE -1 END) MONTH")
  })

  it("today's month is currentMonthKey() with no payday, and the payday's key with one (Kuwait's clock)", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-24T22:30:00Z")) // 25 Oct 01:30 in Kuwait
    expect(currentPeriodKey(null)).toBe(currentMonthKey())
    expect(currentPeriodKey(null)).toBe("2026-10")
    expect(currentPeriodKey(25)).toBe("2026-11")
    expect(currentPeriodKey(3)).toBe("2026-10")
  })

  it("the cache version carries a payday that cuts months, and is unchanged without one", () => {
    expect(versionedCacheKey("safe_to_spend:7:2026-10")).toBe("safe_to_spend:7:2026-10:v2")
    expect(versionedCacheKey("safe_to_spend:7:2026-10", null)).toBe("safe_to_spend:7:2026-10:v2")
    expect(versionedCacheKey("safe_to_spend:7:2026-10", 1)).toBe("safe_to_spend:7:2026-10:v2")
    expect(versionedCacheKey("safe_to_spend:7:2026-10", 25)).toBe("safe_to_spend:7:2026-10:v2:p25")
  })
})
