// MOB-R53 B1 (+ MOB-R55 G2) — suggestions for the hidden /log page: the user's usual places and,
// per place, the items they usually log there. Read-only; writes nothing.
//
// Scope, for one user only:
//   - their own transactions, never source 'demo', and only EXPENSE rows by the backend income
//     rule (payday-lib expenseCategoryFilter) — so income never appears as a place or an item;
//   - places: every merchant with any entry, all time, ordered by entry count in the last
//     PLACE_WINDOW_DAYS, then by most recent date; at most PLACE_LIMIT (G2). Older places stay
//     findable by the page's search, which filters this list in the browser;
//   - items per place: grouped by name_key, counted all time, ordered by count then most recent,
//     at most ITEMS_PER_PLACE. Each carries the display name, category and amount of its MOST
//     RECENT entry.
// Money stays a string end to end: amount_kd is formatKd of the stored decimal, never a number.
//
// Two ordinary queries rather than one window query: places first (grouped, limited), then every
// eligible row at those places newest-first, shaped in shapeLogSuggestions(). Both read through
// ix_transactions_user_id (EXPLAIN in the MOB-R53 A5 report).

import { and, desc, asc, eq, inArray, max, ne, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { transactions } from "../db/schema/transactions"
import { merchants } from "../db/schema/merchants"
import { categories } from "../db/schema/categories"
import { expenseCategoryFilter } from "./payday-lib"
import { currentLocalDate } from "./analytics-helpers"
import { formatKd } from "./kd"

export const PLACE_LIMIT = 200
export const ITEMS_PER_PLACE = 5
export const PLACE_WINDOW_DAYS = 90

export type LogSuggestionItem = { name: string; category: string | null; amount_kd: string }
export type LogSuggestionPlace = {
  name: string
  category: string | null
  count: number
  items: LogSuggestionItem[]
}

/** One row per place from the grouped query, already in display order. */
export type PlaceRow = { merchantId: number; merchantName: string; recentCount: number | string | null }
/** Every eligible entry at the listed places, newest first (date desc, id desc). */
export type EntryRow = {
  merchantId: number | null
  nameKey: string
  name: string
  amountKd: string
  categoryName: string | null
}

/**
 * Pure shaping step. Relies on the input ORDER, never on parsing dates: places arrive in display
 * order, and entries arrive newest first, so the first entry seen for a place (or for an item) is
 * its most recent one.
 */
export function shapeLogSuggestions(placeRows: PlaceRow[], entryRows: EntryRow[]): LogSuggestionPlace[] {
  type ItemAcc = { name: string; category: string | null; amountKd: string; count: number; firstIndex: number }
  const byPlace = new Map<number, { category: string | null; seen: boolean; items: Map<string, ItemAcc> }>()
  for (const p of placeRows) byPlace.set(p.merchantId, { category: null, seen: false, items: new Map() })

  entryRows.forEach((row, index) => {
    if (row.merchantId === null) return
    const place = byPlace.get(row.merchantId)
    if (!place) return
    if (!place.seen) {
      place.category = row.categoryName ?? null
      place.seen = true
    }
    const existing = place.items.get(row.nameKey)
    if (existing) existing.count += 1
    else place.items.set(row.nameKey, { name: row.name, category: row.categoryName ?? null, amountKd: row.amountKd, count: 1, firstIndex: index })
  })

  return placeRows.slice(0, PLACE_LIMIT).map((p) => {
    const acc = byPlace.get(p.merchantId)!
    const items = [...acc.items.values()]
      .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
      .slice(0, ITEMS_PER_PLACE)
      .map((it) => ({ name: it.name, category: it.category, amount_kd: formatKd(it.amountKd) }))
    return { name: p.merchantName, category: acc.category, count: Number(p.recentCount ?? 0), items }
  })
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function buildLogSuggestions(
  db: ReturnType<typeof getDb>,
  userId: number,
  today: Date = currentLocalDate(),
): Promise<LogSuggestionPlace[]> {
  const cutoff = isoDate(new Date(today.getTime() - PLACE_WINDOW_DAYS * 86_400_000))
  const owned = and(eq(transactions.userId, userId), ne(transactions.source, "demo"), expenseCategoryFilter())

  const recentCount = sql<number>`SUM(CASE WHEN ${transactions.date} >= ${cutoff} THEN 1 ELSE 0 END)`
  const placeRows = await db
    .select({ merchantId: merchants.id, merchantName: merchants.name, recentCount })
    .from(transactions)
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(owned)
    .groupBy(merchants.id, merchants.name)
    .orderBy(desc(recentCount), desc(max(transactions.date)), asc(merchants.name))
    .limit(PLACE_LIMIT)

  if (placeRows.length === 0) return []

  const entryRows = await db
    .select({
      merchantId: transactions.merchantId,
      nameKey: transactions.nameKey,
      name: transactions.name,
      amountKd: transactions.amountKd,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(owned, inArray(transactions.merchantId, placeRows.map((p) => p.merchantId))))
    .orderBy(desc(transactions.date), desc(transactions.id))

  return shapeLogSuggestions(placeRows, entryRows)
}
