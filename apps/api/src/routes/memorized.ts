// Memorized POST/PATCH does name lookup only — does not create categories or
// merchants. This differs from transactions CRUD (getOrCreateCategory)
// intentionally. Memorized is rules-editing; missing names are typos, not
// creation intent. Silently creating categories here produces ghost categories.

import { Hono } from "hono"
import { z } from "zod"
import { and, eq, ne, inArray, or, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { categories } from "../db/schema/categories"
import { merchants } from "../db/schema/merchants"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { Sentry } from "../lib/sentry"
import { nullsLastDesc } from "../db/sql-helpers"
import { txnNorm } from "../lib/transaction-lib"
import { zodErrorToEnvelope } from "./route-helpers"

export const memorizedRouter = new Hono()

// B2-3 — bulk-delete body shape. `ids` is z.unknown() + superRefine (non-array →
// custom message, not zod's default); ordered first-fail via early return (D3).
// DISTINCT over-limit message "…entries…" vs transactions' "…transactions…" (D5) —
// preserved verbatim, not unified.
const MemorizedBulkDeleteSchema = z.object({ ids: z.unknown() }).superRefine((v, ctx) => {
  if (!Array.isArray(v.ids) || v.ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ids must be a non-empty list." })
    return
  }
  if (v.ids.length > 200) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cannot delete more than 200 entries at once." })
    return
  }
})

// ── Constants ─────────────────────────────────────────────────────────────────

const PRUNE_DAYS_COUNT_1 = 90   // count==1 rows older than 90 days
const PRUNE_DAYS_COUNT_2 = 180  // count==2 rows older than 180 days

const VALID_SORT_KEYS = ["most_used", "recently_used", "oldest_first", "name_asc", "name_desc"] as const
type SortKey = (typeof VALID_SORT_KEYS)[number]

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeMemorized(row: {
  id: number
  canonical: string
  count: number
  lastSeen: Date | string
  isPinned: boolean | number
  pinnedAt: Date | string | null
  categoryId: number | null
  merchantId: number | null
  categoryName: string | null
  merchantName: string | null
}) {
  return {
    id: row.id,
    canonical: row.canonical,
    category:
      row.categoryId != null && row.categoryName != null
        ? { id: row.categoryId, name: row.categoryName }
        : null,
    merchant:
      row.merchantId != null && row.merchantName != null
        ? { id: row.merchantId, name: row.merchantName }
        : null,
    count: row.count,
    // Match Flask's format: "2026-04-15T10:00:00+00:00" (no milliseconds, +00:00 not Z).
    // Byte-level compatibility with the old API removes a class of latent frontend bugs.
    last_seen: toFlaskTimestamp(row.lastSeen),
    is_pinned: Boolean(row.isPinned),
    pinned_at: row.pinnedAt != null ? toFlaskTimestamp(row.pinnedAt) : null,
  }
}

function toFlaskTimestamp(d: Date | string): string {
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString()
  return iso.replace(/\.\d{3}Z$/, "+00:00")
}

// ── prune helper ──────────────────────────────────────────────────────────────
// Called inline before every POST upsert. Errors are reported to Sentry and
// logged but never bubble up — prune failure must not block the caller.
//
// Cost note: runs a DELETE WHERE scan on every POST. Fine at current scale.
// If this becomes a hot path, replace with a periodic BullMQ job.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pruneStaleMemorized(userId: number, db: any): Promise<void> {
  try {
    const now = new Date()
    const cutoff1 = new Date(now.getTime() - PRUNE_DAYS_COUNT_1 * 86_400_000)
    const cutoff2 = new Date(now.getTime() - PRUNE_DAYS_COUNT_2 * 86_400_000)

    await db
      .delete(memorizedTransactions)
      .where(
        and(
          eq(memorizedTransactions.userId, userId),
          eq(memorizedTransactions.isPinned, false),
          or(
            and(
              eq(memorizedTransactions.count, 1),
              sql`${memorizedTransactions.lastSeen} < ${cutoff1.toISOString().slice(0, 19).replace("T", " ")}`,
            ),
            and(
              eq(memorizedTransactions.count, 2),
              sql`${memorizedTransactions.lastSeen} < ${cutoff2.toISOString().slice(0, 19).replace("T", " ")}`,
            ),
          ),
        ),
      )
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: "pruneStaleMemorized", userId } })
    console.error("[pruneStaleMemorized] failed for userId=%d:", userId, err)
  }
}

