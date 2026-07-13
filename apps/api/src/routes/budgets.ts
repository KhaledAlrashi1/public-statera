// POST is a full atomic replace for the given month — every budget for the
// month is deleted and re-inserted from the request body. Partial updates are
// not supported. The frontend MUST send the complete list of budgets it wants
// to exist for the month.

import { Hono } from "hono"
import { z } from "zod"
import { and, eq, sql } from "drizzle-orm"
import Decimal from "decimal.js"
import { getDb } from "../db/connection"
import { zodErrorToEnvelope } from "./route-helpers"
import { budgets } from "../db/schema/budgets"
import { categories } from "../db/schema/categories"
import { transactions } from "../db/schema/transactions"
import { userProfiles } from "../db/schema/users"
import { requireAuth } from "../middleware/auth"
import { readRateLimit, heavyWriteRateLimit } from "../lib/rate-limit"
import { Sentry } from "../lib/sentry"
import { getOrCreateCategory } from "../lib/transaction-lib"
import { parseKd, formatKd } from "../lib/transaction-lib"
import { cacheBustSafeToSpend } from "../lib/analytics-cache"
import { recordEvent, recordEventOnce } from "../lib/product-events-lib"

export const budgetsRouter = new Hono()

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_AMOUNT = new Decimal("999999.999")

// ── Input schemas (phase-4 10d zod-adoption B1, shape-only) ─────────────────────
// Messages are byte-identical to the pre-existing hand-written checks (Hono wire
// strings, incl. the trailing periods Hono added over Flask). Chaining .min(1)
// before .regex() preserves the required-then-format first-fail ordering.
const MonthQuerySchema = z
  .string()
  .trim()
  .min(1, "month is required (YYYY-MM).")
  .regex(MONTH_RE, "month must be in YYYY-MM format.")

// POST presence is a combined cross-field check with one bespoke message, then a
// month-format check. superRefine + early return reproduces that exact ordering
// (presence message on issues[0] for any presence failure; format message only
// when both are present). The permissive per-item reads + money/duplicate checks
// downstream are intentionally left hand-rolled (out of B1 shape scope).
const PostBudgetsShape = z
  .object({ month: z.unknown(), items: z.unknown() })
  .superRefine((b, ctx) => {
    const month = typeof b.month === "string" ? b.month.trim() : ""
    if (!month || !Array.isArray(b.items)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "month and items[] are required." })
      return
    }
    if (!MONTH_RE.test(month)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "month must be in YYYY-MM format." })
    }
  })

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeBudgetItem(row: { id: number; month: string; amountKd: string; categoryName: string | null }) {
  return {
    id: row.id,
    month: row.month,
    category: row.categoryName ?? "Uncategorized",
    amount_kd: formatKd(row.amountKd),
  }
}

// ── Income resolution ─────────────────────────────────────────────────────────
// Single source of truth for a user's income for a given month.
// Precedence: (1) sum of income-category transactions, (2) declared profile value.
//
// TODO(localization): The income detection filter pattern-matches against the
// English string 'income'. Users with non-English category names will not have
// their income detected, causing budget_to_income_pct to be null. Revisit when
// localizing or when is_income flag is reliably set on all income categories.

