import { and, eq, or, sql } from "drizzle-orm"
import type Decimal from "decimal.js"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { transactions } from "../db/schema/transactions"
import { buildNameKey } from "./name-key"
import { formatKd, parseKd } from "./kd"

export { buildNameKey } from "./name-key"
export { formatKd, parseKd } from "./kd"

type AnyDb = { select: unknown; insert: unknown; update: unknown; delete: unknown } & Record<
  string,
  unknown
>

// ── txnNorm ───────────────────────────────────────────────────────────────────
// Port of Flask's _txn_norm(): normalize a transaction name for memorized-
// transaction matching. Steps match Python exactly:
//   1. lowercase + trim
//   2. replace non-[a-z0-9 Arabic-letters] with spaces
//   3. strip isolated 3+-digit numbers (reference numbers, invoice IDs, etc.)
//   4. collapse whitespace, truncate to 255

const TXN_NONWORD = /[^a-z0-9ء-ي]+/gu

export function txnNorm(value: string | null | undefined): string {
  const s = (value ?? "").toLowerCase().trim()
  const stripped = s.replace(TXN_NONWORD, " ")
  const noNums = stripped.replace(/\b\d{3,}\b/g, " ")
  return noNums.split(/\s+/).filter(Boolean).join(" ").slice(0, 255)
}

// ── learnTransaction ──────────────────────────────────────────────────────────
// Fire-and-forget upsert to memorized_transactions. Errors are swallowed so
// a failure here never blocks a transaction save.

export async function learnTransaction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  name: string,
  userId: number,
  opts: { categoryId?: number | null; merchantId?: number | null } = {},
): Promise<void> {
  const normalized = txnNorm(name)
  if (!normalized) return
  const now = new Date()
  try {
    await db
      .insert(memorizedTransactions)
      .values({
        userId,
        canonical: (name ?? "").trim().slice(0, 255),
        norm: normalized,
        categoryId: opts.categoryId ?? null,
        merchantId: opts.merchantId ?? null,
        count: 1,
        lastSeen: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          count: sql`${memorizedTransactions.count} + 1`,
          lastSeen: now,
          // Only fill category/merchant if the row currently has none.
          categoryId: sql`COALESCE(${memorizedTransactions.categoryId}, ${opts.categoryId ?? null})`,
          merchantId: sql`COALESCE(${memorizedTransactions.merchantId}, ${opts.merchantId ?? null})`,
        },
      })
  } catch (err) {
    console.error("[learnTransaction] failed:", err)
  }
}

// ── getOrCreateCategory ───────────────────────────────────────────────────────

export async function getOrCreateCategory(
  name: string | null | undefined,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return null

  const [existing] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`LOWER(${categories.name}) = LOWER(${trimmed})`))
    .limit(1)

  if (existing) return existing

  const [{ id }] = await db
    .insert(categories)
    .values({ userId, name: trimmed })
    .$returningId()
  return { id, name: trimmed }
}

// ── getOrCreateMerchant ───────────────────────────────────────────────────────

export async function getOrCreateMerchant(
  name: string | null | undefined,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return null

  const [existing] = await db
    .select({ id: merchants.id, name: merchants.name })
    .from(merchants)
    .where(and(eq(merchants.userId, userId), sql`LOWER(${merchants.name}) = LOWER(${trimmed})`))
    .limit(1)

  if (existing) return existing

  const [{ id }] = await db
    .insert(merchants)
    .values({ userId, name: trimmed })
    .$returningId()
  return { id, name: trimmed }
}

// ── validateTransactionInput ──────────────────────────────────────────────────

export type ValidatedTransactionInput = {
  date: string            // "YYYY-MM-DD"
  name: string
  amountKd: Decimal
  categoryName: string | null
  merchantName: string | null
  memo: string | null
}

export function validateTransactionInput(data: Record<string, unknown>): ValidatedTransactionInput {
  const errors: string[] = []
  const result: Partial<ValidatedTransactionInput> = {}

  const dateStr = ((data["date"] as string) ?? "").trim()
  if (!dateStr) {
    errors.push("Date is required.")
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push("Date must be in YYYY-MM-DD format.")
  } else {
    result.date = dateStr
  }

  const name = ((data["name"] as string) ?? "").trim()
  if (!name) {
    errors.push("Name is required.")
  } else if (name.length > 255) {
    errors.push("Name too long (max 255 characters).")
  } else {
    result.name = name
  }

  const amountRaw = ((data["amount_kd"] as string) ?? "").trim()
  try {
    result.amountKd = parseKd(amountRaw)
  } catch (e) {
    errors.push((e as Error).message)
  }

  const catName = ((data["category"] as string) ?? "").trim()
  if (catName && catName.length > 64) {
    errors.push("Category name too long (max 64 characters).")
  } else {
    result.categoryName = catName || null
  }

  const merchantName = ((data["merchant"] as string) ?? "").trim()
  if (merchantName && merchantName.length > 128) {
    errors.push("Merchant name too long (max 128 characters).")
  } else {
    result.merchantName = merchantName || null
  }

  const memo = ((data["memo"] as string) ?? "").trim()
  result.memo = memo ? memo.slice(0, 255) : null

  if (errors.length) throw new Error(errors.join("; "))
  return result as ValidatedTransactionInput
}

