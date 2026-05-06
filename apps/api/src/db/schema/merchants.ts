import { index, int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core"
import { users } from "./users"

export const merchants = mysqlTable(
  "merchants",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 128 }).notNull(),
  },
  (t) => [
    index("ix_merchants_user_id").on(t.userId),
    index("ix_merchants_name").on(t.name),
    uniqueIndex("uq_merchant_user_name").on(t.userId, t.name),
  ],
)
