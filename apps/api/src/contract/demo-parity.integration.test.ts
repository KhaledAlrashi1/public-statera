// MOB-R95 C8 — the demo's answers against the real routes. The sample (apps/web/src/lib/demo/sample.json) is seeded
// as a fresh user in real MySQL, Date is pinned either side of a payday-25 period boundary (Kuwait 23:30 on the
// 24th, the last day of a period; Kuwait 00:30 on the 25th, the first day of the next), and every read the demo's
// screens make is sent to the real app and to the demo engine. Bodies and meta must be equal after dropping ids
// (the demo numbers its own rows), the demo's person (me/profile user), and the two build timestamps
// (dashboard-metrics updated_at, dashboard-bundle snapshot_computed_at). Array order is compared as-is.
//
// Requires INTEGRATION=true and the local stack (MySQL + Redis).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { eq, inArray } from "drizzle-orm"

import { createApp } from "../app"
import { getDb } from "../db/connection"
import { users, userProfiles } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { budgets } from "../db/schema/budgets"
import { productEvents } from "../db/schema/product-events"
import { dashboardSnapshots } from "../db/schema/dashboard-snapshots"
import { createSessionToken } from "../middleware/auth"
import { buildNameKey } from "../lib/name-key"
import { createDemoState, demoAnswer, materializeSample, type DemoSample } from "../../../web/src/lib/demo/engine"

const RUN = process.env["INTEGRATION"] === "true"
const RUN_ID = `demoparity_${process.pid}_${Date.now()}`
const SAMPLE_PATH = resolve(__dirname, "../../../web/src/lib/demo/sample.json")
const app = createApp()
const created: number[] = []

const DROP = new Set(["id", "category_id", "merchant_id", "updated_at", "snapshot_computed_at"])
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !DROP.has(k))
        .map(([k, v]) => [k, normalize(v)]),
    )
  }
  return value
}
/** me and profile carry the demo's own person; the screens' figures are in profile and demo_workspace. */
function comparable(path: string, body: unknown): unknown {
  const b = body as Record<string, unknown>
  if (path === "/api/auth/me") return normalize({ ok: b.ok, flags: b.flags })
  if (path === "/api/auth/profile") return normalize({ ok: b.ok, profile: b.profile, demo_workspace: b.demo_workspace })
  return normalize(body)
}

async function seed(sample: DemoSample, now: Date): Promise<{ userId: number; realIds: number[] }> {
  const db = getDb()
  const m = materializeSample(sample, now)
  const [{ id: userId }] = await db
    .insert(users)
    .values({ email: `${RUN_ID}_${now.getTime()}@test.invalid`, authProvider: "test", externalId: `${RUN_ID}_${now.getTime()}` })
    .$returningId()
  created.push(userId)
  const p = sample.profile
  await db.insert(userProfiles).values({
    userId,
    monthlyIncomeKd: p.monthly_income_kd,
    paydayDay: p.payday_day,
    country: p.country,
    timezone: p.timezone,
    emailNotificationsEnabled: p.email_notifications_enabled,
    setupGuideSeen: p.setup_guide_seen,
    setupGuideDismissed: p.setup_guide_dismissed,
  })
  const catId = new Map<string, number>()
  for (const c of m.categories) catId.set(c.name, (await db.insert(categories).values({ userId, name: c.name, isIncome: c.is_income }).$returningId())[0].id)
  const merId = new Map<string, number>()
  for (const name of m.merchants) merId.set(name, (await db.insert(merchants).values({ userId, name }).$returningId())[0].id)
  // One row at a time, in the demo's order, so the database's ids sort as the demo's do.
  const realIds: number[] = []
  for (const t of m.transactions) {
    const [{ id }] = await db
      .insert(transactions)
      .values({
        userId,
        // Local noon: mysql2 writes a Date in the process's zone, and noon is the same calendar day in every zone.
        date: new Date(Number(t.date.slice(0, 4)), Number(t.date.slice(5, 7)) - 1, Number(t.date.slice(8, 10)), 12),
        name: t.name,
        nameKey: buildNameKey(t.name),
        amountKd: t.amount_kd,
        categoryId: t.category ? catId.get(t.category)! : null,
        merchantId: t.merchant ? merId.get(t.merchant)! : null,
        source: "manual",
      })
      .$returningId()
    realIds.push(id)
  }
  for (const b of m.budgets) await db.insert(budgets).values({ userId, month: b.month, categoryId: catId.get(b.category)!, amountKd: b.amount_kd })
  return { userId, realIds }
}

