// Income resolution helper shared by aggregation routes (5b-2+).
//
// Income is TYPED-ONLY (MOB-R31/R33): the user's declared profile value drives every
// income-derived figure. Income-category transactions are still logged and still summed where a
// route reports LOGGED income (R3, R4, R13), but they no longer resolve to "the user's income".
// The detected arm and detectMonthlyIncome were removed; "detected_from_transactions" is no
// longer emitted.
//
// budgets.ts has a local resolveIncomeForPeriod with looser types (source: string | null). It is
// typed-only too; unifying it onto this one is QUEUED (MOB-R32 RM-13(g)).

import Decimal from "decimal.js"
import { eq } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { userProfiles } from "../db/schema/users"

type Db = ReturnType<typeof getDb>

export type IncomeSource = "declared_in_profile" | "not_set"

export type IncomeResolution = {
  amountKd: Decimal | null
  source: IncomeSource
}

// Declared (userProfiles.monthlyIncomeKd, when present AND > 0) → not_set.
// `month` is accepted and ignored: one typed figure applies to every month (MOB-R32, RM-17 flat).
export async function resolveIncomeForPeriod(
  userId: number,
  month: string,
  db: Db,
): Promise<IncomeResolution> {
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
