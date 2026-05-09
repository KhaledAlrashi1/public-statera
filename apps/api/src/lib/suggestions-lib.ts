// Deliberate deviations from Flask:
// - ILIKE vs LIKE on canonical: MySQL utf8mb4_0900_ai_ci collation makes LIKE case-insensitive;
//   Drizzle's like() is equivalent to Flask's ilike() on this stack.
// - \b in digit-strip regex: JS \b treats Arabic letters as non-word chars; Python re.U treats
//   them as word chars. A digit sequence directly adjacent to an Arabic letter (no space) is
//   stripped in JS but preserved in Python. Does not occur in real transaction names.
// - category/merchant: Flask stores name strings denormalized on the memorized_transactions
//   row (snapshot semantics: a renamed category keeps the old name on existing memorized rows
//   until the rule is rewritten). TS uses FK columns from Phase 2 and LEFT JOINs at query
//   time (live semantics: a renamed category appears with the new name in suggestions
//   immediately). The API surface (returned name string) is identical; the value may differ
//   from Flask's after a rename. This is an intentional improvement, not a bug — users
//   renaming a category expect the new name everywhere.

import { and, desc, eq, like, or } from "drizzle-orm"
import { categories } from "../db/schema/categories"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { merchants } from "../db/schema/merchants"
import { getDb } from "../db/connection"

// Mirrors Flask's _txn_nonword: keep ASCII lowercase letters, ASCII digits, and core Arabic
// letters U+0621–U+064A only. All other chars are collapsed to a single space.
const TXN_NONWORD = /[^a-z0-9ء-ي]+/gu

export function txnNorm(value: string | null | undefined): string {
  let s = (value ?? "").toLowerCase().trim()
  s = s.replace(TXN_NONWORD, " ")
  s = s.replace(/\b\d{3,}\b/g, " ")
  return s.split(/\s+/).filter(Boolean).join(" ").slice(0, 255)
}

type Db = ReturnType<typeof getDb>

export type SuggestionItem = {
  name: string
  category: string | null
  merchant: string | null
  count: number
}

export async function suggestTransactions(
  q: string,
  userId: number,
  db: Db,
  limit = 10,
): Promise<SuggestionItem[]> {
  const normalized = txnNorm(q)
  if (!normalized) return []

  const token = normalized.split(" ")[0]

  const rows = await db
    .select({
      canonical: memorizedTransactions.canonical,
      count: memorizedTransactions.count,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(memorizedTransactions)
    .leftJoin(categories, eq(memorizedTransactions.categoryId, categories.id))
    .leftJoin(merchants, eq(memorizedTransactions.merchantId, merchants.id))
    .where(
      and(
        eq(memorizedTransactions.userId, userId),
        or(
          like(memorizedTransactions.norm, `%${token}%`),
          like(memorizedTransactions.canonical, `%${q}%`),
        ),
      ),
    )
    .orderBy(desc(memorizedTransactions.count), desc(memorizedTransactions.lastSeen))
    .limit(Math.max(1, Math.min(limit, 50)))

  return rows.map((row) => ({
    name: row.canonical,
    category: row.categoryName ?? null,
    merchant: row.merchantName ?? null,
    count: row.count,
  }))
}
