// MOB-R53 B1 — GET /api/log-suggestions against real MySQL. Requires INTEGRATION=true and the
// local stack. Scoping and the demo/income exclusions are SQL, so only a real database proves them.
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
const RUN_ID = `logsugg_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/log-suggestions", logSuggestionsRouter)

type Place = { name: string; category: string | null; count: number; items: Array<{ name: string; category: string | null; amount_kd: unknown }> }

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
let userA = -1
let userB = -1

async function get(userId: number): Promise<Place[]> {
  const token = await createSessionToken({ userId, externalId: `${RUN_ID}_${userId}`, authProvider: "test", sv: 1 })
  const res = await app.request("/api/log-suggestions", { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  return ((await res.json()) as { data: { places: Place[] } }).data.places
}

describe.runIf(RUN)("GET /api/log-suggestions — real MySQL", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userA }] = await db.insert(users).values({ email: `${RUN_ID}_a@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_a` }).$returningId()
    ;[{ id: userB }] = await db.insert(users).values({ email: `${RUN_ID}_b@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_b` }).$returningId()

    const cat = async (userId: number, name: string, isIncome = false) =>
      (await db.insert(categories).values({ userId, name, isIncome }).$returningId())[0].id
    const mer = async (userId: number, name: string) => (await db.insert(merchants).values({ userId, name }).$returningId())[0].id
    const tx = (userId: number, merchantId: number, categoryId: number | null, name: string, amountKd: string, date: Date, source = "manual") => ({
      userId, merchantId, categoryId, name, nameKey: name.toLowerCase(), amountKd, date, source,
    })

    const coffee = await cat(userA, "Coffee")
    const groceries = await cat(userA, "Groceries")
    const salaryByName = await cat(userA, "Income: Salary")
    const salaryByFlag = await cat(userA, "Pay", true)
    const pick = await mer(userA, "PICK")
    const talabat = await mer(userA, "Talabat")
    const sultan = await mer(userA, "Sultan Center")
    const oula = await mer(userA, "Oula")
    const demoPlace = await mer(userA, "Demo Place")
    const employer = await mer(userA, "Acme Payroll")
    const flaggedPayer = await mer(userA, "Flagged Payer")
    const otherCafe = await mer(userB, "Other User Cafe")
    const otherCoffee = await cat(userB, "Coffee")

    const rows = [
      // PICK: 3 recent (newest today) across 6 distinct items, so its item list is capped at 5.
      tx(userA, pick, coffee, "Americano", "2.5", daysAgo(0)),
      tx(userA, pick, coffee, "Americano", "2.250", daysAgo(5)),
      tx(userA, pick, coffee, "Latte", "1.750", daysAgo(6)),
      tx(userA, pick, coffee, "Mocha", "1.900", daysAgo(200)),
      tx(userA, pick, coffee, "Tea", "0.900", daysAgo(201)),
      tx(userA, pick, coffee, "Cake", "2.000", daysAgo(202)),
      tx(userA, pick, coffee, "Cookie", "0.500", daysAgo(203)),
      // Talabat: 4 recent, the highest 90-day count, but its newest is 10 days old — so it leads
      // ONLY because count outranks recency (recency alone would put PICK and Oula ahead).
      tx(userA, talabat, groceries, "Dinner", "6.000", daysAgo(10)),
      tx(userA, talabat, groceries, "Dinner", "6.000", daysAgo(11)),
      tx(userA, talabat, groceries, "Dinner", "6.000", daysAgo(13)),
      tx(userA, talabat, groceries, "Lunch", "4.000", daysAgo(12)),
      // Oula: 3 recent, tying PICK on count, newest 2 days old — so recency puts PICK first
      // (a count-only order would fall back to name and put Oula first).
      tx(userA, oula, groceries, "Fuel", "5.000", daysAgo(2)),
      tx(userA, oula, groceries, "Fuel", "5.000", daysAgo(3)),
      tx(userA, oula, groceries, "Fuel", "5.000", daysAgo(4)),
      // Sultan Center: the most entries all time (5), none in the last 90 days, so it sorts last.
      ...[120, 121, 122, 123, 124].map((d) => tx(userA, sultan, groceries, "Weekly shop", "20.000", daysAgo(d))),
      // Excluded: a demo row, income by name, income by flag.
      tx(userA, demoPlace, coffee, "Demo coffee", "1.000", daysAgo(1), "demo"),
      tx(userA, employer, salaryByName, "Salary", "1600.000", daysAgo(2)),
      tx(userA, flaggedPayer, salaryByFlag, "Bonus", "100.000", daysAgo(3)),
      // Another user's row at another user's merchant.
      tx(userB, otherCafe, otherCoffee, "Flat white", "1.100", daysAgo(0)),
    ]
    await db.insert(transactions).values(rows)
  })

  afterAll(async () => {
    const db = getDb()
    const ids = [userA, userB].filter((id) => id > 0)
    if (ids.length === 0) return
    await db.delete(transactions).where(inArray(transactions.userId, ids))
    await db.delete(merchants).where(inArray(merchants.userId, ids))
    await db.delete(categories).where(inArray(categories.userId, ids))
    for (const id of ids) await db.delete(users).where(eq(users.id, id))
  })

  it("never shows another user's places or items", async () => {
    const a = await get(userA)
    const b = await get(userB)
    expect(a.map((p) => p.name)).not.toContain("Other User Cafe")
    expect(b.map((p) => p.name)).toEqual(["Other User Cafe"])
  })

  it("excludes demo rows and income rows (by name and by flag)", async () => {
    const names = (await get(userA)).map((p) => p.name)
    // The rows exist (seeded above); only the filter keeps them out.
    expect(names).not.toContain("Demo Place")
    expect(names).not.toContain("Acme Payroll")
    expect(names).not.toContain("Flagged Payer")
    expect(names).toEqual(["Talabat", "PICK", "Oula", "Sultan Center"])
  })

  it("orders places by 90-day count then recency, and items by count then recency, capped at 5", async () => {
    const places = await get(userA)
    expect(places.map((p) => p.name)).toEqual(["Talabat", "PICK", "Oula", "Sultan Center"])
    expect(places.map((p) => p.count)).toEqual([4, 3, 3, 0])
    const byName = Object.fromEntries(places.map((p) => [p.name, p]))
    expect(byName["PICK"].items.map((i) => i.name)).toEqual(["Americano", "Latte", "Mocha", "Tea", "Cake"])
    expect(byName["Talabat"].items.map((i) => i.name)).toEqual(["Dinner", "Lunch"])
  })

  it("returns each item's most recent amount as a 3-decimal string", async () => {
    const pick = (await get(userA)).find((p) => p.name === "PICK")!
    expect(pick.items[0]).toEqual({ name: "Americano", category: "Coffee", amount_kd: "2.500" })
    expect(typeof pick.items[0].amount_kd).toBe("string")
  })
})
