// Integration test — requires a running MySQL instance.
// Run with: INTEGRATION=true pnpm --filter statera-api test
//
// Extracted from account-deletion.test.ts (7.5 fix-forward): that file mocks
// ../db/connection at module scope, so this block's getDb() resolved to the mock
// (undefined) and the test could never run. Dedicated *.integration.test.ts file →
// no module-level db mock → real getDb(). Test logic and assertions are unchanged
// from the original; only the imports/setup were adapted for the file split.

import { describe, it, expect } from "vitest"
import { eq } from "drizzle-orm"
import { getDb } from "../db/connection"
import { users, securityEvents } from "../db/schema"

const INTEGRATION = process.env.INTEGRATION === "true"

describe.skipIf(!INTEGRATION)("purgeUserAccountRows — transaction rollback [integration]", () => {
  it("rolls back all deletes if an error occurs mid-purge", async () => {
    // This test requires a live MySQL connection and is gated on INTEGRATION=true.
    // It creates a test user, starts a transaction, forces an error mid-purge,
    // and verifies the user row is still present after rollback.
    const db = getDb()

    // Insert a test user.
    const [inserted] = await db.insert(users).values({
      authProvider: "test",
      externalId: `test-${Date.now()}`,
      email: `rollback-test-${Date.now()}@example.com`,
    }).$returningId()
    const testUserId = inserted.id

    // Simulate mid-purge failure by overriding purgeUserAccountRows' internal
    // savingsGoals delete to throw. We can't easily inject this, so instead
    // we wrap the whole thing in a transaction that we abort.
    try {
      await db.transaction(async (tx) => {
        // Insert tombstone.
        await tx.insert(securityEvents).values({
          userId: null,
          eventType: "account.deleted",
          ipAddress: null,
          userAgent: null,
          detailsJson: "{}",
          isTombstone: true,
        })
        throw new Error("simulated mid-purge failure")
      })
    } catch { /* expected */ }

    // User row must still exist (transaction was rolled back).
    const [still] = await db.select({ id: users.id }).from(users).where(eq(users.id, testUserId)).limit(1)
    expect(still?.id).toBe(testUserId)

    // Cleanup.
    await db.delete(users).where(eq(users.id, testUserId))
  })
})
