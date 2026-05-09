import { Hono } from "hono"
import { and, eq, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../db/connection"
import { debtAccounts } from "../db/schema/debt-accounts"
import { requireAuth } from "../middleware/auth"
import { searchRateLimit } from "../lib/rate-limit"
import { formatKd } from "../lib/transaction-lib"
import { avalanchePlan, snowballPlan, minimumRequiredPayment } from "../lib/debt-calculator"
import { Sentry } from "../lib/sentry"
import { cacheBustDashboardMetrics, cacheBustSafeToSpend } from "../lib/analytics-cache"

export const debtRouter = new Hono()

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_DEBT_TYPES = new Set(["credit_card", "personal_loan", "car_loan", "other"])
const MAX_BALANCE = new Decimal("999999999.999")
const MAX_MINIMUM = new Decimal("9999999.999")
const MAX_APR = new Decimal("999.999")

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeAccount(row: {
  id: number
  name: string
  debtType: string
  balanceKd: string
  aprPct: string | null
  minimumPaymentKd: string
  dueDay: number | null
  isActive: boolean | number
  notes: string | null
  createdAt: Date | string
}) {
  return {
    id: row.id,
    name: row.name,
    debt_type: row.debtType,
    balance_kd: formatKd(row.balanceKd),
    minimum_payment_kd: formatKd(row.minimumPaymentKd),
    apr_pct: row.aprPct != null ? formatKd(row.aprPct) : null,
    due_day: row.dueDay ?? null,
    is_active: Boolean(row.isActive),
    notes: row.notes ?? null,
    created_at: toFlaskTimestamp(row.createdAt),
  }
}

function toFlaskTimestamp(d: Date | string): string {
  const iso = d instanceof Date ? d.toISOString() : new Date(d).toISOString()
  return iso.replace(/\.\d{3}Z$/, "+00:00")
}

// ── Validators ────────────────────────────────────────────────────────────────

function parseName(value: unknown): string {
  const name = String(value ?? "").trim()
  if (!name) throw new Error("name is required.")
  if (name.length > 128) throw new Error("name must be 128 characters or fewer.")
  return name
}

function parseDebtType(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase() || "other"
  if (!ALLOWED_DEBT_TYPES.has(normalized)) {
    throw new Error("debt_type must be one of: credit_card, personal_loan, car_loan, other.")
  }
  return normalized
}

function parseNonNegativeDecimal(
  value: unknown,
  fieldName: string,
  opts: { allowNone?: boolean; maxValue?: Decimal } = {},
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
  if (opts.maxValue != null && parsed.gt(opts.maxValue)) throw new Error(`${fieldName} is too large.`)
  return parsed
}

function parseDueDay(value: unknown, allowNone: boolean): number | null {
  if (value == null || String(value).trim() === "") {
    if (allowNone) return null
    throw new Error("due_day is required.")
  }
  const parsed = parseInt(String(value).trim(), 10)
  if (isNaN(parsed)) throw new Error("due_day must be an integer between 1 and 31.")
  if (parsed < 1 || parsed > 31) throw new Error("due_day must be between 1 and 31.")
  return parsed
}

function parseNotes(value: unknown): string | null {
  if (value == null) return null
  const notes = String(value).trim()
  if (!notes) return null
  if (notes.length > 255) throw new Error("notes must be 255 characters or fewer.")
  return notes
}

// ── ER_DUP_ENTRY detection ────────────────────────────────────────────────────
// Only MySQL error 1062 (ER_DUP_ENTRY) maps to 409 debt_name_conflict. All other
// DB errors propagate as 500. This is more correct than the broad-catch pattern
// used in categories/merchants — those should be retrofitted in a future cleanup.
// TODO(security-pass): retrofit categories/merchants to use ER_DUP_ENTRY-specific catch.

function isDupEntry(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message
    // mysql2 surfaces the MySQL error number in the message or as errno
    const asAny = err as unknown as { errno?: number; code?: string }
    if (asAny.errno === 1062 || asAny.code === "ER_DUP_ENTRY") return true
    if (msg.includes("ER_DUP_ENTRY") || msg.includes("Duplicate entry")) return true
  }
  return false
}

// ── buildDebtSummaryPayload ───────────────────────────────────────────────────
// Exported so aggregation routes (5b-2+) can include debt summary data without
// re-implementing the query.

type Db = ReturnType<typeof getDb>

