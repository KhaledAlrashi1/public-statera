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
import { importRateLimit, searchRateLimit } from "../lib/rate-limit"
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

transactionsRouter.get("/:id{[0-9]+}", requireAuth, async (c) => {
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

transactionsRouter.patch("/:id{[0-9]+}", requireAuth, async (c) => {
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

transactionsRouter.delete("/:id{[0-9]+}", requireAuth, async (c) => {
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

transactionsRouter.post("/:id{[0-9]+}/split", requireAuth, async (c) => {
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

// ── GET /api/transactions/summary ────────────────────────────────────────────

transactionsRouter.get("/summary", requireAuth, async (c) => {
  let month = (c.req.query("month") ?? "").trim()
  if (!month) {
    const now = new Date()
    month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ ok: false, data: null, error: "month must be in YYYY-MM format.", code: "validation_error" }, 400)
  }

  const { userId } = c.get("session")
  const db = getDb()

  // COUNT income vs expense transactions for the month using DATE_FORMAT
  const [incomeRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`DATE_FORMAT(${transactions.date}, '%Y-%m') = ${month}`,
        sql`(${categories.isIncome} = 1 OR ${categories.name} IS NOT NULL AND ${categories.isIncome} = 1)`,
      ),
    )
  const [expenseRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`DATE_FORMAT(${transactions.date}, '%Y-%m') = ${month}`,
        sql`(${categories.isIncome} IS NULL OR ${categories.isIncome} = 0)`,
      ),
    )

  return c.json({
    ok: true,
    data: {
      month,
      transaction_count: Number(expenseRow?.count ?? 0),
      income_count: Number(incomeRow?.count ?? 0),
    },
    error: null,
    meta: {},
  })
})

// ── GET /api/transactions/top-patterns ───────────────────────────────────────

transactionsRouter.get("/top-patterns", requireAuth, searchRateLimit, async (c) => {
  const rangeKey = (c.req.query("range") ?? "30").trim()
  if (!["30", "90", "365", "all"].includes(rangeKey)) {
    return c.json(
      { ok: false, data: null, error: "range must be one of: 30, 90, 365, all", code: "validation_error" },
      400,
    )
  }
  const { userId } = c.get("session")
  const db = getDb()

  const nameKeyExpr = sql<string>`LOWER(TRIM(${transactions.name}))`
  let whereClause = and(
    eq(transactions.userId, userId),
    sql`(${categories.isIncome} IS NULL OR ${categories.isIncome} = 0)`,
    sql`LENGTH(TRIM(${transactions.name})) > 0`,
  )

  if (rangeKey !== "all") {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Number(rangeKey))
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    whereClause = and(whereClause, sql`${transactions.date} >= ${cutoffStr}`)
  }

  const rows = await db
    .select({
      nameKey: nameKeyExpr,
      name: sql<string>`MIN(${transactions.name})`,
      count: sql<number>`COUNT(${transactions.id})`,
      sumKd: sql<string>`SUM(${transactions.amountKd})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .groupBy(nameKeyExpr)
    .orderBy(
      sql`COUNT(${transactions.id}) DESC`,
      sql`SUM(${transactions.amountKd}) DESC`,
      sql`MIN(${transactions.name}) ASC`,
    )
    .limit(3)

  return c.json({
    ok: true,
    data: {
      range: rangeKey,
      items: rows.map((r) => ({
        name: r.name ?? "",
        count: Number(r.count ?? 0),
        sum_kd: formatKd(r.sumKd ?? "0"),
      })),
    },
    error: null,
    meta: {},
  })
})

// ── GET /api/transactions/search ──────────────────────────────────────────────

transactionsRouter.get("/search", requireAuth, searchRateLimit, async (c) => {
  const q = (c.req.query("q") ?? "").trim()
  const catFilter = (c.req.query("category") ?? "").trim()
  const merchantFilter = (c.req.query("merchant") ?? "").trim()
  const dateFromRaw = (c.req.query("date_from") ?? "").trim()
  const dateToRaw = (c.req.query("date_to") ?? "").trim()
  const incomeOnly = argBool(c.req.query("income_only"))
  const excludeIncome = argBool(c.req.query("exclude_income"))
  const sourceFilter = (c.req.query("source") ?? "").trim().toLowerCase()
  const rawLimit = c.req.query("limit")
  const rawOffset = c.req.query("offset")
  const includeTotal = argBool(c.req.query("include_total"), true)

  if (incomeOnly && excludeIncome) {
    return c.json(
      { ok: false, data: null, error: "income_only and exclude_income cannot both be true.", code: "validation_error" },
      400,
    )
  }

  let limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 20
  let offset = rawOffset !== undefined ? parseInt(rawOffset, 10) : 0
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return c.json({ ok: false, data: null, error: "limit must be between 1 and 100.", code: "validation_error" }, 400)
  }
  if (isNaN(offset) || offset < 0) {
    return c.json({ ok: false, data: null, error: "offset must be >= 0.", code: "validation_error" }, 400)
  }

  if (dateFromRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateFromRaw)) {
    return c.json({ ok: false, data: null, error: "date_from must be in YYYY-MM-DD format.", code: "validation_error" }, 400)
  }
  if (dateToRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateToRaw)) {
    return c.json({ ok: false, data: null, error: "date_to must be in YYYY-MM-DD format.", code: "validation_error" }, 400)
  }
  if (dateFromRaw && dateToRaw && dateFromRaw > dateToRaw) {
    return c.json(
      { ok: false, data: null, error: "date_from must be on or before date_to.", code: "invalid_date_range" },
      400,
    )
  }

  const { userId } = c.get("session")
  const db = getDb()

  const catIds = catFilter
    ? await resolveNameFilterIds(catFilter, userId, db, "category")
    : null
  const merIds = merchantFilter
    ? await resolveNameFilterIds(merchantFilter, userId, db, "merchant")
    : null

  if ((catFilter && !catIds) || (merchantFilter && !merIds)) {
    return emptySearchResponse(offset, limit)
  }

  let where = and(eq(transactions.userId, userId))

  if (q) {
    const like = likePattern(q)
    where = and(
      where,
      or(
        sql`${transactions.name} LIKE ${like} ESCAPE '\\'`,
        sql`${categories.name} LIKE ${like} ESCAPE '\\'`,
        sql`${merchants.name} LIKE ${like} ESCAPE '\\'`,
      ),
    )
  }
  if (catIds) where = and(where, inArray(transactions.categoryId as Parameters<typeof inArray>[0], catIds))
  if (merIds) where = and(where, inArray(transactions.merchantId as Parameters<typeof inArray>[0], merIds))
  if (dateFromRaw) where = and(where, sql`${transactions.date} >= ${dateFromRaw}`)
  if (dateToRaw) where = and(where, sql`${transactions.date} <= ${dateToRaw}`)
  if (incomeOnly) where = and(where, sql`${categories.isIncome} = 1`)
  else if (excludeIncome) where = and(where, sql`(${categories.isIncome} IS NULL OR ${categories.isIncome} = 0)`)

  const selectFields = {
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
  }

  let total = -1
  let hasMore: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[]

  if (includeTotal) {
    // Count first so the DB call sequence is predictable for tests
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
    total = Number(countRow?.count ?? 0)
    rows = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
      .orderBy(sql`${transactions.date} DESC`, sql`${transactions.id} DESC`)
      .offset(offset)
      .limit(limit)
    hasMore = offset + rows.length < total
  } else {
    rows = await db
      .select(selectFields)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
      .orderBy(sql`${transactions.date} DESC`, sql`${transactions.id} DESC`)
      .offset(offset)
      .limit(limit + 1)
    hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)
  }

  const items = rows.map((r) => serializeTransaction(r))

  // DataAccessLog for bank_sync source filter
  // TODO(module-6-banksync): validate connection_id/consent_id ownership
  if (sourceFilter === "bank_sync") {
    const { dataAccessLogs } = await import("../db/schema/data-access-logs")
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    const dates = items.map((i) => i.date).sort()
    try {
      await db.insert(dataAccessLogs).values({
        userId,
        action: "transactions.search",
        recordsAccessed: items.length,
        dateRangeStart: dates[0] ? new Date(`${dates[0]}T00:00:00Z`) : undefined,
        dateRangeEnd: dates[dates.length - 1] ? new Date(`${dates[dates.length - 1]}T00:00:00Z`) : undefined,
        ipAddress: ip.slice(0, 64),
      })
    } catch {
      // Non-critical — don't fail the response
    }
  }

  const meta = { total, offset, limit, has_more: hasMore }
  return c.json({
    ok: true,
    data: { items },
    error: null,
    meta,
  })
})

// ── GET /api/transactions/by-category ────────────────────────────────────────

transactionsRouter.get("/by-category", requireAuth, async (c) => {
  const category = (c.req.query("category") ?? "").trim()
  if (!category) {
    return c.json({ ok: false, data: null, error: "category is required.", code: "validation_error" }, 400)
  }
  const q = (c.req.query("q") ?? "").trim()
  const month = (c.req.query("month") ?? "").trim() || null
  const rawLimit = c.req.query("limit")
  const rawOffset = c.req.query("offset")
  const includeTotal = argBool(c.req.query("include_total"), true)

  let limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 20
  let offset = rawOffset !== undefined ? parseInt(rawOffset, 10) : 0
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return c.json({ ok: false, data: null, error: "limit must be between 1 and 100.", code: "validation_error" }, 400)
  }
  if (isNaN(offset) || offset < 0) {
    return c.json({ ok: false, data: null, error: "offset must be >= 0.", code: "validation_error" }, 400)
  }

  const { userId } = c.get("session")
  const db = getDb()

  const catIds = await resolveNameFilterIds(category, userId, db, "category")
  if (!catIds) {
    return c.json({
      ok: true,
      data: { category, month, items: [] },
      error: null,
      meta: { total: 0, offset, limit, has_more: false },
    })
  }

  let where = and(
    eq(transactions.userId, userId),
    inArray(transactions.categoryId as Parameters<typeof inArray>[0], catIds),
  )
  if (month) where = and(where, sql`DATE_FORMAT(${transactions.date}, '%Y-%m') = ${month}`)
  if (q) {
    const like = likePattern(q)
    where = and(where, sql`${transactions.name} LIKE ${like} ESCAPE '\\'`)
  }

  const byCatFields = {
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
  }

  let total = -1
  let hasMore: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[]

  if (includeTotal) {
    // Count first so the DB call sequence is predictable for tests
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
    total = Number(countRow?.count ?? 0)
    rows = await db
      .select(byCatFields)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
      .orderBy(sql`${transactions.date} DESC`, sql`${transactions.id} DESC`)
      .offset(offset)
      .limit(limit)
    hasMore = offset + rows.length < total
  } else {
    rows = await db
      .select(byCatFields)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
      .orderBy(sql`${transactions.date} DESC`, sql`${transactions.id} DESC`)
      .offset(offset)
      .limit(limit + 1)
    hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)
  }

  return c.json({
    ok: true,
    data: { category, month, items: rows.map((r) => serializeTransaction(r)) },
    error: null,
    meta: { total, offset, limit, has_more: hasMore },
  })
})

// ── GET /api/transactions/dup-check ──────────────────────────────────────────

transactionsRouter.get("/dup-check", requireAuth, async (c) => {
  const dateParam = (c.req.query("date") ?? "").trim()
  const nameParam = (c.req.query("name") ?? "").trim()
  const amountParam = (c.req.query("amount_kd") ?? "").trim()

  if (!dateParam || !nameParam || !amountParam) {
    return c.json(
      { ok: false, data: null, error: "date, name, amount_kd are required.", code: "validation_error" },
      400,
    )
  }

  let amountKd: string
  try {
    amountKd = formatKd(parseKd(amountParam))
  } catch {
    return c.json(
      { ok: false, data: null, error: "Invalid duplicate-check payload.", code: "validation_error" },
      400,
    )
  }

  const nameKey = buildNameKey(nameParam)
  const { userId } = c.get("session")
  const db = getDb()

  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.date} = ${dateParam}`,
        eq(transactions.nameKey, nameKey),
        eq(transactions.amountKd, amountKd),
      ),
    )

  return c.json({ ok: true, data: { count: Number(row?.count ?? 0) }, error: null, meta: {} })
})

// ── Private helpers ───────────────────────────────────────────────────────────

function argBool(val: string | undefined, defaultVal = false): boolean {
  if (val === undefined) return defaultVal
  return ["1", "true", "yes", "on"].includes(val.trim().toLowerCase())
}

function emptySearchResponse(offset: number, limit: number) {
  return Response.json({
    ok: true,
    data: { items: [] },
    error: null,
    meta: { total: 0, offset, limit, has_more: false },
  })
}

async function resolveNameFilterIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name: string, userId: number, db: any, type: "category" | "merchant",
): Promise<number[] | null> {
  if (!name) return null
  const table = type === "category" ? categories : merchants
  const rows: Array<{ id: number }> = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), sql`LOWER(${table.name}) LIKE LOWER(${`%${name}%`})`))
  if (!rows.length) return null
  return rows.map((r) => r.id)
}

// ── Placeholder for bulk + import-batch (commit 4) ────────────────────────────
// POST /bulk-delete, POST /bulk-update, DELETE /import-batch/:batch_id

// Re-export helpers needed by the upload module (commit 3b)
export { buildNameKey, formatKd, parseKd, likePattern }
