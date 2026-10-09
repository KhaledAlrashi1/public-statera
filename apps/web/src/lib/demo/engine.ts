// MOB-R95 C5 — the demo's answers, computed in TS over the sample (option a, R94 D5).
//
// Each answer is the JSON the real route returns, built by the same rules, so the screens parse it unchanged.
// The source of every rule is named beside it (apps/api file:function). Money is decimal.js, as on the server,
// so amounts round the same way. Payday periods come from lib/payday-months.ts.
//
// This file is pure: no window, no storage, no fetch. The browser transport (transport.ts) holds one state per
// page load; the API parity test (apps/api .../demo-parity.integration.test.ts) imports this file directly and
// compares its answers with the real routes'. Imports are relative so that test can resolve them.
//
// Deliberate differences from the server, each a default the screens tolerate (listed in the MOB-R95 report):
//   - ids are the demo's own (1, 2, 3 … in sample order), not database ids;
//   - snapshot_computed_at is null (no snapshot table); dashboard-metrics' updated_at is the state's build time;
//   - budget_alerts.items is [] (the server's come from product_events rows a worker job writes; a fresh
//     account has none);
//   - a save never answers 409 (no duplicate check) and never learns memorized rows.

import Decimal from "decimal.js"

import { paydayActive, periodBoundsForKey, periodKeyForDate, shiftKey } from "../payday-months"

// ── Sample ───────────────────────────────────────────────────────────────────

export type DemoSample = {
  person: { first_name: string; last_name: string | null; display_name: string; email: string }
  profile: {
    monthly_income_kd: string | null
    payday_day: number | null
    country: string | null
    timezone: string
    email_notifications_enabled: boolean
    setup_guide_seen: boolean
    setup_guide_dismissed: boolean
  }
  categories: Array<{ name: string; is_income: boolean }>
  budgets_current_period: Array<{ category: string; amount_kd: string }>
  transactions: Array<{ offset_days: number; name: string; category: string | null; merchant: string | null; amount_kd: string }>
}

type Category = { id: number; name: string; isIncome: boolean }
type Merchant = { id: number; name: string }
type Row = {
  id: number
  date: string
  name: string
  amountKd: string
  categoryId: number | null
  merchantId: number | null
  source: string
}
type Budget = { id: number; month: string; categoryId: number; amountKd: string }

export type DemoState = {
  sample: DemoSample
  /** Kuwait's today as the server's currentLocalDate(): UTC fields hold Kuwait's wall clock. */
  today: Date
  todayIso: string
  builtAt: string
  payday: number | null
  categories: Category[]
  merchants: Merchant[]
  rows: Row[]
  budgets: Budget[]
  nextId: { category: number; merchant: number; row: number }
}

const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 86_400_000
const UNCAT = "Uncategorized"
const SAVINGS_NAMES = ["savings", "investing", "savings & investing"]

/** The server's currentLocalDate() for an instant: a Date whose UTC fields read Kuwait's wall clock. */
export function kuwaitToday(now: Date): Date {
  return new Date(now.getTime() + KUWAIT_OFFSET_MS)
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  return isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS))
}

/** The server's timestamp format: no milliseconds, +00:00. */
function stamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00")
}

/**
 * The rows the demo starts with, for an instant: dates from day offsets, keeping the current payday period and
 * the two before it. The parity test seeds exactly these rows, in this order.
 */
export function materializeSample(sample: DemoSample, now: Date) {
  const today = kuwaitToday(now)
  const todayIso = isoDay(today)
  const payday = sample.profile.payday_day
  const currentKey = periodKeyForDate(payday, todayIso)
  const earliest = periodBoundsForKey(payday, shiftKey(currentKey, -2)).start
  const transactions = sample.transactions
    .map((t) => ({ ...t, date: addDays(todayIso, t.offset_days) }))
    .filter((t) => t.date >= earliest && t.date <= todayIso)
  const merchantNames: string[] = []
  for (const t of transactions) if (t.merchant && !merchantNames.includes(t.merchant)) merchantNames.push(t.merchant)
  return {
    todayIso,
    currentKey,
    categories: sample.categories,
    merchants: merchantNames,
    transactions,
    budgets: sample.budgets_current_period.map((b) => ({ ...b, month: currentKey })),
  }
}

export function createDemoState(sample: DemoSample, now: Date): DemoState {
  const m = materializeSample(sample, now)
  const categories = m.categories.map((c, i) => ({ id: i + 1, name: c.name, isIncome: c.is_income }))
  const merchants = m.merchants.map((name, i) => ({ id: i + 1, name }))
  const catId = (name: string | null) => (name === null ? null : categories.find((c) => c.name === name)?.id ?? null)
  const merId = (name: string | null) => (name === null ? null : merchants.find((x) => x.name === name)?.id ?? null)
  const rows = m.transactions.map((t, i) => ({
    id: i + 1,
    date: t.date,
    name: t.name,
    amountKd: new Decimal(t.amount_kd).toFixed(3),
    categoryId: catId(t.category),
    merchantId: merId(t.merchant),
    source: "manual",
  }))
  const budgets = m.budgets.map((b, i) => ({ id: i + 1, month: b.month, categoryId: catId(b.category)!, amountKd: new Decimal(b.amount_kd).toFixed(3) }))
  return {
    sample,
    today: kuwaitToday(now),
    todayIso: m.todayIso,
    builtAt: stamp(now),
    payday: sample.profile.payday_day,
    categories,
    merchants,
    rows,
    budgets,
    nextId: { category: categories.length + 1, merchant: merchants.length + 1, row: rows.length + 1 },
  }
}

