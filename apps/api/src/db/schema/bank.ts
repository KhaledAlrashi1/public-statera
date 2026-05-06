import { sql } from "drizzle-orm"
import {
  check,
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"
import { transactions } from "./transactions"

export const bankConnections = mysqlTable(
  "bank_connections",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    externalInstitutionId: varchar("external_institution_id", { length: 255 }),
    accountNumberMasked: varchar("account_number_masked", { length: 20 }),
    institutionName: varchar("institution_name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    // AES-256-GCM encrypted — stored as enc1:<base64url>
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    revokedAt: datetime("revoked_at", { fsp: 3 }),
    lastSyncedAt: datetime("last_synced_at", { fsp: 3 }),
  },
  (t) => [
    index("ix_bank_connections_user_id").on(t.userId),
    index("ix_bank_connections_user_status").on(t.userId, t.status),
    uniqueIndex("uq_bank_connections_user_provider_institution").on(
      t.userId,
      t.provider,
      t.institutionName,
    ),
  ],
)

export const bankConsents = mysqlTable(
  "bank_consents",
  {
    id: int("id").primaryKey().autoincrement(),
    connectionId: int("connection_id")
      .notNull()
      .references(() => bankConnections.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    // JSON string: e.g. '["transactions:read"]' — stored as TEXT (no JSONB)
    scopes: text("scopes").notNull().default('["transactions:read"]'),
    purposeOfUse: varchar("purpose_of_use", { length: 512 })
      .notNull()
      .default("Personal financial analytics"),
    consentReference: varchar("consent_reference", { length: 128 }),
    dataRecipientName: varchar("data_recipient_name", { length: 255 })
      .notNull()
      .default("Personal Statera"),
    scopeDescription: text("scope_description")
      .notNull()
      .default("Read-only access to transaction history for analytics"),
    ipAddressGranted: varchar("ip_address_granted", { length: 64 }),
    userAgentGranted: varchar("user_agent_granted", { length: 255 }),
    grantedAt: datetime("granted_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    expiresAt: datetime("expires_at", { fsp: 3 }),
    revokedAt: datetime("revoked_at", { fsp: 3 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
  },
  (t) => [
    index("ix_bank_consents_connection_id").on(t.connectionId),
    index("ix_bank_consents_user_id").on(t.userId),
  ],
)

export const bankSyncRuns = mysqlTable(
  "bank_sync_runs",
  {
    id: int("id").primaryKey().autoincrement(),
    connectionId: int("connection_id")
      .notNull()
      .references(() => bankConnections.id),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("staged"),
    providerCursor: varchar("provider_cursor", { length: 255 }),
    stagedCount: int("staged_count").notNull().default(0),
    committedCount: int("committed_count"),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    committedAt: datetime("committed_at", { fsp: 3 }),
    abandonedAt: datetime("abandoned_at", { fsp: 3 }),
  },
  (t) => [
    index("ix_bank_sync_runs_connection_id").on(t.connectionId),
    index("ix_bank_sync_runs_user_id").on(t.userId),
    index("ix_bank_sync_runs_user_status").on(t.userId, t.status),
    index("ix_bank_sync_runs_created_at").on(t.createdAt),
  ],
)

export const rawBankTransactions = mysqlTable(
  "raw_bank_transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    connectionId: int("connection_id")
      .notNull()
      .references(() => bankConnections.id),
    syncRunId: int("sync_run_id")
      .notNull()
      .references(() => bankSyncRuns.id),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    providerTxId: varchar("provider_tx_id", { length: 255 }).notNull(),
    date: date("date").notNull(),
    description: varchar("description", { length: 128 }).notNull(),
    amountKd: decimal("amount_kd", { precision: 10, scale: 3 }).notNull(),
    rawPayloadHash: varchar("raw_payload_hash", { length: 64 }),
    categoryHint: varchar("category_hint", { length: 64 }),
    merchantHint: varchar("merchant_hint", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("staged"),
    transactionId: int("transaction_id").references(() => transactions.id),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_raw_bank_txns_connection_id").on(t.connectionId),
    index("ix_raw_bank_txns_sync_run_id").on(t.syncRunId),
    index("ix_raw_bank_txns_user_id").on(t.userId),
    index("ix_raw_bank_txns_created_at").on(t.createdAt),
    uniqueIndex("uq_raw_bank_txn_connection_provider_id").on(t.connectionId, t.providerTxId),
    check("chk_raw_bank_txns_amount_positive", sql`${t.amountKd} > 0`),
  ],
)
