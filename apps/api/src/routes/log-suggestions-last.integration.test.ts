// MOB-R70 D1 — last_amount and last_used against real MySQL. Requires INTEGRATION=true and the local
// stack. The newest rows at the place are a demo row and an income row; neither may become "last".
// The tie case seeds created_at explicitly, against id order, so only created_at can decide it.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { eq, inArray } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { logSuggestionsRouter } from "./log-suggestions"
import { createSessionToken } from "../middleware/auth"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `logsugglast_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/log-suggestions", logSuggestionsRouter)

type Place = { name: string; last_amount: unknown; last_used: unknown }
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
let userId = -1

async function get(): Promise<Place[]> {
  const token = await createSessionToken({ userId, externalId: RUN_ID, authProvider: "test", sv: 1 })
  const res = await app.request("/api/log-suggestions", { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: { places: Place[] } }).data.places
}

describe.runIf(RUN)("GET /api/log-suggestions — last_amount and last_used, real MySQL (MOB-R70 D1)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db.insert(users).values({ email: `${RUN_ID}@test.invalid`, authProvider: "test", externalId: RUN_ID }).$returningId()
    const cat = async (name: string, isIncome = false) => (await db.insert(categories).values({ userId, name, isIncome }).$returningId())[0].id
    const mer = async (name: string) => (await db.insert(merchants).values({ userId, name }).$returningId())[0].id
    const coffee = await cat("Coffee")
    const pay = await cat("Pay", true)
    const cafe = await mer("Cafe")
    const bakery = await mer("Bakery")
    const row = (merchantId: number, categoryId: number, amountKd: string, date: string, source = "manual", createdAt?: Date) => ({
      userId, merchantId, categoryId, name: "Thing", nameKey: "thing", amountKd, date: day(date), source,
      ...(createdAt ? { createdAt } : {}),
    })

    await db.insert(transactions).values([
      row(cafe, coffee, "2", "2026-09-10"),
      row(cafe, coffee, "1.5", "2026-09-01"),
      // Newer than the expense above, and excluded: a demo row, and an income row.
      row(cafe, coffee, "9", "2026-09-20", "demo"),
      row(cafe, pay, "50", "2026-09-15"),
    ])
    // Same date at Bakery. Inserted one at a time so ids are ordered: the LOWER id was created
    // LATER, so created_at and id disagree and only created_at can pick "3.250".
    await db.insert(transactions).values(row(bakery, coffee, "3.25", "2026-09-12", "manual", new Date("2026-09-12T18:00:00.000Z")))
    await db.insert(transactions).values(row(bakery, coffee, "7", "2026-09-12", "manual", new Date("2026-09-12T08:00:00.000Z")))
  })

  afterAll(async () => {
    if (userId < 0) return
    const db = getDb()
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(merchants).where(inArray(merchants.userId, [userId]))
    await db.delete(categories).where(inArray(categories.userId, [userId]))
    await db.delete(users).where(eq(users.id, userId))
  })

  it("ignores newer demo and income rows at the place", async () => {
    const cafe = (await get()).find((p) => p.name === "Cafe")!
    expect(cafe.last_amount).toBe("2.000")
    expect(cafe.last_used).toBe("2026-09-10")
  })

  it("on the same date, the most recently created row wins, not the highest id", async () => {
    const bakery = (await get()).find((p) => p.name === "Bakery")!
    expect(bakery.last_amount).toBe("3.250")
    expect(bakery.last_used).toBe("2026-09-12")
  })
})
