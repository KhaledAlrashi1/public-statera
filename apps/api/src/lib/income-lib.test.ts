/**
 * Tests for income-lib: detectMonthlyIncome and resolveIncomeForPeriod.
 *
 * Uses the Proxy mock pattern (same as suggestions-lib.test.ts) for single-call
 * scenarios, and a stateful sequential mock for multi-call precedence tests.
 */

import { describe, it, expect } from "vitest"
import Decimal from "decimal.js"
import { detectMonthlyIncome, resolveIncomeForPeriod, type IncomeResolution } from "./income-lib"

// ── Mock helpers ──────────────────────────────────────────────────────────────
//
// Flat self-referential proxy: every method call returns the SAME proxy type
// (which has a proper `then`). This works regardless of chain depth or whether
// the Drizzle query ends on an even/odd chained call — unlike the outer/inner
// two-level proxy in suggestions-lib.test.ts, which only resolves when the chain
// ends on an "inner" (thenable) proxy.

function makeDbReturning(rows: unknown[]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
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

// Returns a mock db where each successive await gets the next rows in sequences[].
function makeSequentialDb(sequences: unknown[][]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  let callIndex = 0
  function makeProxy(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = sequences[callIndex] ?? []
            callIndex++
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

// ── detectMonthlyIncome ───────────────────────────────────────────────────────

describe("detectMonthlyIncome", () => {
  it("returns detected total when income transactions exist", async () => {
    const db = makeDbReturning([{ total: "1500.000" }])
    const result = await detectMonthlyIncome(1, "2024-06", db)
    expect(result.equals(new Decimal("1500.000"))).toBe(true)
  })

  it("returns 0 when no income transactions", async () => {
    const db = makeDbReturning([{ total: "0" }])
    const result = await detectMonthlyIncome(1, "2024-06", db)
    expect(result.equals(0)).toBe(true)
  })

  it("returns 0 for null/missing total row", async () => {
    const db = makeDbReturning([])
    const result = await detectMonthlyIncome(1, "2024-06", db)
    expect(result.equals(0)).toBe(true)
  })
})

// ── resolveIncomeForPeriod ────────────────────────────────────────────────────

describe("resolveIncomeForPeriod — precedence", () => {
  it("returns detected_from_transactions when income exists", async () => {
    const db = makeDbReturning([{ total: "800.000" }])
    const result = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("detected_from_transactions")
    expect(result.amountKd?.toFixed(3)).toBe("800.000")
  })

  it("falls back to declared_in_profile when no income transactions", async () => {
    // First await (detect): [{ total: "0" }]; second await (profile): [{ monthlyIncomeKd: "1200.000" }]
    const db = makeSequentialDb([[{ total: "0" }], [{ monthlyIncomeKd: "1200.000" }]])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("declared_in_profile")
    expect(result.amountKd?.toFixed(3)).toBe("1200.000")
  })

  it("returns not_set when no income and no declared profile value", async () => {
    // detect returns 0; profile row is empty
    const db = makeSequentialDb([[{ total: "0" }], []])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("not_set")
    expect(result.amountKd).toBeNull()
  })

  it("returns not_set when declared income is 0", async () => {
    const db = makeSequentialDb([[{ total: "0" }], [{ monthlyIncomeKd: "0.000" }]])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("not_set")
    expect(result.amountKd).toBeNull()
  })
})
