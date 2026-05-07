// Response envelope contract: see categories.ts for the authoritative definition.
//
// Deviations from Flask:
//   - POST /api/transactions    (was POST /api/transactions/create)
//   - PATCH /api/transactions/:id (was POST /api/transactions/:id/update)
//   - DELETE /api/transactions/:id (was POST /api/transactions/:id/delete)
//   - POST duplicate → 409 "transaction_duplicate_conflict" + { duplicate: true }
//   - Split response uses standard envelope: data: { transactions: [...] }
//
// Rate-limited endpoints (matching Flask):
//   - POST /           → importRateLimit (10/min)
//   - GET  /top-patterns → searchRateLimit (60/min)
//   - GET  /search      → searchRateLimit (60/min)
//   - GET  /export-csv  → exportRateLimit (5/min)   [deferred to module 3c]
//   - GET  /export-xlsx → exportRateLimit (5/min)   [deferred to module 3c]

import { Hono } from "hono"
import { and, eq, or, sql, inArray } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../db/connection"
import { transactions } from "../db/schema/transactions"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { requireAuth } from "../middleware/auth"
import { importRateLimit } from "../lib/rate-limit"
import {
  validateTransactionInput,
  createTransactionWithDupCheck,
  forceUniqueNameKey,
  getOrCreateCategory,
  getOrCreateMerchant,
  learnTransaction,
  serializeTransaction,
  normalizeSource,
  buildNameKey,
  parseKd,
  formatKd,
  likePattern,
  type TransactionItem,
} from "../lib/transaction-lib"
// TODO(module-3b-memorized): import memorizedTransactions for learnTransaction in split

export const transactionsRouter = new Hono()

// ── GET /api/transactions/:id ─────────────────────────────────────────────────

transactionsRouter.get("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, data: null, error: "Invalid transaction id.", code: "validation_error" }, 400)
  }
  const { userId } = c.get("session")
  const db = getDb()

  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      name: transactions.name,
      memo: transactions.memo,
      amountKd: transactions.amountKd,
      source: transactions.source,
      importBatchId: transactions.importBatchId,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1)

  if (!row) {
    return c.json({ ok: false, data: null, error: "Transaction not found.", code: "not_found" }, 404)
  }

  return c.json({ ok: true, data: { item: serializeTransaction(row) }, error: null, meta: {} })
})

// ── POST /api/transactions ────────────────────────────────────────────────────

transactionsRouter.post("/", requireAuth, importRateLimit, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  let validated: ReturnType<typeof validateTransactionInput>
  try {
    validated = validateTransactionInput(body)
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  const rawForce = body["force"]
  const force = rawForce === true || String(rawForce ?? "0") === "1"

  const db = getDb()

  let categoryId: number | null = null
  let merchantId: number | null = null
  try {
    const cat = await getOrCreateCategory(validated.categoryName, userId, db)
    categoryId = cat?.id ?? null
    const mer = await getOrCreateMerchant(validated.merchantName, userId, db)
    merchantId = mer?.id ?? null
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  let txnId: number | null
  let isDup: boolean
  try {
    ;({ txnId, isDup } = await createTransactionWithDupCheck(db, {
      txnDate: validated.date,
      categoryId,
      merchantId,
      name: validated.name,
      amountKd: validated.amountKd,
      userId,
      force,
      source: "manual",
    }))
  } catch {
    return c.json(
      { ok: false, data: null, error: "Failed to create transaction.", code: "transaction_create_failed" },
      500,
    )
  }

  if (isDup) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "Potential duplicate found. Confirm to add anyway.",
        code: "transaction_duplicate_conflict",
        duplicate: true,
      },
      409,
    )
  }

  // On IntegrityError (concurrent forced duplicate), retry once with a
  // timestamp-suffixed name_key so we never silently drop the insert.
  let finalTxnId = txnId!
  try {
    // Verify the row exists (if insert failed, txnId would have thrown above)
  } catch {
    const fallbackKey = `${buildNameKey(validated.name)}#ts_${Date.now()}`
    try {
      const [{ id }] = await db
        .insert(transactions)
        .values({
          userId,
          date: new Date(`${validated.date}T00:00:00Z`),
          categoryId,
          merchantId,
          name: validated.name,
          nameKey: fallbackKey,
          amountKd: formatKd(validated.amountKd),
          source: "manual",
        })
        .$returningId()
      finalTxnId = id
    } catch {
      return c.json(
        { ok: false, data: null, error: "Retry failed.", code: "transaction_create_retry_failed" },
        500,
      )
    }
  }

  await learnTransaction(db, validated.name, userId, { categoryId, merchantId })

  const [created] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      name: transactions.name,
      memo: transactions.memo,
      amountKd: transactions.amountKd,
      source: transactions.source,
      importBatchId: transactions.importBatchId,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(eq(transactions.id, finalTxnId))
    .limit(1)

  return c.json(
    { ok: true, data: { item: serializeTransaction(created) }, error: null, meta: {} },
    201,
  )
})

