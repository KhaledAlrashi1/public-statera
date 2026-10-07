// MOB-R55 P1 — the savings rule's SQL fragments agree with the TypeScript function, row by row, on
// a real database (the collation and MySQL's TRIM are what a mock cannot show). INTEGRATION=true.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, inArray } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { incomeCategoryFilter } from "./payday-lib"
import { categoryKind, expenseOnlyCategoryFilter, savingsCategoryFilter } from "./category-kind"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `catkind_${process.pid}_${Date.now()}`

// Three users, because the (user_id, name) unique index is accent- and case-insensitive.
const USER_A_ROWS: Array<[string, boolean]> = [
  ["  savings ", false],
  ["SAVINGS", false],
  ["Investing", false],
  ["Savings & investing", false],
  ["Savings account", false],
  ["Income: Salary", false],
  ["Groceries", false],
  ["savings\t", false],
]
const USER_B_ROWS: Array<[string, boolean]> = [["Savings", true]]
// The accent is why the savings comparison is COLLATE utf8mb4_bin: ai_ci would call it savings.
const USER_C_ROWS: Array<[string, boolean]> = [["Sávings", false]]

let userA = -1
let userB = -1
let userC = -1

describe.runIf(RUN)("category kind — SQL vs TypeScript (MOB-R55 P1)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userA }] = await db.insert(users).values({ email: `${RUN_ID}_a@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_a` }).$returningId()
    ;[{ id: userB }] = await db.insert(users).values({ email: `${RUN_ID}_b@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_b` }).$returningId()
    ;[{ id: userC }] = await db.insert(users).values({ email: `${RUN_ID}_c@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_c` }).$returningId()
    await db.insert(categories).values(USER_A_ROWS.map(([name, isIncome]) => ({ userId: userA, name, isIncome })))
    await db.insert(categories).values(USER_B_ROWS.map(([name, isIncome]) => ({ userId: userB, name, isIncome })))
    await db.insert(categories).values(USER_C_ROWS.map(([name, isIncome]) => ({ userId: userC, name, isIncome })))
  })

  afterAll(async () => {
    const db = getDb()
    const ids = [userA, userB, userC].filter((id) => id > 0)
    if (ids.length === 0) return
    await db.delete(categories).where(inArray(categories.userId, ids))
    for (const id of ids) await db.delete(users).where(eq(users.id, id))
  })

  it("gives every row the same kind in SQL as in TypeScript", async () => {
    const db = getDb()
    const rows = await db
      .select({
        name: categories.name,
        isIncome: categories.isIncome,
        income: incomeCategoryFilter(),
        savings: savingsCategoryFilter(),
        expense: expenseOnlyCategoryFilter(),
      })
      .from(categories)
      .where(inArray(categories.userId, [userA, userB, userC]))
    expect(rows).toHaveLength(USER_A_ROWS.length + USER_B_ROWS.length + USER_C_ROWS.length)
    const sqlKind = (r: { income: unknown; savings: unknown }) =>
      Number(r.income) ? "income" : Number(r.savings) ? "savings" : "expense"
    const got = rows.map((r) => [r.name, sqlKind(r), Number(r.expense) === 1]).sort()
    const want = rows
      .map((r) => {
        const k = categoryKind(r.name, Number(r.income) === 1)
        return [r.name, k, k === "expense"]
      })
      .sort()
    expect(got).toEqual(want)
    // The table is not degenerate: all three kinds occur.
    expect(new Set(got.map((g) => g[1]))).toEqual(new Set(["income", "savings", "expense"]))
  })
})
