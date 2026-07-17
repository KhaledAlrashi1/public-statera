// User-scoped demo workspace seeding and cleanup.
//
// Flask port of personal-finance/backend/lib/demo_data.py (HEAD 202a1548).
// Routes stay thin; this lib does the work, mirroring the Flask lib split.
//
// Deliberate deviations from personal-finance source:
//  1. Category/merchant storage (inherited, project-wide): memorized rows carry FK ids +
//     LEFT JOIN at read time (Phase 2), vs Flask's denormalized name strings. Via the shared
//     learnTransaction helper; API surface identical. See lib/suggestions-lib.ts.
//  2. _hasFinancialData omits BankConnection (personal_statera/backend/lib/demo_data.py:306
//     includes it; personal-finance:305 does not). Bank sync is deferred in public-statera —
//     no bank_connections writes exist, so the check would be dead. Operator-approved omit.
//  3. Atomicity boundary: the whole seed / clear runs inside a single db.transaction(tx) handed
//     in by the route (Flask stages in the lib and commits in the route — same all-or-nothing
//     guarantee, expressed with an explicit tx handle threaded through every helper).
//  4. Envelope/timestamps: callers return the project {ok,data,error,meta} envelope; loaded_at
//     uses the project +00:00 no-ms format.
//  5. learnTransaction priming (inherited quirk, operator-flagged for Module 11): demo-load
//     primes memorized_transactions via learnTransaction per seeded non-dup row (faithful to
//     Flask create_transaction_with_dup_check:172). clearDemoWorkspace does NOT remove those
//     memorized rows — confirmed against personal-finance/backend/lib/demo_data.py:545-586 and
//     personal_statera:546-587 (neither references MemorizedTransaction). The primed rows
//     survive a clear. Recorded as an input to Module 11 suggestion-quality design.

import Decimal from "decimal.js"
import { and, eq, inArray, sql } from "drizzle-orm"
import { transactions } from "../db/schema/transactions"
import { budgets } from "../db/schema/budgets"
import { userProfiles } from "../db/schema/users"
import { productEvents } from "../db/schema/product-events"
import {
  createTransactionWithDupCheck,
  getOrCreateCategory,
  getOrCreateMerchant,
  learnTransaction,
  formatKd,
} from "./transaction-lib"
import { recordEvent, recordEventOnce } from "./product-events-lib"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any

export const DEMO_TRANSACTION_SOURCE = "demo"
export const DEMO_DATA_EVENT = "demo_data_loaded"
export const DEMO_MANIFEST_EVENT = "demo_workspace_manifest"
export const DEMO_CLEARED_EVENT = "demo_data_cleared"
export const DEMO_REPLACED_WITH_IMPORT_EVENT = "demo_data_replaced_with_import"

// Flask _DEMO_PROFILE_DEFAULTS (demo_data.py:32-36).
const DEMO_PROFILE_DEFAULTS = {
  monthly_income_kd: "1800.000",
  payday_day: 25,
  country: "Kuwait",
} as const

// Flask _DEMO_BUDGETS (demo_data.py:79-87).
const DEMO_BUDGETS: ReadonlyArray<readonly [string, string]> = [
  ["Housing", "450.000"],
  ["Groceries", "150.000"],
  ["Dining", "95.000"],
  ["Transport", "70.000"],
  ["Utilities", "40.000"],
  ["Entertainment", "55.000"],
  ["Health", "30.000"],
]

export class DemoDataConflictError extends Error {
  constructor(message = "Demo data can only be loaded into an empty account.") {
    super(message)
    this.name = "DemoDataConflictError"
  }
}

export class DemoDataNotLoadedError extends Error {
  constructor(message = "No active demo workspace was found.") {
    super(message)
    this.name = "DemoDataNotLoadedError"
  }
}

type DemoTransactionTemplate = {
  monthOffset: number
  day: number
  category: string
  name: string
  amountKd: string
  merchant: string | null
}

function demoTx(
  monthOffset: number,
  day: number,
  category: string,
  name: string,
  amountKd: string,
  merchant: string | null = null,
): DemoTransactionTemplate {
  return { monthOffset, day, category, name, amountKd, merchant }
}

