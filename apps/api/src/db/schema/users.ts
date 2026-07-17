import { sql } from "drizzle-orm"
import {
  boolean,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"

export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    authProvider: varchar("auth_provider", { length: 32 }).notNull().default("google"),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 128 }),
    firstName: varchar("first_name", { length: 64 }),
    lastName: varchar("last_name", { length: 64 }),
    // AES-256-GCM encrypted at rest — stored as enc1:<base64url>
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpBackupCodesJson: text("totp_backup_codes_json"),
    // Increment to invalidate all active sessions for this user.
    sessionVersion: int("session_version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: datetime("last_login_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_users_email").on(t.email),
    uniqueIndex("uq_users_provider_external_id").on(t.authProvider, t.externalId),
  ],
)

export const userProfiles = mysqlTable("user_profiles", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id),
  monthlyIncomeKd: decimal("monthly_income_kd", { precision: 12, scale: 3 }),
  paydayDay: int("payday_day"),
  country: varchar("country", { length: 64 }),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
  setupGuideSeen: boolean("setup_guide_seen").notNull().default(false),
  setupGuideDismissed: boolean("setup_guide_dismissed").notNull().default(false),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kuwait"),
  createdAt: datetime("created_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdateFn(() => new Date()),
})
