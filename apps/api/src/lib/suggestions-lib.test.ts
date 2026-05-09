/**
 * Tests for suggestions-lib: txnNorm and suggestTransactions.
 *
 * txnNorm expected values are captured from running Flask's _txn_norm against
 * the same inputs (backend/lib/suggestions.py). Fixture parity is the source
 * of truth; do not "fix" these by adjusting the expected strings.
 *
 * suggestTransactions uses a Proxy db mock — the function is tested for correct
 * early-exit behaviour and row mapping. Ordering is enforced by the DB query;
 * rows are mapped in the order the mock returns them.
 */

import { describe, it, expect } from "vitest"
import { txnNorm, suggestTransactions } from "./suggestions-lib"
import type { SuggestionItem } from "./suggestions-lib"

// ── txnNorm fixture tests ──────────────────────────────────────────────────────

describe("txnNorm — null / empty", () => {
  it("null → empty string", () => {
    expect(txnNorm(null)).toBe("")
  })

  it("undefined → empty string", () => {
    expect(txnNorm(undefined)).toBe("")
  })

  it("empty string → empty string", () => {
    expect(txnNorm("")).toBe("")
  })
})

describe("txnNorm — lowercase and whitespace", () => {
  it("lowercases input", () => {
    expect(txnNorm("STARBUCKS")).toBe("starbucks")
  })

  it("trims leading and trailing whitespace", () => {
    expect(txnNorm("  hello world  ")).toBe("hello world")
  })

  it("collapses internal whitespace", () => {
    expect(txnNorm("multiple   spaces")).toBe("multiple spaces")
  })

  it("trims + lowercases + collapses together", () => {
    expect(txnNorm("  Hello   World  ")).toBe("hello world")
  })
})

describe("txnNorm — punctuation and special chars", () => {
  it("strips hyphens and collapses to single space", () => {
    expect(txnNorm("Hello-World")).toBe("hello world")
  })

  it("strips trailing punctuation", () => {
    expect(txnNorm("Hello-World!")).toBe("hello world")
  })

  it("strips slash", () => {
    expect(txnNorm("a/b")).toBe("a b")
  })
})

describe("txnNorm — Arabic core letters U+0621–U+064A (in-range, preserved)", () => {
  // ك = U+0643, within the kept range U+0621–U+064A
  it("preserves a single Arabic core letter (U+0643 ك)", () => {
    expect(txnNorm("ك")).toBe("ك")
  })

  // ا = U+0627, ف = U+0641, ي = U+064A — all in range
  it("preserves an Arabic word", () => {
    expect(txnNorm("كافيه")).toBe("كافيه")
  })

  it("preserves Arabic mixed with ASCII", () => {
    expect(txnNorm("hello كافيه")).toBe("hello كافيه")
  })

  // U+0621 (ء Arabic Letter Hamza) — lower bound of kept range
  it("preserves U+0621 (ء — lower bound)", () => {
    expect(txnNorm("ء")).toBe("ء")
  })

  // U+064A (ي Arabic Letter Yeh) — upper bound of kept range
  it("preserves U+064A (ي — upper bound)", () => {
    expect(txnNorm("ي")).toBe("ي")
  })
})

describe("txnNorm — Arabic out-of-range chars (stripped)", () => {
  // U+064B Arabic Fathatan — one above the kept range upper bound
  it("strips U+064B (Arabic Fathatan — one above upper bound) alone → empty", () => {
    expect(txnNorm("ً")).toBe("")
  })

  it("strips U+064B between ASCII chars → collapses to space", () => {
    expect(txnNorm("abcًxyz")).toBe("abc xyz")
  })

  // U+FB50 Arabic Presentation Form-A (Arabic Letter Alef Wasla Isolated Form)
  it("strips U+FB50 (Arabic Presentation Form-A) alone → empty", () => {
    expect(txnNorm("ﭐ")).toBe("")
  })

  it("strips U+FB50 between ASCII chars → collapses to space", () => {
    expect(txnNorm("abcﭐxyz")).toBe("abc xyz")
  })

  // U+FE70 Arabic Presentation Form-B
  it("strips U+FE70 (Arabic Presentation Form-B) alone → empty", () => {
    expect(txnNorm("ﹰ")).toBe("")
  })

  it("strips U+FE70 between ASCII chars → collapses to space", () => {
    expect(txnNorm("abcﹰxyz")).toBe("abc xyz")
  })
})

