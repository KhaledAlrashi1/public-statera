/**
 * Tests for analytics-helpers: roundedKd, calendarMonthBounds, buildMonthWindow.
 *
 * roundedKd expected values are A1 fixtures approved pre-implementation.
 * Note: Python json.dumps(0.0) → "0.0"; JS JSON.stringify(0) → "0" — the numeric
 * 0 return from roundedKd serializes as "0", not "0.0". Module 9 verifies this diff.
 */

import { describe, it, expect } from "vitest"
import { roundedKd, calendarMonthBounds, buildMonthWindow } from "./analytics-helpers"

// ── roundedKd ─────────────────────────────────────────────────────────────────

describe("roundedKd — null / empty inputs → 0", () => {
  it("null → 0", () => { expect(roundedKd(null)).toBe(0) })
  it("undefined → 0", () => { expect(roundedKd(undefined)).toBe(0) })
  it('"" → 0', () => { expect(roundedKd("")).toBe(0) })
  it('"0" → 0', () => { expect(roundedKd("0")).toBe(0) })
  it('"0.000" → 0', () => { expect(roundedKd("0.000")).toBe(0) })
})

describe("roundedKd — rounding to 3 decimal places", () => {
  it('"12.5" → 12.5', () => { expect(roundedKd("12.5")).toBe(12.5) })
  it('"12.500" → 12.5', () => { expect(roundedKd("12.500")).toBe(12.5) })
  it('"-3.14159" → -3.142', () => { expect(roundedKd("-3.14159")).toBe(-3.142) })
})

// ── calendarMonthBounds ───────────────────────────────────────────────────────

describe("calendarMonthBounds", () => {
  it("June 2024 — 30-day month", () => {
    expect(calendarMonthBounds(2024, 6)).toEqual({ start: "2024-06-01", end: "2024-06-30" })
  })

  it("February 2024 — leap year (29 days)", () => {
    expect(calendarMonthBounds(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" })
  })

  it("February 2025 — non-leap year (28 days)", () => {
    expect(calendarMonthBounds(2025, 2)).toEqual({ start: "2025-02-01", end: "2025-02-28" })
  })

  it("December 2024 — 31-day month", () => {
    expect(calendarMonthBounds(2024, 12)).toEqual({ start: "2024-12-01", end: "2024-12-31" })
  })
})

// ── buildMonthWindow ──────────────────────────────────────────────────────────

describe("buildMonthWindow", () => {
  it("3 months ending Jan 2026", () => {
    expect(buildMonthWindow(2026, 1, 3)).toEqual(["2025-11", "2025-12", "2026-01"])
  })

  it("2 months ending Feb 2026", () => {
    expect(buildMonthWindow(2026, 2, 2)).toEqual(["2026-01", "2026-02"])
  })

  it("1 month ending Mar 2026", () => {
    expect(buildMonthWindow(2026, 3, 1)).toEqual(["2026-03"])
  })
})
