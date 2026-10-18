// MOB-R116 C5 — refunds against real MySQL (INTEGRATION=true, the local stack, after migrations 0008 and 0009).
// The CHECK on transactions.amount_kd is now "<> 0": a negative row is accepted, zero is still refused, and
// POST /api/transactions with kind "refund" stores the parsed positive amount negated and reads it back.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"
import { sumIncomeExtrasBetween } from "../lib/income-extras"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `refund_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/transactions", transactionsRouter)
let userId = -1
let dining = -1

const row = (amountKd: string, name: string) => ({
  userId, categoryId: dining, name, nameKey: `${name}_${amountKd}`, amountKd, date: new Date("2026-05-10T00:00:00Z"), source: "manual",
})

describe.runIf(RUN)("refunds — real MySQL (MOB-R116 C5)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db.insert(users).values({ email: `${RUN_ID}_u@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_u` }).$returningId()
    ;[{ id: dining }] = await db.insert(categories).values({ userId, name: "Dining", isIncome: false }).$returningId()
  })

  afterAll(async () => {
    const db = getDb()
    if (userId <= 0) return
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userId))
    await db.delete(merchants).where(eq(merchants.userId, userId))
    await db.delete(categories).where(eq(categories.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it("a row of −1.500 is accepted", async () => {
    const db = getDb()
    await db.insert(transactions).values(row("-1.500", "direct refund"))
    const [stored] = await db.select({ amountKd: transactions.amountKd }).from(transactions).where(eq(transactions.nameKey, "direct refund_-1.500"))
    expect(stored.amountKd).toBe("-1.500")
  })

  it("a row of 0 is refused by chk_transactions_amount_nonzero", async () => {
    let message = ""
    try {
      await getDb().insert(transactions).values(row("0.000", "zero row"))
    } catch (e) {
      message = String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message)
    }
    expect(message).toContain("chk_transactions_amount_nonzero")
  })

  it("POST kind refund round trip: 2.250 in, −2.250 stored and served, not learned", async () => {
    const token = await createSessionToken({ userId, externalId: `${RUN_ID}_u`, authProvider: "test", sv: 1 })
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-05-11", merchant: "Caribou Coffee", category: "dining", name: "Caribou Coffee", amount_kd: "2.250", kind: "refund" }),
    })
    expect(res.status).toBe(201)
    const item = ((await res.json()) as { data: { item: { id: number; amount_kd: string; category: string; category_counts_as_income: boolean } } }).data.item
    expect(item).toMatchObject({ amount_kd: "-2.250", category: "Dining", category_counts_as_income: false })
    const [stored] = await getDb().select({ amountKd: transactions.amountKd, categoryId: transactions.categoryId }).from(transactions).where(eq(transactions.id, item.id))
    expect(stored).toEqual({ amountKd: "-2.250", categoryId: dining })
    expect(await getDb().select().from(memorizedTransactions).where(eq(memorizedTransactions.userId, userId))).toEqual([])
  })
})

// MOB-R117 C2–C3 — a refund never sits in a category that counts as income (the payday-lib rule), against real MySQL.
describe.runIf(RUN)("refunds and income categories — real MySQL (MOB-R117 C2, C3)", () => {
  const R = `${RUN_ID}_r117`
  let uid = -1
  let diningId = -1
  let bonusId = -1
  let token = ""
  const call = (method: string, path: string, body: Record<string, unknown>) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  beforeAll(async () => {
    const db = getDb()
    ;[{ id: uid }] = await db.insert(users).values({ email: `${R}@test.invalid`, authProvider: "test", externalId: R }).$returningId()
    ;[{ id: diningId }] = await db.insert(categories).values({ userId: uid, name: "Dining", isIncome: false }).$returningId()
    ;[{ id: bonusId }] = await db.insert(categories).values({ userId: uid, name: "Bonus", isIncome: true }).$returningId()
    // An extra in the period (category Bonus, name "Bonus"), so a refund named "Bonus" moved into Bonus would lower it.
    await db.insert(transactions).values({ userId: uid, categoryId: bonusId, name: "Bonus", nameKey: "bonus_extra", amountKd: "50.000", date: new Date("2026-05-05T00:00:00Z"), source: "manual" })
    token = await createSessionToken({ userId: uid, externalId: R, authProvider: "test", sv: 1 })
  })

  afterAll(async () => {
    const db = getDb()
    if (uid <= 0) return
    await db.delete(transactions).where(eq(transactions.userId, uid))
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, uid))
    await db.delete(merchants).where(eq(merchants.userId, uid))
    await db.delete(categories).where(eq(categories.userId, uid))
    await db.delete(users).where(eq(users.id, uid))
  })

  it("C2: POST refund into a new \"Income…\" name: 409, no category and no row written", async () => {
    const before = await getDb().select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, uid))
    const res = await call("POST", "/api/transactions", { date: "2026-05-11", category: "Income from sale", name: "Sale", amount_kd: "2.250", kind: "refund" })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe("category_is_income")
    const cats = await getDb().select({ name: categories.name }).from(categories).where(eq(categories.userId, uid))
    expect(cats.map((c) => c.name).sort()).toEqual(["Bonus", "Dining"])
    expect(await getDb().select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, uid))).toEqual(before)
  })

  it("C3: PATCH a refund to Bonus: 409, row still −2.250 in Dining, the period's extras unchanged", async () => {
    const db = getDb()
    const [{ id }] = await db.insert(transactions).values({ userId: uid, categoryId: diningId, name: "Bonus", nameKey: "bonus_refund", amountKd: "-2.250", date: new Date("2026-05-12T00:00:00Z"), source: "manual" }).$returningId()
    const extrasBefore = (await sumIncomeExtrasBetween(uid, "2026-05-01", "2026-05-31", db)).toFixed(3)
    const res = await call("PATCH", `/api/transactions/${id}`, { name: "Bonus", category: "Bonus", amount_kd: "2.250", merchant: "", date: "2026-05-12" })
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe("category_is_income")
    const [stored] = await db.select({ amountKd: transactions.amountKd, categoryId: transactions.categoryId }).from(transactions).where(eq(transactions.id, id))
    expect(stored).toEqual({ amountKd: "-2.250", categoryId: diningId })
    expect(extrasBefore).toBe("50.000")
    expect((await sumIncomeExtrasBetween(uid, "2026-05-01", "2026-05-31", db)).toFixed(3)).toBe(extrasBefore)
  })

  it("C3: a positive row moved into Bonus is saved as today: 200, still positive, now in Bonus", async () => {
    const db = getDb()
    const [{ id }] = await db.insert(transactions).values({ userId: uid, categoryId: diningId, name: "Lunch", nameKey: "lunch_pos", amountKd: "4.000", date: new Date("2026-05-13T00:00:00Z"), source: "manual" }).$returningId()
    const res = await call("PATCH", `/api/transactions/${id}`, { name: "Lunch", category: "Bonus", amount_kd: "4.000", merchant: "", date: "2026-05-13" })
    expect(res.status).toBe(200)
    const [stored] = await db.select({ amountKd: transactions.amountKd, categoryId: transactions.categoryId }).from(transactions).where(eq(transactions.id, id))
    expect(stored).toEqual({ amountKd: "4.000", categoryId: bonusId })
  })
})
