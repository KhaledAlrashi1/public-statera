import { sql } from "drizzle-orm"
import {
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"

export const securityEvents = mysqlTable(
  "security_events",
  {
    id: int("id").primaryKey().autoincrement(),
    // Nullable: pre-auth events (e.g. failed login attempts) have no user yet.
    userId: int("user_id").references(() => users.id),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    detailsJson: text("details_json"),
    // Marks an account.deleted audit record that must survive the user purge.
    // Tombstone rows have user_id=NULL and is_tombstone=true; the purge DELETE
    // targets WHERE user_id = uid AND is_tombstone = false, so they are never removed.
    isTombstone: boolean("is_tombstone").notNull().default(false),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_security_events_user_id").on(t.userId),
    index("ix_security_events_event_type").on(t.eventType),
    index("ix_security_events_created_at").on(t.createdAt),
  ],
)