// ── Rules (apps/api payday-lib, category-kind) ───────────────────────────────

function category(state: DemoState, id: number | null): Category | null {
  return id === null ? null : state.categories.find((c) => c.id === id) ?? null
}
function merchant(state: DemoState, id: number | null): Merchant | null {
  return id === null ? null : state.merchants.find((x) => x.id === id) ?? null
}
/** payday-lib incomeCategoryFilter: is_income, or a name starting "income". A row with no category is not income. */
function isIncomeCategory(c: Category | null): boolean {
  if (!c) return false
  return c.isIncome || c.name.toLowerCase().startsWith("income")
}
/** category-kind isSavingsCategoryName. */
function isSavingsName(name: string | null | undefined): boolean {
  return SAVINGS_NAMES.includes((name ?? "").replace(/^ +| +$/g, "").toLowerCase())
}
const rowIsIncome = (s: DemoState, r: Row) => isIncomeCategory(category(s, r.categoryId))
/** payday-lib expenseCategoryFilter: not income (savings included; no category counts). */
const rowIsExpense = (s: DemoState, r: Row) => !rowIsIncome(s, r)
/** category-kind expenseOnlyCategoryFilter: not income and not savings. */
const rowIsExpenseOnly = (s: DemoState, r: Row) => !rowIsIncome(s, r) && !isSavingsName(category(s, r.categoryId)?.name)
const catName = (s: DemoState, r: Row) => category(s, r.categoryId)?.name ?? null

const dec = (v: string | number) => new Decimal(v)
const sum = (rows: Row[]) => rows.reduce((a, r) => a.plus(r.amountKd), new Decimal(0))
const formatKd = (d: Decimal) => d.toFixed(3)
/** analytics-helpers roundedKd. */
const roundedKd = (raw: string) => Number(new Decimal(raw || "0").toDecimalPlaces(3))

function periodKey(s: DemoState, date: string): string {
  return periodKeyForDate(s.payday, date)
}
/** payday-lib currentPeriodKey (no payday: Kuwait's calendar month). */
function currentKey(s: DemoState): string {
  return periodKey(s, s.todayIso)
}
/** analytics-helpers buildMonthWindow: `months` keys ending at the end month, oldest first. */
function monthWindow(endKey: string, months: number): string[] {
  const out: string[] = []
  for (let i = months - 1; i >= 0; i--) out.push(shiftKey(endKey, -i))
  return out
}
/** MySQL's LOWER(name) order for the sample's ASCII names, then id. */
function byLowerName<T extends { id: number }>(name: (x: T) => string) {
  return (a: T, b: T) => {
    const x = name(a).toLowerCase()
    const y = name(b).toLowerCase()
    return x < y ? -1 : x > y ? 1 : a.id - b.id
  }
}
const newestFirst = (a: Row, b: Row) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)

function groupSum(rows: Row[], key: (r: Row) => string): Map<string, Decimal> {
  const out = new Map<string, Decimal>()
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? new Decimal(0)).plus(r.amountKd))
  return out
}

// ── Serializers (apps/api transaction-lib serializeTransaction, categories, merchants) ──

function serializeTransaction(s: DemoState, r: Row) {
  const c = category(s, r.categoryId)
  const m = merchant(s, r.merchantId)
  return {
    id: r.id,
    date: r.date,
    name: r.name,
    memo: null,
    amount_kd: r.amountKd,
    category: c?.name ?? null,
    category_id: r.categoryId,
    category_counts_as_income: isIncomeCategory(c),
    merchant: m?.name ?? null,
    merchant_id: r.merchantId,
    source: r.source,
    source_label: "Manual",
    import_batch_id: null,
  }
}

function ok(data: unknown, meta: Record<string, unknown> = {}) {
  return { ok: true, data, error: null, meta }
}

// ── Answers, one per read route ──────────────────────────────────────────────

/** auth.ts GET /me */
function me(s: DemoState) {
  const p = s.sample.person
  return {
    ok: true,
    user: {
      id: 1,
      email: p.email,
      display_name: p.display_name,
      first_name: p.first_name,
      last_name: p.last_name,
      totp_enabled: false,
      created_at: stamp(new Date(Date.parse(`${addDays(s.todayIso, -95)}T00:00:00Z`))),
    },
    flags: { template_suggestions: false, open_banking: false },
  }
}

/** auth.ts GET /profile; demo_workspace as demo-data-lib getDemoWorkspaceState for an account that never loaded it. */
function profile(s: DemoState) {
  const p = s.sample.profile
  return {
    ok: true,
    user: me(s).user,
    profile: {
      monthly_income_kd: p.monthly_income_kd === null ? null : formatKd(dec(p.monthly_income_kd)),
      payday_day: p.payday_day,
      country: p.country,
      timezone: p.timezone,
      email_notifications_enabled: p.email_notifications_enabled,
      setup_guide_seen: p.setup_guide_seen,
      setup_guide_dismissed: p.setup_guide_dismissed,
    },
    demo_workspace: {
      active: false,
      clearable: false,
      loaded_at: null,
      month: s.todayIso.slice(0, 7),
      months_seeded: 6,
      transactions: 0,
      budgets: 0,
      profile_seeded_fields: [],
    },
  }
}

