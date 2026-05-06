import { sql } from "drizzle-orm"
import {
  check,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"
import { categories } from "./categories"

export const budgets = mysqlTable(
  "budgets",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    month: varchar("month", { length: 7 }).notNull(),  // YYYY-MM
    categoryId: int("category_id")
      .notNull()
      .references(() => categories.id),
    amountKd: decimal("amount_kd", { precision: 10, scale: 3 }).notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("ix_budgets_user_id").on(t.userId),
    index("ix_budgets_month").on(t.month),
    index("ix_budgets_category_id").on(t.categoryId),
    index("ix_budgets_user_month").on(t.userId, t.month),
    uniqueIndex("uq_budget_user_month_category").on(t.userId, t.month, t.categoryId),
    check("chk_budgets_amount_positive", sql`${t.amountKd} > 0`),
  ],
)
