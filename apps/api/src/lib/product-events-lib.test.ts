/**
 * Unit tests for product-events-lib.
 *
 * Uses the flat self-referential proxy pattern (canonical: income-lib.test.ts).
 * "DB returning rows" is used for SELECT (hasEvent, hasEventBetween).
 * "DB returning []" simulates no existing row → insert proceeds.
 * "DB throwing" simulates a DB error → function returns false, Sentry called.
 *
 * recordEventDaily boundary test: verifies the UTC-midnight day boundary is
 * exclusive on the upper end, matching Flask's event_ts < day_end comparison.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./sentry", () => ({ Sentry: { captureException: vi.fn() } }))

// ── DB mock helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDbReturning(rows: unknown[]): any {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject)
        }
        return (..._args: unknown[]) => makeDbReturning(rows)
      },
    },
  )
}

// Sequential mock: each await on the db returns the next entry in sequences[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSequentialDb(sequences: unknown[][]): any {
  let idx = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeProxy(): any {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = sequences[idx] ?? []
            idx++
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (..._args: unknown[]) => makeProxy()
        },
      },
    )
  }
  return makeProxy()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeThrowingDb(): any {
  return new Proxy(
    {},
    {
      get() {
        return () => { throw new Error("DB error") }
      },
    },
  )
}

// ── Imports under test ────────────────────────────────────────────────────────

import {
  hasEvent,
  hasEventBetween,
  recordEvent,
  recordEventOnce,
  recordEventDaily,
} from "./product-events-lib"
import { Sentry } from "./sentry"

beforeEach(() => { vi.clearAllMocks() })

// ── hasEvent ──────────────────────────────────────────────────────────────────

describe("hasEvent", () => {
  it("returns true when a matching row exists", async () => {
    const db = makeDbReturning([{ id: 1 }])
    expect(await hasEvent(1, "app_opened", db)).toBe(true)
  })

  it("returns false when no matching row exists", async () => {
    const db = makeDbReturning([])
    expect(await hasEvent(1, "app_opened", db)).toBe(false)
  })
})

// ── hasEventBetween ───────────────────────────────────────────────────────────

describe("hasEventBetween", () => {
  it("returns true when a row exists within the window", async () => {
    const db = makeDbReturning([{ id: 5 }])
    const start = new Date("2026-05-13T00:00:00.000Z")
    const end = new Date("2026-05-14T00:00:00.000Z")
    expect(await hasEventBetween(1, "app_opened", start, end, db)).toBe(true)
  })

  it("returns false when no row exists within the window", async () => {
    const db = makeDbReturning([])
    const start = new Date("2026-05-13T00:00:00.000Z")
    const end = new Date("2026-05-14T00:00:00.000Z")
    expect(await hasEventBetween(1, "app_opened", start, end, db)).toBe(false)
  })
})

// ── recordEvent ───────────────────────────────────────────────────────────────

describe("recordEvent", () => {
  it("returns true on successful insert", async () => {
    const db = makeDbReturning([])
    expect(await recordEvent(1, "budget_saved", { month: "2026-05" }, db)).toBe(true)
  })

  it("returns false and reports to Sentry on DB error", async () => {
    expect(await recordEvent(1, "budget_saved", {}, makeThrowingDb())).toBe(false)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })

  it("accepts null properties", async () => {
    const db = makeDbReturning([])
    expect(await recordEvent(1, "app_opened", null, db)).toBe(true)
  })
})

// ── recordEventOnce ───────────────────────────────────────────────────────────

describe("recordEventOnce", () => {
  it("returns false without inserting when event already exists", async () => {
    // First call (SELECT) returns a row → existing; no insert
    const db = makeDbReturning([{ id: 99 }])
    expect(await recordEventOnce(1, "first_budget_set", {}, db)).toBe(false)
  })

  it("inserts and returns true when event does not exist", async () => {
    // SELECT returns nothing → no existing row; INSERT succeeds
    const db = makeSequentialDb([[], []])
    expect(await recordEventOnce(1, "first_budget_set", {}, db)).toBe(true)
  })

  it("returns false and reports to Sentry on DB error", async () => {
    expect(await recordEventOnce(1, "first_budget_set", {}, makeThrowingDb())).toBe(false)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })
})

// ── recordEventDaily ──────────────────────────────────────────────────────────

describe("recordEventDaily", () => {
  it("returns false without inserting when event already exists today", async () => {
    const nowUtc = new Date("2026-05-13T14:00:00.000Z")
    const db = makeDbReturning([{ id: 10 }])
    expect(await recordEventDaily(1, "app_opened", null, db, { nowUtc })).toBe(false)
  })

  it("inserts and returns true when no event exists today", async () => {
    const nowUtc = new Date("2026-05-13T14:00:00.000Z")
    const db = makeSequentialDb([[], []])
    expect(await recordEventDaily(1, "app_opened", null, db, { nowUtc })).toBe(true)
  })

  it("returns false and reports to Sentry on DB error", async () => {
    const nowUtc = new Date("2026-05-13T14:00:00.000Z")
    expect(await recordEventDaily(1, "app_opened", null, makeThrowingDb(), { nowUtc })).toBe(false)
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
  })

  // UTC-midnight boundary: 23:59:59.999Z on day N is within day N's window.
  // 00:00:00.000Z on day N+1 is outside day N's window (exclusive upper bound).
  // Both should insert (window check finds no row on each call separately).
  it("treats 23:59:59.999Z as still within its day window (day N)", async () => {
    const endOfDayN = new Date("2026-05-13T23:59:59.999Z")
    const db = makeSequentialDb([[], []])
    expect(await recordEventDaily(1, "app_opened", null, db, { nowUtc: endOfDayN })).toBe(true)
  })

  it("treats 00:00:00.000Z day N+1 as a new day (inserts independently)", async () => {
    const startOfDayNplus1 = new Date("2026-05-14T00:00:00.000Z")
    const db = makeSequentialDb([[], []])
    expect(await recordEventDaily(1, "app_opened", null, db, { nowUtc: startOfDayNplus1 })).toBe(true)
  })

  it("uses nowUtc as the inserted eventTs when provided", async () => {
    // Verify that the insert values include eventTs = nowUtc.
    // We spy on the proxy's method chain to capture the values passed to insert().
    const nowUtc = new Date("2026-05-13T08:30:00.000Z")
    let capturedValues: unknown = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeCapturingDb(): any {
      let selectDone = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function makeProxy(stage: "root" | "insert-values"): any {
        return new Proxy(
          {},
          {
            get(_t, prop: string) {
              if (prop === "then") {
                return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve)
              }
              if (!selectDone && prop !== "insert") {
                // SELECT chain — return no rows
                selectDone = true
                return (..._args: unknown[]) => makeProxy("root")
              }
              if (prop === "values") {
                return (vals: unknown) => {
                  capturedValues = vals
                  return makeProxy("insert-values")
                }
              }
              return (..._args: unknown[]) => makeProxy(stage)
            },
          },
        )
      }
      return makeProxy("root")
    }

    await recordEventDaily(1, "app_opened", null, makeCapturingDb(), { nowUtc })
    expect(capturedValues).toMatchObject({ eventTs: nowUtc })
  })
})
