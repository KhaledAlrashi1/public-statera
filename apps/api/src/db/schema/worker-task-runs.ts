import { sql } from "drizzle-orm"
import {
  datetime,
  index,
  int,
  mysqlTable,
  varchar,
} from "drizzle-orm/mysql-core"

export const workerTaskRuns = mysqlTable(
  "worker_task_runs",
  {
    id: int("id").primaryKey().autoincrement(),
    taskName: varchar("task_name", { length: 128 }).notNull().unique(),
    lastStartedAt: datetime("last_started_at", { fsp: 3 }),
    lastFinishedAt: datetime("last_finished_at", { fsp: 3 }),
    lastSuccessAt: datetime("last_success_at", { fsp: 3 }),
    lastFailureAt: datetime("last_failure_at", { fsp: 3 }),
    lastStatus: varchar("last_status", { length: 32 }).notNull().default("never"),
    lastError: varchar("last_error", { length: 255 }),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("ix_worker_task_runs_task_name").on(t.taskName),
    index("ix_worker_task_runs_last_finished_at").on(t.lastFinishedAt),
  ],
)
