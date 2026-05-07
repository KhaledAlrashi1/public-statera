/**
 * Fixture-based equivalence tests against Python's goal_projection()
 * and monthly_pace_from_deposits() in lib/savings_goals.py.
 *
 * DB rows are injected via a minimal mock — no live connection needed.
 */

import { describe, it, expect, vi } from "vitest"
import { goalProjection, monthlyPaceFromDeposits } from "./savings-goals-lib"

// ── Sentry mock ───────────────────────────────────────────────────────────────
vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── DB mock ───────────────────────────────────────────────────────────────────
// The lib only does a .select().from().where() chain, which resolves to an array.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy(
    {},
    {
      get() {
        return (..._args: unknown[]) =>
          new Proxy(
            {},
            {
              get(_t, prop: string) {
                if (prop === "then") {
                  return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                    Promise.resolve(rows).then(resolve, reject)
                }
                return (..._innerArgs: unknown[]) => makeDbReturning(rows)
              },
            },
          )
      },
    },
  )
}

// ── monthlyPaceFromDeposits ───────────────────────────────────────────────────

describe("monthlyPaceFromDeposits — no matching events", () => {
  it("returns 0.000 when no deposit events exist", async () => {
    const db = makeDbReturning([])
    const pace = await monthlyPaceFromDeposits(1, 10, db, "2026-01-15")
    expect(pace.toFixed(3)).toBe("0.000")
  })
})

describe("monthlyPaceFromDeposits — filters by goal_id", () => {
  it("ignores events for other goals", async () => {
    const rows = [
      {
        eventTs: new Date("2026-01-10T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 99, amount_kd: "200.000" }),
      },
    ]
    const db = makeDbReturning(rows)
    const pace = await monthlyPaceFromDeposits(1, 10, db, "2026-01-15")
    expect(pace.toFixed(3)).toBe("0.000")
  })

  it("counts events for the correct goal", async () => {
    const rows = [
      {
        eventTs: new Date("2026-01-10T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 1, amount_kd: "300.000" }),
      },
    ]
    const db = makeDbReturning(rows)
    const pace = await monthlyPaceFromDeposits(1, 10, db, "2026-01-15")
    // 300 in one month, lookback=3: avg = 300/3 = 100.000
    expect(pace.toFixed(3)).toBe("100.000")
  })
})

describe("monthlyPaceFromDeposits — malformed JSON rows are skipped", () => {
  it("skips malformed propertiesJson, returns pace from valid rows only", async () => {
    const rows = [
      { eventTs: new Date("2026-01-10T12:00:00Z"), propertiesJson: "not-json" },
      {
        eventTs: new Date("2026-01-05T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 1, amount_kd: "150.000" }),
      },
    ]
    const db = makeDbReturning(rows)
    const pace = await monthlyPaceFromDeposits(1, 10, db, "2026-01-15")
    // 150 in one month, lookback=3: avg = 150/3 = 50.000
    expect(pace.toFixed(3)).toBe("50.000")
  })
})

describe("monthlyPaceFromDeposits — multi-month average", () => {
  it("averages 3 months of deposits correctly", async () => {
    // today = "2026-03-15", lookback = 3 → window Jan–Mar 2026
    const rows = [
      {
        eventTs: new Date("2026-01-10T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 5, amount_kd: "60.000" }),
      },
      {
        eventTs: new Date("2026-02-08T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 5, amount_kd: "90.000" }),
      },
      {
        eventTs: new Date("2026-03-01T12:00:00Z"),
        propertiesJson: JSON.stringify({ goal_id: 5, amount_kd: "120.000" }),
      },
    ]
    const db = makeDbReturning(rows)
    const pace = await monthlyPaceFromDeposits(5, 10, db, "2026-03-15")
    // 60+90+120 = 270, / 3 = 90.000
    expect(pace.toFixed(3)).toBe("90.000")
  })
})

// ── goalProjection — Fixture A: fully funded ──────────────────────────────────
// Python: goal(target=500, current=500, target_date=None), today=2026-01-15, no deposits
// Expected: remaining=0, pace=0, projected_date=2026-01-15, months_remaining=0,
//           required_monthly=0.000, on_track=True, shortfall=0.000

describe("Fixture A — fully funded goal", () => {
  const goal = { id: 1, userId: 10, targetKd: "500.000", currentKd: "500.000", targetDate: null }

  it("projected_date equals today", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.projected_date).toBe("2026-01-15")
  })
  it("months_remaining is 0", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.months_remaining).toBe(0)
  })
  it("required_monthly is 0.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.required_monthly).toBe("0.000")
  })
  it("on_track is true", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.on_track).toBe(true)
  })
  it("shortfall_per_month is 0.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.shortfall_per_month).toBe("0.000")
  })
})