// ── Lookup helpers (no create) ────────────────────────────────────────────────

async function findCategoryById(
  id: number,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1)
  return row ?? null
}

async function findCategoryByName(
  name: string,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`LOWER(${categories.name}) = LOWER(${name.trim()})`))
    .limit(1)
  return row ?? null
}

async function findMerchantById(
  id: number,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: merchants.id, name: merchants.name })
    .from(merchants)
    .where(and(eq(merchants.id, id), eq(merchants.userId, userId)))
    .limit(1)
  return row ?? null
}

async function findMerchantByName(
  name: string,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ id: number; name: string } | null> {
  const [row] = await db
    .select({ id: merchants.id, name: merchants.name })
    .from(merchants)
    .where(and(eq(merchants.userId, userId), sql`LOWER(${merchants.name}) = LOWER(${name.trim()})`))
    .limit(1)
  return row ?? null
}

// ── GET /api/memorized-transactions ──────────────────────────────────────────

memorizedRouter.get("/", requireAuth, searchRateLimit, async (c) => {
  const q = (c.req.query("q") ?? "").trim()
  const rawSort = (c.req.query("sort") ?? "most_used").trim()
  const sortKey: SortKey = (VALID_SORT_KEYS as readonly string[]).includes(rawSort)
    ? (rawSort as SortKey)
    : "most_used"

  const rawLimit = c.req.query("limit")
  const rawOffset = c.req.query("offset")
  let limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 50
  let offset = rawOffset !== undefined ? parseInt(rawOffset, 10) : 0
  if (isNaN(limit) || limit < 1) limit = 50
  if (limit > 200) limit = 200
  if (isNaN(offset) || offset < 0) offset = 0

  const { userId } = c.get("session")
  const db = getDb()

  const selectFields = {
    id: memorizedTransactions.id,
    canonical: memorizedTransactions.canonical,
    count: memorizedTransactions.count,
    lastSeen: memorizedTransactions.lastSeen,
    isPinned: memorizedTransactions.isPinned,
    pinnedAt: memorizedTransactions.pinnedAt,
    categoryId: memorizedTransactions.categoryId,
    merchantId: memorizedTransactions.merchantId,
    categoryName: categories.name,
    merchantName: merchants.name,
  }

  let where = and(eq(memorizedTransactions.userId, userId))
  if (q) {
    const like = `%${q}%`
    where = and(
      where,
      or(
        sql`${memorizedTransactions.canonical} LIKE ${like}`,
        sql`${memorizedTransactions.norm} LIKE ${like}`,
        sql`${categories.name} LIKE ${like}`,
        sql`${merchants.name} LIKE ${like}`,
      ),
    )
  }

  const orderBy = buildOrderBy(sortKey)

  // Count first so call sequence is predictable for tests
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(memorizedTransactions)
    .leftJoin(categories, eq(memorizedTransactions.categoryId, categories.id))
    .leftJoin(merchants, eq(memorizedTransactions.merchantId, merchants.id))
    .where(where)
  const total = Number(countRow?.count ?? 0)

  const rows = await db
    .select(selectFields)
    .from(memorizedTransactions)
    .leftJoin(categories, eq(memorizedTransactions.categoryId, categories.id))
    .leftJoin(merchants, eq(memorizedTransactions.merchantId, merchants.id))
    .where(where)
    .orderBy(...orderBy)
    .offset(offset)
    .limit(limit)

  const items = rows.map(serializeMemorized)
  return c.json({
    ok: true,
    data: { items },
    error: null,
    meta: { total, offset, limit, has_more: offset + items.length < total },
  })
})

// ── POST /api/memorized-transactions ─────────────────────────────────────────
// Manual create-or-update. Prunes stale rows first (fire-and-forget).
// Returns 201 on insert, 200 on update.