describe("txnNorm — digit-token stripping (3+ digit standalone tokens)", () => {
  it("strips 5-digit token", () => {
    expect(txnNorm("order 12345 done")).toBe("order done")
  })

  it("strips 3-digit token (minimum)", () => {
    expect(txnNorm("order 123 done")).toBe("order done")
  })

  it("does NOT strip 2-digit token", () => {
    expect(txnNorm("order 12 done")).toBe("order 12 done")
  })

  it("does NOT strip 1-digit token", () => {
    expect(txnNorm("order 9 done")).toBe("order 9 done")
  })

  it("strips only the 3+ digit tokens, leaves the rest", () => {
    expect(txnNorm("ref 99 code 1234 ok")).toBe("ref 99 code ok")
  })
})

describe("txnNorm — 255-char truncation", () => {
  it("truncates to exactly 255 chars", () => {
    const long = "a".repeat(300)
    expect(txnNorm(long)).toBe("a".repeat(255))
  })

  it("does not truncate strings at or under 255 chars", () => {
    const exact = "a".repeat(255)
    expect(txnNorm(exact)).toBe("a".repeat(255))
  })
})

// ── suggestTransactions proxy-mock tests ───────────────────────────────────────

type MockRow = {
  canonical: string
  count: number
  categoryName: string | null
  merchantName: string | null
}

function makeDbReturning(rows: MockRow[]): any { // eslint-disable-line @typescript-eslint/no-explicit-any
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
                return (..._inner: unknown[]) => makeDbReturning(rows)
              },
            },
          )
      },
    },
  )
}

describe("suggestTransactions — early exit", () => {
  it("returns [] immediately when q is empty without touching db", async () => {
    const dbSpy = { select: () => { throw new Error("db should not be called") } }
    const result = await suggestTransactions("", 1, dbSpy as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual([])
  })

  it("returns [] when q normalizes to empty (only stripped chars)", async () => {
    const dbSpy = { select: () => { throw new Error("db should not be called") } }
    // "12345" after txnNorm: digits stripped → "" → early exit
    const result = await suggestTransactions("12345", 1, dbSpy as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(result).toEqual([])
  })
})

describe("suggestTransactions — row mapping", () => {
  it("maps canonical→name, count→count, categoryName→category, merchantName→merchant", async () => {
    const rows: MockRow[] = [
      { canonical: "Starbucks", count: 5, categoryName: "Food", merchantName: "Starbucks Co" },
    ]
    const result = await suggestTransactions("star", 1, makeDbReturning(rows))
    expect(result).toEqual<SuggestionItem[]>([
      { name: "Starbucks", count: 5, category: "Food", merchant: "Starbucks Co" },
    ])
  })

  it("maps null categoryName → category: null", async () => {
    const rows: MockRow[] = [
      { canonical: "ATM Withdrawal", count: 3, categoryName: null, merchantName: null },
    ]
    const result = await suggestTransactions("atm", 1, makeDbReturning(rows))
    expect(result).toEqual<SuggestionItem[]>([
      { name: "ATM Withdrawal", count: 3, category: null, merchant: null },
    ])
  })
})

describe("suggestTransactions — ordering (count desc, lastSeen desc)", () => {
  it("preserves db row order — higher count first", async () => {
    // The DB enforces ordering; the function must preserve the returned order.
    const rows: MockRow[] = [
      { canonical: "Starbucks", count: 10, categoryName: "Food", merchantName: null },
      { canonical: "Costa Coffee", count: 3, categoryName: "Food", merchantName: null },
    ]
    const result = await suggestTransactions("coffee", 1, makeDbReturning(rows))
    expect(result[0].name).toBe("Starbucks")
    expect(result[1].name).toBe("Costa Coffee")
  })

  it("returns all rows from db without reordering", async () => {
    const rows: MockRow[] = [
      { canonical: "A", count: 5, categoryName: null, merchantName: null },
      { canonical: "B", count: 4, categoryName: null, merchantName: null },
      { canonical: "C", count: 1, categoryName: null, merchantName: null },
    ]
    const result = await suggestTransactions("a", 1, makeDbReturning(rows))
    expect(result.map((r) => r.name)).toEqual(["A", "B", "C"])
  })
})
