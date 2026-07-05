/*
 * Deliberate deviations from "export equals purge" (Module 10c-1, GDPR right-to-access).
 *
 * The account-deletion purge (lib/account-deletion.ts purgeUserAccountRows) is the
 * authoritative list of everything held against a user's ID. This export mirrors that
 * scope so that a right-to-access download and a right-to-erasure purge cover the same
 * data — EXCEPT for the departures documented here. This comment block is the single
 * findable place for every departure; keep it in sync with DATA_EXPORT_EXCLUSIONS below.
 *
 * FIELD-LEVEL exclusions (row is exported; specific columns are omitted):
 * - users.external_id — authentication-infrastructure material. The export is a
 *   downloadable artifact that leaves our custody; a stable IdP-issued cross-service
 *   identifier adds linkability risk to every copy while adding no right-to-know value
 *   (the user's identity is already fully present via email + name). Grouped with the
 *   other auth-infra fields below.
 * - users.totp_secret / users.totp_backup_codes_json / users.session_version —
 *   authentication-infrastructure / credential material. Never leaves the server.
 * - transactions.name_key — derived normalization key; redundant with transactions.name
 *   (the human-readable name IS exported). No right-to-know value on its own.
 * - transactions.import_row_hash — import-dedup infrastructure, not user-authored data.
 *
 * DELIBERATE ASYMMETRY (recorded per 10c-1 bookkeeping): memorized_transactions.norm
 * IS exported even though it is also a derived normalization value. The memorized table
 * is the core of the derived-data-transparency story — a user has a right to see what
 * the suggestion engine has learned and stored about them, including the normalized key
 * it matches on. transactions.name_key is redundant with the exported name; norm is the
 * primary key of a row that would otherwise be opaque, so it stays.
 *
 * TABLE-LEVEL exclusions (whole table omitted from the export, still purged on deletion):
 * - dashboard_snapshots — derived aggregation cache, fully reconstructable from the
 *   exported transactions/budgets. No independent right-to-know value.
 * - account_action_tokens — short-lived authentication tokens (auth-infra, same rationale
 *   as external_id).
 * - template_suggestion_feedback — feature not present in this deployment (flagged off /
 *   never ported to Hono); the table is empty.
 * - security_events tombstone rows — account-deletion audit records (user_id=NULL,
 *   is_tombstone=true). Not tied to this user's identity; never exported.
 *
 * INCLUDED behavioral/audit data (per 10c-1 ruling 1): security_events (non-tombstone)
 * and product_events ARE exported. The export=purge rule holds for them — behavioral and
 * audit data held against the user's ID is in scope for a right-to-access export.
 *
 * Read-consistency deviation (per proposal): the export runs as a sequence of independent
 * SELECTs, NOT inside a single serializable transaction. A concurrent write mid-export
 * could yield a mildly inconsistent snapshot (e.g. a transaction present but its category
 * already renamed). Accepted because the export is a single-user, low-frequency, read-only
 * operation and the user is the only writer of their own data. Revisit trigger: wrap the
 * reads in a REPEATABLE READ transaction if the export ever becomes concurrent with an
 * automated writer (e.g. a background enrichment job mutating the same rows).
 */

import { and, asc, eq, ne } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { formatKd } from "./kd"
import {
  users,
  userProfiles,
  categories,
  merchants,
  transactions,
  budgets,
  debtAccounts,
  savingsGoals,
  memorizedTransactions,
  securityEvents,
  productEvents,
} from "../db/schema"

// Shared shape accepted by both the main db instance and drizzle transaction objects.
type DrizzleDbOrTx = Pick<ReturnType<typeof getDb>, "select">

