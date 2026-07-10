// Response envelope contract (matches Flask api_response.py):
//   Success: { ok: true,  data: <resource>,  error: null, meta: {} }
//   Error:   { ok: false, data: null,         error: <string>, code: <string>, ...extras }
//
// Resource shapes for this module:
//   GET  /api/categories          → data: { items: CategoryItem[] }
//   POST /api/categories          → data: { item: CategoryItem }          status 201
//   DELETE /api/categories/:id    → data: { deleted: true }               ?reassign_to=<id>
//   POST /api/categories/:id/remap → data: RemapCounts
//
// Deviation from Flask POST /api/categories:
//   Flask silently returned 200 + existing category on duplicate name.
//   Here we return 409 "category_name_exists" with the existing item in the
//   payload so the frontend can recover without a follow-up GET.
//   POST means create-new; the 409 payload contains the existing item.

import { Hono } from "hono"
import { z } from "zod"
import { and, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { budgets } from "../db/schema/budgets"
import { savingsGoals } from "../db/schema/savings-goals"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { requireAuth } from "../middleware/auth"
import { readRateLimit, writeRateLimit, heavyWriteRateLimit } from "../lib/rate-limit"

export const categoriesRouter = new Hono()

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CreateBody = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(64, "Name too long (max 64 characters).")
    .trim(),
  is_income: z.boolean().optional().default(false),
})

const RemapBody = z.object({
  target_id: z.number().int().positive("target_id must be a positive integer."),
})

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoryItem = {
  id: number
  name: string
  is_income: boolean
  is_system: boolean
  transaction_count: number
}

type RemapCounts = {
  remapped_count: number
  budget_count: number
  goal_count: number
  memorized_count: number
}

function serializeCategory(
  row: typeof categories.$inferSelect,
  transactionCount = 0,
): CategoryItem {
  return {
    id: row.id,
    name: row.name,
    is_income: row.isIncome ?? false,
    is_system: row.isSystem,
    transaction_count: transactionCount,
  }
}

// ── GET /api/categories ───────────────────────────────────────────────────────

categoriesRouter.get("/", requireAuth, readRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(sql`LOWER(${categories.name})`, categories.id)

  let items: CategoryItem[]
  if (cats.length === 0) {
    items = []
  } else {
    const catIds = cats.map((cat) => cat.id)
    const countRows = await db
      .select({
        categoryId: transactions.categoryId,
        count: sql<number>`COUNT(${transactions.id})`,
      })
      .from(transactions)
      // transactions.categoryId is nullable; inArray skips NULLs at runtime
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.categoryId as Parameters<typeof inArray>[0], catIds),
        ),
      )
      .groupBy(transactions.categoryId)

    const countMap = new Map(countRows.map((r) => [r.categoryId, Number(r.count)]))
    items = cats.map((cat) => serializeCategory(cat, countMap.get(cat.id) ?? 0))
  }

  return c.json({ ok: true, data: { items }, error: null, meta: {} })
})

// ── POST /api/categories ──────────────────────────────────────────────────────

categoriesRouter.post("/", requireAuth, writeRateLimit, async (c) => {
  const { userId } = c.get("session")

  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Validation error."
    return c.json({ ok: false, data: null, error: msg, code: "validation_error" }, 400)
  }
  const { name, is_income } = parsed.data

  const db = getDb()
  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`LOWER(${categories.name}) = LOWER(${name})`))
    .limit(1)

  if (existing) {
    return c.json(
      {
        ok: false,
        data: null,
        error: `A category named '${existing.name}' already exists.`,
        code: "category_name_exists",
        existing_item: serializeCategory(existing),
      },
      409,
    )
  }

  const [{ id: newId }] = await db
    .insert(categories)
    .values({ userId, name, isIncome: is_income })
    .$returningId()

  const [created] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, newId))
    .limit(1)

  return c.json(
    { ok: true, data: { item: serializeCategory(created) }, error: null, meta: {} },
    201,
  )
})

