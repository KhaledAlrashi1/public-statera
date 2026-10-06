// MOB-R53 B1 — GET /api/log-suggestions, hermetic. Scoping, demo and income exclusion live in SQL
// and are proven against real MySQL in log-suggestions.integration.test.ts; this file pins the
// route envelope and the pure shaping (ordering, both caps, money as strings).
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import { logSuggestionsRouter } from "./log-suggestions"
import { createSessionToken } from "../middleware/auth"
import { shapeLogSuggestions, type EntryRow, type PlaceRow } from "../lib/log-suggestions-lib"

// Each db.select() chain resolves to the NEXT queued result, so the two queries can differ.
function makeQueuedDb(results: unknown[][]) {
  let call = 0
  const chain = (result: unknown): object =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then")
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
          return () => chain(result)
        },
      },
    )
  return new Proxy({}, { get: () => () => chain(results[call++] ?? []) })
}

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

const app = new Hono().route("/api/log-suggestions", logSuggestionsRouter)
const auth = async () =>
  `Bearer ${await createSessionToken({ userId: 7, externalId: "ext", authProvider: "test", sv: 1 })}`

const place = (merchantId: number, merchantName: string, recentCount = 1): PlaceRow => ({ merchantId, merchantName, recentCount })
const entry = (merchantId: number, nameKey: string, amountKd = "1.000", categoryName: string | null = "Coffee"): EntryRow => ({ date: "2026-05-01", createdAt: null, id: 0,
  merchantId,
  nameKey,
  name: nameKey.toUpperCase(),
  amountKd,
  categoryName,
})

describe("GET /api/log-suggestions", () => {
  beforeEach(() => vi.resetAllMocks())

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/log-suggestions")
    expect(res.status).toBe(401)
  })

  it("returns places with items, money as 3-decimal strings", async () => {
    vi.mocked(getDb).mockReturnValue(
      makeQueuedDb([[place(1, "PICK", 3)], [entry(1, "americano", "1.5"), entry(1, "americano", "1.25")]]) as never,
    )
    const res = await app.request("/api/log-suggestions", { headers: { Authorization: await auth() } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { places: Array<Record<string, unknown>> }; meta: { count: number } }
    expect(body.ok).toBe(true)
    expect(body.meta.count).toBe(1)
    expect(body.data.places[0]).toEqual({ last_amount: "1.500", last_used: "2026-05-01",
      name: "PICK",
      category: "Coffee",
      count: 3,
      // The most recent entry's amount, normalised: "1.5" -> "1.500". A string, never a number.
      items: [{ name: "AMERICANO", category: "Coffee", amount_kd: "1.500" }],
    })
  })
})

describe("shapeLogSuggestions", () => {
  it("orders a place's items by count, then most recent, and keeps at most 5", () => {
    const entries = [
      entry(1, "f"), // newest, count 1
      entry(1, "a"), entry(1, "a"), entry(1, "a"),
      entry(1, "b"), entry(1, "b"),
      entry(1, "c"), entry(1, "d"), entry(1, "e"),
    ]
    const [p] = shapeLogSuggestions([place(1, "PICK")], entries)
    // a(3), b(2), then the count-1 items in recency order f, c, d — e is the 6th and is dropped.
    expect(p.items.map((i) => i.name)).toEqual(["A", "B", "F", "C", "D"])
  })

  it("keeps at most 200 places, in the order the query returned them", () => {
    const places = Array.from({ length: 205 }, (_, i) => place(i + 1, `P${i + 1}`))
    const shaped = shapeLogSuggestions(places, [])
    expect(shaped).toHaveLength(200)
    expect(shaped[0].name).toBe("P1")
    expect(shaped[199].name).toBe("P200")
  })

  it("takes the place's category and each item's details from its most recent entry", () => {
    const entries = [entry(1, "latte", "2.000", "Coffee"), entry(1, "latte", "1.500", "Snacks"), entry(1, "cake", "3.000", "Snacks")]
    const [p] = shapeLogSuggestions([place(1, "PICK")], entries)
    expect(p.category).toBe("Coffee")
    expect(p.items[0]).toEqual({ name: "LATTE", category: "Coffee", amount_kd: "2.000" })
  })
})