memorizedRouter.post("/", requireAuth, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  const canonical = ((body["canonical"] as string) ?? "").trim().slice(0, 255)
  if (!canonical) {
    return c.json({ ok: false, data: null, error: "Transaction name is required.", code: "validation_error" }, 400)
  }

  const norm = txnNorm(canonical)
  if (!norm) {
    return c.json(
      { ok: false, data: null, error: "Transaction name is invalid (normalizes to empty).", code: "validation_error" },
      400,
    )
  }

  const db = getDb()

  // Resolve category: prefer category_id, fall back to name lookup (no create)
  let categoryId: number | null = null
  if (body["category_id"] != null) {
    const id = Number(body["category_id"])
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, data: null, error: "Invalid category_id.", code: "validation_error" }, 400)
    }
    const cat = await findCategoryById(id, userId, db)
    if (!cat) {
      return c.json({ ok: false, data: null, error: `Category not found.`, code: "not_found" }, 400)
    }
    categoryId = cat.id
  } else if (body["category"] != null) {
    const name = ((body["category"] as string) ?? "").trim()
    if (name) {
      const cat = await findCategoryByName(name, userId, db)
      if (!cat) {
        return c.json(
          { ok: false, data: null, error: `Category '${name}' not found.`, code: "not_found" },
          400,
        )
      }
      categoryId = cat.id
    }
  }

  // Resolve merchant: prefer merchant_id, fall back to name lookup (no create)
  let merchantId: number | null = null
  if (body["merchant_id"] != null) {
    const id = Number(body["merchant_id"])
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, data: null, error: "Invalid merchant_id.", code: "validation_error" }, 400)
    }
    const mer = await findMerchantById(id, userId, db)
    if (!mer) {
      return c.json({ ok: false, data: null, error: `Merchant not found.`, code: "not_found" }, 400)
    }
    merchantId = mer.id
  } else if (body["merchant"] != null) {
    const name = ((body["merchant"] as string) ?? "").trim()
    if (name) {
      const mer = await findMerchantByName(name, userId, db)
      if (!mer) {
        return c.json(
          { ok: false, data: null, error: `Merchant '${name}' not found.`, code: "not_found" },
          400,
        )
      }
      merchantId = mer.id
    }
  }

  await pruneStaleMemorized(userId, db)

  const now = new Date()

  const [existing] = await db
    .select({
      id: memorizedTransactions.id,
      canonical: memorizedTransactions.canonical,
      count: memorizedTransactions.count,
      lastSeen: memorizedTransactions.lastSeen,
      isPinned: memorizedTransactions.isPinned,
      pinnedAt: memorizedTransactions.pinnedAt,
      categoryId: memorizedTransactions.categoryId,
      merchantId: memorizedTransactions.merchantId,
    })
    .from(memorizedTransactions)
    .where(and(eq(memorizedTransactions.norm, norm), eq(memorizedTransactions.userId, userId)))
    .limit(1)

  if (existing) {
    await db
      .update(memorizedTransactions)
      .set({
        canonical,
        lastSeen: now,
        count: sql`${memorizedTransactions.count} + 1`,
        ...(categoryId !== null ? { categoryId } : {}),
        ...(merchantId !== null ? { merchantId } : {}),
      })
      .where(eq(memorizedTransactions.id, existing.id))

    const row = await fetchMemorizedRow(existing.id, db)
    return c.json({ ok: true, data: { item: serializeMemorized(row) }, error: null, meta: {} })
  }

  const [{ id: newId }] = await db
    .insert(memorizedTransactions)
    .values({ userId, canonical, norm, categoryId, merchantId, count: 1, lastSeen: now })
    .$returningId()

  const row = await fetchMemorizedRow(newId, db)
  return c.json({ ok: true, data: { item: serializeMemorized(row) }, error: null, meta: {} }, 201)
})

// ── PATCH /api/memorized-transactions/:id ────────────────────────────────────

