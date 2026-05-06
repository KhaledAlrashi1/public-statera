import { sql } from "drizzle-orm"
import {
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"
import { categories } from "./categories"
import { merchants } from "./merchants"

export const memorizedTransactions = mysqlTable(
  "memorized_transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    canonical: varchar("canonical", { length: 255 }).notNull(),
    norm: varchar("norm", { length: 255 }).notNull(),
    categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),
    merchantId: int("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    count: int("count").notNull().default(1),
    lastSeen: datetime("last_seen", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    isPinned: boolean("is_pinned").notNull().default(false),
    pinnedAt: datetime("pinned_at", { fsp: 3 }),
  },
  (t) => [
    index("ix_memorized_transactions_user_id").on(t.userId),
    index("ix_memorized_transactions_norm").on(t.norm),
    index("ix_memorized_transactions_category_id").on(t.categoryId),
    index("ix_memorized_transactions_merchant_id").on(t.merchantId),
    index("ix_memorized_transactions_last_seen").on(t.lastSeen),
    uniqueIndex("uq_memorized_user_norm").on(t.userId, t.norm),
  ],
)
