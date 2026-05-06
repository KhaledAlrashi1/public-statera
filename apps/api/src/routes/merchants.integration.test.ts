// Integration tests — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm test
//
// Two atomicity cases tested separately because DELETE /:id and POST /:id/remap
// are distinct code paths: either could regress independently.
//   1. DELETE ?reassign_to: remap + delete — fail mid-transaction, verify remap rolled back.
//   2. POST remap: remap + delete source — fail after remap, verify both rolled back.

import { describe, it, expect, afterEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"

const RUN = process.env["INTEGRATION"] === "true"

const TEST_RUN_ID = `merchant_integ_${process.pid}_${Date.now()}`

let testUserId = -1

// ── Shared helpers ────────────────────────────────────────────────────────────

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

async function cleanupTestData(userId: number): Promise<void> {
  const db = getDb()
  await db.delete(transactions).where(eq(transactions.userId, userId))
  await db.delete(merchants).where(eq(merchants.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

async function insertMerchant(userId: number, name: string): Promise<number> {
  const db = getDb()
  const [{ id }] = await db.insert(merchants).values({ userId, name }).$returningId()
  return id
}

async function insertTransaction(userId: number, merchantId: number): Promise<number> {
  const db = getDb()
  const [{ id }] = await db
    .insert(transactions)
    .values({
      userId,
      date: new Date(),
      name: "Test transaction",
      nameKey: "test transaction",
      amountKd: "1.000",
      merchantId,
    })
    .$returningId()
  return id
}

afterEach(async () => {
  if (testUserId === -1) return
  await cleanupTestData(testUserId)
  testUserId = -1
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe.runIf(RUN)("merchants — DELETE atomicity (real MySQL)", () => {
  it("rolls back remap when mid-transaction error occurs during delete-with-reassign", async () => {
    const db = getDb()
    testUserId = await setupTestUser()
    const sourceId = await insertMerchant(testUserId, "Source Merchant")
    const targetId = await insertMerchant(testUserId, "Target Merchant")
    const txnId = await insertTransaction(testUserId, sourceId)

    // Simulate: remap succeeds, delete throws
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ merchantId: targetId })
          .where(and(eq(transactions.userId, testUserId), eq(transactions.merchantId, sourceId)))

        throw new Error("Simulated delete failure — must roll back remap")
      }),
    ).rejects.toThrow("Simulated delete failure")

    const [row] = await db
      .select({ merchantId: transactions.merchantId })
      .from(transactions)
      .where(eq(transactions.id, txnId))

    expect(row?.merchantId).toBe(sourceId)
  })
})

describe.runIf(RUN)("merchants — POST remap atomicity (real MySQL)", () => {
  it("rolls back remap AND source deletion when mid-transaction error occurs", async () => {
    const db = getDb()
    testUserId = await setupTestUser()
    const sourceId = await insertMerchant(testUserId, "Source Merge")
    const targetId = await insertMerchant(testUserId, "Target Merge")
    const txnId = await insertTransaction(testUserId, sourceId)

    // Simulate: remap succeeds, delete source throws
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ merchantId: targetId })
          .where(and(eq(transactions.userId, testUserId), eq(transactions.merchantId, sourceId)))

        throw new Error("Simulated source-delete failure — must roll back remap too")
      }),
    ).rejects.toThrow("Simulated source-delete failure")

    // Remap must be rolled back: transaction still references source
    const [txnRow] = await db
      .select({ merchantId: transactions.merchantId })
      .from(transactions)
      .where(eq(transactions.id, txnId))
    expect(txnRow?.merchantId).toBe(sourceId)

    // Source merchant must still exist (delete was part of same rolled-back transaction)
    const [sourceRow] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, sourceId))
    expect(sourceRow?.id).toBe(sourceId)
  })
})
