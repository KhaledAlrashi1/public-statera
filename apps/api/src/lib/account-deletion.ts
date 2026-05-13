/*
 * Deliberate deviations from Flask (routers/auth.py delete_account, lib/account_deletion.py):
 * - Flask uses password re-verification (two-step with session token). Hono uses OIDC re-auth
 *   (prompt=login) + optional TOTP as the confirmation step, replacing the password+token pattern.
 *   The result is equivalent: the user proves identity via a fresh IdP challenge before purge.
 * - Flask purge order: Transaction → Budget → DashboardSnapshot → DebtAccount → SavingsGoal →
 *   SecurityEvent → ProductEvent → MemorizedTransaction → TemplateSuggestionFeedback →
 *   AccountActionToken → UserProfile → Merchant → Category → soft-delete User.
 *   Hono matches this order exactly.
 * - Tombstone: Flask relies on DELETE WHERE user_id=uid (NULL semantics for tombstone with
 *   user_id=NULL). Hono adds is_tombstone=true column and uses AND is_tombstone=false in the
 *   DELETE, so tombstone survival is explicit rather than implicit.
 * - BullMQ instead of Celery; sync fallback is transaction-wrapped (Flask uses raw db.commit()
 *   with rollback on failure — same intent but Hono makes the transaction boundary explicit).
 * - Sentry-tracks when sync fallback fires (Flask only logs it).
 */

import { createHash } from "node:crypto"
import { and, eq, ne } from "drizzle-orm"
import type { getDb } from "../db/connection"
import {
  transactions,
  budgets,
  dashboardSnapshots,
  debtAccounts,
  savingsGoals,
  securityEvents,
  productEvents,
  memorizedTransactions,
  templateSuggestionFeedback,
  accountActionTokens,
  userProfiles,
  merchants,
  categories,
  users,
} from "../db/schema"

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}

// Shared shape accepted by both the main db instance and drizzle transaction objects.
// MySqlTransaction doesn't have $client, so ReturnType<typeof getDb> is too narrow.
type DrizzleDbOrTx = Pick<ReturnType<typeof getDb>, "insert" | "delete" | "update" | "select">

// Purges all user-owned rows in dependency order, inserts an audit tombstone first,
// and soft-deletes the user row last. Must be called inside a DB transaction.
// The tombstone row (user_id=NULL, is_tombstone=true) survives the SecurityEvent purge
// because the DELETE targets only rows WHERE user_id=uid AND is_tombstone=false.
export async function purgeUserAccountRows(
  userId: number,
  emailHash: string,
  ipAddress: string,
  userAgent: string,
  db: DrizzleDbOrTx,
): Promise<void> {
  // Tombstone first — inserted before the purge so it exists even if the purge
  // is interrupted. user_id=NULL means it is not tied to the user row and cannot
  // be accidentally deleted by any future user-scoped cleanup.
  await db.insert(securityEvents).values({
    userId: null,
    eventType: "account.deleted",
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
    detailsJson: JSON.stringify({ deleted_user_id: userId, email_hash: emailHash }),
    isTombstone: true,
  })

  // Purge order: leaf tables → parent tables (mirrors Flask's USER_OWNED_PURGE_MODELS tuple).
  await db.delete(transactions).where(eq(transactions.userId, userId))
  await db.delete(budgets).where(eq(budgets.userId, userId))
  await db.delete(dashboardSnapshots).where(eq(dashboardSnapshots.userId, userId))
  await db.delete(debtAccounts).where(eq(debtAccounts.userId, userId))
  await db.delete(savingsGoals).where(eq(savingsGoals.userId, userId))
  // SecurityEvent: exclude tombstone rows (is_tombstone=true has userId=NULL so the
  // eq() clause already misses them, but we make the exclusion explicit for clarity).
  await db.delete(securityEvents).where(
    and(eq(securityEvents.userId, userId), ne(securityEvents.isTombstone, true)),
  )
  await db.delete(productEvents).where(eq(productEvents.userId, userId))
  await db.delete(memorizedTransactions).where(eq(memorizedTransactions.userId, userId))
  await db.delete(templateSuggestionFeedback).where(eq(templateSuggestionFeedback.userId, userId))
  await db.delete(accountActionTokens).where(eq(accountActionTokens.userId, userId))
  await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
  await db.delete(merchants).where(eq(merchants.userId, userId))
  await db.delete(categories).where(eq(categories.userId, userId))

  // Soft-delete the user row last.
  await db.update(users).set({ isActive: false }).where(eq(users.id, userId))
}
