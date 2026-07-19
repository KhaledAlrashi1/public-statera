// Integration test — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// Oracle boundary equivalence for the unified count-tiered memorized-prune rule
// (operator ruling Option A, 2026-07-18). Oracle = personal_statera
// lib/suggestions.py:114-118 / :150-166 (strict `<` cutoff; count>=3 & pinned
// never pruned). Dedicated *.integration.test.ts file → no module-level db mock →
// real getDb().
//
// MP-C1 (determinism): a single FIXED `NOW` is injected into
// deleteStaleMemorizedRows via `opts.now`, and every seeded `lastSeen` is derived
// from that same `NOW`. Nothing reads the wall clock, so the "exactly 90d" boundary
// (lastSeen === cutoff1 → strict-`<` false → survives) is stable rather than flaky.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { deleteStaleMemorizedRows } from "./memorized-prune"

const INTEGRATION = process.env.INTEGRATION === "true"
const DAY_MS = 86_400_000
// Fixed reference instant — all cutoffs and seeded lastSeen derive from this.
const NOW = new Date("2026-06-15T12:00:00.000Z")

describe.skipIf(!INTEGRATION)("deleteStaleMemorizedRows — count-tiered oracle [integration]", () => {
  let userAId: number
  let userBId: number

  const db = getDb()

  // Insert one memorized row `ageDays` before NOW; returns its id.
  async function seed(
    userId: number,
    norm: string,
    count: number,
    ageDays: number,
    isPinned = false,
  ): Promise<number> {
    const lastSeen = new Date(NOW.getTime() - ageDays * DAY_MS)
    const [row] = await db
      .insert(memorizedTransactions)
      .values({ userId, canonical: norm, norm, count, lastSeen, isPinned })
      .$returningId()
    return row.id
  }

  async function survives(id: number): Promise<boolean> {
    const [row] = await db
      .select({ id: memorizedTransactions.id })
      .from(memorizedTransactions)
      .where(eq(memorizedTransactions.id, id))
      .limit(1)
    return row?.id === id
  }

  beforeAll(async () => {
    const [a] = await db
      .insert(users)
      .values({ authProvider: "test", externalId: `mp-a-${Date.now()}`, email: `mp-a-${Date.now()}@example.com` })
      .$returningId()
    const [b] = await db
      .insert(users)
      .values({ authProvider: "test", externalId: `mp-b-${Date.now()}`, email: `mp-b-${Date.now()}@example.com` })
      .$returningId()
    userAId = a.id
    userBId = b.id
  })

  afterAll(async () => {
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userAId))
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userBId))
    await db.delete(users).where(eq(users.id, userAId))
    await db.delete(users).where(eq(users.id, userBId))
  })

  beforeEach(async () => {
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userAId))
    await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userBId))
  })

  it("scoped run: prunes exactly the count-tiered stale set; boundaries strict; count>=3 & pinned immortal", async () => {
    // count==1 tier (90d cutoff)
    const c1_over = await seed(userAId, "c1-91d", 1, 91) // pruned
    const c1_under = await seed(userAId, "c1-89d", 1, 89) // survives
    const c1_exact = await seed(userAId, "c1-90d", 1, 90) // survives (strict <, lastSeen === cutoff1)
    // count==2 tier (180d cutoff)
    const c2_over = await seed(userAId, "c2-181d", 2, 181) // pruned
    const c2_under = await seed(userAId, "c2-179d", 2, 179) // survives
    const c2_gap = await seed(userAId, "c2-120d", 2, 120) // survives (in 90-180 gap; count==2 needs >180d)
    // immortality + immunity
    const c3_old = await seed(userAId, "c3-400d", 3, 400) // survives (count>=3 never pruned)
    const pinned_old = await seed(userAId, "pinned-200d", 1, 200, true) // survives (pinned immunity)
    // other user's stale row — must be untouched by a scoped run
    const userB_stale = await seed(userBId, "b-200d", 1, 200) // survives (scoping)

    const deleted = await deleteStaleMemorizedRows(db, { userId: userAId, now: NOW })

    expect(deleted).toBe(2) // exactly c1_over + c2_over (test user has no other rows)
    expect(await survives(c1_over)).toBe(false)
    expect(await survives(c2_over)).toBe(false)
    expect(await survives(c1_under)).toBe(true)
    expect(await survives(c1_exact)).toBe(true)
    expect(await survives(c2_under)).toBe(true)
    expect(await survives(c2_gap)).toBe(true)
    expect(await survives(c3_old)).toBe(true)
    expect(await survives(pinned_old)).toBe(true)
    expect(await survives(userB_stale)).toBe(true)
  })

  it("all-users run (userId omitted): prunes stale rows across users; scoping boundary confirmed", async () => {
    const a_stale = await seed(userAId, "a-91d", 1, 91) // pruned (all-users)
    const b_stale = await seed(userBId, "b-91d", 1, 91) // pruned (all-users) — NOT reachable by a userA-scoped run
    const c3_old = await seed(userAId, "a-c3-400d", 3, 400) // survives (immortal)

    await deleteStaleMemorizedRows(db, { now: NOW })

    // Assert by id (a shared dev DB may hold other users' rows; we only own these).
    expect(await survives(a_stale)).toBe(false)
    expect(await survives(b_stale)).toBe(false)
    expect(await survives(c3_old)).toBe(true)
  })
})
