// MOB-R112 D2 — income extras. An extra is a row Log's income mode saves: its category counts as
// income by the payday-lib rule AND its trimmed, lower-cased name is one of the three tile names.
// Every other income row (a salary row included) stays listed and is not counted.
//
// This is the ONE server definition. The demo engine carries the one mirror
// (apps/web/src/lib/demo/engine.ts, isIncomeExtra); there is no other copy.
//
// Its own module, not lib/income-lib.ts: routes/aggregation.test.ts replaces income-lib with a
// factory that lists only resolveIncomeForPeriod, so an export added there reads undefined in that
// file (the 10e-R36 class).

import Decimal from "decimal.js"
import { and, eq, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { incomeCategoryFilter } from "./payday-lib"

type Db = ReturnType<typeof getDb>

export const INCOME_EXTRA_NAMES = ["bonus", "commission", "other income"] as const

// For a select that joins categories on transactions.category_id.
export function incomeExtraFilter() {
  return sql<number>`(${incomeCategoryFilter()} AND LOWER(TRIM(COALESCE(${transactions.name}, ''))) IN (${sql.join(
    INCOME_EXTRA_NAMES.map((n) => sql`${n}`),
    sql`, `,
  )}))`
}

// The extras dated in [start, end] (inclusive, YYYY-MM-DD).
export async function sumIncomeExtrasBetween(userId: number, start: string, end: string, db: Db): Promise<Decimal> {
  const [row] = await db
    .select({ total: sql<string | null>`SUM(${transactions.amountKd})` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.date} >= ${start}`,
        sql`${transactions.date} <= ${end}`,
        incomeExtraFilter(),
      ),
    )
  return new Decimal(row?.total ?? "0")
}
