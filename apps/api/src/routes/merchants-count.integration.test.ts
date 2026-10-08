// MOB-R92 E2 — the places list's expense count, against real MySQL (INTEGRATION=true, the local stack): it counts
// her rows at each place whose category is not income (a row with no category counts), never income rows and never
// another user's rows; a place with none reads 0.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { inArray } from "drizzle-orm"

import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { merchantsRouter } from "./merchants"
import { createSessionToken } from "../middleware/auth"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `placecount_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/merchants", merchantsRouter)
const ids = { me: -1, other: -1 }

describe.runIf(RUN)("places list expense count (MOB-R92 E2)", () => {
  beforeAll(async () => {
    const db = getDb()
    for (const who of ["me", "other"] as const) {
      ;[{ id: ids[who] }] = await db.insert(users).values({ email: `${RUN_ID}_${who}@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_${who}` }).$returningId()
    }
    const me = ids.me
    const [{ id: groceries }] = await db.insert(categories).values({ userId: me, name: "Groceries", isIncome: false }).$returningId()
    const [{ id: salary }] = await db.insert(categories).values({ userId: me, name: "Salary", isIncome: true }).$returningId()
    const [{ id: lulu }] = await db.insert(merchants).values({ userId: me, name: "Lulu" }).$returningId()
    const [{ id: upwork }] = await db.insert(merchants).values({ userId: me, name: "Upwork" }).$returningId()
    await db.insert(merchants).values({ userId: me, name: "Empty" })
    const [{ id: theirs }] = await db.insert(merchants).values({ userId: ids.other, name: "Lulu" }).$returningId()
    const row = (userId: number, merchantId: number, categoryId: number | null, name: string) => ({
      userId, merchantId, categoryId, name, nameKey: name.toLowerCase(), amountKd: "1.000", date: new Date("2026-09-15T00:00:00Z"), source: "manual" as const,
    })
    await db.insert(transactions).values([
      row(me, lulu, groceries, "a"), row(me, lulu, groceries, "b"), row(me, lulu, null, "c"),
      row(me, upwork, salary, "pay"),
      row(ids.other, theirs, null, "theirs"),
    ])
  })

  afterAll(async () => {
    const db = getDb()
    const all = Object.values(ids).filter((id) => id > 0)
    if (all.length === 0) return
    await db.delete(transactions).where(inArray(transactions.userId, all))
    await db.delete(merchants).where(inArray(merchants.userId, all))
    await db.delete(categories).where(inArray(categories.userId, all))
    await db.delete(users).where(inArray(users.id, all))
  })

  it("counts expense rows per place: 3 at Lulu (one uncategorized), 0 at Upwork (income), 0 at Empty", async () => {
    const token = await createSessionToken({ userId: ids.me, externalId: `${RUN_ID}_me`, authProvider: "test", sv: 0 })
    const res = await app.request("/api/merchants", { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { items: Array<{ name: string; expense_count: number }> } }
    expect(body.data.items.map((i) => [i.name, i.expense_count])).toEqual([["Empty", 0], ["Lulu", 3], ["Upwork", 0]])
  })
})
