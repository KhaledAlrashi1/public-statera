// MOB-R77 C2–C5 — the API computes "counts as income" and emits it; the frontend keeps no copy of the
// rule. Against real MySQL (INTEGRATION=true, the local stack), driven by MOB-R75's ONE table of names
// (src/test/income-rule-cases.ts), so the rule's only source — payday-lib's incomeCategoryFilter() — is
// what every row below is checked against:
//   - GET /api/categories emits counts_as_income beside is_income (unchanged);
//   - every route that returns transaction rows emits category_counts_as_income: GET /search, GET /:id,
//     GET /by-category, POST /, PATCH /:id, POST /:id/split, and GET /api/account/data-export, which
//     bypasses the serializer.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { inArray, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { transactionsRouter } from "./transactions"
import { categoriesRouter } from "./categories"
import { accountRouter } from "./account"
import { createSessionToken } from "../middleware/auth"
import { OWNED_TABLES } from "../lib/restore-repurge-lib"
import { INCOME_RULE_CASES, type IncomeRuleCase } from "../test/income-rule-cases"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `incflag_${process.pid}_${Date.now()}`
const app = new Hono()
  .route("/api/transactions", transactionsRouter)
  .route("/api/categories", categoriesRouter)
  .route("/api/account", accountRouter)
const userIds: Record<"a" | "b", number> = { a: -1, b: -1 }
/** The seeded transaction id of each table case. */
const txnIdOf = new Map<IncomeRuleCase, number>()

type Json = { ok: boolean; data: Record<string, unknown> }

async function call(user: "a" | "b", path: string, init: { method?: string; body?: unknown } = {}): Promise<Json> {
  const token = await createSessionToken({ userId: userIds[user], externalId: `${RUN_ID}_${user}`, authProvider: "test", sv: 0 })
  const res = await app.request(path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  expect([200, 201]).toContain(res.status)
  return (await res.json()) as Json
}

type Row = { id: number; category_counts_as_income?: unknown }
const byId = (rows: unknown, id: number): Row | undefined => (rows as Row[]).find((r) => r.id === id)

describe.runIf(RUN)("income computed by the API (MOB-R77 C2–C5)", () => {
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
      const [{ id }] = await db.insert(transactions).values({
        userId, categoryId, name: `${c.name} row`, nameKey: `${c.name} row`.toLowerCase(), amountKd: "1.000",
        date: new Date("2026-09-15T00:00:00Z"), source: "manual",
      }).$returningId()
      txnIdOf.set(c, id)
    }
  })

  afterAll(async () => {
    const db = getDb()
    const ids = Object.values(userIds).filter((id) => id > 0)
    if (ids.length === 0) return
    for (const t of [...OWNED_TABLES, "security_events"]) {
      await db.execute(sql.raw(`DELETE FROM \`${t}\` WHERE user_id IN (${ids.join(",")})`))
    }
    await db.delete(users).where(inArray(users.id, ids))
  })

  it.each(INCOME_RULE_CASES.map((c) => [`${c.name} (is_income=${c.isIncome})`, c] as const))(
    "GET /api/categories: counts_as_income for %s",
    async (_label, c) => {
      const body = await call(c.user, "/api/categories")
      const item = (body.data["items"] as Array<Record<string, unknown>>).find((i) => i["name"] === c.name)
      expect(item?.["counts_as_income"]).toBe(c.income)
      expect(item?.["is_income"]).toBe(c.isIncome) // unchanged beside it
    },
  )

  it.each(INCOME_RULE_CASES.map((c) => [`${c.name} (is_income=${c.isIncome})`, c] as const))(
    "transaction rows (/search, GET /:id, /by-category): category_counts_as_income for %s",
    async (_label, c) => {
      const id = txnIdOf.get(c)!
      const search = await call(c.user, "/api/transactions/search?limit=100")
      expect(byId(search.data["items"], id)?.category_counts_as_income).toBe(c.income)
      const one = await call(c.user, `/api/transactions/${id}`)
      expect((one.data["item"] as Row).category_counts_as_income).toBe(c.income)
      const byCat = await call(c.user, `/api/transactions/by-category?category=${encodeURIComponent(c.name)}&limit=100`)
      expect(byId(byCat.data["items"], id)?.category_counts_as_income).toBe(c.income)
    },
  )

  it("GET /api/account/data-export (bypasses the serializer): every row by the rule", async () => {
    for (const u of ["a", "b"] as const) {
      const body = await call(u, "/api/account/data-export")
      for (const c of INCOME_RULE_CASES.filter((x) => x.user === u)) {
        expect(byId(body.data["transactions"], txnIdOf.get(c)!)?.category_counts_as_income).toBe(c.income)
      }
    }
  })

  it("POST / and PATCH /:id return the flag of the row's category", async () => {
    const created = await call("a", "/api/transactions", {
      method: "POST",
      body: { date: "2026-09-16", name: `${RUN_ID} pay`, amount_kd: "2.000", category: "Salary" }, // a's UNflagged Salary
    })
    const item = created.data["item"] as Row
    expect(item.category_counts_as_income).toBe(false)
    // PATCH INTO an income category, so the expected value is true: a PATCH that emitted a constant
    // false would pass a false expectation (the first version of this case did, under its mutation).
    const patched = await call("a", `/api/transactions/${item.id}`, {
      method: "PATCH",
      body: { name: `${RUN_ID} pay`, amount_kd: "2.000", category: "Income: Salary" },
    })
    expect((patched.data["item"] as Row).category_counts_as_income).toBe(true)
    const flagged = await call("b", "/api/transactions", {
      method: "POST",
      body: { date: "2026-09-16", name: `${RUN_ID} wage`, amount_kd: "3.000", category: "Salary" }, // b's flagged Salary
    })
    expect((flagged.data["item"] as Row).category_counts_as_income).toBe(true)
  })

  it("POST /:id/split returns the flag on both parts", async () => {
    const created = await call("a", "/api/transactions", {
      method: "POST",
      body: { date: "2026-09-17", name: `${RUN_ID} bonus`, amount_kd: "4.000", category: "INCOME bonus" },
    })
    const id = (created.data["item"] as Row).id
    const split = await call("a", `/api/transactions/${id}/split`, {
      method: "POST",
      body: { rows: [
        { name: `${RUN_ID} bonus A`, category: "INCOME bonus", amount_kd: "1.500" },
        { name: `${RUN_ID} bonus B`, category: "income", amount_kd: "2.500" },
      ] },
    })
    const parts = split.data["transactions"] as Row[]
    expect(parts).toHaveLength(2)
    expect(parts.map((p) => p.category_counts_as_income)).toEqual([true, true])
  })
})
