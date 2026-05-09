// Income detection and resolution helpers shared by aggregation routes (5b-2+).
//
// budgets.ts has a local resolveIncomeForPeriod with looser types (source: string | null).
// This version uses the stricter IncomeSource union, calendarMonthBounds from
// analytics-helpers (A4), and incomeCategoryFilter from payday-lib to avoid duplication.

import Decimal from "decimal.js"
import { and, eq, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { userProfiles } from "../db/schema/users"
import { calendarMonthBounds } from "./analytics-helpers"
import { incomeCategoryFilter } from "./payday-lib"

type Db = ReturnType<typeof getDb>

export type IncomeSource = "detected_from_transactions" | "declared_in_profile" | "not_set"

export type IncomeResolution = {
  amountKd: Decimal | null
  source: IncomeSource
}

// Sums income-category transactions for the given YYYY-MM month.
// Returns 0 if no income transactions exist.
export async function detectMonthlyIncome(
  userId: number,
  month: string,
  db: Db,
): Promise<Decimal> {
  const [year, mon] = month.split("-").map(Number)
  const { start: monthStart, end: monthEnd } = calendarMonthBounds(year, mon)

  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.date} >= ${monthStart}`,
        sql`${transactions.date} <= ${monthEnd}`,
        incomeCategoryFilter(),
      ),
    )

  return new Decimal(row?.total ?? "0")
}

// Precedence: detected (transaction SUM) → declared (userProfiles.monthlyIncomeKd) → not_set.
export async function resolveIncomeForPeriod(
  userId: number,
  month: string,
  db: Db,
): Promise<IncomeResolution> {
  const detected = await detectMonthlyIncome(userId, month, db)
  if (detected.gt(0)) {
    return { amountKd: detected, source: "detected_from_transactions" }
  }

  const [profile] = await db
    .select({ monthlyIncomeKd: userProfiles.monthlyIncomeKd })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (profile?.monthlyIncomeKd) {
    const declared = new Decimal(profile.monthlyIncomeKd)
    if (declared.gt(0)) {
      return { amountKd: declared, source: "declared_in_profile" }
    }
  }

  return { amountKd: null, source: "not_set" }
}
