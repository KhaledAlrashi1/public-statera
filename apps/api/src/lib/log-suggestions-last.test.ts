// MOB-R70 D1 — per place, last_amount and last_used: the amount (formatKd) and date of the most
// recent entry. Ties on date go to the most recently created row. Pure shaping; the demo and income
// exclusions are SQL and are proven against real MySQL in log-suggestions-last.integration.test.ts.
import { describe, it, expect } from "vitest"
import { shapeLogSuggestions, type EntryRow, type PlaceRow } from "./log-suggestions-lib"

const place: PlaceRow = { merchantId: 1, merchantName: "PICK", recentCount: 3 }
let nextId = 1
const entry = (date: string, amountKd: string, createdAt: string, id = nextId++): EntryRow => ({
  merchantId: 1,
  nameKey: `item${id}`,
  name: `Item ${id}`,
  amountKd,
  categoryName: "Coffee",
  date: new Date(`${date}T00:00:00Z`),
  createdAt: new Date(createdAt),
  id,
})

describe("shapeLogSuggestions — last_amount and last_used (MOB-R70 D1)", () => {
  it("takes the amount and date of the place's most recent entry, whatever order the rows arrive in", () => {
    const rows = [
      entry("2026-09-01", "4.5", "2026-09-01T08:00:00Z"),
      entry("2026-10-03", "1.75", "2026-10-03T08:00:00Z"),
      entry("2026-09-20", "9", "2026-09-20T08:00:00Z"),
    ]
    const [p] = shapeLogSuggestions([place], rows)
    expect(p.last_amount).toBe("1.750")
    expect(p.last_used).toBe("2026-10-03")
  })

  it("on the same date, the most recently created row wins", () => {
    const rows = [
      // Higher id but created earlier: created_at decides, not id.
      entry("2026-10-03", "2", "2026-10-03T09:00:00Z", 50),
      entry("2026-10-03", "3", "2026-10-03T18:30:00Z", 40),
    ]
    const [p] = shapeLogSuggestions([place], rows)
    expect(p.last_amount).toBe("3.000")
    expect(p.last_used).toBe("2026-10-03")
  })

  it("a place with no entries has neither", () => {
    const [p] = shapeLogSuggestions([place], [])
    expect(p.last_amount).toBeNull()
    expect(p.last_used).toBeNull()
  })
})