/** income-lib resolveIncomeForPeriod: the typed income when above zero. */
function typedIncome(s: DemoState): Decimal | null {
  const raw = s.sample.profile.monthly_income_kd
  if (raw && dec(raw).gt(0)) return dec(raw)
  return null
}

/** categories.ts GET / */
function categoriesList(s: DemoState) {
  const items = [...s.categories].sort(byLowerName((c) => c.name)).map((c) => {
    const countsAsIncome = isIncomeCategory(c)
    return {
      id: c.id,
      name: c.name,
      is_income: c.isIncome,
      is_system: false,
      transaction_count: s.rows.filter((r) => r.categoryId === c.id).length,
      kind: countsAsIncome ? "income" : isSavingsName(c.name) ? "savings" : "expense",
      counts_as_income: countsAsIncome,
    }
  })
  return ok({ items })
}

/** merchants.ts GET / */
function merchantsList(s: DemoState) {
  const items = [...s.merchants].sort(byLowerName((m) => m.name)).map((m) => ({
    id: m.id,
    name: m.name,
    expense_count: s.rows.filter((r) => r.merchantId === m.id && rowIsExpense(s, r)).length,
  }))
  return ok({ items })
}

/** transactions.ts resolveNameFilterIds: LOWER(name) LIKE %term%. */
function nameFilterIds(list: Array<{ id: number; name: string }>, term: string): number[] | null {
  if (!term) return null
  const ids = list.filter((x) => x.name.toLowerCase().includes(term.toLowerCase())).map((x) => x.id)
  return ids.length ? ids : null
}

function page(s: DemoState, rows: Row[], q: URLSearchParams) {
  const limit = q.has("limit") ? parseInt(q.get("limit")!, 10) : 20
  const offset = q.has("offset") ? parseInt(q.get("offset")!, 10) : 0
  const includeTotal = q.get("include_total") !== "false"
  const sorted = [...rows].sort(newestFirst)
  if (includeTotal) {
    const slice = sorted.slice(offset, offset + limit)
    return { items: slice.map((r) => serializeTransaction(s, r)), meta: { total: sorted.length, offset, limit, has_more: offset + slice.length < sorted.length } }
  }
  const slice = sorted.slice(offset, offset + limit + 1)
  const hasMore = slice.length > limit
  return { items: slice.slice(0, limit).map((r) => serializeTransaction(s, r)), meta: { total: -1, offset, limit, has_more: hasMore } }
}

/** transactions.ts GET /search */
function search(s: DemoState, q: URLSearchParams) {
  const term = (q.get("q") ?? "").trim().toLowerCase()
  const catTerm = (q.get("category") ?? "").trim()
  const merTerm = (q.get("merchant") ?? "").trim()
  const from = (q.get("date_from") ?? "").trim()
  const to = (q.get("date_to") ?? "").trim()
  const incomeOnly = q.get("income_only") === "true"
  const excludeIncome = q.get("exclude_income") === "true"
  const catIds = nameFilterIds(s.categories, catTerm)
  const merIds = nameFilterIds(s.merchants, merTerm)
  const limit = q.has("limit") ? parseInt(q.get("limit")!, 10) : 20
  const offset = q.has("offset") ? parseInt(q.get("offset")!, 10) : 0
  if ((catTerm && !catIds) || (merTerm && !merIds)) return ok({ items: [] }, { total: 0, offset, limit, has_more: false })
  const rows = s.rows.filter((r) => {
    if (term) {
      const hay = [r.name, catName(s, r) ?? "", merchant(s, r.merchantId)?.name ?? ""].map((x) => x.toLowerCase())
      if (!hay.some((x) => x.includes(term))) return false
    }
    if (catIds && (r.categoryId === null || !catIds.includes(r.categoryId))) return false
    if (merIds && (r.merchantId === null || !merIds.includes(r.merchantId))) return false
    if (from && r.date < from) return false
    if (to && r.date > to) return false
    if (incomeOnly) return rowIsIncome(s, r)
    if (excludeIncome) return rowIsExpense(s, r)
    return true
  })
  const p = page(s, rows, q)
  return ok({ items: p.items }, p.meta)
}

/** transactions.ts GET /by-category */
function byCategory(s: DemoState, q: URLSearchParams) {
  const cat = (q.get("category") ?? "").trim()
  const term = (q.get("q") ?? "").trim().toLowerCase()
  const month = (q.get("month") ?? "").trim() || null
  const limit = q.has("limit") ? parseInt(q.get("limit")!, 10) : 20
  const offset = q.has("offset") ? parseInt(q.get("offset")!, 10) : 0
  const catIds = nameFilterIds(s.categories, cat)
  if (!catIds) return ok({ category: cat, month, items: [] }, { total: 0, offset, limit, has_more: false })
  const rows = s.rows.filter(
    (r) =>
      r.categoryId !== null &&
      catIds.includes(r.categoryId) &&
      (!month || periodKey(s, r.date) === month) &&
      (!term || r.name.toLowerCase().includes(term)),
  )
  const p = page(s, rows, q)
  return ok({ category: cat, month, items: p.items }, p.meta)
}

