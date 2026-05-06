import { sql } from "drizzle-orm"
import {
  datetime,
  index,
  int,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"

export const accountActionTokens = mysqlTable(
  "account_action_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    purpose: varchar("purpose", { length: 32 }).notNull(),  // email_change | password_change
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    payloadJson: text("payload_json"),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    usedAt: datetime("used_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_account_action_tokens_user_id").on(t.userId),
    index("ix_account_action_tokens_purpose").on(t.purpose),
    index("ix_account_action_tokens_expires_at").on(t.expiresAt),
    index("ix_account_action_tokens_used_at").on(t.usedAt),
  ],
)
