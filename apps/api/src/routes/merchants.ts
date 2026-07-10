// Response envelope contract: see categories.ts for the authoritative definition.
// Resource shapes for this module:
//   GET  /api/merchants          → data: { items: MerchantItem[] }
//   POST /api/merchants          → data: { item: MerchantItem }          status 201
//   PATCH /api/merchants/:id     → data: { item: MerchantItem }
//   DELETE /api/merchants/:id    → data: { deleted: true }               ?reassign_to=<id>
//   POST /api/merchants/:id/remap → data: { remapped_count, memorized_count }
//
// Deviations from Flask:
//   - POST duplicate name → 409 "merchant_name_exists" with existing_item in payload
//     (Flask returned 200 + existing; same deviation as categories).
//   - PATCH /:id instead of POST /:id/update.
//   - DELETE ?reassign_to=<id> instead of POST /:id/delete.

import { Hono } from "hono"
import { z } from "zod"
import { and, eq, inArray, sql } from "drizzle-orm"
import { getDb } from "../db/connection"
import { merchants } from "../db/schema/merchants"
import { transactions } from "../db/schema/transactions"
import { memorizedTransactions } from "../db/schema/memorized-transactions"
import { requireAuth } from "../middleware/auth"
import { readRateLimit, writeRateLimit, heavyWriteRateLimit } from "../lib/rate-limit"

export const merchantsRouter = new Hono()

// ── Zod schemas ───────────────────────────────────────────────────────────────

const NameBody = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(128, "Name too long (max 128 characters).")
    .trim(),
})

const RemapBody = z.object({
  target_id: z.number().int().positive("target_id must be a positive integer."),
})

// ── Types ─────────────────────────────────────────────────────────────────────

type MerchantItem = { id: number; name: string }

function serializeMerchant(row: typeof merchants.$inferSelect): MerchantItem {
  return { id: row.id, name: row.name }
}

// ── GET /api/merchants ────────────────────────────────────────────────────────

merchantsRouter.get("/", requireAuth, readRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  const rows = await db
    .select()
    .from(merchants)
    .where(eq(merchants.userId, userId))
    .orderBy(sql`LOWER(${merchants.name})`, merchants.id)

  return c.json({ ok: true, data: { items: rows.map(serializeMerchant) }, error: null, meta: {} })
})

// ── POST /api/merchants ───────────────────────────────────────────────────────

merchantsRouter.post("/", requireAuth, writeRateLimit, async (c) => {
  const { userId } = c.get("session")

  const body = await c.req.json().catch(() => ({}))
  const parsed = NameBody.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Validation error."
    return c.json({ ok: false, data: null, error: msg, code: "validation_error" }, 400)
  }
  const { name } = parsed.data

  const db = getDb()
  const [existing] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.userId, userId), sql`LOWER(${merchants.name}) = LOWER(${name})`))
    .limit(1)

  if (existing) {
    return c.json(
      {
        ok: false,
        data: null,
        error: `A merchant named '${existing.name}' already exists.`,
        code: "merchant_name_exists",
        existing_item: serializeMerchant(existing),
      },
      409,
    )
  }

  const [{ id: newId }] = await db.insert(merchants).values({ userId, name }).$returningId()
  const [created] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, newId))
    .limit(1)

  return c.json(
    { ok: true, data: { item: serializeMerchant(created) }, error: null, meta: {} },
    201,
  )
})

// ── PATCH /api/merchants/:id ──────────────────────────────────────────────────

merchantsRouter.patch("/:id", requireAuth, writeRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(
      { ok: false, data: null, error: "Invalid merchant id.", code: "validation_error" },
      400,
    )
  }
  const { userId } = c.get("session")

  const body = await c.req.json().catch(() => ({}))
  const parsed = NameBody.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Validation error."
    return c.json({ ok: false, data: null, error: msg, code: "validation_error" }, 400)
  }
  const { name } = parsed.data

  const db = getDb()
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, id), eq(merchants.userId, userId)))
    .limit(1)

  if (!merchant) {
    return c.json(
      { ok: false, data: null, error: "Merchant not found.", code: "not_found" },
      404,
    )
  }

  const [conflict] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.userId, userId), sql`LOWER(${merchants.name}) = LOWER(${name})`))
    .limit(1)

  if (conflict && conflict.id !== id) {
    return c.json(
      {
        ok: false,
        data: null,
        error: `A merchant named '${conflict.name}' already exists.`,
        code: "merchant_name_exists",
        existing_item: serializeMerchant(conflict),
      },
      409,
    )
  }

  await db.update(merchants).set({ name }).where(eq(merchants.id, id))

  const [updated] = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1)
  return c.json({ ok: true, data: { item: serializeMerchant(updated) }, error: null, meta: {} })
})

// ── DELETE /api/merchants/:id ─────────────────────────────────────────────────
// Dependent-row reassignment uses ?reassign_to=<id> query param — consistent
// with DELETE /api/categories/:id.

