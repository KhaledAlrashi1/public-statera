/**
 * Tests for income-lib: resolveIncomeForPeriod.
 *
 * Income is TYPED-ONLY (MOB-R31/R33). detectMonthlyIncome and its three tests were removed with
 * the detected arm; the remaining four cover the resolver's two arms.
 *
 * Uses a stateful sequential mock for the profile-arm cases, and a COLUMN-KEYED mock for the case
 * proving income rows are ignored — call-order routing could not tell "the resolver ignored the
 * income rows" from "the resolver read a different slot".
 */

import { describe, it, expect } from "vitest"
import { resolveIncomeForPeriod, type IncomeResolution } from "./income-lib"

// ── Mock helpers ──────────────────────────────────────────────────────────────

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

// Answers each query by the COLUMNS it selects: `total` is the income-transaction SUM the removed
// detected arm issued; `monthlyIncomeKd` is the profile. Records every selected column set.
function makeKeyedDb(byKey: Record<string, unknown[]>, seen: string[][]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  function chain(rows: unknown[]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          }
          return (..._args: unknown[]) => chain(rows)
        },
      },
    )
  }
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          const cols = prop === "select" && args[0] ? Object.keys(args[0] as object) : []
          seen.push(cols)
          const key = cols.find((c) => c in byKey)
          return chain(key ? byKey[key] : [])
        }
      },
    },
  )
}

// ── resolveIncomeForPeriod ────────────────────────────────────────────────────

describe("resolveIncomeForPeriod — typed-only", () => {
  it("income transactions do not resolve to income: rows present, no profile value → not_set", async () => {
    const seen: string[][] = []
    const db = makeKeyedDb({ total: [{ total: "800.000" }], monthlyIncomeKd: [] }, seen)
    const result = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("not_set")
    expect(result.amountKd).toBeNull()
    // The transaction-income SUM is never issued.
    expect(seen.some((cols) => cols.includes("total"))).toBe(false)
  })

  it("returns declared_in_profile when the profile value is > 0", async () => {
    const db = makeSequentialDb([[{ monthlyIncomeKd: "1200.000" }]])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("declared_in_profile")
    expect(result.amountKd?.toFixed(3)).toBe("1200.000")
  })

  it("returns not_set when no income and no declared profile value", async () => {
    // profile row is empty
    const db = makeSequentialDb([[]])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("not_set")
    expect(result.amountKd).toBeNull()
  })

  it("returns not_set when declared income is 0", async () => {
    const db = makeSequentialDb([[{ monthlyIncomeKd: "0.000" }]])
    const result: IncomeResolution = await resolveIncomeForPeriod(1, "2024-06", db)
    expect(result.source).toBe("not_set")
    expect(result.amountKd).toBeNull()
  })
})
