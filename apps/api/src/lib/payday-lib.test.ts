/**
 * Tests for payday-lib: currentPayPeriod.
 *
 * All expected values are captured from running Flask's payday.current_pay_period
 * against the same inputs (backend/lib/payday.py). Fixture parity is the source of
 * truth; do not adjust expected values without re-running the Flask reference script.
 */

import { describe, it, expect } from "vitest"
import { currentPayPeriod } from "./payday-lib"

function ref(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

// ── null payday → calendar month bounds ──────────────────────────────────────

describe("currentPayPeriod — null payday (calendar month bounds)", () => {
  it("(null, 2024-06-15) → full June 2024", () => {
    expect(currentPayPeriod(null, ref("2024-06-15"))).toEqual({
      start: "2024-06-01",
      end: "2024-06-30",
    })
  })
})

// ── payday=31 (month-end clamping) ────────────────────────────────────────────

describe("currentPayPeriod — payday=31 (month-end clamping)", () => {
  it("(31, 2025-02-15) → Jan 31 – Feb 27 (non-leap Feb, clamp 31→28)", () => {
    expect(currentPayPeriod(31, ref("2025-02-15"))).toEqual({
      start: "2025-01-31",
      end: "2025-02-27",
    })
  })

  it("(31, 2024-02-15) → Jan 31 – Feb 28 (leap Feb, clamp 31→29, end=Feb28)", () => {
    expect(currentPayPeriod(31, ref("2024-02-15"))).toEqual({
      start: "2024-01-31",
      end: "2024-02-28",
    })
  })

  it("(31, 2024-04-15) → Mar 31 – Apr 29 (Apr=30 days, clamp 31→30)", () => {
    expect(currentPayPeriod(31, ref("2024-04-15"))).toEqual({
      start: "2024-03-31",
      end: "2024-04-29",
    })
  })
})

// ── payday=30 ────────────────────────────────────────────────────────────────

describe("currentPayPeriod — payday=30", () => {
  it("(30, 2024-02-15) → Jan 30 – Feb 28 (Feb 2024=29 days, clamp 30→29)", () => {
    expect(currentPayPeriod(30, ref("2024-02-15"))).toEqual({
      start: "2024-01-30",
      end: "2024-02-28",
    })
  })

  it("(30, 2025-02-15) → Jan 30 – Feb 27 (Feb 2025=28 days, clamp 30→28)", () => {
    expect(currentPayPeriod(30, ref("2025-02-15"))).toEqual({
      start: "2025-01-30",
      end: "2025-02-27",
    })
  })
})

// ── payday=29 ────────────────────────────────────────────────────────────────

describe("currentPayPeriod — payday=29", () => {
  it("(29, 2024-02-15) → Jan 29 – Feb 28 (Feb 2024=29 days, clamp 29→29)", () => {
    expect(currentPayPeriod(29, ref("2024-02-15"))).toEqual({
      start: "2024-01-29",
      end: "2024-02-28",
    })
  })

  it("(29, 2025-02-15) → Jan 29 – Feb 27 (Feb 2025=28 days, clamp 29→28)", () => {
    expect(currentPayPeriod(29, ref("2025-02-15"))).toEqual({
      start: "2025-01-29",
      end: "2025-02-27",
    })
  })
})

// ── payday=1 (ref always on/after) ───────────────────────────────────────────

describe("currentPayPeriod — payday=1", () => {
  it("(1, 2024-06-15) → Jun 1 – Jun 30", () => {
    expect(currentPayPeriod(1, ref("2024-06-15"))).toEqual({
      start: "2024-06-01",
      end: "2024-06-30",
    })
  })
})

// ── payday=15 (ref before and after) ─────────────────────────────────────────

describe("currentPayPeriod — payday=15 (mid-month)", () => {
  it("(15, 2024-06-10) → May 15 – Jun 14 (ref before payday)", () => {
    expect(currentPayPeriod(15, ref("2024-06-10"))).toEqual({
      start: "2024-05-15",
      end: "2024-06-14",
    })
  })

  it("(15, 2024-06-20) → Jun 15 – Jul 14 (ref on/after payday)", () => {
    expect(currentPayPeriod(15, ref("2024-06-20"))).toEqual({
      start: "2024-06-15",
      end: "2024-07-14",
    })
  })
})

// ── month/year boundary crossing ─────────────────────────────────────────────

describe("currentPayPeriod — crosses month/year boundary", () => {
  it("(5, 2024-01-03) → Dec 5 – Jan 4 (ref before payday, crosses year)", () => {
    expect(currentPayPeriod(5, ref("2024-01-03"))).toEqual({
      start: "2023-12-05",
      end: "2024-01-04",
    })
  })

  it("(25, 2024-12-30) → Dec 25 – Jan 24 (ref after payday, crosses year)", () => {
    expect(currentPayPeriod(25, ref("2024-12-30"))).toEqual({
      start: "2024-12-25",
      end: "2025-01-24",
    })
  })
})
