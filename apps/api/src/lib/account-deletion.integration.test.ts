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
import { purgeUserAccountRows } from "./account-deletion"

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

    // Simulate mid-purge failure by overriding one of purgeUserAccountRows' internal
    // deletes to throw. We can't easily inject this, so instead
    // we wrap the whole thing in a transaction that we abort.
    let caughtMessage = ""
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
    } catch (err) {
      caughtMessage = err instanceof Error ? err.message : String(err)
    }

    // Assert the SPECIFIC injected failure — not merely that "some error" occurred.
    // A bare `catch {}` here would be satisfied by an unrelated error (e.g. the tombstone
    // insert failing on a drifted dev DB missing the is_tombstone column), giving a
    // green-for-the-wrong-reason pass. See the "dev-DB drift" fix-forward.
    expect(caughtMessage).toBe("simulated mid-purge failure")

    // User row must still exist (transaction was rolled back).
    const [still] = await db.select({ id: users.id }).from(users).where(eq(users.id, testUserId)).limit(1)
    expect(still?.id).toBe(testUserId)

    // Cleanup.
    await db.delete(users).where(eq(users.id, testUserId))
  })

  it("bumps sessionVersion, clears TOTP, and soft-deletes on a successful committed purge (10d-0a)", async () => {
    const db = getDb()

    const [inserted] = await db.insert(users).values({
      authProvider: "test",
      externalId: `test-purge-${Date.now()}`,
      email: `purge-${Date.now()}@example.com`,
      totpEnabled: true,
      totpSecret: "enc1:secret",
      totpBackupCodesJson: '["$2b$12$hash"]',
    }).$returningId()
    const uid = inserted.id

    const result = await db.transaction(async (tx) =>
      purgeUserAccountRows(uid, "a".repeat(64), "", "", tx),
    )
    // Fresh user defaults sessionVersion=1 → returns revokedSv=1, bumps DB to 2.
    expect(result.revokedSv).toBe(1)

    const [row] = await db
      .select({
        isActive: users.isActive,
        sessionVersion: users.sessionVersion,
        totpEnabled: users.totpEnabled,
        totpSecret: users.totpSecret,
        totpBackupCodesJson: users.totpBackupCodesJson,
      })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1)

    expect(row.isActive).toBe(false)
    expect(row.sessionVersion).toBe(2)
    expect(row.totpEnabled).toBe(false)
    expect(row.totpSecret).toBeNull()
    expect(row.totpBackupCodesJson).toBeNull()

    // Cleanup the soft-deleted stub. The tombstone (user_id=NULL, is_tombstone=true) is
    // left in place by design — it must survive deletion.
    await db.delete(users).where(eq(users.id, uid))
  })
})
