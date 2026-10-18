// MOB-R112 D2/D3/D4 — income extras against real MySQL (INTEGRATION=true, the local stack).
// One user, typed income 1000, and in May 2026: the three tile rows (one with odd case and spaces),
// both demo salary shapes (API demo: "Monthly salary" in "Income: Salary"; the no-signup sample:
// "Salary" in an is_income "Salary"), a "Bonus" under a spending category, and a "Bonus" in April.
// Only the three tile rows in May are extras: 50 + 20 + 5 = 75.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, userProfiles } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { productEvents } from "../db/schema/product-events"
import { aggregationRouter } from "./aggregation"
import { createSessionToken } from "../middleware/auth"
import { sumIncomeExtrasBetween } from "../lib/income-extras"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `extras_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/analytics", aggregationRouter)
let userId = -1

async function getJson(path: string) {
  const token = await createSessionToken({ userId, externalId: `${RUN_ID}_u`, authProvider: "test", sv: 1 })
  const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await res.json()) as { data: any }).data
}

describe.runIf(RUN)("income extras — real MySQL (MOB-R112)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db.insert(users).values({ email: `${RUN_ID}_u@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_u` }).$returningId()
    await db.insert(userProfiles).values({ userId, monthlyIncomeKd: "1000.000" })
    const cat = async (name: string, isIncome: boolean) =>
      (await db.insert(categories).values({ userId, name, isIncome }).$returningId())[0].id
    const bonus = await cat("Bonus", true)
    const commission = await cat("Commission", true)
    const other = await cat("Other income", true)
    const apiDemoSalary = await cat("Income: Salary", false) // income by its name, as the API demo seeds it
    const sampleSalary = await cat("Salary", true)
    const gifts = await cat("Gifts", false)
    const tx = (categoryId: number, name: string, amountKd: string, date = "2026-05-10") => ({
      userId, categoryId, name, nameKey: `${name.trim().toLowerCase()}_${amountKd}`, amountKd, date: new Date(`${date}T00:00:00Z`), source: "manual",
    })
    await db.insert(transactions).values([
      tx(bonus, "Bonus", "50.000"),
      tx(commission, "  COMMISSION ", "20.000"),
      tx(other, "Other income", "5.000"),
      tx(apiDemoSalary, "Monthly salary", "1800.000"),
      tx(apiDemoSalary, "Income: Salary", "300.000"),
      tx(sampleSalary, "Salary", "1200.000"),
      tx(gifts, "Bonus", "7.000"),
      tx(bonus, "Bonus", "100.000", "2026-04-20"),
    ])
  })

  afterAll(async () => {
    const db = getDb()
    if (userId <= 0) return
    await db.delete(productEvents).where(eq(productEvents.userId, userId))
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(categories).where(eq(categories.userId, userId))
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it("sums only the three tile names, in income categories, in the period: salary rows are not extras", async () => {
    expect((await sumIncomeExtrasBetween(userId, "2026-05-01", "2026-05-31", getDb())).toFixed(3)).toBe("75.000")
  })

  it("R9: monthly_income_kd is typed 1000 + May's extras 75", async () => {
    const r9 = await getJson("/api/analytics/safe-to-spend?month=2026-05")
    expect(r9.monthly_income_kd).toBe("1075.000")
    expect(r9.income_source).toBe("declared_in_profile")
  })

  it("R3: each period carries its extras; income_kd still counts every income row", async () => {
    const r3 = await getJson("/api/analytics/dashboard-metrics?months=2&until=2026-05")
    expect(r3.monthly).toEqual([
      { month: "2026-04", income_kd: "100.000", expense_kd: "0.000", savings_kd: "0.000", extras_kd: "100.000" },
      { month: "2026-05", income_kd: "3375.000", expense_kd: "7.000", savings_kd: "0.000", extras_kd: "75.000" },
    ])
  })
})