// Flask _build_demo_transactions (demo_data.py:100-219). 6 month-specs (offsets -5..0);
// each yields 12 fixed rows + 1 `extra` + optional `bonus`.
type MonthSpec = {
  offset: number
  salary: string
  groceries_a: string
  groceries_b: string
  mobile: string
  dining: string
  coffee: string
  transport_a: string
  transport_b: string
  subscription: string
  utilities_extra: string
  extra: readonly [string, string, string, string]
  bonus?: readonly [string, string, string, string]
}

const MONTH_SPECS: ReadonlyArray<MonthSpec> = [
  {
    offset: -5, salary: "1800.000", groceries_a: "44.600", groceries_b: "18.400", mobile: "6.900",
    dining: "9.800", coffee: "2.900", transport_a: "8.400", transport_b: "3.200",
    subscription: "6.500", utilities_extra: "11.800",
    extra: ["Health", "Pharmacy run", "12.700", "Boots"],
  },
  {
    offset: -4, salary: "1800.000", groceries_a: "47.200", groceries_b: "21.300", mobile: "7.100",
    dining: "6.200", coffee: "3.100", transport_a: "9.100", transport_b: "4.000",
    subscription: "4.500", utilities_extra: "10.900",
    extra: ["Shopping", "Weekend basics", "17.500", "Centrepoint"],
    bonus: ["Income: Freelance", "Weekend consulting", "120.000", "Side Project"],
  },
  {
    offset: -3, salary: "1800.000", groceries_a: "41.900", groceries_b: "19.100", mobile: "6.800",
    dining: "13.600", coffee: "2.600", transport_a: "8.200", transport_b: "3.600",
    subscription: "4.500", utilities_extra: "12.100",
    extra: ["Household", "Home essentials", "14.400", "IKEA"],
  },
  {
    offset: -2, salary: "1800.000", groceries_a: "49.300", groceries_b: "22.600", mobile: "7.000",
    dining: "18.900", coffee: "3.400", transport_a: "7.900", transport_b: "4.200",
    subscription: "4.500", utilities_extra: "11.400",
    extra: ["Health", "Dentist visit", "28.000", "Dental Studio"],
    bonus: ["Income: Cashback", "Card cashback", "8.500", "NBK"],
  },
  {
    offset: -1, salary: "1800.000", groceries_a: "52.800", groceries_b: "20.800", mobile: "7.200",
    dining: "16.200", coffee: "2.800", transport_a: "8.900", transport_b: "3.800",
    subscription: "4.500", utilities_extra: "10.700",
    extra: ["Gifts", "Birthday gift", "13.200", "Miniso"],
  },
  {
    offset: 0, salary: "1800.000", groceries_a: "46.700", groceries_b: "24.400", mobile: "7.000",
    dining: "14.200", coffee: "3.200", transport_a: "8.600", transport_b: "4.100",
    subscription: "4.500", utilities_extra: "12.300",
    extra: ["Housing", "Unexpected plumbing fix", "92.000", "HomeFix"],
    bonus: ["Income: Freelance", "Freelance project", "160.000", "Upwork"],
  },
]

function buildDemoTransactions(): DemoTransactionTemplate[] {
  const templates: DemoTransactionTemplate[] = []
  for (const spec of MONTH_SPECS) {
    const o = spec.offset
    templates.push(
      demoTx(o, 25, "Income: Salary", "Monthly salary", spec.salary, "Acme Co."),
      demoTx(o, 1, "Housing", "Apartment rent", "450.000", "Pearl Residences"),
      demoTx(o, 4, "Groceries", "Weekly groceries", spec.groceries_a, "Lulu Hypermarket"),
      demoTx(o, 18, "Groceries", "Top-up groceries", spec.groceries_b, "Carrefour"),
      demoTx(o, 7, "Utilities", "Home internet", "15.000", "Ooredoo"),
      demoTx(o, 9, "Utilities", "Mobile plan", spec.mobile, "STC"),
      demoTx(o, 11, "Dining", "Coffee run", spec.coffee, "% Arabica"),
      demoTx(o, 13, "Dining", "Lunch out", spec.dining, "Pick"),
      demoTx(o, 15, "Transport", "Ride share", spec.transport_a, "Careem"),
      demoTx(o, 22, "Transport", "Fuel top-up", spec.transport_b, "Q8 Fuel"),
      demoTx(o, 21, "Entertainment", "Streaming subscription", spec.subscription, "Netflix"),
      demoTx(o, 23, "Utilities", "Electricity and water", spec.utilities_extra, "MEW"),
    )
    templates.push(demoTx(o, 26, spec.extra[0], spec.extra[1], spec.extra[2], spec.extra[3]))
    if (spec.bonus) {
      templates.push(demoTx(o, 28, spec.bonus[0], spec.bonus[1], spec.bonus[2], spec.bonus[3]))
    }
  }
  return templates
}

