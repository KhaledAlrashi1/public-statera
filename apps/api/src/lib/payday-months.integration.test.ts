// MOB-R91 C2 — the SQL month key, evaluated by real MySQL (INTEGRATION=true, the local stack), names every row's
// month exactly as the JS helper does, at every payday, over two Februaries (one of them a leap year) and the
// months around them. Rows are one per day; each payday's GROUP BY is read back and compared row by row.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq, sql } from "drizzle-orm"

import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { transactions } from "../db/schema/transactions"
import { periodKeyExpr, periodKeyForDate } from "./payday-lib"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `paydaymonths_${process.pid}_${Date.now()}`
let userId = -1
const days: string[] = []
for (const [from, to] of [["2027-01-20", "2027-04-05"], ["2028-01-25", "2028-03-05"]]) {
  for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) days.push(d)
}

describe.runIf(RUN)("payday month key in MySQL equals the JS key (MOB-R91 C2)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db
      .insert(users)
      .values({ email: `${RUN_ID}@test.invalid`, authProvider: "test", externalId: RUN_ID })
      .$returningId()
    await db.insert(transactions).values(
      days.map((d) => ({
        userId, name: d, nameKey: d, amountKd: "1.000", date: new Date(`${d}T00:00:00Z`), source: "manual" as const,
      })),
    )
  })

  afterAll(async () => {
    if (userId < 0) return
    const db = getDb()
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it.each([null, 1, 2, 3, 14, 15, 16, 17, 25, 28, 29, 30, 31])("payday %s", async (payday) => {
    const db = getDb()
    const expr = periodKeyExpr(payday)
    const rows = await db
      .select({ day: sql<string>`DATE_FORMAT(${transactions.date}, '%Y-%m-%d')`, key: expr })
      .from(transactions)
      .where(eq(transactions.userId, userId))
    expect(rows).toHaveLength(days.length)
    const wrong = rows.filter((r) => r.key !== periodKeyForDate(payday, r.day)).map((r) => `${r.day} sql ${r.key} js ${periodKeyForDate(payday, r.day)}`)
    expect(wrong).toEqual([])
    // The same expression groups: one count per key, and the counts add up.
    const groups = await db
      .select({ key: expr, n: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(expr)
    expect(groups.reduce((sum, g) => sum + Number(g.n), 0)).toBe(days.length)
  })
})