/** transactions.ts GET /:id */
function getTransaction(s: DemoState, id: number) {
  const r = s.rows.find((x) => x.id === id)
  if (!r) return { status: 404, body: { ok: false, data: null, error: "Transaction not found.", code: "not_found" } }
  return { status: 200, body: ok({ item: serializeTransaction(s, r) }) }
}

/** name-key buildNameKey */
function nameKey(name: string): string {
  return [...name.split(/\s+/u).filter(Boolean).join(" ").toLowerCase()].slice(0, 255).join("") || "?"
}

/** log-suggestions-lib buildLogSuggestions + shapeLogSuggestions */
function logSuggestions(s: DemoState) {
  const cutoff = isoDay(new Date(s.today.getTime() - 90 * DAY_MS))
  const owned = s.rows.filter((r) => r.source !== "demo" && rowIsExpense(s, r) && r.merchantId !== null)
  const byPlace = new Map<number, Row[]>()
  for (const r of owned) byPlace.set(r.merchantId!, [...(byPlace.get(r.merchantId!) ?? []), r])
  const places = [...byPlace.entries()].map(([id, rows]) => ({
    id,
    name: merchant(s, id)!.name,
    recent: rows.filter((r) => r.date >= cutoff).length,
    last: rows.reduce((a, r) => (r.date > a ? r.date : a), ""),
  }))
  places.sort((a, b) => b.recent - a.recent || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0))
  const top = places.slice(0, 200)
  const result = top.map((p) => {
    const entries = [...byPlace.get(p.id)!].sort(newestFirst)
    const items = new Map<string, { name: string; category: string | null; amountKd: string; count: number; first: number }>()
    entries.forEach((r, i) => {
      const k = nameKey(r.name)
      const it = items.get(k)
      if (it) it.count += 1
      else items.set(k, { name: r.name, category: catName(s, r), amountKd: r.amountKd, count: 1, first: i })
    })
    const last = entries[0]
    return {
      name: p.name,
      category: catName(s, entries[0]),
      count: p.recent,
      items: [...items.values()]
        .sort((a, b) => b.count - a.count || a.first - b.first)
        .slice(0, 5)
        .map((it) => ({ name: it.name, category: it.category, amount_kd: formatKd(dec(it.amountKd)) })),
      last_amount: last ? formatKd(dec(last.amountKd)) : null,
      last_used: last ? last.date : null,
    }
  })
  return ok({ places: result }, { count: result.length })
}

/** budgets.ts buildBudgetPayload + buildProfileContext */
function budgetPayload(s: DemoState, month: string) {
  const items = s.budgets
    .filter((b) => b.month === month)
    .map((b) => ({ id: b.id, month: b.month, category: category(s, b.categoryId)?.name ?? "Uncategorized", amount_kd: formatKd(dec(b.amountKd)) }))
    .sort((a, b) => (a.category.toLowerCase() < b.category.toLowerCase() ? -1 : a.category.toLowerCase() > b.category.toLowerCase() ? 1 : 0))
  const total = items.reduce((a, it) => a.plus(it.amount_kd), new Decimal(0))
  const income = typedIncome(s)
  return {
    month,
    items,
    profile_context: {
      budget_total_kd: total.toFixed(3),
      monthly_income_kd: income === null ? null : income.toFixed(3),
      income_source: income === null ? null : "declared_in_profile",
      budget_to_income_pct: income === null || income.isZero() ? null : total.div(income).mul(100).toDecimalPlaces(1).toFixed(1),
      payday_day: s.payday,
    },
  }
}

/** budgets.ts GET /months */
function budgetMonths(s: DemoState) {
  const months = [...new Set(s.budgets.map((b) => b.month))].sort().reverse()
  return ok({ months })
}

/** aggregation.ts _sumExpenseBetween: expense-only (savings out), inclusive. */
function sumExpenseBetween(s: DemoState, start: string, end: string): Decimal {
  if (end < start) return new Decimal(0)
  return sum(s.rows.filter((r) => r.date >= start && r.date <= end && rowIsExpenseOnly(s, r)))
}

/** aggregation.ts _buildSafeToSpendPayload */
function safeToSpendPayload(s: DemoState, month: string) {
  const { start, end } = periodBoundsForKey(s.payday, month)
  const todayStr = s.todayIso
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
  const cycleDays = Math.round((ms(end) - ms(start)) / DAY_MS) + 1
  let daysElapsed: number
  let daysRemaining: number
  let spendWindowEnd: string | null
  if (todayStr < start) {
    daysElapsed = 0
    daysRemaining = cycleDays
    spendWindowEnd = null
  } else if (todayStr > end) {
    daysElapsed = cycleDays
    daysRemaining = 0
    spendWindowEnd = end
  } else {
    daysElapsed = Math.round((ms(todayStr) - ms(start)) / DAY_MS) + 1
    daysRemaining = Math.round((ms(end) - ms(todayStr)) / DAY_MS)
    spendWindowEnd = todayStr
  }
  const income = typedIncome(s)
  const totalBudget = s.budgets.filter((b) => b.month === month).reduce((a, b) => a.plus(b.amountKd), new Decimal(0))
  const actualSpend = spendWindowEnd === null ? new Decimal(0) : sumExpenseBetween(s, start, spendWindowEnd)
  const incomeForCalc = income ?? new Decimal(0)
  const committed = totalBudget
  const overCap = incomeForCalc.gt(0) && committed.gt(incomeForCalc.mul(dec("0.40")))
  const remainingRaw = incomeForCalc.minus(committed).minus(actualSpend)
  const remaining = remainingRaw.gt(0) ? remainingRaw : new Decimal(0)
  const dailyRate = remaining.div(new Decimal(Math.max(daysRemaining, 1)))
  const warnings: string[] = []
  if (income === null) warnings.push("income_not_set")
  if (totalBudget.lte(0)) warnings.push("budgets_not_set")
  if (overCap) warnings.push("commitments_over_40pct_cap")
  return {
    month,
    cycle_start: start,
    cycle_end: end,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    monthly_income_kd: income === null ? null : formatKd(income),
    income_auto_detected: false,
    income_source: income === null ? "not_set" : "declared_in_profile",
    total_budget_kd: formatKd(totalBudget),
    committed_kd: formatKd(committed),
    committed_breakdown_kd: { budget_allocations: formatKd(totalBudget) },
    actual_spend_kd: formatKd(actualSpend),
    remaining_budget_kd: formatKd(remaining),
    daily_rate_kd: formatKd(dailyRate),
    data_complete: income !== null && totalBudget.gt(0),
    warnings,
  }
}