memorizedRouter.patch("/:id{[0-9]+}", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [existing] = await db
    .select()
    .from(memorizedTransactions)
    .where(and(eq(memorizedTransactions.id, id), eq(memorizedTransactions.userId, userId)))
    .limit(1)

  if (!existing) {
    return c.json({ ok: false, data: null, error: "Memorized transaction not found.", code: "not_found" }, 404)
  }

  const canonical = ((body["canonical"] as string) ?? "").trim().slice(0, 255)
  if (!canonical) {
    return c.json({ ok: false, data: null, error: "Transaction name is required.", code: "validation_error" }, 400)
  }

  const newNorm = txnNorm(canonical)
  if (!newNorm) {
    return c.json(
      { ok: false, data: null, error: "Transaction name is invalid (normalizes to empty).", code: "validation_error" },
      400,
    )
  }

  if (newNorm !== existing.norm) {
    const [collision] = await db
      .select({ id: memorizedTransactions.id })
      .from(memorizedTransactions)
      .where(
        and(
          eq(memorizedTransactions.norm, newNorm),
          ne(memorizedTransactions.id, id),
          eq(memorizedTransactions.userId, userId),
        ),
      )
      .limit(1)
    if (collision) {
      return c.json(
        { ok: false, data: null, error: "Another memorized transaction already matches this name.", code: "validation_error" },
        400,
      )
    }
  }

  // Resolve category (lookup only, no create)
  let categoryId: number | null | undefined
  if ("category_id" in body) {
    if (body["category_id"] == null) {
      categoryId = null
    } else {
      const rawId = Number(body["category_id"])
      if (!Number.isInteger(rawId) || rawId <= 0) {
        return c.json({ ok: false, data: null, error: "Invalid category_id.", code: "validation_error" }, 400)
      }
      const cat = await findCategoryById(rawId, userId, db)
      if (!cat) {
        return c.json({ ok: false, data: null, error: "Category not found.", code: "not_found" }, 400)
      }
      categoryId = cat.id
    }
  } else if ("category" in body) {
    const name = ((body["category"] as string) ?? "").trim()
    if (!name) {
      categoryId = null
    } else {
      const cat = await findCategoryByName(name, userId, db)
      if (!cat) {
        return c.json(
          { ok: false, data: null, error: `Category '${name}' not found.`, code: "not_found" },
          400,
        )
      }
      categoryId = cat.id
    }
  }

  // Resolve merchant (lookup only, no create)
  let merchantId: number | null | undefined
  if ("merchant_id" in body) {
    if (body["merchant_id"] == null) {
      merchantId = null
    } else {
      const rawId = Number(body["merchant_id"])
      if (!Number.isInteger(rawId) || rawId <= 0) {
        return c.json({ ok: false, data: null, error: "Invalid merchant_id.", code: "validation_error" }, 400)
      }
      const mer = await findMerchantById(rawId, userId, db)
      if (!mer) {
        return c.json({ ok: false, data: null, error: "Merchant not found.", code: "not_found" }, 400)
      }
      merchantId = mer.id
    }
  } else if ("merchant" in body) {
    const name = ((body["merchant"] as string) ?? "").trim()
    if (!name) {
      merchantId = null
    } else {
      const mer = await findMerchantByName(name, userId, db)
      if (!mer) {
        return c.json(
          { ok: false, data: null, error: `Merchant '${name}' not found.`, code: "not_found" },
          400,
        )
      }
      merchantId = mer.id
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { canonical, norm: newNorm, lastSeen: new Date() }
  if (categoryId !== undefined) patch.categoryId = categoryId
  if (merchantId !== undefined) patch.merchantId = merchantId

  await db.update(memorizedTransactions).set(patch).where(eq(memorizedTransactions.id, id))

  const row = await fetchMemorizedRow(id, db)
  return c.json({ ok: true, data: { item: serializeMemorized(row) }, error: null, meta: {} })
})

// ── DELETE /api/memorized-transactions/:id ────────────────────────────────────

memorizedRouter.delete("/:id{[0-9]+}", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const db = getDb()

  const [row] = await db
    .select({ id: memorizedTransactions.id })
    .from(memorizedTransactions)
    .where(and(eq(memorizedTransactions.id, id), eq(memorizedTransactions.userId, userId)))
    .limit(1)

  if (!row) {
    return c.json({ ok: false, data: null, error: "Memorized transaction not found.", code: "not_found" }, 404)
  }

  await db.delete(memorizedTransactions).where(eq(memorizedTransactions.id, id))
  return c.json({ ok: true, data: { deleted: true }, error: null, meta: {} })
})