merchantsRouter.delete("/:id", requireAuth, writeRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(
      { ok: false, data: null, error: "Invalid merchant id.", code: "validation_error" },
      400,
    )
  }
  const { userId } = c.get("session")
  const db = getDb()

  const [merchant] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, id), eq(merchants.userId, userId)))
    .limit(1)

  if (!merchant) {
    return c.json(
      { ok: false, data: null, error: "Merchant not found.", code: "not_found" },
      404,
    )
  }

  const counts = await _getDependentCounts(db, id, userId)
  const hasDependents = counts.transactions > 0 || counts.memorized > 0

  const reassignParam = c.req.query("reassign_to")
  const reassignId =
    reassignParam !== undefined && reassignParam !== "" ? Number(reassignParam) : null

  if (hasDependents && reassignId === null) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "This merchant has dependent rows. Provide 'reassign_to' to move them first.",
        code: "has_dependents",
        dependent_counts: counts,
      },
      409,
    )
  }

  if (reassignId !== null) {
    if (!Number.isInteger(reassignId) || reassignId <= 0) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "'reassign_to' must be a valid merchant id.",
          code: "validation_error",
        },
        400,
      )
    }
    if (reassignId === id) {
      return c.json(
        {
          ok: false,
          data: null,
          error: "'reassign_to' must be a different merchant.",
          code: "validation_error",
        },
        400,
      )
    }
    const [target] = await db
      .select()
      .from(merchants)
      .where(and(eq(merchants.id, reassignId), eq(merchants.userId, userId)))
      .limit(1)
    if (!target) {
      return c.json(
        { ok: false, data: null, error: "Reassignment target not found.", code: "not_found" },
        404,
      )
    }
  }

  await db.transaction(async (tx) => {
    if (hasDependents && reassignId !== null) {
      await tx
        .update(transactions)
        .set({ merchantId: reassignId })
        .where(and(eq(transactions.userId, userId), eq(transactions.merchantId, id)))
      await tx
        .update(memorizedTransactions)
        .set({ merchantId: reassignId })
        .where(and(eq(memorizedTransactions.userId, userId), eq(memorizedTransactions.merchantId, id)))
    }
    await tx.delete(merchants).where(eq(merchants.id, id))
  })

  return c.json({ ok: true, data: { deleted: true }, error: null, meta: {} })
})

// ── POST /api/merchants/:id/remap ─────────────────────────────────────────────
// Note: this endpoint merges source INTO target — it remaps dependents AND
// deletes the source merchant in one transaction. This differs from categories'
// remap endpoint, which remaps only and leaves the source category in place.
// Preserves Flask behavior; flagged here so the asymmetry is discoverable.

merchantsRouter.post("/:id/remap", requireAuth, heavyWriteRateLimit, async (c) => {
  const sourceId = Number(c.req.param("id"))
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return c.json(
      { ok: false, data: null, error: "Invalid merchant id.", code: "validation_error" },
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
      .from(merchants)
      .where(and(eq(merchants.id, sourceId), eq(merchants.userId, userId)))
      .limit(1),
    db
      .select()
      .from(merchants)
      .where(and(eq(merchants.id, target_id), eq(merchants.userId, userId)))
      .limit(1),
  ])

  if (!source) {
    return c.json(
      { ok: false, data: null, error: "Source merchant not found.", code: "not_found" },
      404,
    )
  }
  if (!target) {
    return c.json(
      { ok: false, data: null, error: "Target merchant not found.", code: "not_found" },
      404,
    )
  }

  let remapCounts!: { remapped_count: number; memorized_count: number }
  await db.transaction(async (tx) => {
    const [[txnRow], [memRow]] = await Promise.all([
      tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.merchantId, sourceId))),
      tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(memorizedTransactions)
        .where(
          and(
            eq(memorizedTransactions.userId, userId),
            eq(memorizedTransactions.merchantId, sourceId),
          ),
        ),
    ])

    await tx
      .update(transactions)
      .set({ merchantId: target_id })
      .where(and(eq(transactions.userId, userId), eq(transactions.merchantId, sourceId)))
    await tx
      .update(memorizedTransactions)
      .set({ merchantId: target_id })
      .where(
        and(
          eq(memorizedTransactions.userId, userId),
          eq(memorizedTransactions.merchantId, sourceId),
        ),
      )
    await tx.delete(merchants).where(eq(merchants.id, sourceId))

    remapCounts = {
      remapped_count: Number(txnRow?.count ?? 0),
      memorized_count: Number(memRow?.count ?? 0),
    }
  })

  return c.json({ ok: true, data: remapCounts, error: null, meta: {} })
})

// ── Private helpers ───────────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof getDb>

async function _getDependentCounts(
  db: AnyDb,
  merchantId: number,
  userId: number,
): Promise<{ transactions: number; memorized: number }> {
  const [[txnRow], [memRow]] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.merchantId, merchantId))),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(memorizedTransactions)
      .where(
        and(
          eq(memorizedTransactions.userId, userId),
          eq(memorizedTransactions.merchantId, merchantId),
        ),
      ),
  ])
  return {
    transactions: Number(txnRow?.count ?? 0),
    memorized: Number(memRow?.count ?? 0),
  }
}
