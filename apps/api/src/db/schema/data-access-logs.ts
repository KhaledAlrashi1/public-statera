import { sql } from "drizzle-orm"
import {
  date,
  datetime,
  index,
  int,
  mysqlTable,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"
import { bankConnections } from "./bank"
import { bankConsents } from "./bank"

export const dataAccessLogs = mysqlTable(
  "data_access_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    connectionId: int("connection_id").references(() => bankConnections.id),
    consentId: int("consent_id").references(() => bankConsents.id),
    action: varchar("action", { length: 64 }).notNull(),
    recordsAccessed: int("records_accessed").notNull().default(0),
    dateRangeStart: date("date_range_start"),
    dateRangeEnd: date("date_range_end"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_data_access_logs_user_id").on(t.userId),
    index("ix_data_access_logs_connection_id").on(t.connectionId),
    index("ix_data_access_logs_consent_id").on(t.consentId),
    index("ix_data_access_logs_action").on(t.action),
    index("ix_data_access_logs_created_at").on(t.createdAt),
    index("ix_data_access_logs_user_connection_created").on(
      t.userId,
      t.connectionId,
      t.createdAt,
    ),
  ],
)
