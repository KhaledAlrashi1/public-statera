import { Hono } from "hono"
import { and, desc, eq, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../db/connection"
import { savingsGoals } from "../db/schema/savings-goals"
import { categories } from "../db/schema/categories"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { formatKd } from "../lib/transaction-lib"
import { Sentry } from "../lib/sentry"
import { goalProjection } from "../lib/savings-goals-lib"
import { cacheBustSafeToSpend } from "../lib/analytics-cache"
import { recordEvent, recordEventOnce } from "../lib/product-events-lib"
import { getQueue } from "../worker/queue"

export const savingsGoalsRouter = new Hono()

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_GOAL_TYPES = new Set(["starter_buffer", "emergency_fund", "custom"])
const MAX_AMOUNT = new Decimal("999999999.999")

// ── Serializer ────────────────────────────────────────────────────────────────

function toFlaskTimestamp(d: Date | string): string {
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString()
  return iso.replace(/\.\d{3}Z$/, "+00:00")
}

// Drizzle MySQL date() returns Date objects; normalize to YYYY-MM-DD string for app code.
function toTargetDateStr(d: Date | string | null | undefined): string | null {
  if (d == null) return null
  return d instanceof Date ? d.toISOString().slice(0, 10) : d
}

function serializeGoal(row: {
  id: number
  name: string
  goalType: string
  targetKd: string
  currentKd: string
  targetDate: Date | string | null
  linkedCategoryId: number | null
  isActive: boolean | number
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}) {
  return {
    id: row.id,
    name: row.name,
    goal_type: row.goalType,
    target_kd: formatKd(row.targetKd),
    current_kd: formatKd(row.currentKd),
    target_date: toTargetDateStr(row.targetDate),
    linked_category_id: row.linkedCategoryId ?? null,
    is_active: Boolean(row.isActive),
    notes: row.notes ?? null,
    created_at: toFlaskTimestamp(row.createdAt),
    updated_at: toFlaskTimestamp(row.updatedAt),
  }
}

// ── Validators ────────────────────────────────────────────────────────────────

function parseName(value: unknown): string {
  const name = String(value ?? "").trim()
  if (!name) throw new Error("name is required.")
  if (name.length > 128) throw new Error("name must be 128 characters or fewer.")
  return name
}

function parseGoalType(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase() || "custom"
  if (!ALLOWED_GOAL_TYPES.has(normalized)) {
    throw new Error("goal_type must be one of: starter_buffer, emergency_fund, custom.")
  }
  return normalized
}

function parseAmount(
  value: unknown,
  fieldName: string,
  opts: { allowNone?: boolean; allowZero?: boolean } = {},
): Decimal | null {
  if (value == null || String(value).trim() === "") {
    if (opts.allowNone) return null
    throw new Error(`${fieldName} is required.`)
  }
  let parsed: Decimal
  try {
    parsed = new Decimal(String(value).trim())
  } catch {
    throw new Error(`${fieldName} must be a valid number.`)
  }
  if (parsed.lt(0)) throw new Error(`${fieldName} must be greater than or equal to zero.`)
  if (opts.allowZero === false && parsed.isZero()) throw new Error(`${fieldName} must be greater than zero.`)
  if (parsed.gt(MAX_AMOUNT)) throw new Error(`${fieldName} is too large.`)
  return parsed
}

function parseTargetDate(
  value: unknown,
  opts: { allowNone?: boolean; existingDate?: string | null } = {},
): string | null {
  if (value == null || String(value).trim() === "") {
    if (opts.allowNone) return null
    throw new Error("target_date is required.")
  }
  const raw = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || isNaN(new Date(raw + "T00:00:00Z").getTime())) {
    throw new Error("target_date must use YYYY-MM-DD format.")
  }
  const today = new Date().toISOString().slice(0, 10)
  if (raw !== opts.existingDate && raw < today) {
    throw new Error("target_date cannot be in the past.")
  }
  return raw
}

function parseNotes(value: unknown): string | null {
  if (value == null) return null
  const notes = String(value).trim()
  if (!notes) return null
  if (notes.length > 255) throw new Error("notes must be 255 characters or fewer.")
  return notes
}

function validateGoalAmounts(targetKd: Decimal | null, currentKd: Decimal | null): void {
  const target = targetKd ?? new Decimal(0)
  const current = currentKd ?? new Decimal(0)
  if (current.gt(target)) throw new Error("current_kd cannot exceed target_kd.")
}