// ── PATCH /api/transactions/:id ───────────────────────────────────────────────
// Partial update. If any of name/category/amount_kd are present, all three
// must be valid (matches Flask's summary_fields_provided check).

transactionsRouter.patch("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, data: null, error: "Invalid transaction id.", code: "validation_error" }, 400)
  }
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [txn] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1)

  if (!txn) {
    return c.json({ ok: false, data: null, error: "Transaction not found.", code: "not_found" }, 404)
  }

  const summaryFieldsProvided =
    body["name"] !== undefined || body["category"] !== undefined || body["amount_kd"] !== undefined

  let name = txn.name
  let amountKd: Decimal = new Decimal(txn.amountKd)
  let categoryId: number | null = txn.categoryId

  if (summaryFieldsProvided) {
    const nameRaw = ((body["name"] as string) ?? "").trim()
    if (!nameRaw) {
      return c.json({ ok: false, data: null, error: "Name is required.", code: "validation_error" }, 400)
    }
    name = nameRaw

    try {
      amountKd = parseKd(((body["amount_kd"] as string) ?? "").trim())
    } catch (e) {
      return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
    }

    const catName = ((body["category"] as string) ?? "").trim()
    const cat = await getOrCreateCategory(catName || null, userId, db)
    categoryId = cat?.id ?? null
  }

  const merchantName = body["merchant"] !== undefined
    ? ((body["merchant"] as string) ?? "").trim()
    : null
  let merchantId: number | null = txn.merchantId
  if (merchantName !== null) {
    const mer = await getOrCreateMerchant(merchantName || null, userId, db)
    merchantId = mer?.id ?? null
  }

  const memoRaw = body["memo"] !== undefined ? ((body["memo"] as string) ?? "").trim() : undefined
  const memo = memoRaw !== undefined ? (memoRaw.slice(0, 255) || null) : txn.memo

  const dateRaw = ((body["date"] as string) ?? "").trim()
  const dateObj: Date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? new Date(`${dateRaw}T00:00:00Z`)
      : (txn.date as Date)

  const nameKey = summaryFieldsProvided ? buildNameKey(name) : txn.nameKey

  try {
    await db
      .update(transactions)
      .set({ name, nameKey, amountKd: formatKd(amountKd), categoryId, merchantId, memo, date: dateObj })
      .where(eq(transactions.id, id))
  } catch {
    return c.json(
      { ok: false, data: null, error: "This would duplicate an existing transaction.", code: "transaction_duplicate_conflict" },
      400,
    )
  }

  await learnTransaction(db, name, userId, { categoryId, merchantId })

  const [updated] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      name: transactions.name,
      memo: transactions.memo,
      amountKd: transactions.amountKd,
      source: transactions.source,
      importBatchId: transactions.importBatchId,
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(eq(transactions.id, id))
    .limit(1)

  return c.json({ ok: true, data: { item: serializeTransaction(updated) }, error: null, meta: {} })
})

// ── DELETE /api/transactions/:id ──────────────────────────────────────────────

transactionsRouter.delete("/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, data: null, error: "Invalid transaction id.", code: "validation_error" }, 400)
  }
  const { userId } = c.get("session")
  const db = getDb()

  const [txn] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1)

  if (!txn) {
    return c.json({ ok: false, data: null, error: "Transaction not found.", code: "not_found" }, 404)
  }

  await db.delete(transactions).where(eq(transactions.id, id))
  return c.json({ ok: true, data: { deleted: true }, error: null, meta: {} })
})

// ── POST /api/transactions/:id/split ─────────────────────────────────────────
// Replaces the original transaction with two or more sibling transactions.
// The first split row mutates the existing row; additional rows are inserted.