// ── POST /api/memorized-transactions/:id/pin ──────────────────────────────────

memorizedRouter.post("/:id{[0-9]+}/pin", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [row] = await db
    .select({ id: memorizedTransactions.id })
    .from(memorizedTransactions)
    .where(and(eq(memorizedTransactions.id, id), eq(memorizedTransactions.userId, userId)))
    .limit(1)

  if (!row) {
    return c.json({ ok: false, data: null, error: "Memorized transaction not found.", code: "not_found" }, 404)
  }

  const pinned = body["pinned"] !== false
  const pinnedAt = pinned ? new Date() : null

  await db
    .update(memorizedTransactions)
    .set({ isPinned: pinned, pinnedAt })
    .where(eq(memorizedTransactions.id, id))

  const updated = await fetchMemorizedRow(id, db)
  return c.json({ ok: true, data: { item: serializeMemorized(updated) }, error: null, meta: {} })
})

// ── POST /api/memorized-transactions/bulk-delete ─────────────────────────────

memorizedRouter.post("/bulk-delete", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const parsedBulkDelete = MemorizedBulkDeleteSchema.safeParse(body)
  if (!parsedBulkDelete.success) return zodErrorToEnvelope(c, parsedBulkDelete.error)
  const ids = body["ids"] as unknown[]

  const numericIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (!numericIds.length) {
    return c.json({ ok: true, data: { deleted: 0 }, error: null, meta: {} })
  }

  const { userId } = c.get("session")
  const db = getDb()

  const owned = await db
    .select({ id: memorizedTransactions.id })
    .from(memorizedTransactions)
    .where(and(eq(memorizedTransactions.userId, userId), inArray(memorizedTransactions.id, numericIds)))

  if (owned.length > 0) {
    await db
      .delete(memorizedTransactions)
      .where(inArray(memorizedTransactions.id, owned.map((r) => r.id)))
  }

  return c.json({ ok: true, data: { deleted: owned.length }, error: null, meta: {} })
})

// ── Private helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMemorizedRow(id: number, db: any) {
  const [row] = await db
    .select({
      id: memorizedTransactions.id,
      canonical: memorizedTransactions.canonical,
      count: memorizedTransactions.count,
      lastSeen: memorizedTransactions.lastSeen,
      isPinned: memorizedTransactions.isPinned,
      pinnedAt: memorizedTransactions.pinnedAt,
      categoryId: memorizedTransactions.categoryId,
      merchantId: memorizedTransactions.merchantId,
      categoryName: categories.name,
      merchantName: merchants.name,
    })
    .from(memorizedTransactions)
    .leftJoin(categories, eq(memorizedTransactions.categoryId, categories.id))
    .leftJoin(merchants, eq(memorizedTransactions.merchantId, merchants.id))
    .where(eq(memorizedTransactions.id, id))
    .limit(1)
  return row
}

function buildOrderBy(sort: SortKey) {
  // All orderings: pinned rows first, then by pinnedAt desc nulls-last, then by sort key.
  const pinnedFirst = sql`${memorizedTransactions.isPinned} DESC`
  const pinnedAt = nullsLastDesc(memorizedTransactions.pinnedAt)

  switch (sort) {
    case "most_used":
      return [pinnedFirst, pinnedAt, sql`${memorizedTransactions.count} DESC`, sql`${memorizedTransactions.lastSeen} DESC`]
    case "recently_used":
      return [pinnedFirst, pinnedAt, sql`${memorizedTransactions.lastSeen} DESC`]
    case "oldest_first":
      return [pinnedFirst, pinnedAt, sql`${memorizedTransactions.id} ASC`]
    case "name_asc":
      return [pinnedFirst, pinnedAt, sql`${memorizedTransactions.canonical} ASC`]
    case "name_desc":
      return [pinnedFirst, pinnedAt, sql`${memorizedTransactions.canonical} DESC`]
  }
}