// ── Category lookup (silent null, per approved migration decision) ─────────────
// See memorized.ts — unmatched names become NULL, matching Flask's _resolve_linked_category_id.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveLinkedCategoryId(value: unknown, userId: number, db: any): Promise<number | null> {
  if (value == null) return null
  const name = String(value).trim()
  if (!name) return null
  if (name.length > 64) throw new Error("linked_category must be 64 characters or fewer.")
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`LOWER(${categories.name}) = LOWER(${name})`))
    .limit(1)
  return (row as { id: number } | undefined)?.id ?? null
}

// ── GET /api/savings-goals ────────────────────────────────────────────────────

savingsGoalsRouter.get("/", requireAuth, searchRateLimit, async (c) => {
  const includeInactive = ["1", "true", "yes", "on"].includes(
    (c.req.query("include_inactive") ?? "").trim().toLowerCase(),
  )
  const { userId } = c.get("session")
  const db = getDb()

  let where = and(eq(savingsGoals.userId, userId))
  if (!includeInactive) where = and(where, eq(savingsGoals.isActive, true))

  const rows = await db
    .select()
    .from(savingsGoals)
    .where(where)
    .orderBy(desc(savingsGoals.createdAt), desc(savingsGoals.id))

  const today = new Date().toISOString().slice(0, 10)
  const goals = await Promise.all(
    rows.map(async (row) => ({
      ...serializeGoal(row),
      projection: await goalProjection(
        { id: row.id, userId: row.userId, targetKd: row.targetKd, currentKd: row.currentKd, targetDate: toTargetDateStr(row.targetDate) },
        db,
        today,
      ),
    })),
  )

  return c.json({
    ok: true,
    data: { goals, include_inactive: includeInactive },
    error: null,
    meta: { count: goals.length },
  })
})

// ── GET /api/savings-goals/:id/projection ────────────────────────────────────

savingsGoalsRouter.get("/:id{[0-9]+}/projection", requireAuth, searchRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const db = getDb()

  const [goal] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .limit(1)

  if (!goal) {
    return c.json({ ok: false, data: null, error: "Savings goal not found.", code: "not_found" }, 404)
  }

  const projection = await goalProjection(
    { id: goal.id, userId: goal.userId, targetKd: goal.targetKd, currentKd: goal.currentKd, targetDate: toTargetDateStr(goal.targetDate) },
    db,
  )
  return c.json({ ok: true, data: { projection }, error: null, meta: {} })
})

// ── POST /api/savings-goals ───────────────────────────────────────────────────

savingsGoalsRouter.post("/", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  let name: string, goalType: string, targetKd: Decimal, currentKd: Decimal
  let targetDate: string | null, linkedCategoryId: number | null, notes: string | null
  try {
    targetKd = parseAmount(body["target_kd"], "target_kd", { allowZero: false })!
    currentKd = parseAmount(body["current_kd"] ?? "0", "current_kd", { allowZero: true })!
    validateGoalAmounts(targetKd, currentKd)
    name = parseName(body["name"])
    goalType = parseGoalType(body["goal_type"])
    targetDate = parseTargetDate(body["target_date"], { allowNone: true })
    linkedCategoryId = await resolveLinkedCategoryId(body["linked_category"], userId, db)
    notes = parseNotes(body["notes"])
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  const [{ id }] = await db
    .insert(savingsGoals)
    .values({
      userId,
      name,
      goalType,
      targetKd: formatKd(targetKd),
      currentKd: formatKd(currentKd),
      targetDate: targetDate ? new Date(targetDate + "T00:00:00Z") : undefined,
      linkedCategoryId: linkedCategoryId ?? undefined,
      notes: notes ?? undefined,
    })
    .$returningId()

  const [created] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1)

  ;(async () => {
    try {
      await cacheBustSafeToSpend(userId)
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "savings-goals.post.cacheBust", userId } })
    }
  })()

  const projection = await goalProjection(
    { id: created.id, userId: created.userId, targetKd: created.targetKd, currentKd: created.currentKd, targetDate: toTargetDateStr(created.targetDate) },
    db,
  )

  return c.json(
    { ok: true, data: { goal: { ...serializeGoal(created), projection } }, error: null, meta: {} },
    201,
  )
})

// ── PATCH /api/savings-goals/:id ─────────────────────────────────────────────
// Flask used POST /:id/update — ported to PATCH /:id per REST convention.

