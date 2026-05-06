import { sql } from "drizzle-orm"
import {
  datetime,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./users"

export const templateSuggestionFeedback = mysqlTable(
  "template_suggestion_feedback",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    signatureKey: varchar("signature_key", { length: 64 }).notNull(),
    acceptedCount: int("accepted_count").notNull().default(0),
    rejectedCount: int("rejected_count").notNull().default(0),
    lastAcceptedAt: datetime("last_accepted_at", { fsp: 3 }),
    lastRejectedAt: datetime("last_rejected_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("ix_template_feedback_user_id").on(t.userId),
    index("ix_template_feedback_user_updated").on(t.userId, t.updatedAt),
    uniqueIndex("uq_template_feedback_user_signature").on(t.userId, t.signatureKey),
  ],
)