/** Every read the demo's screens make (the walk in apps/web demo-app.test.tsx), for this instant's months. */
function reads(cur: string, prev: string, demoTxnId: number): string[] {
  return [
    "/api/auth/me",
    "/api/auth/profile",
    "/api/categories",
    "/api/merchants",
    "/api/log-suggestions",
    "/api/budgets/months",
    `/api/budgets?month=${cur}`,
    `/api/budgets?month=${prev}`,
    "/api/analytics/dashboard-metrics?months=24",
    `/api/analytics/dashboard-metrics?months=24&until=${cur}`,
    `/api/analytics/dashboard-metrics?months=3&until=${cur}`,
    `/api/analytics/dashboard-metrics?months=2&until=${cur}`,
    `/api/analytics/dashboard-bundle?month=${cur}`,
    `/api/analytics/budget-metrics?month=${cur}&range=month`,
    `/api/analytics/budget-metrics?month=${prev}&range=month`,
    `/api/analytics/safe-to-spend?month=${cur}`,
    "/api/analytics/weekly-digest",
    "/api/analytics/recurring-patterns?days=120",
    "/api/transactions/search?limit=20&offset=0",
    "/api/transactions/search?limit=20&offset=20",
    "/api/transactions/search?q=Dinner%20with%20friends",
    `/api/transactions/by-category?category=Dining&month=${cur}&limit=20&offset=0`,
    `/api/transactions/${demoTxnId}`,
  ]
}

function shift(key: string, delta: number): string {
  const total = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

describe.skipIf(!RUN)("the demo's answers equal the real routes' (MOB-R95 C8)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    const db = getDb()
    if (created.length === 0) return
    await db.delete(productEvents).where(inArray(productEvents.userId, created))
    await db.delete(dashboardSnapshots).where(inArray(dashboardSnapshots.userId, created))
    await db.delete(transactions).where(inArray(transactions.userId, created))
    await db.delete(budgets).where(inArray(budgets.userId, created))
    await db.delete(merchants).where(inArray(merchants.userId, created))
    await db.delete(categories).where(inArray(categories.userId, created))
    await db.delete(userProfiles).where(inArray(userProfiles.userId, created))
    for (const id of created) await db.delete(users).where(eq(users.id, id))
  })

  it.each([
    ["2026-10-24T20:30:00Z", "Kuwait 23:30 on the 24th, the last day of a period"],
    ["2026-10-24T21:30:00Z", "Kuwait 00:30 on the 25th, the first day of the next"],
  ])("at %s (%s)", async (instant) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(instant))
    const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as DemoSample
    const now = new Date()
    const { userId, realIds } = await seed(sample, now)
    const demo = createDemoState(sample, now)
    const cur = materializeSample(sample, now).currentKey
    const prev = shift(cur, -1)
    const dinner = demo.rows.find((r) => r.name === "Dinner with friends")!
    const token = await createSessionToken({ userId, externalId: `${RUN_ID}_${now.getTime()}`, authProvider: "test", sv: 1 })

    const mismatches: string[] = []
    for (const url of reads(cur, prev, dinner.id)) {
      const realUrl = url === `/api/transactions/${dinner.id}` ? `/api/transactions/${realIds[dinner.id - 1]}` : url
      const res = await app.request(realUrl, { headers: { Authorization: `Bearer ${token}` } })
      const real = (await res.json()) as unknown
      const mine = demoAnswer(demo, "GET", url)
      const path = url.split("?")[0].replace(/\/[0-9]+$/, "/:id")
      if (res.status !== mine.status) mismatches.push(`${url}: status real ${res.status} demo ${mine.status}`)
      try {
        expect(comparable(path, mine.body)).toEqual(comparable(path, real))
      } catch (err) {
        mismatches.push(`${url}: ${(err as Error).message.slice(0, 2000)}`)
      }
    }
    expect(mismatches).toEqual([])
  }, 60_000)
})
