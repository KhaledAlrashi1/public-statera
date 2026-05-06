import { sql } from "drizzle-orm"
import {
  boolean,
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

export const debtAccounts = mysqlTable(
  "debt_accounts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 128 }).notNull(),
    debtType: varchar("debt_type", { length: 32 }).notNull().default("other"),
    balanceKd: decimal("balance_kd", { precision: 12, scale: 3 }).notNull().default("0"),
    aprPct: decimal("apr_pct", { precision: 6, scale: 3 }),
    minimumPaymentKd: decimal("minimum_payment_kd", { precision: 10, scale: 3 })
      .notNull()
      .default("0"),
    dueDay: int("due_day"),
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
    index("ix_debt_accounts_user_id").on(t.userId),
    index("ix_debt_accounts_user_active").on(t.userId, t.isActive),
    uniqueIndex("uq_debt_accounts_user_name").on(t.userId, t.name),
    check("chk_debt_balance_non_negative", sql`${t.balanceKd} >= 0`),
    check("chk_debt_min_payment_non_negative", sql`${t.minimumPaymentKd} >= 0`),
  ],
)
