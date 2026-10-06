// MOB-R75 C — one income rule for Activity. Against real MySQL (INTEGRATION=true, the local stack):
// both sides read the SAME table of names (src/test/income-rule-cases.ts):
//   - payday-lib's incomeCategoryFilter / expenseCategoryFilter classify each category;
//   - GET /api/transactions/search with income_only lists exactly the rule's income rows, and with
//     exclude_income exactly the rest — so a row the rule calls income is under Income, not Expense.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"
import { incomeCategoryFilter, expenseCategoryFilter } from "../lib/payday-lib"
import { INCOME_RULE_CASES } from "../test/income-rule-cases"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `incrule_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/transactions", transactionsRouter)
const userIds: Record<"a" | "b", number> = { a: -1, b: -1 }

async function searchCategories(user: "a" | "b", query: string): Promise<string[]> {
  const token = await createSessionToken({ userId: userIds[user], externalId: `${RUN_ID}_${user}`, authProvider: "test", sv: 0 })
  const res = await app.request(`/api/transactions/search?${query}&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { items: Array<{ category: string | null }> } }
  return body.data.items.map((t) => t.category ?? "").sort()
}

describe.runIf(RUN)("one income rule: payday-lib and Activity's /search (MOB-R75 C)", () => {
  beforeAll(async () => {
    const db = getDb()
    for (const u of ["a", "b"] as const) {
      ;[{ id: userIds[u] }] = await db
        .insert(users)
        .values({ email: `${RUN_ID}_${u}@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_${u}` })
        .$returningId()
    }
    for (const c of INCOME_RULE_CASES) {
      const userId = userIds[c.user]
      const [{ id: categoryId }] = await db.insert(categories).values({ userId, name: c.name, isIncome: c.isIncome }).$returningId()
      await db.insert(transactions).values({
        userId, categoryId, name: `${c.name} row`, nameKey: `${c.name} row`.toLowerCase(), amountKd: "1.000",
        date: new Date("2026-09-15T00:00:00Z"), source: "manual",
      })
    }
  })

  afterAll(async () => {
    const db = getDb()
    const ids = Object.values(userIds).filter((id) => id > 0)
    if (ids.length === 0) return
    await db.delete(transactions).where(inArray(transactions.userId, ids))
    await db.delete(categories).where(inArray(categories.userId, ids))
    await db.delete(users).where(inArray(users.id, ids))
  })

  it.each(INCOME_RULE_CASES.map((c) => [`${c.name} (is_income=${c.isIncome})`, c] as const))(
    "payday-lib: %s",
    async (_label, c) => {
      const db = getDb()
      const own = and(eq(categories.userId, userIds[c.user]), eq(categories.name, c.name))
      const asIncome = await db.select({ id: categories.id }).from(categories).where(and(own, incomeCategoryFilter()))
      const asExpense = await db.select({ id: categories.id }).from(categories).where(and(own, expenseCategoryFilter()))
      expect(asIncome.length).toBe(c.income ? 1 : 0)
      expect(asExpense.length).toBe(c.income ? 0 : 1)
    },
  )

  it("Activity's Income view (income_only) lists exactly the rows the rule calls income", async () => {
    for (const u of ["a", "b"] as const) {
      const expected = INCOME_RULE_CASES.filter((c) => c.user === u && c.income).map((c) => c.name).sort()
      expect(await searchCategories(u, "income_only=true")).toEqual(expected)
    }
  })

  it("Activity's Expense view (exclude_income) lists exactly the rest, never an income row", async () => {
    for (const u of ["a", "b"] as const) {
      const expected = INCOME_RULE_CASES.filter((c) => c.user === u && !c.income).map((c) => c.name).sort()
      expect(await searchCategories(u, "exclude_income=true")).toEqual(expected)
    }
  })
})
