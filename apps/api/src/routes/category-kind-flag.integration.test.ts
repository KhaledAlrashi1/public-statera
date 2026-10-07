// MOB-R79 F — a category's kind takes "income" from the one SQL rule (payday-lib's incomeCategoryFilter,
// selected as a column), not from a JavaScript copy. Against real MySQL (INTEGRATION=true), driven by
// MOB-R75's table (src/test/income-rule-cases.ts) plus the accented "Íncome: Salary", which the column's
// accent-insensitive collation counts as income and the old JavaScript test did not. On every path that
// emits kind: POST / (created), POST / again (the name-conflict path's existing_item) and GET /.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { inArray, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categoriesRouter } from "./categories"
import { createSessionToken } from "../middleware/auth"
import { OWNED_TABLES } from "../lib/restore-repurge-lib"
import { INCOME_RULE_CASES } from "../test/income-rule-cases"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `kindflag_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/categories", categoriesRouter)

// One scratch user per case: names are unique per user, and "Salary" appears twice in the table.
const CASES = [
  ...INCOME_RULE_CASES.map((c) => ({ name: c.name, isIncome: c.isIncome, income: c.income })),
  { name: "Íncome: Salary", isIncome: false, income: true },
]
const userIdOf = new Map<number, number>()

type Item = { name: string; kind: string; counts_as_income?: boolean }

async function request(i: number, method: "GET" | "POST", body?: unknown) {
  const userId = userIdOf.get(i)!
  const token = await createSessionToken({ userId, externalId: `${RUN_ID}_${i}`, authProvider: "test", sv: 0 })
  const res = await app.request("/api/categories", {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

describe.runIf(RUN)("kind follows the one income rule (MOB-R79 F)", () => {
  beforeAll(async () => {
    const db = getDb()
    for (let i = 0; i < CASES.length; i++) {
      const [{ id }] = await db
        .insert(users)
        .values({ email: `${RUN_ID}_${i}@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_${i}` })
        .$returningId()
      userIdOf.set(i, id)
    }
  })

  afterAll(async () => {
    const db = getDb()
    const ids = [...userIdOf.values()]
    if (ids.length === 0) return
    for (const t of [...OWNED_TABLES, "security_events"]) {
      await db.execute(sql.raw(`DELETE FROM \`${t}\` WHERE user_id IN (${ids.join(",")})`))
    }
    await db.delete(users).where(inArray(users.id, ids))
  })

  it.each(CASES.map((c, i) => [`${c.name} (is_income=${c.isIncome})`, i] as const))(
    "%s: kind is income exactly when the rule says so, on POST, the POST conflict and GET",
    async (_label, i) => {
      const c = CASES[i]
      const want = c.income ? "income" : "expense"

      const created = await request(i, "POST", { name: c.name, is_income: c.isIncome })
      expect(created.status).toBe(201)
      expect(((created.json.data as { item: Item }).item).kind).toBe(want)

      const conflict = await request(i, "POST", { name: c.name, is_income: c.isIncome })
      expect(conflict.status).toBe(409)
      expect((conflict.json.existing_item as Item).kind).toBe(want)

      const list = await request(i, "GET")
      const item = ((list.json.data as { items: Item[] }).items).find((x) => x.name === c.name)!
      expect(item.counts_as_income).toBe(c.income)
      expect(item.kind).toBe(item.counts_as_income ? "income" : "expense")
    },
  )
})