/** aggregation.ts _buildAccountOverviewPayload */
function accountOverview(s: DemoState, month: string) {
  const { start, end } = periodBoundsForKey(s.payday, month)
  const inMonth = s.rows.filter((r) => r.date >= start && r.date <= end)
  const expenses = inMonth.filter((r) => rowIsExpense(s, r))
  const savingsRows = expenses.filter((r) => isSavingsName(catName(s, r)))
  const totalSpend = sum(expenses.filter((r) => !isSavingsName(catName(s, r))))
  const totalSavings = sum(savingsRows)
  const totalIncome = sum(inMonth.filter((r) => rowIsIncome(s, r)))
  const manual = inMonth.filter((r) => r.source === "manual")
  const manualSpend = sum(manual.filter((r) => rowIsExpenseOnly(s, r)))
  const top = [...groupSum(expenses, (r) => catName(s, r) ?? UNCAT).entries()]
    .sort((a, b) => b[1].comparedTo(a[1]) || (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : a[0].toLowerCase() > b[0].toLowerCase() ? 1 : 0))
    .slice(0, 5)
    .map(([cat, amount]) => ({
      category: cat,
      amount_kd: formatKd(amount),
      pct: isSavingsName(cat) ? null : totalSpend.gt(0) ? Number(amount.div(totalSpend).mul(100).toDecimalPlaces(1)) : 0,
    }))
  const keys = monthWindow(month, 6)
  const month_trend = keys.map((k) => {
    const rows = s.rows.filter((r) => periodKey(s, r.date) === k)
    return {
      month: k,
      spend: formatKd(sum(rows.filter((r) => rowIsExpenseOnly(s, r)))),
      income: formatKd(sum(rows.filter((r) => rowIsIncome(s, r)))),
    }
  })
  return {
    month,
    total_spend_mtd: formatKd(totalSpend),
    total_savings_mtd: formatKd(totalSavings),
    total_income_mtd: formatKd(totalIncome),
    connected_accounts: [],
    manual_entry_summary: { transactions_mtd: manual.length, spend_mtd: formatKd(manualSpend) },
    top_categories: top,
    month_trend,
  }
}

/** aggregation.ts GET /dashboard-metrics -> dashboard-snapshot-lib computeDashboardMetricsPayload */
function dashboardMetrics(s: DemoState, q: URLSearchParams) {
  const months = q.has("months") ? parseInt(q.get("months")!, 10) : 24
  const until = (q.get("until") ?? "").trim()
  const cycle = q.get("cycle") === "true" || q.get("cycle") === "1"
  const endKey = until || currentKey(s)
  const bounds = cycle ? periodBoundsForKey(s.payday, endKey) : null
  let keys: string[]
  if (cycle && bounds) {
    if (paydayActive(s.payday)) keys = [endKey]
    else {
      keys = []
      for (let k = bounds.start.slice(0, 7); k <= bounds.end.slice(0, 7); k = shiftKey(k, 1)) keys.push(k)
    }
  } else keys = monthWindow(endKey, months)
  const inScope = (r: Row) =>
    cycle && bounds ? r.date >= bounds.start && r.date <= bounds.end : keys.includes(periodKey(s, r.date))
  const income = new Map(keys.map((k) => [k, new Decimal(0)]))
  const expense = new Map(keys.map((k) => [k, new Decimal(0)]))
  const savings = new Map(keys.map((k) => [k, new Decimal(0)]))
  const byCat: Record<string, Record<string, Decimal>> = Object.fromEntries(keys.map((k) => [k, {}]))
  for (const r of s.rows) {
    if (!inScope(r)) continue
    const k = periodKey(s, r.date)
    if (!income.has(k)) continue
    if (rowIsIncome(s, r)) income.set(k, income.get(k)!.plus(r.amountKd))
    else {
      const name = catName(s, r)
      if (isSavingsName(name)) savings.set(k, savings.get(k)!.plus(r.amountKd))
      else expense.set(k, expense.get(k)!.plus(r.amountKd))
      const c = name ?? UNCAT
      byCat[k][c] = (byCat[k][c] ?? new Decimal(0)).plus(r.amountKd)
    }
  }
  const expense_by_category: Record<string, Record<string, string>> = {}
  for (const k of keys) expense_by_category[k] = Object.fromEntries(Object.entries(byCat[k]).map(([c, d]) => [c, formatKd(d)]))
  return ok(
    {
      months: keys,
      monthly: keys.map((k) => ({
        month: k,
        income_kd: formatKd(income.get(k)!),
        expense_kd: formatKd(expense.get(k)!),
        savings_kd: formatKd(savings.get(k)!),
      })),
      expense_by_category,
      cycle_enabled: cycle,
      cycle_start: cycle ? bounds!.start : null,
      cycle_end: cycle ? bounds!.end : null,
      updated_at: s.builtAt,
      cache_warning: null,
    },
    { months_count: keys.length },
  )
}

