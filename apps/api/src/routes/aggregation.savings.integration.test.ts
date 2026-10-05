// MOB-R55 P2 / MOB-R58 D1 / MOB-R55 P4 — the ruled month (income 100, expenses 40, savings 30)
// against real MySQL: R4 and R3 move savings out of the expense total, and GET /api/categories
// reports each category's kind. INTEGRATION=true and the local stack.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { eq, inArray } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { productEvents } from "../db/schema/product-events"
import { aggregationRouter } from "./aggregation"
import { categoriesRouter } from "./categories"
import { createSessionToken } from "../middleware/auth"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `k1savings_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/analytics", aggregationRouter).route("/api/categories", categoriesRouter)

let userId = -1

async function getJson(path: string) {
  const token = await createSessionToken({ userId, externalId: `${RUN_ID}_u`, authProvider: "test", sv: 1 })
  const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as { data: any }).data
}

describe.runIf(RUN)("K1 savings split — real MySQL", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db.insert(users).values({ email: `${RUN_ID}_u@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_u` }).$returningId()
    const cat = async (name: string, isIncome = false) =>
      (await db.insert(categories).values({ userId, name, isIncome }).$returningId())[0].id
    const salary = await cat("Salary", true)
    const groceries = await cat("Groceries")
    const savings = await cat("Savings & investing")
    const tx = (categoryId: number, name: string, amountKd: string) => ({
      userId, categoryId, name, nameKey: name.toLowerCase(), amountKd, date: new Date("2026-05-10T00:00:00Z"), source: "manual",
    })
    await db.insert(transactions).values([
      tx(salary, "Salary", "100.000"),
      tx(groceries, "Weekly shop", "40.000"),
      tx(savings, "Transfer to savings", "30.000"),
    ])
  })

  afterAll(async () => {
    const db = getDb()
    if (userId <= 0) return
    // The analytics routes record product events (app_opened); they reference the user.
    await db.delete(productEvents).where(eq(productEvents.userId, userId))
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(categories).where(inArray(categories.userId, [userId]))
    await db.delete(users).where(eq(users.id, userId))
  })

  it("R4 and R3: expenses 40, savings 30, the breakdown keeps the savings row", async () => {
    const r4 = await getJson("/api/analytics/account-overview?month=2026-05")
    expect(r4.total_spend_mtd).toBe("40.000")
    expect(r4.total_savings_mtd).toBe("30.000")
    expect(r4.total_income_mtd).toBe("100.000")
    expect(r4.top_categories).toEqual([
      { category: "Groceries", amount_kd: "40.000", pct: 100 },
      { category: "Savings & investing", amount_kd: "30.000", pct: null },
    ])

    const r3 = await getJson("/api/analytics/dashboard-metrics?months=1&until=2026-05")
    expect(r3.monthly).toEqual([{ month: "2026-05", income_kd: "100.000", expense_kd: "40.000", savings_kd: "30.000" }])
    expect(r3.expense_by_category["2026-05"]).toEqual({ Groceries: "40.000", "Savings & investing": "30.000" })
  })

  it("GET /api/categories reports each category's kind", async () => {
    const data = await getJson("/api/categories")
    const kinds = Object.fromEntries((data.items as Array<{ name: string; kind: string }>).map((i) => [i.name, i.kind]))
    expect(kinds).toEqual({ Groceries: "expense", Salary: "income", "Savings & investing": "savings" })
  })
})