savingsGoalsRouter.patch("/:id{[0-9]+}", requireAuth, searchRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [goal] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .limit(1)

  if (!goal) {
    return c.json({ ok: false, data: null, error: "Savings goal not found.", code: "not_found" }, 404)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {}
  try {
    if ("name" in body) patch.name = parseName(body["name"])
    if ("goal_type" in body) patch.goalType = parseGoalType(body["goal_type"])
    let nextTargetKd: Decimal | null = null
    let nextCurrentKd: Decimal | null = null
    if ("target_kd" in body) {
      nextTargetKd = parseAmount(body["target_kd"], "target_kd", { allowZero: false })!
      patch.targetKd = formatKd(nextTargetKd)
    }
    if ("current_kd" in body) {
      nextCurrentKd = parseAmount(body["current_kd"], "current_kd", { allowZero: true })!
      patch.currentKd = formatKd(nextCurrentKd)
    }
    if ("target_kd" in body || "current_kd" in body) {
      validateGoalAmounts(
        nextTargetKd ?? new Decimal(goal.targetKd),
        nextCurrentKd ?? new Decimal(goal.currentKd ?? "0"),
      )
    }
    if ("target_date" in body) {
      // Pass existing stored value so an unchanged past date is not re-rejected.
      const parsedDate = parseTargetDate(body["target_date"], {
        allowNone: true,
        existingDate: toTargetDateStr(goal.targetDate),
      })
      patch.targetDate = parsedDate ? new Date(parsedDate + "T00:00:00Z") : null
    }
    if ("linked_category" in body) {
      patch.linkedCategoryId =
        (await resolveLinkedCategoryId(body["linked_category"], userId, db)) ?? null
    }
    if ("notes" in body) patch.notes = parseNotes(body["notes"])
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  if (Object.keys(patch).length === 0) {
    const projection = await goalProjection(
      { id: goal.id, userId: goal.userId, targetKd: goal.targetKd, currentKd: goal.currentKd, targetDate: toTargetDateStr(goal.targetDate) },
      db,
    )
    return c.json({ ok: true, data: { goal: { ...serializeGoal(goal), projection } }, error: null, meta: {} })
  }

  await db.update(savingsGoals).set(patch).where(eq(savingsGoals.id, id))

  ;(async () => {
    try {
      await cacheBustSafeToSpend(userId)
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "savings-goals.patch.cacheBust", userId } })
    }
  })()

  const [updated] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1)
  const projection = await goalProjection(
    { id: updated.id, userId: updated.userId, targetKd: updated.targetKd, currentKd: updated.currentKd, targetDate: toTargetDateStr(updated.targetDate) },
    db,
  )

  return c.json({ ok: true, data: { goal: { ...serializeGoal(updated), projection } }, error: null, meta: {} })
})

// ── POST /api/savings-goals/:id/deposit ──────────────────────────────────────
// Flask used POST /:id/deposit — kept as POST (not PATCH) since deposits are
// a specific action, not a partial update of the goal's fields.