export async function buildDebtSummaryPayload(userId: number, db: Db) {
  const [row] = await db
    .select({
      totalBalance: sql<string>`COALESCE(SUM(${debtAccounts.balanceKd}), '0')`,
      totalMinimum: sql<string>`COALESCE(SUM(${debtAccounts.minimumPaymentKd}), '0')`,
      accountCount: sql<number>`COUNT(${debtAccounts.id})`,
    })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.isActive, true)))

  return {
    total_balance_kd: formatKd(row?.totalBalance ?? "0"),
    total_minimum_kd: formatKd(row?.totalMinimum ?? "0"),
    account_count: Number(row?.accountCount ?? 0),
  }
}

// ── GET /api/debt-accounts ────────────────────────────────────────────────────

debtRouter.get("/", requireAuth, searchRateLimit, async (c) => {
  const includeInactive = ["1", "true", "yes", "on"].includes(
    (c.req.query("include_inactive") ?? "").trim().toLowerCase(),
  )
  const { userId } = c.get("session")
  const db = getDb()

  let where = and(eq(debtAccounts.userId, userId))
  if (!includeInactive) where = and(where, eq(debtAccounts.isActive, true))

  const rows = await db
    .select()
    .from(debtAccounts)
    .where(where)
    .orderBy(sql`LOWER(${debtAccounts.name}) ASC`, sql`${debtAccounts.id} ASC`)

  const accounts = rows.map(serializeAccount)
  return c.json({
    ok: true,
    data: { accounts, include_inactive: includeInactive },
    error: null,
    meta: { count: accounts.length },
  })
})

// ── GET /api/debt-accounts/summary ───────────────────────────────────────────

debtRouter.get("/summary", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()
  const data = await buildDebtSummaryPayload(userId, db)
  return c.json({ ok: true, data, error: null, meta: {} })
})

// ── GET /api/debt-accounts/payoff-plan ───────────────────────────────────────

