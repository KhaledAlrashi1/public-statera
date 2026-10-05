import { describe, expect, it } from "vitest"

import { SUGGESTED_CATEGORIES, SUGGESTED_MERCHANTS } from "./suggested-names"

// MOB-R46 Part B — the constant suggestion list. Nothing in it is saved until a transaction is.

const lower = (s: string) => s.toLowerCase()

describe("suggested names (MOB-R46)", () => {
  it("has the 23 categories", () => {
    expect(SUGGESTED_CATEGORIES).toHaveLength(23)
  })

  it("has the 50 merchants", () => {
    expect(SUGGESTED_MERCHANTS).toHaveLength(50)
  })

  it("has no category starting with \"income\" (case-insensitive)", () => {
    expect(SUGGESTED_CATEGORIES.filter((c) => lower(c).startsWith("income"))).toEqual([])
  })

  it("has no case-insensitive duplicates among categories or merchants", () => {
    const categories = SUGGESTED_CATEGORIES.map(lower)
    const merchants = SUGGESTED_MERCHANTS.map((m) => lower(m.name))
    expect(new Set(categories).size).toBe(categories.length)
    expect(new Set(merchants).size).toBe(merchants.length)
  })

  it("gives every merchant a default category that is in the category list", () => {
    const known = new Set(SUGGESTED_CATEGORIES)
    expect(SUGGESTED_MERCHANTS.filter((m) => !known.has(m.category))).toEqual([])
  })
})
