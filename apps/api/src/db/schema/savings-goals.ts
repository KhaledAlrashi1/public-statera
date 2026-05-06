import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"
import { categories } from "./categories"

export const savingsGoals = mysqlTable(
  "savings_goals",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 128 }).notNull(),
    goalType: varchar("goal_type", { length: 32 }).notNull().default("custom"),
    targetKd: decimal("target_kd", { precision: 12, scale: 3 }).notNull(),
    currentKd: decimal("current_kd", { precision: 12, scale: 3 }).notNull().default("0"),
    targetDate: date("target_date"),
    linkedCategoryId: int("linked_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    notes: varchar("notes", { length: 255 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("ix_savings_goals_user_id").on(t.userId),
    index("ix_savings_goals_linked_category_id").on(t.linkedCategoryId),
    index("ix_savings_goals_user_active").on(t.userId, t.isActive),
    check("chk_savings_target_positive", sql`${t.targetKd} > 0`),
    check("chk_savings_current_non_negative", sql`${t.currentKd} >= 0`),
  ],
)
