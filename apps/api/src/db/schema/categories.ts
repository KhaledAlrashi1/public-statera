import { boolean, index, int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core"
import { users } from "./users"

export const categories = mysqlTable(
  "categories",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 64 }).notNull(),
    // NULL treated as false (not income) for backward compatibility.
    isIncome: boolean("is_income").default(false),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (t) => [
    index("ix_categories_user_id").on(t.userId),
    index("ix_categories_name").on(t.name),
    uniqueIndex("uq_category_user_name").on(t.userId, t.name),
  ],
)