// ── goalProjection — Fixture B: no deposits, no target date ──────────────────
// Python: goal(target=300, current=0, target_date=None), today=2026-01-15, no deposits
// Expected: pace=0, projected_date=null, months_remaining=null,
//           required_monthly=null, on_track=False, shortfall=null

describe("Fixture B — no deposits, no target date", () => {
  const goal = { id: 2, userId: 10, targetKd: "300.000", currentKd: "0.000", targetDate: null }

  it("projected_date is null", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.projected_date).toBeNull()
  })
  it("months_remaining is null", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.months_remaining).toBeNull()
  })
  it("required_monthly is null", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.required_monthly).toBeNull()
  })
  it("on_track is false", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.on_track).toBe(false)
  })
  it("shortfall_per_month is null", async () => {
    const proj = await goalProjection(goal, makeDbReturning([]), "2026-01-15")
    expect(proj.shortfall_per_month).toBeNull()
  })
})

// ── goalProjection — Fixture C: on-track with target date ────────────────────
// Python: goal(target=500, current=0, target_date=2026-06-01), today=2026-01-15
// Deposits: 100 KD each in Jan, Feb, Mar 2026 → pace = 100.000
// target_date: (2026-06-01 - 2026-01-15) = 137 days → max(1, (137+29)//30) = 5 months
// required_monthly = 500/5 = 100.000, on_track = True, shortfall = 0.000
// months_remaining = ceil(500/100) = 5, projected_date = addMonths("2026-01-01", 5) = "2026-06-01"

describe("Fixture C — on-track goal with target date", () => {
  const goal = {
    id: 3,
    userId: 10,
    targetKd: "500.000",
    currentKd: "0.000",
    targetDate: "2026-06-01",
  }
  // Lookback window with today=2026-01-15: Nov 2025 – Jan 2026 (3 months)
  const depositRows = [
    {
      eventTs: new Date("2025-11-10T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 3, amount_kd: "100.000" }),
    },
    {
      eventTs: new Date("2025-12-10T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 3, amount_kd: "100.000" }),
    },
    {
      eventTs: new Date("2026-01-10T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 3, amount_kd: "100.000" }),
    },
  ]

  it("projected_date is 2026-06-01", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.projected_date).toBe("2026-06-01")
  })
  it("months_remaining is 5", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.months_remaining).toBe(5)
  })
  it("required_monthly is 100.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.required_monthly).toBe("100.000")
  })
  it("current_pace_monthly is 100.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.current_pace_monthly).toBe("100.000")
  })
  it("on_track is true", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.on_track).toBe(true)
  })
  it("shortfall_per_month is 0.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.shortfall_per_month).toBe("0.000")
  })
})

// ── goalProjection — Fixture D: behind target ────────────────────────────────
// Python: goal(target=1000, current=100, target_date=2026-03-01), today=2026-01-15
// Deposits: 50 KD each in Nov, Dec, Jan → pace = 50.000
// target_date: (2026-03-01 - 2026-01-15) = 45 days → max(1, (45+29)//30) = 2 months
// remaining = 900, required_monthly = 900/2 = 450.000
// on_track = (50 >= 450) = False, shortfall = 400.000
// months_remaining = ceil(900/50) = 18, projected_date = addMonths("2026-01-01", 18) = "2027-07-01"

describe("Fixture D — behind-target goal", () => {
  const goal = {
    id: 4,
    userId: 10,
    targetKd: "1000.000",
    currentKd: "100.000",
    targetDate: "2026-03-01",
  }
  const depositRows = [
    {
      eventTs: new Date("2025-11-15T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 4, amount_kd: "50.000" }),
    },
    {
      eventTs: new Date("2025-12-15T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 4, amount_kd: "50.000" }),
    },
    {
      eventTs: new Date("2026-01-10T00:00:00Z"),
      propertiesJson: JSON.stringify({ goal_id: 4, amount_kd: "50.000" }),
    },
  ]

  it("projected_date is 2027-07-01", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.projected_date).toBe("2027-07-01")
  })
  it("months_remaining is 18", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.months_remaining).toBe(18)
  })
  it("required_monthly is 450.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.required_monthly).toBe("450.000")
  })
  it("current_pace_monthly is 50.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.current_pace_monthly).toBe("50.000")
  })
  it("on_track is false", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.on_track).toBe(false)
  })
  it("shortfall_per_month is 400.000", async () => {
    const proj = await goalProjection(goal, makeDbReturning(depositRows), "2026-01-15")
    expect(proj.shortfall_per_month).toBe("400.000")
  })
})