// Runtime echo of the file-top deviations comment. Static — does not vary with data.
// The empty-state export carries the exact same list as a fully-populated one.
export const DATA_EXPORT_EXCLUSIONS: readonly string[] = [
  "users.external_id — authentication-infrastructure (IdP-issued cross-service identifier)",
  "users.totp_secret / users.totp_backup_codes_json / users.session_version — authentication-infrastructure / credential material",
  "transactions.name_key — derived normalization key, redundant with transactions.name",
  "transactions.import_row_hash — import-dedup infrastructure",
  "dashboard_snapshots — derived aggregation cache, reconstructable from transactions/budgets",
  "account_action_tokens — short-lived authentication tokens",
  "template_suggestion_feedback — feature not present in this deployment",
  "security_events tombstone rows — account-deletion audit records not tied to the user",
] as const

function toIsoUtc(d: Date | string | null | undefined): string | null {
  if (d == null) return null
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString()
  return iso.replace(/\.\d{3}Z$/, "+00:00")
}

function toDateOnly(d: Date | string | null | undefined): string | null {
  if (d == null) return null
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

export type UserDataExport = {
  generated_at: string
  user: Record<string, unknown>
  profile: Record<string, unknown> | null
  categories: Record<string, unknown>[]
  merchants: Record<string, unknown>[]
  transactions: Record<string, unknown>[]
  budgets: Record<string, unknown>[]
  debt_accounts: Record<string, unknown>[]
  savings_goals: Record<string, unknown>[]
  memorized_transactions: Record<string, unknown>[]
  security_events: Record<string, unknown>[]
  product_events: Record<string, unknown>[]
}

export type DataExportResult = {
  export: UserDataExport
  counts: Record<string, number>
}

// Assembles the full right-to-access export for one user. Returns null when the user
// row does not exist (should be unreachable behind requireAuth, mirrors GET /profile).
//
// Queries run sequentially (not Promise.all) — see the read-consistency deviation in the
// file-top comment; the sequence is intentional, not a perf oversight.
export async function buildUserDataExport(
  db: DrizzleDbOrTx,
  userId: number,
): Promise<DataExportResult | null> {
  // ── user (auth-infra columns deliberately not selected) ──────────────────────
  const [userRow] = await db
    .select({
      id: users.id,
      email: users.email,
      authProvider: users.authProvider,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      totpEnabled: users.totpEnabled,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!userRow) return null

  // ── profile ──────────────────────────────────────────────────────────────────
  const [profileRow] = await db
    .select({
      monthlyIncomeKd: userProfiles.monthlyIncomeKd,
      paydayDay: userProfiles.paydayDay,
      country: userProfiles.country,
      timezone: userProfiles.timezone,
      emailNotificationsEnabled: userProfiles.emailNotificationsEnabled,
      hasDebtChoice: userProfiles.hasDebtChoice,
      setupGuideSeen: userProfiles.setupGuideSeen,
      setupGuideDismissed: userProfiles.setupGuideDismissed,
      createdAt: userProfiles.createdAt,
      updatedAt: userProfiles.updatedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  // ── categories ─────────────────────────────────────────────────────────────
  const categoryRows = await db
    .select({
      id: categories.id,
      name: categories.name,
      isIncome: categories.isIncome,
      isSystem: categories.isSystem,
    })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.id))

  // ── merchants ────────────────────────────────────────────────────────────────
  const merchantRows = await db
    .select({ id: merchants.id, name: merchants.name })
    .from(merchants)
    .where(eq(merchants.userId, userId))
    .orderBy(asc(merchants.id))

  // ── transactions (name_key + import_row_hash deliberately not selected) ───────
  const transactionRows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      source: transactions.source,
      name: transactions.name,
      memo: transactions.memo,
      amountKd: transactions.amountKd,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      importBatchId: transactions.importBatchId,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.id))

  // ── budgets ──────────────────────────────────────────────────────────────────
  const budgetRows = await db
    .select({
      id: budgets.id,
      month: budgets.month,
      categoryId: budgets.categoryId,
      amountKd: budgets.amountKd,
      updatedAt: budgets.updatedAt,
    })
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .orderBy(asc(budgets.id))

  // ── debt accounts ──────────────────────────────────────────────────────────
  const debtRows = await db
    .select({
      id: debtAccounts.id,
      name: debtAccounts.name,
      debtType: debtAccounts.debtType,
      balanceKd: debtAccounts.balanceKd,
      aprPct: debtAccounts.aprPct,
      minimumPaymentKd: debtAccounts.minimumPaymentKd,
      dueDay: debtAccounts.dueDay,
      isActive: debtAccounts.isActive,
      notes: debtAccounts.notes,
      createdAt: debtAccounts.createdAt,
      updatedAt: debtAccounts.updatedAt,
    })
    .from(debtAccounts)
    .where(eq(debtAccounts.userId, userId))
    .orderBy(asc(debtAccounts.id))

  // ── savings goals ──────────────────────────────────────────────────────────
  const savingsRows = await db
    .select({
      id: savingsGoals.id,
      name: savingsGoals.name,
      goalType: savingsGoals.goalType,
      targetKd: savingsGoals.targetKd,
      currentKd: savingsGoals.currentKd,
      targetDate: savingsGoals.targetDate,
      linkedCategoryId: savingsGoals.linkedCategoryId,
      isActive: savingsGoals.isActive,
      notes: savingsGoals.notes,
      createdAt: savingsGoals.createdAt,
      updatedAt: savingsGoals.updatedAt,
    })
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, userId))
    .orderBy(asc(savingsGoals.id))

  // ── memorized transactions (norm IS exported — see deliberate-asymmetry note) ─
  const memorizedRows = await db
    .select({
      id: memorizedTransactions.id,
      canonical: memorizedTransactions.canonical,
      norm: memorizedTransactions.norm,
      categoryId: memorizedTransactions.categoryId,
      merchantId: memorizedTransactions.merchantId,
      count: memorizedTransactions.count,
      lastSeen: memorizedTransactions.lastSeen,
      isPinned: memorizedTransactions.isPinned,
      pinnedAt: memorizedTransactions.pinnedAt,
    })
    .from(memorizedTransactions)
    .where(eq(memorizedTransactions.userId, userId))
    .orderBy(asc(memorizedTransactions.id))

  // ── security events (non-tombstone only) ─────────────────────────────────────
  const securityRows = await db
    .select({
      id: securityEvents.id,
      eventType: securityEvents.eventType,
      ipAddress: securityEvents.ipAddress,
      userAgent: securityEvents.userAgent,
      detailsJson: securityEvents.detailsJson,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(and(eq(securityEvents.userId, userId), ne(securityEvents.isTombstone, true)))
    .orderBy(asc(securityEvents.id))

  // ── product events ────────────────────────────────────────────────────────────
  const productRows = await db
    .select({
      id: productEvents.id,
      eventName: productEvents.eventName,
      propertiesJson: productEvents.propertiesJson,
      eventTs: productEvents.eventTs,
    })
    .from(productEvents)
    .where(eq(productEvents.userId, userId))
    .orderBy(asc(productEvents.id))

  const exportData: UserDataExport = {
    generated_at: toIsoUtc(new Date())!,
    user: {
      id: userRow.id,
      email: userRow.email,
      auth_provider: userRow.authProvider,
      display_name: userRow.displayName ?? null,
      first_name: userRow.firstName ?? null,
      last_name: userRow.lastName ?? null,
      totp_enabled: Boolean(userRow.totpEnabled),
      is_active: Boolean(userRow.isActive),
      last_login_at: toIsoUtc(userRow.lastLoginAt),
      created_at: toIsoUtc(userRow.createdAt),
    },
    profile: profileRow
      ? {
          monthly_income_kd:
            profileRow.monthlyIncomeKd != null ? formatKd(profileRow.monthlyIncomeKd) : null,
          payday_day: profileRow.paydayDay ?? null,
          country: profileRow.country ?? null,
          timezone: profileRow.timezone ?? "Asia/Kuwait",
          email_notifications_enabled: Boolean(profileRow.emailNotificationsEnabled),
          has_debt_choice: profileRow.hasDebtChoice ?? null,
          setup_guide_seen: Boolean(profileRow.setupGuideSeen),
          setup_guide_dismissed: Boolean(profileRow.setupGuideDismissed),
          created_at: toIsoUtc(profileRow.createdAt),
          updated_at: toIsoUtc(profileRow.updatedAt),
        }
      : null,
    categories: categoryRows.map((r) => ({
      id: r.id,
      name: r.name,
      is_income: Boolean(r.isIncome),
      is_system: Boolean(r.isSystem),
    })),
    merchants: merchantRows.map((r) => ({ id: r.id, name: r.name })),
    transactions: transactionRows.map((r) => ({
      id: r.id,
      date: toDateOnly(r.date),
      source: r.source,
      name: r.name,
      memo: r.memo ?? null,
      amount_kd: formatKd(r.amountKd),
      category_id: r.categoryId ?? null,
      merchant_id: r.merchantId ?? null,
      import_batch_id: r.importBatchId ?? null,
      created_at: toIsoUtc(r.createdAt),
      updated_at: toIsoUtc(r.updatedAt),
    })),
    budgets: budgetRows.map((r) => ({
      id: r.id,
      month: r.month,
      category_id: r.categoryId,
      amount_kd: formatKd(r.amountKd),
      updated_at: toIsoUtc(r.updatedAt),
    })),
    debt_accounts: debtRows.map((r) => ({
      id: r.id,
      name: r.name,
      debt_type: r.debtType,
      balance_kd: formatKd(r.balanceKd),
      apr_pct: r.aprPct != null ? formatKd(r.aprPct) : null,
      minimum_payment_kd: formatKd(r.minimumPaymentKd),
      due_day: r.dueDay ?? null,
      is_active: Boolean(r.isActive),
      notes: r.notes ?? null,
      created_at: toIsoUtc(r.createdAt),
      updated_at: toIsoUtc(r.updatedAt),
    })),
    savings_goals: savingsRows.map((r) => ({
      id: r.id,
      name: r.name,
      goal_type: r.goalType,
      target_kd: formatKd(r.targetKd),
      current_kd: formatKd(r.currentKd),
      target_date: toDateOnly(r.targetDate),
      linked_category_id: r.linkedCategoryId ?? null,
      is_active: Boolean(r.isActive),
      notes: r.notes ?? null,
      created_at: toIsoUtc(r.createdAt),
      updated_at: toIsoUtc(r.updatedAt),
    })),
    memorized_transactions: memorizedRows.map((r) => ({
      id: r.id,
      canonical: r.canonical,
      norm: r.norm,
      category_id: r.categoryId ?? null,
      merchant_id: r.merchantId ?? null,
      count: r.count,
      last_seen: toIsoUtc(r.lastSeen),
      is_pinned: Boolean(r.isPinned),
      pinned_at: toIsoUtc(r.pinnedAt),
    })),
    security_events: securityRows.map((r) => ({
      id: r.id,
      event_type: r.eventType,
      ip_address: r.ipAddress ?? null,
      user_agent: r.userAgent ?? null,
      details_json: r.detailsJson ?? null,
      created_at: toIsoUtc(r.createdAt),
    })),
    product_events: productRows.map((r) => ({
      id: r.id,
      event_name: r.eventName,
      properties_json: r.propertiesJson ?? null,
      event_ts: toIsoUtc(r.eventTs),
    })),
  }

  const counts: Record<string, number> = {
    categories: exportData.categories.length,
    merchants: exportData.merchants.length,
    transactions: exportData.transactions.length,
    budgets: exportData.budgets.length,
    debt_accounts: exportData.debt_accounts.length,
    savings_goals: exportData.savings_goals.length,
    memorized_transactions: exportData.memorized_transactions.length,
    security_events: exportData.security_events.length,
    product_events: exportData.product_events.length,
  }

  return { export: exportData, counts }
}