savingsGoalsRouter.post("/:id{[0-9]+}/deposit", requireAuth, searchRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  let amount: Decimal
  try {
    amount = parseAmount(body["amount_kd"], "amount_kd", { allowZero: false })!
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  // Pre-flight SELECT for diagnostics. Diagnostic check order matches Flask's
  // _deposit_failure_response() exactly — do not reorder without coordinating with frontend.
  const [preflightGoal] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .limit(1)

  if (!preflightGoal) {
    return c.json({ ok: false, data: null, error: "Savings goal not found.", code: "not_found" }, 404)
  }
  if (!preflightGoal.isActive) {
    return c.json({ ok: false, data: null, error: "Savings goal is inactive.", code: "goal_inactive" }, 409)
  }
  const preflightCurrent = new Decimal(preflightGoal.currentKd ?? "0")
  const preflightTarget = new Decimal(preflightGoal.targetKd ?? "0")
  if (preflightCurrent.gte(preflightTarget)) {
    return c.json({ ok: false, data: null, error: "Goal is already fully funded.", code: "goal_fully_funded" }, 409)
  }
  if (preflightCurrent.plus(amount).gt(preflightTarget)) {
    return c.json({ ok: false, data: null, error: "amount_kd would exceed the goal target", code: "validation_error" }, 400)
  }

  // Atomic conditional UPDATE — WHERE conditions guard against race-window double-spend.
  // Race note: between the pre-flight SELECT and this UPDATE, another request could
  // mutate the row. The conditions in WHERE ensure no money moves if the state changed.
  // If the UPDATE matches 0 rows (race), we return goal_deposit_conflict — the only
  // durable guarantee is that no funds moved. A wrong 4xx in this race is acceptable
  // since the user will retry. This race exists in Flask's _apply_goal_deposit too.
  await db
    .update(savingsGoals)
    .set({ currentKd: sql`${savingsGoals.currentKd} + ${formatKd(amount)}` })
    .where(
      and(
        eq(savingsGoals.id, id),
        eq(savingsGoals.userId, userId),
        eq(savingsGoals.isActive, true),
        sql`${savingsGoals.currentKd} < ${savingsGoals.targetKd}`,
        sql`${savingsGoals.currentKd} + ${formatKd(amount)} <= ${savingsGoals.targetKd}`,
      ),
    )

  const [afterUpdateGoal] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .limit(1)

  // Verify the UPDATE applied by checking the current balance changed as expected.
  const expectedCurrentKd = formatKd(preflightCurrent.plus(amount))
  if (!afterUpdateGoal || afterUpdateGoal.currentKd !== expectedCurrentKd) {
    return c.json(
      {
        ok: false,
        data: null,
        error: "Savings goal deposit could not be applied. Please try again.",
        code: "goal_deposit_conflict",
      },
      409,
    )
  }

  ;(async () => {
    try {
      await cacheBustSafeToSpend(userId)
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "savings-goals.deposit.cacheBust", userId } })
    }
  })()

  await recordEvent(
    userId,
    "savings_goal.deposit",
    {
      goal_id: afterUpdateGoal.id,
      goal_name: afterUpdateGoal.name,
      amount_kd: formatKd(amount),
    },
    db,
  )

  // Milestone detection: check if 25/50/75/100% thresholds were crossed.
  const targetKdDec = new Decimal(afterUpdateGoal.targetKd ?? "0")
  if (targetKdDec.gt(0)) {
    const afterCurrentDec = new Decimal(afterUpdateGoal.currentKd ?? "0")
    const beforePct = preflightCurrent.div(targetKdDec).mul(100)
    const afterPct = afterCurrentDec.div(targetKdDec).mul(100)
    for (const marker of [25, 50, 75, 100]) {
      const markerPct = new Decimal(marker)
      if (beforePct.lt(markerPct) && markerPct.lte(afterPct)) {
        const eventName = `goal_milestone_${afterUpdateGoal.id}_${marker}`.slice(0, 64)
        await recordEventOnce(
          userId,
          eventName,
          {
            goal_id: afterUpdateGoal.id,
            goal_name: afterUpdateGoal.name,
            milestone_pct: marker,
            current_kd: formatKd(afterCurrentDec),
            target_kd: formatKd(targetKdDec),
          },
          db,
        )
        // Fire-and-forget: dispatch milestone email. Errors must not block the response.
        ;(async () => {
          try {
            await getQueue().add("send-goal-milestone-email", {
              userId,
              goalId: afterUpdateGoal.id,
              goalName: afterUpdateGoal.name,
              milestonePct: marker,
              currentKd: formatKd(afterCurrentDec),
              targetKd: formatKd(targetKdDec),
            })
          } catch (err) {
            Sentry.captureException(err, {
              tags: { handler: "savings-goals.deposit.milestone-email", userId, marker },
            })
          }
        })()
      }
    }
  }

  const projection = await goalProjection(
    { id: afterUpdateGoal.id, userId: afterUpdateGoal.userId, targetKd: afterUpdateGoal.targetKd, currentKd: afterUpdateGoal.currentKd, targetDate: toTargetDateStr(afterUpdateGoal.targetDate) },
    db,
  )

  return c.json({
    ok: true,
    data: { goal: { ...serializeGoal(afterUpdateGoal), projection } },
    error: null,
    meta: {},
  })
})

// ── DELETE /api/savings-goals/:id ─────────────────────────────────────────────
// Soft-delete: sets is_active = false, row is preserved. Flask used POST /:id/delete;
// ported to DELETE /:id per REST convention.

savingsGoalsRouter.delete("/:id{[0-9]+}", requireAuth, searchRateLimit, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const db = getDb()

  const [goal] = await db
    .select()
    .from(savingsGoals)
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .limit(1)

  if (!goal) {
    return c.json({ ok: false, data: null, error: "Savings goal not found.", code: "not_found" }, 404)
  }

  await db.update(savingsGoals).set({ isActive: false }).where(eq(savingsGoals.id, id))

  ;(async () => {
    try {
      await cacheBustSafeToSpend(userId)
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "savings-goals.delete.cacheBust", userId } })
    }
  })()

  const [updated] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1)
  const projection = await goalProjection(
    { id: updated.id, userId: updated.userId, targetKd: updated.targetKd, currentKd: updated.currentKd, targetDate: toTargetDateStr(updated.targetDate) },
    db,
  )

  return c.json({ ok: true, data: { goal: { ...serializeGoal(updated), projection } }, error: null, meta: {} })
})