async function resolveIncomeForPeriod(
  userId: number,
  month: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ amountKd: Decimal | null; source: string | null }> {
  const [year, mon] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`
  const monthEnd = new Date(new Date(nextMonth).getTime() - 86_400_000).toISOString().slice(0, 10)

  const [incomeRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amountKd}), '0')` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.date} >= ${monthStart}`,
        sql`${transactions.date} <= ${monthEnd}`,
        sql`(${categories.isIncome} = 1 OR LOWER(COALESCE(${categories.name}, '')) LIKE 'income%')`,
      ),
    )

  const detected = new Decimal(incomeRow?.total ?? "0")
  if (detected.gt(0)) {
    return { amountKd: detected, source: "detected_from_transactions" }
  }

  const [profile] = await db
    .select({ monthlyIncomeKd: userProfiles.monthlyIncomeKd, paydayDay: userProfiles.paydayDay })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (profile?.monthlyIncomeKd) {
    const declared = new Decimal(profile.monthlyIncomeKd)
    if (declared.gt(0)) {
      return { amountKd: declared, source: "declared_in_profile" }
    }
  }

  return { amountKd: null, source: null }
}

// ── Profile context builder ───────────────────────────────────────────────────

async function buildProfileContext(
  userId: number,
  month: string,
  items: Array<{ amount_kd: string }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
) {
  const budgetTotal = items.reduce((acc, it) => {
    try { return acc.plus(new Decimal(it.amount_kd)) } catch { return acc }
  }, new Decimal(0))

  const income = await resolveIncomeForPeriod(userId, month, db)
  const incomeKd = income.amountKd

  const [profile] = await db
    .select({ paydayDay: userProfiles.paydayDay })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  // Explicit divide-by-zero guard — decimal.js throws on .div(0), don't rely on try/catch
  let budgetToIncomePct: string | null = null
  if (incomeKd !== null && !incomeKd.isZero()) {
    budgetToIncomePct = budgetTotal.div(incomeKd).mul(100).toDecimalPlaces(1).toFixed(1)
  }

  return {
    budget_total_kd: budgetTotal.toFixed(3),
    monthly_income_kd: incomeKd !== null ? incomeKd.toFixed(3) : null,
    income_source: income.source,
    budget_to_income_pct: budgetToIncomePct,
    payday_day: profile?.paydayDay ?? null,
  }
}

// ── Budget payload builder ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildBudgetPayload(userId: number, month: string, db: any) {
  const rows = await db
    .select({
      id: budgets.id,
      month: budgets.month,
      amountKd: budgets.amountKd,
      categoryName: categories.name,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.userId, userId), eq(budgets.month, month)))
    .orderBy(sql`LOWER(${categories.name}) ASC`)

  const items = rows.map(serializeBudgetItem)
  const profileContext = await buildProfileContext(userId, month, items, db)

  return { month, items, profile_context: profileContext }
}

// ── GET /api/budgets/months ───────────────────────────────────────────────────

budgetsRouter.get("/months", requireAuth, readRateLimit, async (c) => {
  const { userId } = c.get("session")
  const db = getDb()

  const rows = await db
    .selectDistinct({ month: budgets.month })
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .orderBy(sql`${budgets.month} DESC`)

  return c.json({ ok: true, data: { months: rows.map((r) => r.month) }, error: null, meta: {} })
})

// ── GET /api/budgets ──────────────────────────────────────────────────────────

budgetsRouter.get("/", requireAuth, readRateLimit, async (c) => {
  const parsed = MonthQuerySchema.safeParse(c.req.query("month") ?? "")
  if (!parsed.success) return zodErrorToEnvelope(c, parsed.error)
  const month = parsed.data

  const { userId } = c.get("session")
  const db = getDb()
  const payload = await buildBudgetPayload(userId, month, db)
  return c.json({ ok: true, data: payload, error: null, meta: {} })
})

// ── POST /api/budgets ─────────────────────────────────────────────────────────

budgetsRouter.post("/", requireAuth, heavyWriteRateLimit, async (c) => {
  const { userId } = c.get("session")
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  const parsed = PostBudgetsShape.safeParse(body)
  if (!parsed.success) return zodErrorToEnvelope(c, parsed.error)
  // The refine guarantees month is a non-empty YYYY-MM string and items is an
  // array; re-derive from body so the permissive per-item reads below are
  // byte-identical to the pre-B1 handler.
  const month = ((body["month"] as string) ?? "").trim()
  const itemsRaw = body["items"]

  // ── Pre-flight: normalize names and check for duplicates before any DB write
  // Names are trimmed + whitespace-collapsed + lowercased for comparison so that
  // "Coffee" and "  Coffee  " (or "coffee") are caught as duplicates here, not
  // after getOrCreateCategory has already resolved them to the same row.

  type RawItem = Record<string, unknown>

  const seen = new Map<string, string>()  // normalizedKey → original display name
  const duplicateNames: string[] = []

  for (const it of itemsRaw as RawItem[]) {
    const raw = ((it["category"] as string) ?? "").trim()
    if (!raw) continue
    const key = raw.replace(/\s+/g, " ").toLowerCase()
    if (seen.has(key)) {
      if (!duplicateNames.includes(seen.get(key)!)) {
        duplicateNames.push(seen.get(key)!)
      }
    } else {
      seen.set(key, raw)
    }
  }

  if (duplicateNames.length > 0) {
    const sorted = [...duplicateNames].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    return c.json(
      {
        ok: false,
        data: null,
        error: `Duplicate categories: ${sorted.join(", ")}`,
        code: "budget_duplicate_category",
        meta: { duplicate_categories: sorted },
      },
      400,
    )
  }

  // ── Pre-flight: validate all amounts before touching the DB
  type ValidatedItem = { catName: string; amountKd: Decimal }
  const validated: ValidatedItem[] = []

  for (const normalizedKey of seen.keys()) {
    const it = (itemsRaw as RawItem[]).find(
      (r) => ((r["category"] as string) ?? "").trim().replace(/\s+/g, " ").toLowerCase() === normalizedKey,
    )!
    const catName = ((it["category"] as string) ?? "").trim()
    let amountKd: Decimal
    try {
      amountKd = parseKd(((it["amount_kd"] as string) ?? "").trim())
    } catch (e) {
      return c.json(
        { ok: false, data: null, error: `Budget amount for '${catName}': ${(e as Error).message}`, code: "validation_error" },
        400,
      )
    }
    if (amountKd.gt(MAX_AMOUNT)) {
      return c.json(
        { ok: false, data: null, error: `Budget amount for '${catName}' is too large.`, code: "validation_error" },
        400,
      )
    }
    validated.push({ catName, amountKd })
  }

  // ── Database: atomic delete + re-insert inside a transaction
  const db = getDb()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.transaction(async (tx: any) => {
      await tx.delete(budgets).where(and(eq(budgets.month, month), eq(budgets.userId, userId)))

      if (validated.length > 0) {
        const catCache = new Map<string, number>()
        const toInsert = []
        for (const { catName, amountKd } of validated) {
          const key = catName.toLowerCase()
          let categoryId = catCache.get(key)
          if (categoryId === undefined) {
            const cat = await getOrCreateCategory(catName, userId, tx)
            categoryId = cat!.id
            catCache.set(key, categoryId)
          }
          toInsert.push({ userId, month, categoryId, amountKd: formatKd(amountKd) })
        }
        await tx.insert(budgets).values(toInsert)
      }
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { handler: "budgets.post", userId, month } })
    console.error("[budgets.post] save failed userId=%d month=%s:", userId, month, err)
    return c.json({ ok: false, data: null, error: "Failed to save budgets.", code: "budget_save_failed" }, 500)
  }

  // ── Fire-and-forget: bust safe-to-spend cache (budget totals affect STS)
  ;(async () => {
    try {
      await cacheBustSafeToSpend(userId)
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "budgets.post.cacheBust", userId } })
    }
  })()

  // ── Fire-and-forget product events (errors never block the response)
  if (validated.length > 0) {
    const props = { month, categories: validated.length }
    await recordEvent(userId, "budget_saved", props, db)
    await recordEventOnce(userId, "first_budget_set", props, db)
  }

  const payload = await buildBudgetPayload(userId, month, db)
  return c.json({ ok: true, data: payload, error: null, meta: {} })
})
