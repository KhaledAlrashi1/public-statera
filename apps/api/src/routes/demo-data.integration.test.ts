// Integration tests — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// Demo-workspace (10b-2) atomicity + behavior. Not part of the hermetic CI gate;
// local/pre-release discipline per the test conventions for db.transaction() routes.
//
// Cases:
//   1. load seeds every table + the manifest / demo_data_loaded product events.
//   2. all-or-nothing: a failure after loadDemoWorkspace rolls back every seeded row.
//   3. conflict guard: a second load into a non-empty account throws DemoDataConflictError
//      and does not double-seed.
//   4. clear removes exactly the seeded rows and nulls only the seeded profile fields —
//      and the memorized_transactions rows primed during load SURVIVE the clear
//      (inherited Flask quirk; input to Module 11).

import { describe, it, expect, afterEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, userProfiles } from "../db/schema/users"
import { transactions } from "../db/schema/transactions"
import { budgets } from "../db/schema/budgets"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { productEvents } from "../db/schema/product-events"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import {
  loadDemoWorkspace,
  clearDemoWorkspace,
  DemoDataConflictError,
  DEMO_DATA_EVENT,
  DEMO_MANIFEST_EVENT,
} from "../lib/demo-data-lib"

const RUN = process.env["INTEGRATION"] === "true"
const TEST_RUN_ID = `demo_integ_${process.pid}_${Date.now()}`

let testUserId = -1

async function setupTestUser(): Promise<number> {
  const db = getDb()
  const [{ id }] = await db
    .insert(users)
    .values({
      email: `${TEST_RUN_ID}@test.invalid`,
      authProvider: "test",
      externalId: TEST_RUN_ID,
      displayName: "Test User",
    })
    .$returningId()
  return id
}

async function countFor(table: { userId: unknown }, userId: number): Promise<number> {
  const db = getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await db.select({ id: (table as any).id }).from(table as any).where(eq((table as any).userId, userId))
  return rows.length
}

async function cleanupTestData(userId: number): Promise<void> {
  const db = getDb()
  await db.delete(productEvents).where(eq(productEvents.userId, userId))
  await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userId))
  await db.delete(transactions).where(eq(transactions.userId, userId))
  await db.delete(budgets).where(eq(budgets.userId, userId))
  await db.delete(categories).where(eq(categories.userId, userId))
  await db.delete(merchants).where(eq(merchants.userId, userId))
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

afterEach(async () => {
  if (testUserId === -1) return
  await cleanupTestData(testUserId)
  testUserId = -1
})

describe.runIf(RUN)("demo-workspace — load seeds every table (real MySQL)", () => {
  it("seeds transactions, budgets, profile, and product events", async () => {
    const db = getDb()
    testUserId = await setupTestUser()

    const summary = await db.transaction(async (tx) => loadDemoWorkspace(tx, testUserId))

    expect(summary.months_seeded).toBe(6)
    expect(summary.budgets_created).toBe(7)
    expect(summary.transactions_created).toBe(81)

    expect(await countFor(transactions, testUserId)).toBe(81)
    expect(await countFor(budgets, testUserId)).toBe(7)

    const [profile] = await db
      .select({ inc: userProfiles.monthlyIncomeKd, pay: userProfiles.paydayDay, country: userProfiles.country })
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId))
    expect(profile?.inc).toBe("1800.000")
    expect(profile?.pay).toBe(25)
    expect(profile?.country).toBe("Kuwait")

    const manifest = await db
      .select({ id: productEvents.id })
      .from(productEvents)
      .where(and(eq(productEvents.userId, testUserId), eq(productEvents.eventName, DEMO_MANIFEST_EVENT)))
    expect(manifest.length).toBe(1)
    const loaded = await db
      .select({ id: productEvents.id })
      .from(productEvents)
      .where(and(eq(productEvents.userId, testUserId), eq(productEvents.eventName, DEMO_DATA_EVENT)))
    expect(loaded.length).toBe(1)

    // Load primes memorized suggestions (faithful to Flask create_transaction_with_dup_check:172).
    expect(await countFor(memorizedTransactions, testUserId)).toBeGreaterThan(0)
  })
})

describe.runIf(RUN)("demo-workspace — all-or-nothing rollback (real MySQL)", () => {
  it("rolls back every seeded row when the transaction fails after load", async () => {
    const db = getDb()
    testUserId = await setupTestUser()

    await expect(
      db.transaction(async (tx) => {
        await loadDemoWorkspace(tx, testUserId)
        throw new Error("force rollback")
      }),
    ).rejects.toThrow("force rollback")

    expect(await countFor(transactions, testUserId)).toBe(0)
    expect(await countFor(budgets, testUserId)).toBe(0)
    expect(await countFor(memorizedTransactions, testUserId)).toBe(0)
    expect(await countFor(productEvents, testUserId)).toBe(0)
  })
})

describe.runIf(RUN)("demo-workspace — conflict guard (real MySQL)", () => {
  it("refuses a second load and does not double-seed", async () => {
    const db = getDb()
    testUserId = await setupTestUser()

    await db.transaction(async (tx) => loadDemoWorkspace(tx, testUserId))
    const txnCountAfterFirst = await countFor(transactions, testUserId)

    await expect(
      db.transaction(async (tx) => loadDemoWorkspace(tx, testUserId)),
    ).rejects.toBeInstanceOf(DemoDataConflictError)

    expect(await countFor(transactions, testUserId)).toBe(txnCountAfterFirst)
    expect(await countFor(budgets, testUserId)).toBe(7)
  })
})

describe.runIf(RUN)("demo-workspace — clear removes seeded rows; memorized survives (real MySQL)", () => {
  it("clears the demo workspace but leaves primed memorized rows intact", async () => {
    const db = getDb()
    testUserId = await setupTestUser()

    await db.transaction(async (tx) => loadDemoWorkspace(tx, testUserId))
    const memorizedBefore = await countFor(memorizedTransactions, testUserId)
    expect(memorizedBefore).toBeGreaterThan(0)

    const summary = await db.transaction(async (tx) => clearDemoWorkspace(tx, testUserId))

    expect(summary.transactions_cleared).toBe(81)
    expect(summary.budgets_cleared).toBe(7)
    expect(summary.profile_fields_cleared.sort()).toEqual(
      ["country", "monthly_income_kd", "payday_day"].sort(),
    )

    expect(await countFor(transactions, testUserId)).toBe(0)
    expect(await countFor(budgets, testUserId)).toBe(0)

    const [profile] = await db
      .select({ inc: userProfiles.monthlyIncomeKd, pay: userProfiles.paydayDay, country: userProfiles.country })
      .from(userProfiles)
      .where(eq(userProfiles.userId, testUserId))
    expect(profile?.inc).toBeNull()
    expect(profile?.pay).toBeNull()
    expect(profile?.country).toBeNull()

    // The operator-flagged inherited quirk: clear does NOT remove memorized rows.
    expect(await countFor(memorizedTransactions, testUserId)).toBe(memorizedBefore)
  })
})