/** aggregation.ts GET /budget-metrics */
function budgetMetrics(s: DemoState, q: URLSearchParams) {
  const range = ((q.get("range") ?? "").trim().toLowerCase() || "month") as "month" | "30" | "90" | "365" | "all"
  const month = (q.get("month") ?? "").trim() || currentKey(s)
  const cycle = q.get("cycle") === "true" || q.get("cycle") === "1"
  const bounds = cycle ? periodBoundsForKey(s.payday, month) : null
  const expenses = s.rows.filter((r) => rowIsExpense(s, r))
  const rounded = (m: Map<string, Decimal>) => Object.fromEntries([...m.entries()].map(([c, d]) => [c, roundedKd(d.toString())]))
  const monthRows = expenses.filter((r) => (bounds ? r.date >= bounds.start && r.date <= bounds.end : periodKey(s, r.date) === month))
  const spent = rounded(groupSum(monthRows, (r) => catName(s, r) ?? UNCAT))
  let rangeSpent: Record<string, number>
  if (range === "month") rangeSpent = { ...spent }
  else {
    const cutoff = range === "all" ? "" : isoDay(new Date(s.today.getTime() - parseInt(range, 10) * DAY_MS))
    rangeSpent = rounded(groupSum(expenses.filter((r) => r.date >= cutoff), (r) => catName(s, r) ?? UNCAT))
  }
  const prevKeys = monthWindow(shiftKey(month, -1), 12)
  const prev = groupSum(expenses.filter((r) => prevKeys.includes(periodKey(s, r.date))), (r) => catName(s, r) ?? UNCAT)
  const avg12 = Object.fromEntries([...prev.entries()].map(([c, d]) => [c, roundedKd(d.dividedBy(new Decimal("12")).toString())]))
  return ok({
    month,
    range,
    spent_by_category: spent,
    range_spent_by_category: rangeSpent,
    avg12_by_category: avg12,
    cycle_enabled: cycle,
    cycle_start: cycle ? bounds!.start : null,
    cycle_end: cycle ? bounds!.end : null,
  })
}

/** aggregation.ts GET /safe-to-spend */
function safeToSpend(s: DemoState, q: URLSearchParams) {
  return ok(safeToSpendPayload(s, (q.get("month") ?? "").trim() || currentKey(s)))
}

