// MOB-R77 D — the split route's "cannot mix income and expense" guard uses the income rule
// (payday-lib's incomeCategoryFilter: the flag, or a name starting "income"). Against real MySQL
// (INTEGRATION=true, the local stack). D2 (RM-21 (b)): the change only adds a refusal BEFORE any write,
// so a refused split writes nothing, and an accepted split writes exactly as it did on b858528.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { asc, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"
import { OWNED_TABLES } from "../lib/restore-repurge-lib"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `splitguard_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/transactions", transactionsRouter)
let userId = -1
const cat: Record<string, number> = {}

async function split(id: number, rows: Array<{ name: string; category: string; amount_kd: string }>) {
  const token = await createSessionToken({ userId, externalId: RUN_ID, authProvider: "test", sv: 0 })
  const res = await app.request(`/api/transactions/${id}/split`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  })
  return { status: res.status, body: (await res.json()) as { ok: boolean; error: string | null; code?: string } }
}

async function seedRow(name: string, category: string, amountKd: string): Promise<number> {
  const [{ id }] = await getDb().insert(transactions).values({
    userId, categoryId: cat[category], name, nameKey: name.toLowerCase(), amountKd, memo: `${name} memo`,
    date: new Date("2026-09-15T00:00:00Z"), source: "manual",
  }).$returningId()
  return id
}

/** Everything a split can write for this user: transactions, categories, memorized rows. */
async function snapshot() {
  const db = getDb()
  return {
    transactions: await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(asc(transactions.id)),
    categories: await db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.id)),
    memorized: await db.select().from(memorizedTransactions).where(eq(memorizedTransactions.userId, userId)).orderBy(asc(memorizedTransactions.id)),
  }
}

describe.runIf(RUN)("split guard uses the income rule (MOB-R77 D)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db.insert(users)
      .values({ email: `${RUN_ID}@test.invalid`, authProvider: "test", externalId: RUN_ID }).$returningId()
    for (const [name, isIncome] of [["Income: Salary", false], ["Groceries", false], ["Salary", true], ["Income: Bonus", false]] as const) {
      ;[{ id: cat[name] }] = await db.insert(categories).values({ userId, name, isIncome }).$returningId()
    }
  })

  afterAll(async () => {
    if (userId < 0) return
    const db = getDb()
    for (const t of [...OWNED_TABLES, "security_events"]) {
      await db.execute(sql.raw(`DELETE FROM \`${t}\` WHERE user_id = ${userId}`))
    }
    await db.delete(users).where(inArray(users.id, [userId]))
  })

  it("refuses an income-by-name + expense split with the existing error, and writes nothing", async () => {
    const id = await seedRow(`${RUN_ID} mix`, "Income: Salary", "1800.000")
    const before = await snapshot()
    const { status, body } = await split(id, [
      { name: `${RUN_ID} mix A`, category: "Income: Salary", amount_kd: "900.000" },
      { name: `${RUN_ID} mix B`, category: "Groceries", amount_kd: "900.000" },
    ])
    expect(status).toBe(400)
    expect(body.error).toBe("Split rows cannot mix income and expense categories.")
    expect(body.code).toBe("validation_error")
    expect(await snapshot()).toEqual(before) // the original row's fields unchanged, nothing added
  })

  it("accepts two income halves and writes exactly as before: the original row updated, one row added", async () => {
    const id = await seedRow(`${RUN_ID} halves`, "Income: Salary", "1800.000")
    const before = await snapshot()
    const { status } = await split(id, [
      { name: `${RUN_ID} halves A`, category: "Income: Salary", amount_kd: "900.000" },
      { name: `${RUN_ID} halves B`, category: "Income: Salary", amount_kd: "900.000" },
    ])
    expect(status).toBe(200)
    const after = await snapshot()
    expect(after.categories).toEqual(before.categories)
    const original = before.transactions.find((t) => t.id === id)!
    const updated = after.transactions.find((t) => t.id === id)!
    expect(updated).toMatchObject({
      name: `${RUN_ID} halves A`, amountKd: "900.000", categoryId: cat["Income: Salary"],
      date: original.date, memo: original.memo, merchantId: original.merchantId, source: original.source,
    })
    const added = after.transactions.filter((t) => !before.transactions.some((b) => b.id === t.id))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({
      name: `${RUN_ID} halves B`, amountKd: "900.000", categoryId: cat["Income: Salary"],
      date: original.date, memo: original.memo, merchantId: original.merchantId, source: original.source,
    })
    // Every other row untouched.
    expect(after.transactions.filter((t) => t.id !== id && !added.includes(t))).toEqual(before.transactions.filter((t) => t.id !== id))
  })

  it("accepts a flagged-income + income-by-name split (both income under the rule)", async () => {
    const id = await seedRow(`${RUN_ID} both`, "Salary", "2000.000")
    const { status, body } = await split(id, [
      { name: `${RUN_ID} both A`, category: "Salary", amount_kd: "1000.000" },
      { name: `${RUN_ID} both B`, category: "Income: Bonus", amount_kd: "1000.000" },
    ])
    expect(body.error).toBeNull()
    expect(status).toBe(200)
  })
})
