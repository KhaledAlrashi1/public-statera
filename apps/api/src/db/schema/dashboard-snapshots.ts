import { sql } from "drizzle-orm"
import {
  datetime,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"

export const dashboardSnapshots = mysqlTable(
  "dashboard_snapshots",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    monthsCount: int("months_count").notNull().default(24),
    windowEndMonth: varchar("window_end_month", { length: 7 }).notNull(),  // YYYY-MM
    monthsJson: text("months_json").notNull().default("[]"),
    monthlyJson: text("monthly_json").notNull().default("[]"),
    expenseByCategoryJson: text("expense_by_category_json").notNull().default("{}"),
    computedAt: datetime("computed_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [
    index("ix_dashboard_snapshots_user_id").on(t.userId),
    index("ix_dashboard_snapshots_window_end_month").on(t.windowEndMonth),
    index("ix_dashboard_snapshots_computed_at").on(t.computedAt),
    index("ix_dashboard_snapshots_user_computed").on(t.userId, t.computedAt),
    uniqueIndex("uq_dashboard_snapshot_user_window").on(
      t.userId,
      t.monthsCount,
      t.windowEndMonth,
    ),
  ],
)