debtRouter.get("/payoff-plan", requireAuth, searchRateLimit, async (c) => {
  const rawPayment = (c.req.query("monthly_payment") ?? "").trim()
  if (!rawPayment) {
    return c.json({ ok: false, data: null, error: "monthly_payment is required.", code: "validation_error" }, 400)
  }

  let monthlyPayment: Decimal
  try {
    const d = parseNonNegativeDecimal(rawPayment, "monthly_payment", { maxValue: MAX_BALANCE })
    if (d === null || d.lte(0)) {
      return c.json({ ok: false, data: null, error: "monthly_payment must be greater than zero.", code: "validation_error" }, 400)
    }
    monthlyPayment = d
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  const { userId } = c.get("session")
  const db = getDb()

  const rows = await db
    .select()
    .from(debtAccounts)
    .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.isActive, true)))
    .orderBy(sql`LOWER(${debtAccounts.name}) ASC`, sql`${debtAccounts.id} ASC`)

  const debts = rows.map((r) => ({
    id: r.id,
    name: r.name,
    balance_kd: r.balanceKd,
    apr_pct: r.aprPct ?? "0",
    minimum_payment_kd: r.minimumPaymentKd,
  }))

  const minimumRequired = minimumRequiredPayment(debts)
  if (debts.length > 0 && monthlyPayment.lt(minimumRequired)) {
    return c.json(
      {
        ok: false,
        data: null,
        error: `Monthly payment must exceed minimum total of ${formatKd(minimumRequired)} KD`,
        code: "PAYMENT_TOO_LOW",
      },
      400,
    )
  }

  const now = new Date()
  const startDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`

  const avalanche = avalanchePlan(debts, monthlyPayment, startDate)
  const snowball = snowballPlan(debts, monthlyPayment, startDate)

  return c.json({
    ok: true,
    data: {
      avalanche,
      snowball,
      minimum_required: formatKd(minimumRequired),
    },
    error: null,
    meta: {},
  })
})

// ── POST /api/debt-accounts ───────────────────────────────────────────────────

debtRouter.post("/", requireAuth, searchRateLimit, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  let name: string, debtType: string, balanceKd: Decimal, minimumPaymentKd: Decimal
  let dueDay: number | null, aprPct: Decimal | null, notes: string | null
  try {
    name = parseName(body["name"])
    debtType = parseDebtType(body["debt_type"])
    balanceKd = parseNonNegativeDecimal(body["balance_kd"], "balance_kd", { maxValue: MAX_BALANCE })!
    minimumPaymentKd = parseNonNegativeDecimal(body["minimum_payment_kd"], "minimum_payment_kd", { maxValue: MAX_MINIMUM })!
    dueDay = parseDueDay(body["due_day"], true)
    aprPct = parseNonNegativeDecimal(body["apr_pct"], "apr_pct", { allowNone: true, maxValue: MAX_APR })
    notes = parseNotes(body["notes"])
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  try {
    const [{ id }] = await db
      .insert(debtAccounts)
      .values({
        userId,
        name,
        debtType,
        balanceKd: formatKd(balanceKd),
        minimumPaymentKd: formatKd(minimumPaymentKd),
        dueDay,
        aprPct: aprPct != null ? formatKd(aprPct) : null,
        notes,
      })
      .$returningId()

    ;(async () => {
      try {
        await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
      } catch (err) {
        Sentry.captureException(err, { tags: { handler: "debt.post.cacheBust", userId } })
      }
    })()

    const [created] = await db.select().from(debtAccounts).where(eq(debtAccounts.id, id)).limit(1)
    return c.json({ ok: true, data: { account: serializeAccount(created) }, error: null, meta: {} }, 201)
  } catch (err) {
    if (isDupEntry(err)) {
      return c.json(
        { ok: false, data: null, error: "A debt account with this name already exists.", code: "debt_name_conflict" },
        409,
      )
    }
    throw err
  }
})

// ── PATCH /api/debt-accounts/:id ─────────────────────────────────────────────
// TODO(security-pass): Flask added PATCH and DELETE without rate limits.
// As mutating endpoints they probably should be rate-limited at the same tier
// as POST. Not changing in this migration; flag for a future security pass.

debtRouter.patch("/:id{[0-9]+}", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()

  const [account] = await db
    .select()
    .from(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, userId)))
    .limit(1)

  if (!account) {
    return c.json({ ok: false, data: null, error: "Debt account not found.", code: "not_found" }, 404)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {}
  try {
    if ("name" in body) patch.name = parseName(body["name"])
    if ("debt_type" in body) patch.debtType = parseDebtType(body["debt_type"])
    if ("balance_kd" in body) {
      patch.balanceKd = formatKd(parseNonNegativeDecimal(body["balance_kd"], "balance_kd", { maxValue: MAX_BALANCE })!)
    }
    if ("minimum_payment_kd" in body) {
      patch.minimumPaymentKd = formatKd(parseNonNegativeDecimal(body["minimum_payment_kd"], "minimum_payment_kd", { maxValue: MAX_MINIMUM })!)
    }
    if ("due_day" in body) patch.dueDay = parseDueDay(body["due_day"], true)
    if ("apr_pct" in body) {
      const apr = parseNonNegativeDecimal(body["apr_pct"], "apr_pct", { allowNone: true, maxValue: MAX_APR })
      patch.aprPct = apr != null ? formatKd(apr) : null
    }
    if ("notes" in body) patch.notes = parseNotes(body["notes"])
  } catch (e) {
    return c.json({ ok: false, data: null, error: (e as Error).message, code: "validation_error" }, 400)
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ ok: true, data: { account: serializeAccount(account) }, error: null, meta: {} })
  }

  try {
    await db.update(debtAccounts).set(patch).where(eq(debtAccounts.id, id))
  } catch (err) {
    if (isDupEntry(err)) {
      return c.json(
        { ok: false, data: null, error: "A debt account with this name already exists.", code: "debt_name_conflict" },
        409,
      )
    }
    throw err
  }

  ;(async () => {
    try {
      await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "debt.patch.cacheBust", userId } })
    }
  })()

  const [updated] = await db.select().from(debtAccounts).where(eq(debtAccounts.id, id)).limit(1)
  return c.json({ ok: true, data: { account: serializeAccount(updated) }, error: null, meta: {} })
})

// ── DELETE /api/debt-accounts/:id ─────────────────────────────────────────────
// Soft-delete: sets is_active = false, row is preserved. Flask matches.
// TODO(security-pass): rate-limit this endpoint (see PATCH comment above).

debtRouter.delete("/:id{[0-9]+}", requireAuth, async (c) => {
  const id = Number(c.req.param("id"))
  const { userId } = c.get("session")
  const db = getDb()

  const [account] = await db
    .select()
    .from(debtAccounts)
    .where(and(eq(debtAccounts.id, id), eq(debtAccounts.userId, userId)))
    .limit(1)

  if (!account) {
    return c.json({ ok: false, data: null, error: "Debt account not found.", code: "not_found" }, 404)
  }

  await db.update(debtAccounts).set({ isActive: false }).where(eq(debtAccounts.id, id))

  ;(async () => {
    try {
      await Promise.all([cacheBustDashboardMetrics(userId, db), cacheBustSafeToSpend(userId)])
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "debt.delete.cacheBust", userId } })
    }
  })()

  const [updated] = await db.select().from(debtAccounts).where(eq(debtAccounts.id, id)).limit(1)
  return c.json({ ok: true, data: { account: serializeAccount(updated) }, error: null, meta: {} })
})