// ── forceUniqueNameKey ────────────────────────────────────────────────────────
// Returns a unique name_key for a forced-duplicate insert. Queries existing
// keys on the same (date, amountKd, userId) to find the next suffix.
// Port of Flask's force_unique_name_key().

export async function forceUniqueNameKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: {
    txnDate: string      // "YYYY-MM-DD"
    baseName: string
    amountKd: Decimal
    userId: number
    excludeTransactionId?: number | null
  },
): Promise<string> {
  const { txnDate, baseName, amountKd, userId, excludeTransactionId } = params
  const base = buildNameKey(baseName)
  const likePattern = `${base}#%`
  const amountStr = formatKd(amountKd)

  const baseCondition = and(
    eq(transactions.userId, userId),
    sql`${transactions.date} = ${txnDate}`,
    eq(transactions.amountKd, amountStr),
    or(eq(transactions.nameKey, base), sql`${transactions.nameKey} LIKE ${likePattern}`),
  )
  const condition =
    excludeTransactionId != null
      ? and(baseCondition, sql`${transactions.id} != ${excludeTransactionId}`)
      : baseCondition

  const rows: Array<{ nameKey: string }> = await db
    .select({ nameKey: transactions.nameKey })
    .from(transactions)
    .where(condition)

  const existingKeys = new Set(rows.map((r) => r.nameKey))

  if (!existingKeys.has(base)) return base

  let maxSuffix = 1
  for (const key of existingKeys) {
    if (key === base) continue
    const parts = key.split("#")
    const suffixStr = parts[parts.length - 1]
    const suffix = parseInt(suffixStr ?? "", 10)
    if (!isNaN(suffix)) maxSuffix = Math.max(maxSuffix, suffix)
  }

  return `${base}#${maxSuffix + 1}`
}

// ── createTransactionWithDupCheck ─────────────────────────────────────────────
// Core create logic: dup-check on (date, name_key, amount_kd, user_id),
// then insert. Returns { txnId, isDup, errorMsg }.
// Caller is responsible for calling learnTransaction after a successful commit.

export async function createTransactionWithDupCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  params: {
    txnDate: string
    categoryId: number | null
    merchantId: number | null
    name: string
    amountKd: Decimal
    userId: number
    force: boolean
    source?: string
  },
): Promise<{ txnId: number | null; isDup: boolean; errorMsg: string | null }> {
  const { txnDate, categoryId, merchantId, name, amountKd, userId, force, source = "manual" } =
    params

  const baseKey = buildNameKey(name)
  const amountStr = formatKd(amountKd)

  const [dupRow] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.date} = ${txnDate}`,
        eq(transactions.nameKey, baseKey),
        eq(transactions.amountKd, amountStr),
      ),
    )
    .limit(1)

  if (dupRow && !force) {
    return {
      txnId: null,
      isDup: true,
      errorMsg: "Potential duplicate found. Confirm to add anyway.",
    }
  }

  const nameKey =
    force && dupRow
      ? await forceUniqueNameKey(db, { txnDate, baseName: name, amountKd, userId })
      : baseKey

  const [{ id: txnId }] = await db
    .insert(transactions)
    .values({
      userId,
      date: new Date(`${txnDate}T00:00:00Z`),
      categoryId,
      merchantId,
      name,
      nameKey,
      amountKd: amountStr,
      source,
    })
    .$returningId()

  return { txnId, isDup: false, errorMsg: null }
}

// ── Transaction serialization ─────────────────────────────────────────────────

export type TransactionItem = {
  id: number
  date: string
  name: string
  memo: string | null
  amount_kd: string
  category: string | null
  category_id: number | null
  merchant: string | null
  merchant_id: number | null
  source: string
  source_label: string
  import_batch_id: string | null
}

export function normalizeSource(source: string | null | undefined): string {
  return ((source ?? "").trim().toLowerCase()) || "manual"
}

export function sourceLabel(source: string | null | undefined): string {
  const normalized = normalizeSource(source)
  // TODO(module-6-banksync): enrich bank_import sourceLabel with institution name
  if (normalized === "bank_import") return "Bank"
  if (normalized === "csv_import") return "CSV"
  return "Manual"
}

export function serializeTransaction(row: {
  id: number
  date: string | Date
  name: string
  memo: string | null
  amountKd: string
  source: string
  importBatchId: string | null
  categoryId: number | null
  merchantId: number | null
  categoryName: string | null
  merchantName: string | null
}): TransactionItem {
  const src = normalizeSource(row.source)
  return {
    id: row.id,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    name: row.name,
    memo: row.memo ?? null,
    amount_kd: formatKd(row.amountKd),
    category: row.categoryName ?? null,
    category_id: row.categoryId ?? null,
    merchant: row.merchantName ?? null,
    merchant_id: row.merchantId ?? null,
    source: src,
    source_label: sourceLabel(src),
    import_batch_id: row.importBatchId ?? null,
  }
}

// ── likeSafe ──────────────────────────────────────────────────────────────────
// Escape LIKE special chars. Port of Flask's _like_pattern().

export function likePattern(term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
  return `%${escaped}%`
}
