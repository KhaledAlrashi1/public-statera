// Integration test — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm test
//
// What this file tests:
//   - Drizzle MySQL transactions roll back on error (atomicity of remap+delete).
//   - This cannot be tested with mocks: mocked transactions always "commit".
//   - One test here is worth more than a dozen mock-based unit tests for this
//     specific guarantee.

import { describe, it, expect, afterEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users } from "../db/schema/users"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"

const RUN = process.env["INTEGRATION"] === "true"

// Unique test-run sentinel so parallel runs don't collide.
const TEST_RUN_ID = `integration_${process.pid}_${Date.now()}`

let testUserId = -1

afterEach(async () => {
  if (testUserId === -1) return
  // Delete in FK order: transactions → categories → users
  const db = getDb()
  await db.delete(transactions).where(eq(transactions.userId, testUserId))
  await db.delete(categories).where(eq(categories.userId, testUserId))
  await db.delete(users).where(eq(users.id, testUserId))
  testUserId = -1
})

describe.runIf(RUN)("categories — DB transaction atomicity (real MySQL)", () => {
  it("rolls back remap updates when an error is thrown mid-transaction", async () => {
    const db = getDb()

    // ── Setup ────────────────────────────────────────────────────────────────
    const [{ id: userId }] = await db
      .insert(users)
      .values({
        email: `${TEST_RUN_ID}@test.invalid`,
        authProvider: "test",
        externalId: TEST_RUN_ID,
        displayName: "Test User",
      })
      .$returningId()
    testUserId = userId

    const [{ id: sourceId }] = await db
      .insert(categories)
      .values({ userId, name: "Source", isIncome: false })
      .$returningId()

    const [{ id: targetId }] = await db
      .insert(categories)
      .values({ userId, name: "Target", isIncome: false })
      .$returningId()

    const [{ id: txnId }] = await db
      .insert(transactions)
      .values({
        userId,
        date: new Date(),
        name: "Test transaction",
        nameKey: "test transaction",
        amountKd: "1.000",
        categoryId: sourceId,
      })
      .$returningId()

    // ── Act: remap inside a transaction, then throw to trigger rollback ───────
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ categoryId: targetId })
          .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, sourceId)))

        // Deliberate failure — simulates a subsequent operation (e.g. delete) throwing.
        throw new Error("Simulated mid-transaction failure — must roll back")
      }),
    ).rejects.toThrow("Simulated mid-transaction failure")

    // ── Assert: the update was rolled back ────────────────────────────────────
    const [row] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.id, txnId))

    expect(row?.categoryId).toBe(sourceId)  // still points to source, not target
  })
})
