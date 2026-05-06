import { sql } from "drizzle-orm"
import {
  char,
  check,
  date,
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
import { merchants } from "./merchants"

export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    source: varchar("source", { length: 32 }).notNull().default("manual"),

    merchantId: int("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    categoryId: int("category_id").references(() => categories.id, { onDelete: "set null" }),

    name: varchar("name", { length: 255 }).notNull(),
    memo: varchar("memo", { length: 255 }),
    nameKey: varchar("name_key", { length: 255 }).notNull(),

    amountKd: decimal("amount_kd", { precision: 10, scale: 3 }).notNull(),

    createdAt: datetime("created_at", { fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date()),

    // Import provenance — NULL for manual and bank-synced transactions.
    importBatchId: char("import_batch_id", { length: 36 }),
    importRowHash: varchar("import_row_hash", { length: 64 }),
  },
  (t) => [
    index("ix_transactions_user_id").on(t.userId),
    index("ix_transactions_date").on(t.date),
    index("ix_transactions_source").on(t.source),
    index("ix_transactions_merchant_id").on(t.merchantId),
    index("ix_transactions_category_id").on(t.categoryId),
    index("ix_transactions_name_key").on(t.nameKey),
    index("ix_transactions_import_batch_id").on(t.importBatchId),
    // Unique on import_row_hash; MySQL NULLs are always distinct in UNIQUE indexes
    // so multiple NULL rows are permitted — equivalent to PostgreSQL's partial UNIQUE WHERE IS NOT NULL.
    uniqueIndex("ix_transactions_import_row_hash").on(t.importRowHash),
    index("ix_transactions_user_date_id").on(t.userId, t.date, t.id),
    index("ix_transactions_user_category_date").on(t.userId, t.categoryId, t.date),
    index("ix_transactions_user_source_date").on(t.userId, t.source, t.date),
    check("chk_transactions_amount_positive", sql`${t.amountKd} > 0`),
  ],
)
