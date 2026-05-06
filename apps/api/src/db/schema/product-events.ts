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

export const productEvents = mysqlTable(
  "product_events",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    propertiesJson: text("properties_json"),
    eventTs: datetime("event_ts", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_product_events_user_id").on(t.userId),
    index("ix_product_events_event_name").on(t.eventName),
    index("ix_product_events_event_ts").on(t.eventTs),
    index("ix_product_events_user_event").on(t.userId, t.eventName),
    index("ix_product_events_event_ts_name").on(t.eventName, t.eventTs),
  ],
)