// ── DELETE /api/categories/:id ────────────────────────────────────────────────
// Dependent-row reassignment uses ?reassign_to=<id> query param — not a JSON
// body. DELETE-with-body is silently dropped by some proxies and CDNs, and
// query params are universally supported by HTTP clients and OpenAPI tooling.

categoriesRouter.delete("/:id", requireAuth, writeRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(
      { ok: false, data: null, error: "Invalid category id.", code: "validation_error" },
      400,
    )
  }
  const { userId } = c.get("session")
  const db = getDb()

  const [cat] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1)

  if (!cat) {
    return c.json(
      { ok: false, data: null, error: "Category not found.", code: "not_found" },
      404,
    )
  }
  if (cat.isSystem) {
    return c.json(
      {
        ok: false,
        data: null,
        error: `'${cat.name}' is a system category and cannot be deleted.`,
        code: "system_category_protected",
      },
      403,
    )
  }

  const counts = await _getDependentCounts(db, id, userId)
  const hasDependents = Object.values(counts).some((n) => n > 0)

  const reassignParam = c.req.query("reassign_to")
  const reassignId = reassignParam !== undefined && reassignParam !== "" ? Number(reassignParam) : null

  if (hasDependents && reassignId === null) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "This category has dependent rows. Provide 'reassign_to' to move them first.",
        code: "has_dependents",
        dependent_counts: counts,
      },
      409,
    )
  }

  if (reassignId !== null) {
    if (!Number.isInteger(reassignId) || reassignId <= 0) {
      return c.json(
        { ok: false, data: null, error: "'reassign_to' must be a valid category id.", code: "validation_error" },
        400,
      )
    }
    if (reassignId === id) {
      return c.json(
        { ok: false, data: null, error: "'reassign_to' must be a different category.", code: "validation_error" },
        400,
      )
    }
    const [target] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, reassignId), eq(categories.userId, userId)))
      .limit(1)
    if (!target) {
      return c.json(
        { ok: false, data: null, error: "Reassignment target not found.", code: "not_found" },
        404,
      )
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (hasDependents && reassignId !== null) {
        await _checkBudgetConflict(tx, id, reassignId, userId)
        await tx
          .update(transactions)
          .set({ categoryId: reassignId })
          .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id)))
        await tx
          .update(budgets)
          .set({ categoryId: reassignId })
          .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, id)))
        await tx
          .update(savingsGoals)
          .set({ linkedCategoryId: reassignId })
          .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.linkedCategoryId, id)))
        await tx
          .update(memorizedTransactions)
          .set({ categoryId: reassignId })
          .where(and(eq(memorizedTransactions.userId, userId), eq(memorizedTransactions.categoryId, id)))
      }
      await tx.delete(categories).where(eq(categories.id, id))
    })
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; conflicting_periods?: string[] }
    if (e?.code === "budget_conflict") {
      return c.json(
        {
          ok: false,
          data: null,
          error: e.message ?? "Budget conflict.",
          code: "budget_conflict",
          conflicting_periods: e.conflicting_periods ?? [],
        },
        409,
      )
    }
    throw err
  }

  return c.json({ ok: true, data: { deleted: true }, error: null, meta: {} })
})

// ── POST /api/categories/:id/remap ────────────────────────────────────────────