/** aggregation.ts _weekBounds, _daysUntilPayday, _deltaPercent, GET /weekly-digest */
function weeklyDigest(s: DemoState) {
  const t = s.today
  const dow = t.getUTCDay()
  const sinceMonday = dow === 0 ? 6 : dow - 1
  const weekStart = isoDay(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - sinceMonday)))
  const weekEnd = addDays(weekStart, 6)
  const effectiveEnd = s.todayIso < weekEnd ? s.todayIso : weekEnd
  const lastStart = addDays(weekStart, -7)
  const lastEnd = addDays(weekStart, -1)
  const daysObserved = Math.round((Date.parse(`${effectiveEnd}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / DAY_MS) + 1
  const thisWeek = sumExpenseBetween(s, weekStart, effectiveEnd)
  const lastWeek = sumExpenseBetween(s, lastStart, lastEnd)
  const delta = lastWeek.gt(0)
    ? Number(thisWeek.minus(lastWeek).div(lastWeek).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP))
    : thisWeek.gt(0)
      ? 100.0
      : 0.0
  const weekRows = s.rows.filter((r) => r.date >= weekStart && r.date <= effectiveEnd && rowIsExpense(s, r))
  const top = [...groupSum(weekRows, (r) => catName(s, r) ?? UNCAT).entries()]
    .sort((a, b) => b[1].comparedTo(a[1]) || (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : a[0].toLowerCase() > b[0].toLowerCase() ? 1 : 0))
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount_kd: formatKd(amount) }))
  let daysUntilPayday: number | null = null
  if (s.payday !== null) {
    const y = t.getUTCFullYear()
    const m = t.getUTCMonth() + 1
    const clamp = (yy: number, mm: number) => Math.max(1, Math.min(s.payday!, new Date(Date.UTC(yy, mm, 0)).getUTCDate()))
    const todayMs = Date.UTC(y, m - 1, t.getUTCDate())
    const thisPay = Date.UTC(y, m - 1, clamp(y, m))
    if (todayMs <= thisPay) daysUntilPayday = (thisPay - todayMs) / DAY_MS
    else {
      const ny = m === 12 ? y + 1 : y
      const nm = m === 12 ? 1 : m + 1
      daysUntilPayday = (Date.UTC(ny, nm - 1, clamp(ny, nm)) - todayMs) / DAY_MS
    }
  }
  const payload = {
    week_start: weekStart,
    week_end: weekEnd,
    this_week_expense_kd: formatKd(thisWeek),
    last_week_expense_kd: formatKd(lastWeek),
    delta_pct: delta,
    top_categories: top,
    days_until_payday: daysUntilPayday,
    safe_to_spend_today_kd: String(safeToSpendPayload(s, currentKey(s)).daily_rate_kd ?? "0.000"),
    days_observed: daysObserved,
  }
  return ok(payload, { count: top.length })
}

/** aggregation.ts GET /dashboard-bundle */
function dashboardBundle(s: DemoState, q: URLSearchParams) {
  const month = (q.get("month") ?? "").trim() || currentKey(s)
  const budget = budgetPayload(s, month)
  return ok(
    {
      month,
      snapshot_computed_at: null,
      safe_to_spend: safeToSpendPayload(s, month),
      budget,
      budget_alerts: { month, items: [] },
      account_overview: accountOverview(s, month),
    },
    { budget_count: budget.items.length, alert_count: 0 },
  )
}

// ── intelligence-lib buildRecurringPatternsPayload ───────────────────────────

const SUBSCRIPTION_HINTS = ["subscription", "subscriptions", "netflix", "spotify", "apple", "prime", "youtube", "adobe", "membership", "streaming", "software", "icloud"]
const UTILITY_HINTS = ["utility", "utilities", "water", "electric", "electricity", "internet", "wifi", "phone", "mobile", "telecom", "broadband", "mew", "ooredoo", "stc", "viva", "zain", "kptc", "knpc"]
const LOAN_HINTS = ["loan", "loans", "installment", "installments", "mortgage", "finance", "credit card", "minimum payment", "debt"]

function recurringGroup(cat: string | null, mer: string | null, display: string): string {
  const hay = [cat ?? "", mer ?? "", display].map((x) => x.toLowerCase().split(/\s+/).filter(Boolean).join(" "))
  const match = (hints: string[]) => hay.some((h) => h && hints.some((x) => h.includes(x)))
  if (match(LOAN_HINTS)) return "Loan Payments"
  if (match(UTILITY_HINTS)) return "Utilities"
  if (match(SUBSCRIPTION_HINTS)) return "Subscriptions"
  return "Other"
}

function mostFrequent(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0]
}

function recurringPatterns(s: DemoState, q: URLSearchParams) {
  const days = q.has("days") ? parseInt(q.get("days")!, 10) || 90 : 90
  const cutoff = addDays(s.todayIso, -days)
  const rows = s.rows
    .filter((r) => r.date >= cutoff && rowIsExpenseOnly(s, r))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id))
  const groups = new Map<string, Array<{ date: string; display: string; amount: Decimal; cat: string | null; mer: string | null }>>()
  for (const r of rows) {
    const amount = dec(r.amountKd)
    if (amount.lte(0)) continue
    const display = r.name.trim().split(/\s+/).filter(Boolean).join(" ") || "Unnamed"
    const key = display.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), { date: r.date, display, amount, cat: catName(s, r), mer: merchant(s, r.merchantId)?.name ?? null }])
  }
  const patterns: Array<{ name: string; frequency: string; avg_amount_kd: string; last_seen: string; confidence: string; occurrences: number; group: string; _avg: Decimal }> = []
  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    const dates = entries.map((e) => e.date).sort()
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.round((Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) / DAY_MS)
      if (gap > 0) intervals.push(gap)
    }
    if (intervals.length === 0) continue
    const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
    const frequency = median >= 28 && median <= 32 ? "monthly" : median >= 13 && median <= 15 ? "bi-weekly" : median >= 6 && median <= 8 ? "weekly" : "irregular"
    let variance: Decimal
    if (intervals.length === 1) variance = new Decimal(0)
    else {
      const avg = new Decimal(intervals.reduce((a, b) => a + b, 0)).div(intervals.length)
      variance = new Decimal(0)
      if (avg.lte(0)) variance = new Decimal(1)
      else for (const d of intervals) {
        const dev = new Decimal(d).minus(avg).abs().div(avg)
        if (dev.gt(variance)) variance = dev
      }
    }
    let confidence = variance.lte("0.10") ? "high" : variance.lte("0.20") ? "medium" : "low"
    if (frequency === "irregular" && confidence === "high") confidence = "medium"
    const avgAmount = entries.reduce((a, e) => a.plus(e.amount), new Decimal(0)).div(entries.length)
    const name = mostFrequent(entries.map((e) => e.display))!
    patterns.push({
      name,
      frequency,
      avg_amount_kd: formatKd(avgAmount),
      last_seen: dates[dates.length - 1],
      confidence,
      occurrences: entries.length,
      group: recurringGroup(mostFrequent(entries.flatMap((e) => (e.cat ? [e.cat] : []))), mostFrequent(entries.flatMap((e) => (e.mer ? [e.mer] : []))), name),
      _avg: avgAmount,
    })
  }
  patterns.sort((a, b) => b._avg.comparedTo(a._avg) || b.occurrences - a.occurrences || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const out = patterns.map(({ _avg, ...rest }) => rest)
  return ok({ patterns: out }, { count: out.length, days })
}

// ── Writes: /log's create, edit and delete change only this state (C6) ──────

export const DEMO_REFUSAL = "Sign up to keep your own"

function refused() {
  return { status: 403, body: { ok: false, data: null, error: DEMO_REFUSAL, code: "demo_read_only" } }
}

function validationError(message: string) {
  return { status: 400, body: { ok: false, data: null, error: message, code: "validation_error" } }
}

function categoryFor(s: DemoState, name: string): number {
  const found = s.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (found) return found.id
  const c = { id: s.nextId.category++, name, isIncome: false }
  s.categories.push(c)
  return c.id
}

function merchantFor(s: DemoState, name: string): number | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const found = s.merchants.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())
  if (found) return found.id
  const m = { id: s.nextId.merchant++, name: trimmed }
  s.merchants.push(m)
  return m.id
}

function amountOf(raw: unknown): string | null {
  try {
    const d = new Decimal(String(raw ?? "").trim())
    if (d.decimalPlaces() > 3 || d.lte(0)) return null
    return d.toFixed(3)
  } catch {
    return null
  }
}

function createTransaction(s: DemoState, body: Record<string, unknown>) {
  const amount = amountOf(body.amount_kd)
  if (!amount) return validationError("Amount is invalid.")
  const categoryName = String(body.category ?? "").trim()
  if (!categoryName) return validationError("Category is required.")
  const date = String(body.date ?? s.todayIso)
  const row: Row = {
    id: s.nextId.row++,
    date,
    name: String(body.name ?? categoryName).trim() || categoryName,
    amountKd: amount,
    categoryId: categoryFor(s, categoryName),
    merchantId: merchantFor(s, String(body.merchant ?? "")),
    source: "manual",
  }
  s.rows.push(row)
  return { status: 201, body: ok({ item: serializeTransaction(s, row) }) }
}

function updateTransaction(s: DemoState, id: number, body: Record<string, unknown>) {
  const row = s.rows.find((r) => r.id === id)
  if (!row) return { status: 404, body: { ok: false, data: null, error: "Transaction not found.", code: "not_found" } }
  if ("amount_kd" in body) {
    const amount = amountOf(body.amount_kd)
    if (!amount) return validationError("Amount is invalid.")
    row.amountKd = amount
  }
  if (typeof body.category === "string" && body.category.trim()) row.categoryId = categoryFor(s, body.category.trim())
  if (typeof body.name === "string" && body.name.trim()) row.name = body.name.trim()
  if ("merchant" in body) row.merchantId = merchantFor(s, String(body.merchant ?? ""))
  if (typeof body.date === "string" && body.date) row.date = body.date
  return { status: 200, body: ok({ item: serializeTransaction(s, row) }) }
}

function deleteTransaction(s: DemoState, id: number) {
  const i = s.rows.findIndex((r) => r.id === id)
  if (i < 0) return { status: 404, body: { ok: false, data: null, error: "Transaction not found.", code: "not_found" } }
  s.rows.splice(i, 1)
  return { status: 200, body: ok({ deleted: true }) }
}

// ── The one entry point ──────────────────────────────────────────────────────

export class DemoUnknownCallError extends Error {
  constructor(method: string, path: string) {
    super(`The demo does not answer ${method} ${path}`)
    this.name = "DemoUnknownCallError"
  }
}

export type DemoResponse = { status: number; body: unknown }

/**
 * Answers one API call from the state. Known reads are computed; /log's three writes change the state; every
 * other write is refused (403, "Sign up to keep your own"); a read the demo does not know throws (C3b) — the
 * caller must never fall back to the network.
 */
export function demoAnswer(s: DemoState, method: string, url: string, body?: unknown): DemoResponse {
  const u = new URL(url, "http://demo.invalid")
  const path = u.pathname.replace(/\/+$/, "") || "/"
  const q = u.searchParams
  const verb = method.toUpperCase()
  const txnId = path.match(/^\/api\/transactions\/([0-9]+)$/)
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>

  if (verb === "GET") {
    if (txnId) return getTransaction(s, Number(txnId[1]))
    const read: Record<string, () => unknown> = {
      "/api/auth/me": () => me(s),
      "/api/auth/profile": () => profile(s),
      "/api/categories": () => categoriesList(s),
      "/api/merchants": () => merchantsList(s),
      "/api/transactions/search": () => search(s, q),
      "/api/transactions/by-category": () => byCategory(s, q),
      "/api/log-suggestions": () => logSuggestions(s),
      "/api/budgets": () => ok(budgetPayload(s, (q.get("month") ?? "").trim() || currentKey(s))),
      "/api/budgets/months": () => budgetMonths(s),
      "/api/analytics/dashboard-metrics": () => dashboardMetrics(s, q),
      "/api/analytics/dashboard-bundle": () => dashboardBundle(s, q),
      "/api/analytics/budget-metrics": () => budgetMetrics(s, q),
      "/api/analytics/safe-to-spend": () => safeToSpend(s, q),
      "/api/analytics/weekly-digest": () => weeklyDigest(s),
      "/api/analytics/recurring-patterns": () => recurringPatterns(s, q),
    }
    const answer = read[path]
    if (!answer) throw new DemoUnknownCallError(verb, path)
    return { status: 200, body: answer() }
  }
  if (verb === "POST" && path === "/api/transactions") return createTransaction(s, data)
  if (verb === "PATCH" && txnId) return updateTransaction(s, Number(txnId[1]), data)
  if (verb === "DELETE" && txnId) return deleteTransaction(s, Number(txnId[1]))
  return refused()
}
