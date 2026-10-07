// MOB-R88 B5 — Activity's text search against real MySQL (INTEGRATION=true, the local stack). The typed text is
// escaped by likePattern (lib/transaction-lib.ts) with a backslash, so the LIKE clause must name one backslash as its
// escape character: a plain word finds its row, and "%" and "_" match only themselves.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { transactions } from "../db/schema/transactions"
import { transactionsRouter } from "./transactions"
import { createSessionToken } from "../middleware/auth"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `srchesc_${process.pid}_${Date.now()}`
const app = new Hono().route("/api/transactions", transactionsRouter)
let userId = -1
const NAMES = ["Coffee beans", "50% off sale", "50 percent", "a_b", "axb"]

async function search(q: string): Promise<{ status: number; names: string[] }> {
  const token = await createSessionToken({ userId, externalId: RUN_ID, authProvider: "test", sv: 0 })
  const res = await app.request(`/api/transactions/search?q=${encodeURIComponent(q)}&limit=100`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status !== 200) return { status: res.status, names: [] }
  const body = (await res.json()) as { data: { items: Array<{ name: string }> } }
  return { status: 200, names: body.data.items.map((t) => t.name).sort() }
}

describe.runIf(RUN)("Activity text search escapes its pattern (MOB-R88 B5)", () => {
  beforeAll(async () => {
    const db = getDb()
    ;[{ id: userId }] = await db
      .insert(users)
      .values({ email: `${RUN_ID}@test.invalid`, authProvider: "test", externalId: RUN_ID })
      .$returningId()
    for (const name of NAMES) {
      await db.insert(transactions).values({
        userId, name, nameKey: name.toLowerCase(), amountKd: "1.000", date: new Date("2026-09-15T00:00:00Z"), source: "manual",
      })
    }
  })

  afterAll(async () => {
    if (userId < 0) return
    const db = getDb()
    await db.delete(transactions).where(eq(transactions.userId, userId))
    await db.delete(users).where(eq(users.id, userId))
  })

  it("a plain word finds its row", async () => {
    expect(await search("coffee")).toEqual({ status: 200, names: ["Coffee beans"] })
  })

  it('"50%" matches only the literal 50%, not every name starting with 50', async () => {
    expect(await search("50%")).toEqual({ status: 200, names: ["50% off sale"] })
  })

  it('"a_b" matches only the literal a_b, not a single-character wildcard', async () => {
    expect(await search("a_b")).toEqual({ status: 200, names: ["a_b"] })
  })
})