categoriesRouter.post("/:id/remap", requireAuth, heavyWriteRateLimit, async (c) => {
  const sourceId = Number(c.req.param("id"))
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return c.json(
      { ok: false, data: null, error: "Invalid category id.", code: "validation_error" },
      400,
    )
  }
  const { userId } = c.get("session")

  const body = await c.req.json().catch(() => ({}))
  const parsed = RemapBody.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, data: null, error: "target_id is required.", code: "validation_error" },
      400,
    )
  }
  const { target_id } = parsed.data

  if (sourceId === target_id) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "source_id and target_id must be different.",
        code: "validation_error",
      },
      400,
    )
  }

  const db = getDb()
  const [[source], [target]] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(and(eq(categories.id, sourceId), eq(categories.userId, userId)))
      .limit(1),
    db
      .select()
      .from(categories)
      .where(and(eq(categories.id, target_id), eq(categories.userId, userId)))
      .limit(1),
  ])

  if (!source) {
    return c.json(
      { ok: false, data: null, error: "Source category not found.", code: "not_found" },
      404,
    )
  }
  if (!target) {
    return c.json(
      { ok: false, data: null, error: "Target category not found.", code: "not_found" },
      404,
    )
  }
  if (source.isSystem) {
    return c.json(
      { ok: false, data: null, error: "Cannot remap a system category.", code: "validation_error" },
      400,
    )
  }

  let remapCounts!: RemapCounts
  try {
    await db.transaction(async (tx) => {
      await _checkBudgetConflict(tx, sourceId, target_id, userId)

      // Count rows before updating so the response reflects actual changes.
      const [[txnRow], [budRow], [goalRow], [memRow]] = await Promise.all([
        tx.select({ count: sql<number>`COUNT(*)` }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.categoryId, sourceId))),
        tx.select({ count: sql<number>`COUNT(*)` }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, sourceId))),
        tx.select({ count: sql<number>`COUNT(*)` }).from(savingsGoals).where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.linkedCategoryId, sourceId))),
        tx.select({ count: sql<number>`COUNT(*)` }).from(memorizedTransactions).where(and(eq(memorizedTransactions.userId, userId), eq(memorizedTransactions.categoryId, sourceId))),
      ])

      await tx
        .update(transactions)
        .set({ categoryId: target_id })
        .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, sourceId)))
      await tx
        .update(budgets)
        .set({ categoryId: target_id })
        .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, sourceId)))
      await tx
        .update(savingsGoals)
        .set({ linkedCategoryId: target_id })
        .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.linkedCategoryId, sourceId)))
      await tx
        .update(memorizedTransactions)
        .set({ categoryId: target_id })
        .where(and(eq(memorizedTransactions.userId, userId), eq(memorizedTransactions.categoryId, sourceId)))

      remapCounts = {
        remapped_count: Number(txnRow?.count ?? 0),
        budget_count: Number(budRow?.count ?? 0),
        goal_count: Number(goalRow?.count ?? 0),
        memorized_count: Number(memRow?.count ?? 0),
      }
    })
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; conflicting_periods?: string[] }
    if (e?.code === "budget_conflict") {
      return c.json(
        {
          ok: false,
          data: null,
          error: e.message ?? "Budget conflict.",
          code: "budget_conflict",
          conflicting_periods: e.conflicting_periods ?? [],
        },
        409,
      )
    }
    throw err
  }

  return c.json({ ok: true, data: remapCounts, error: null, meta: {} })
})

// ── Private helpers ───────────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof getDb>

async function _getDependentCounts(
  db: AnyDb,
  categoryId: number,
  userId: number,
): Promise<{ transactions: number; budgets: number; goals: number; memorized: number }> {
  const [[txnRow], [budRow], [goalRow], [memRow]] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.categoryId, categoryId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(savingsGoals).where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.linkedCategoryId, categoryId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(memorizedTransactions).where(and(eq(memorizedTransactions.userId, userId), eq(memorizedTransactions.categoryId, categoryId))),
  ])
  return {
    transactions: Number(txnRow?.count ?? 0),
    budgets: Number(budRow?.count ?? 0),
    goals: Number(goalRow?.count ?? 0),
    memorized: Number(memRow?.count ?? 0),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _checkBudgetConflict(tx: any, sourceId: number, targetId: number, userId: number): Promise<void> {
  const [sourceBudgets, targetBudgets] = await Promise.all([
    tx.select({ month: budgets.month }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, sourceId))),
    tx.select({ month: budgets.month }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, targetId))),
  ])

  const sourceMonths = new Set((sourceBudgets as { month: string }[]).map((r) => r.month))
  const conflicting = (targetBudgets as { month: string }[])
    .map((r) => r.month)
    .filter((m) => sourceMonths.has(m))
    .sort()

  if (conflicting.length > 0) {
    throw Object.assign(
      new Error("Both categories have budgets for the same period(s). Resolve before reassigning."),
      { code: "budget_conflict", conflicting_periods: conflicting },
    )
  }
}