const DEMO_TRANSACTIONS = buildDemoTransactions()

// ── Date helpers (Flask _month_start_for / _date_for, demo_data.py:225-244) ──

function monthStartFor(offset: number): { year: number; month: number } {
  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() + 1 + offset // 1-based month
  while (month < 1) {
    month += 12
    year -= 1
  }
  while (month > 12) {
    month -= 12
    year += 1
  }
  return { year, month }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dateFor(monthOffset: number, day: number): string {
  const { year, month } = monthStartFor(monthOffset)
  const clamped = Math.min(Math.max(1, day), daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`
}

function currentMonthKey(): string {
  const { year, month } = monthStartFor(0)
  return `${year}-${String(month).padStart(2, "0")}`
}

// ── Manifest (Flask DemoWorkspaceManifest + _latest_manifest, demo_data.py:57-76, 266-298) ──

type DemoWorkspaceManifest = {
  month: string
  monthsSeeded: number
  transactionIds: number[]
  budgetIds: number[]
  profileSeededFields: string[]
}

function manifestToProperties(m: DemoWorkspaceManifest): Record<string, unknown> {
  return {
    month: m.month,
    months_seeded: m.monthsSeeded,
    transaction_ids: m.transactionIds,
    budget_ids: m.budgetIds,
    profile_seeded_fields: m.profileSeededFields,
  }
}

function coerceIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Number(item)
    if (Number.isInteger(n)) out.push(n)
  }
  return out
}

async function latestManifest(tx: Tx, userId: number): Promise<DemoWorkspaceManifest | null> {
  const [row] = await tx
    .select({ propertiesJson: productEvents.propertiesJson })
    .from(productEvents)
    .where(and(eq(productEvents.userId, userId), eq(productEvents.eventName, DEMO_MANIFEST_EVENT)))
    .orderBy(sql`${productEvents.id} DESC`)
    .limit(1)

  if (!row || !row.propertiesJson) return null
  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(row.propertiesJson)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    payload = parsed as Record<string, unknown>
  } catch {
    return null
  }

  const seededRaw = payload.profile_seeded_fields
  const profileSeededFields = (Array.isArray(seededRaw) ? seededRaw : []).filter(
    (f): f is string => typeof f === "string" && f in DEMO_PROFILE_DEFAULTS,
  )

  // phase4 SC-1/2 (C9): the retired snake_case keys `debt_account_ids` / `savings_goal_ids`
  // may still be present on a LEGACY stored manifest written before the debt/savings features
  // were removed. They are simply not read here — JSON.parse tolerates the extra keys, so a
  // legacy manifest is handled without error and those ids are ignored.
  return {
    month: typeof payload.month === "string" && payload.month ? payload.month : currentMonthKey(),
    monthsSeeded: Math.max(1, Number(payload.months_seeded) || 6),
    transactionIds: coerceIdList(payload.transaction_ids),
    budgetIds: coerceIdList(payload.budget_ids),
    profileSeededFields,
  }
}

// ── Demo-scoped selectors with manifest fallbacks (Flask _demo_*_query, :460-486) ──

function demoTransactionWhere(userId: number, manifest: DemoWorkspaceManifest | null) {
  if (manifest && manifest.transactionIds.length > 0) {
    return and(eq(transactions.userId, userId), inArray(transactions.id, manifest.transactionIds))
  }
  return and(eq(transactions.userId, userId), eq(transactions.source, DEMO_TRANSACTION_SOURCE))
}

function demoBudgetWhere(userId: number, manifest: DemoWorkspaceManifest | null) {
  if (manifest && manifest.budgetIds.length > 0) {
    return and(eq(budgets.userId, userId), inArray(budgets.id, manifest.budgetIds))
  }
  // Flask fallback matches nothing (Budget.id == -1) — budgets are manifest-only.
  return and(eq(budgets.userId, userId), sql`1 = 0`)
}

// ── Empty-account guard (Flask _has_financial_data, :301-309; BankConnection omitted) ──

async function hasFinancialData(tx: Tx, userId: number): Promise<boolean> {
  const [profile] = await tx
    .select({ monthlyIncomeKd: userProfiles.monthlyIncomeKd, paydayDay: userProfiles.paydayDay })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  if (profile && (profile.monthlyIncomeKd != null || profile.paydayDay != null)) return true

  const checks: Array<Promise<Array<{ id: number }>>> = [
    tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, userId)).limit(1),
    tx.select({ id: budgets.id }).from(budgets).where(eq(budgets.userId, userId)).limit(1),
  ]
  const results = await Promise.all(checks)
  return results.some((rows) => rows.length > 0)
}

// ── Profile seeding (Flask _ensure_profile, :312-328) ──

async function ensureProfile(tx: Tx, userId: number): Promise<string[]> {
  const [existing] = await tx
    .select({
      monthlyIncomeKd: userProfiles.monthlyIncomeKd,
      paydayDay: userProfiles.paydayDay,
      country: userProfiles.country,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  const seeded: string[] = []
  if (!existing) {
    await tx.insert(userProfiles).values({
      userId,
      monthlyIncomeKd: DEMO_PROFILE_DEFAULTS.monthly_income_kd,
      paydayDay: DEMO_PROFILE_DEFAULTS.payday_day,
      country: DEMO_PROFILE_DEFAULTS.country,
    })
    seeded.push("monthly_income_kd", "payday_day", "country")
    return seeded
  }

  const set: Record<string, unknown> = {}
  if (existing.monthlyIncomeKd == null) {
    set.monthlyIncomeKd = DEMO_PROFILE_DEFAULTS.monthly_income_kd
    seeded.push("monthly_income_kd")
  }
  if (existing.paydayDay == null) {
    set.paydayDay = DEMO_PROFILE_DEFAULTS.payday_day
    seeded.push("payday_day")
  }
  if (!existing.country) {
    set.country = DEMO_PROFILE_DEFAULTS.country
    seeded.push("country")
  }
  if (Object.keys(set).length > 0) {
    await tx.update(userProfiles).set(set).where(eq(userProfiles.userId, userId))
  }
  return seeded
}

// ── Budget seeding (Flask _ensure_budget, :331-339) ──

async function ensureBudget(
  tx: Tx,
  month: string,
  categoryName: string,
  amountKd: string,
  userId: number,
): Promise<{ id: number; created: boolean }> {
  const category = await getOrCreateCategory(categoryName, userId, tx)
  const categoryId = category?.id ?? null
  const amountStr = formatKd(new Decimal(amountKd))

  const [existing] = await tx
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.month, month), eq(budgets.categoryId, categoryId!)))
    .limit(1)

  if (!existing) {
    const [{ id }] = await tx
      .insert(budgets)
      .values({ userId, month, categoryId, amountKd: amountStr })
      .$returningId()
    return { id, created: true }
  }
  await tx.update(budgets).set({ amountKd: amountStr }).where(eq(budgets.id, existing.id))
  return { id: existing.id, created: false }
}

// ── Single demo transaction (Flask _create_demo_transaction, :376-392) ──
// Faithful to Flask: create with force=false + source="demo", and on a non-dup success
// prime memorized_transactions via learnTransaction (Flask does this inside
// create_transaction_with_dup_check:172; Hono's helper defers it to the caller).

async function createDemoTransaction(tx: Tx, template: DemoTransactionTemplate, userId: number): Promise<number | null> {
  const category = await getOrCreateCategory(template.category, userId, tx)
  const merchant = template.merchant ? await getOrCreateMerchant(template.merchant, userId, tx) : null
  const categoryId = category?.id ?? null
  const merchantId = merchant?.id ?? null

  const { txnId, isDup, errorMsg } = await createTransactionWithDupCheck(tx, {
    txnDate: dateFor(template.monthOffset, template.day),
    categoryId,
    merchantId,
    name: template.name,
    amountKd: new Decimal(template.amountKd),
    userId,
    force: false,
    source: DEMO_TRANSACTION_SOURCE,
  })
  if (errorMsg || txnId == null || isDup) return null

  await learnTransaction(tx, template.name, userId, { categoryId, merchantId })
  return txnId
}

// ── Public: load (Flask load_demo_workspace, :404-457) ──

export type DemoLoadSummary = {
  month: string
  transactions_created: number
  budgets_created: number
  months_seeded: number
}

export async function loadDemoWorkspace(tx: Tx, userId: number): Promise<DemoLoadSummary> {
  if (await hasFinancialData(tx, userId)) {
    throw new DemoDataConflictError()
  }

  const profileSeededFields = await ensureProfile(tx, userId)

  const month = currentMonthKey()
  const budgetIds: number[] = []
  let budgetsCreated = 0
  for (const [categoryName, amountKd] of DEMO_BUDGETS) {
    const { id, created } = await ensureBudget(tx, month, categoryName, amountKd, userId)
    budgetIds.push(id)
    if (created) budgetsCreated += 1
  }

  const transactionIds: number[] = []
  for (const template of DEMO_TRANSACTIONS) {
    const id = await createDemoTransaction(tx, template, userId)
    if (id != null) transactionIds.push(id)
  }

  const manifest: DemoWorkspaceManifest = {
    month,
    monthsSeeded: 6,
    transactionIds,
    budgetIds,
    profileSeededFields,
  }

  await recordEvent(userId, DEMO_MANIFEST_EVENT, manifestToProperties(manifest), tx)
  await recordEventOnce(
    userId,
    DEMO_DATA_EVENT,
    {
      transactions_created: transactionIds.length,
      budgets_created: budgetsCreated,
      months_seeded: manifest.monthsSeeded,
    },
    tx,
  )

  return {
    month,
    transactions_created: transactionIds.length,
    budgets_created: budgetsCreated,
    months_seeded: manifest.monthsSeeded,
  }
}

// ── Profile fields still at demo default (Flask _profile_demo_fields_remaining, :488-502) ──

async function profileDemoFieldsRemaining(
  tx: Tx,
  userId: number,
  manifest: DemoWorkspaceManifest | null,
): Promise<string[]> {
  const [profile] = await tx
    .select({
      monthlyIncomeKd: userProfiles.monthlyIncomeKd,
      paydayDay: userProfiles.paydayDay,
      country: userProfiles.country,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)
  if (!profile) return []

  const seededFields = manifest ? manifest.profileSeededFields : []
  const remaining: string[] = []
  for (const field of seededFields) {
    if (
      field === "monthly_income_kd" &&
      profile.monthlyIncomeKd != null &&
      formatKd(new Decimal(profile.monthlyIncomeKd)) === DEMO_PROFILE_DEFAULTS.monthly_income_kd
    ) {
      remaining.push(field)
    } else if (
      field === "payday_day" &&
      Number(profile.paydayDay ?? 0) === DEMO_PROFILE_DEFAULTS.payday_day
    ) {
      remaining.push(field)
    } else if (field === "country" && (profile.country ?? "").trim() === DEMO_PROFILE_DEFAULTS.country) {
      remaining.push(field)
    }
  }
  return remaining
}

// ── Demo workspace state (Flask get_demo_workspace_state, :505-542) ──
// Full snake_case shape matches apps/web DemoWorkspaceState; consumed by clear,
// GET /api/auth/profile (10b-3 D2), and import-commit's demo-replace guard.

export type DemoWorkspaceState = {
  active: boolean
  clearable: boolean
  loaded_at: string | null
  month: string
  months_seeded: number
  transactions: number
  budgets: number
  profile_seeded_fields: string[]
}

// getDemoWorkspaceState() — reads the latest manifest itself so callers can pass just
// (tx, userId); load/clear that already hold the manifest use the internal variant.
export async function getDemoWorkspaceState(tx: Tx, userId: number): Promise<DemoWorkspaceState> {
  const manifest = await latestManifest(tx, userId)
  return getDemoWorkspaceStateWithManifest(tx, userId, manifest)
}

async function getDemoWorkspaceStateWithManifest(
  tx: Tx,
  userId: number,
  manifest: DemoWorkspaceManifest | null,
): Promise<DemoWorkspaceState> {
  const [txnCount] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(demoTransactionWhere(userId, manifest))
  const [budgetCount] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(budgets)
    .where(demoBudgetWhere(userId, manifest))

  const profileFields = await profileDemoFieldsRemaining(tx, userId, manifest)

  const transactionCount = Number(txnCount?.n ?? 0)
  const budgetCountN = Number(budgetCount?.n ?? 0)

  const active =
    transactionCount > 0 ||
    budgetCountN > 0 ||
    profileFields.length > 0

  // loaded_at: event_ts of the latest manifest (fallback: latest demo_data_loaded) event.
  const [tsRow] = await tx
    .select({ ts: productEvents.eventTs })
    .from(productEvents)
    .where(
      and(
        eq(productEvents.userId, userId),
        inArray(productEvents.eventName, [DEMO_MANIFEST_EVENT, DEMO_DATA_EVENT]),
      ),
    )
    .orderBy(sql`${productEvents.id} DESC`)
    .limit(1)
  const loadedAt = tsRow?.ts
    ? new Date(tsRow.ts).toISOString().replace(/\.\d{3}Z$/, "+00:00")
    : null

  return {
    active,
    clearable: active,
    loaded_at: loadedAt,
    month: manifest ? manifest.month : currentMonthKey(),
    months_seeded: manifest ? manifest.monthsSeeded : 6,
    transactions: transactionCount,
    budgets: budgetCountN,
    profile_seeded_fields: profileFields,
  }
}

// ── Public: clear (Flask clear_demo_workspace, :545-586) ──

export type DemoClearSummary = {
  transactions_cleared: number
  budgets_cleared: number
  profile_fields_cleared: string[]
}

export async function clearDemoWorkspace(tx: Tx, userId: number): Promise<DemoClearSummary> {
  const manifest = await latestManifest(tx, userId)
  const state = await getDemoWorkspaceStateWithManifest(tx, userId, manifest)
  if (!state.active) {
    throw new DemoDataNotLoadedError()
  }

  const demoTxns = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(demoTransactionWhere(userId, manifest))
  const transactionsCleared = demoTxns.length
  if (transactionsCleared > 0) {
    await tx.delete(transactions).where(demoTransactionWhere(userId, manifest))
  }

  // phase4 SC-1/2 (C9): only transactions/budgets/profile are cleared. A LEGACY manifest may
  // still carry debt_account_ids / savings_goal_ids, but those are no longer read (see
  // latestManifest) and there is no debt/savings delete here — the guard ignores them without
  // error. Any orphaned legacy debt/savings rows are removed when SC-3 drops the tables.
  const budgetRows = await tx.delete(budgets).where(demoBudgetWhere(userId, manifest))

  const profileClearedFields: string[] = []
  if (state.profile_seeded_fields.length > 0) {
    const set: Record<string, unknown> = {}
    for (const field of state.profile_seeded_fields) {
      if (field === "monthly_income_kd") {
        set.monthlyIncomeKd = null
        profileClearedFields.push(field)
      } else if (field === "payday_day") {
        set.paydayDay = null
        profileClearedFields.push(field)
      } else if (field === "country") {
        set.country = null
        profileClearedFields.push(field)
      }
    }
    if (Object.keys(set).length > 0) {
      await tx.update(userProfiles).set(set).where(eq(userProfiles.userId, userId))
    }
  }

  const summary: DemoClearSummary = {
    transactions_cleared: transactionsCleared,
    budgets_cleared: affectedRows(budgetRows),
    profile_fields_cleared: profileClearedFields,
  }
  await recordEvent(userId, DEMO_CLEARED_EVENT, { ...summary }, tx)
  return summary
}

// MySQL2 delete result carries affectedRows on the first tuple element.
function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const head = result[0] as { affectedRows?: number } | undefined
    return Number(head?.affectedRows ?? 0)
  }
  const rec = result as { affectedRows?: number } | undefined
  return Number(rec?.affectedRows ?? 0)
}