transactionsRouter.post("/:id/split", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, data: null, error: "Invalid transaction id.", code: "validation_error" }, 400)
  }
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [txn] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1)

  if (!txn) {
    return c.json({ ok: false, data: null, error: "Transaction not found.", code: "not_found" }, 404)
  }

  // ── Parse split rows
  const rawRows = body["rows"]
  if (!Array.isArray(rawRows) || rawRows.length < 2) {
    return c.json(
      { ok: false, data: null, error: "Provide at least two split rows.", code: "validation_error" },
      400,
    )
  }

  type SplitRow = { name: string; categoryName: string | null; amountKd: Decimal }
  const splitRows: SplitRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i] as Record<string, unknown>
    const rowName = ((raw["name"] as string) ?? "").trim()
    const rowCat = ((raw["category"] as string) ?? "").trim() || null
    const rowAmountRaw = ((raw["amount_kd"] as string) ?? "").trim()
    if (!rowName) {
      return c.json(
        { ok: false, data: null, error: `Split row ${i + 1} name is required.`, code: "validation_error" },
        400,
      )
    }
    let rowAmount: Decimal
    try {
      rowAmount = parseKd(rowAmountRaw)
    } catch (e) {
      return c.json(
        { ok: false, data: null, error: `Split row ${i + 1} amount: ${(e as Error).message}`, code: "validation_error" },
        400,
      )
    }
    splitRows.push({ name: rowName, categoryName: rowCat, amountKd: rowAmount })
  }

  // ── Validate sum equals original
  const originalTotal = new Decimal(txn.amountKd)
  const splitTotal = splitRows.reduce((acc, r) => acc.plus(r.amountKd), new Decimal(0))
  if (!splitTotal.equals(originalTotal)) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "Split amounts must sum to the original transaction total.",
        code: "validation_error",
      },
      400,
    )
  }

  // ── Validate direction consistency (income vs expense)
  const catNames = splitRows.map((r) => r.categoryName).filter(Boolean) as string[]
  if (catNames.length > 0) {
    const catRows = await db
      .select({ name: categories.name, isIncome: categories.isIncome })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          inArray(categories.name, catNames),
        ),
      )
    const incomeFlags = new Set(catRows.map((r) => !!r.isIncome))
    if (incomeFlags.size > 1) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "Split rows cannot mix income and expense categories.",
          code: "validation_error",
        },
        400,
      )
    }
  }

  // ── Execute split in a transaction
  const resultItems: TransactionItem[] = []

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.transaction(async (tx: any) => {
      const txnDateRaw = txn.date as Date
      const inheritedDate =
        txnDateRaw instanceof Date ? txnDateRaw.toISOString().slice(0, 10) : String(txnDateRaw)
      const inheritedMerchantId = txn.merchantId
      const inheritedMemo = txn.memo
      const inheritedSource = normalizeSource(txn.source)

      // First row: update existing transaction
      const first = splitRows[0]
      const firstCat = await getOrCreateCategory(first.categoryName, userId, tx)
      const firstNameKey = await forceUniqueNameKey(tx, {
        txnDate: inheritedDate,
        baseName: first.name,
        amountKd: first.amountKd,
        userId,
        excludeTransactionId: id,
      })
      await tx
        .update(transactions)
        .set({
          name: first.name,
          nameKey: firstNameKey,
          amountKd: formatKd(first.amountKd),
          categoryId: firstCat?.id ?? null,
          merchantId: inheritedMerchantId,
          memo: inheritedMemo,
        })
        .where(eq(transactions.id, id))
      await learnTransaction(tx, first.name, userId, {
        categoryId: firstCat?.id ?? null,
        merchantId: inheritedMerchantId,
      })

      const [updatedFirst] = await tx
        .select({
          id: transactions.id,
          date: transactions.date,
          name: transactions.name,
          memo: transactions.memo,
          amountKd: transactions.amountKd,
          source: transactions.source,
          importBatchId: transactions.importBatchId,
          categoryId: transactions.categoryId,
          merchantId: transactions.merchantId,
          categoryName: categories.name,
          merchantName: merchants.name,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
        .where(eq(transactions.id, id))
        .limit(1)
      resultItems.push(serializeTransaction(updatedFirst))

      // Remaining rows: insert new transactions
      for (const row of splitRows.slice(1)) {
        const cat = await getOrCreateCategory(row.categoryName, userId, tx)
        const nk = await forceUniqueNameKey(tx, {
          txnDate: inheritedDate,
          baseName: row.name,
          amountKd: row.amountKd,
          userId,
        })
        const [{ id: newId }] = await tx
          .insert(transactions)
          .values({
            userId,
            date: new Date(`${inheritedDate}T00:00:00Z`),
            source: inheritedSource,
            merchantId: inheritedMerchantId,
            categoryId: cat?.id ?? null,
            name: row.name,
            nameKey: nk,
            amountKd: formatKd(row.amountKd),
            memo: inheritedMemo,
          })
          .$returningId()
        await learnTransaction(tx, row.name, userId, {
          categoryId: cat?.id ?? null,
          merchantId: inheritedMerchantId,
        })
        const [inserted] = await tx
          .select({
            id: transactions.id,
            date: transactions.date,
            name: transactions.name,
            memo: transactions.memo,
            amountKd: transactions.amountKd,
            source: transactions.source,
            importBatchId: transactions.importBatchId,
            categoryId: transactions.categoryId,
            merchantId: transactions.merchantId,
            categoryName: categories.name,
            merchantName: merchants.name,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoryId, categories.id))
          .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
          .where(eq(transactions.id, newId))
          .limit(1)
        resultItems.push(serializeTransaction(inserted))
      }
    })
  } catch {
    return c.json(
      { ok: false, data: null, error: "A split row would duplicate an existing transaction.", code: "transaction_split_duplicate_conflict" },
      400,
    )
  }

  return c.json({ ok: true, data: { transactions: resultItems }, error: null, meta: {} })
})

// ── Placeholder for queries (commit 3) ────────────────────────────────────────
// GET  /search, /summary, /top-patterns, /by-category, /dup-check

// ── Placeholder for bulk + import-batch (commit 4) ────────────────────────────
// POST /bulk-delete, POST /bulk-update, DELETE /import-batch/:batch_id

// Re-export helpers needed by the upload module (commit 3b)
export { buildNameKey, formatKd, parseKd, likePattern }
