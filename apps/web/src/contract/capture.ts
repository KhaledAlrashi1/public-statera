// Phase 4 / Module 10a — frontend API-call contract capture.
//
// Exercises every frontend api.ts method behind a global.fetch spy and records
// the concrete (method, path) each one requests. The captured set is committed as
// apps/web/contract/frontend-calls.json (see frontend-contract.test.ts) and is
// checked against the live Hono route table by
// apps/api/src/contract/frontend-contract.test.ts — so a frontend call to an
// unmounted route fails CI before deploy.
//
// This file is NOT a test; it is imported by the web contract test and by the
// `contract:generate` script. Keep it browser-safe (no node imports) so web tsc
// (which type-checks non-test source) stays happy.

import {
  categoriesApi,
  merchantsApi,
  transactionsApi,
  analyticsApi,
  notificationsApi,
  budgetsApi,
  debtApi,
  goalsApi,
  memorizedApi,
  authApi,
  uploadApi,
} from "@/lib/api"

export type FrontendCall = { method: string; path: string }

// EXERCISED — every method on each of these objects is invoked below. A new
// method that is not invoked fails the meta-test (exercisedMethodGaps).
export const EXERCISED_APIS = {
  categoriesApi,
  merchantsApi,
  transactionsApi,
  analyticsApi,
  notificationsApi,
  budgetsApi,
  debtApi,
  goalsApi,
  memorizedApi,
  authApi,
  uploadApi,
} as const

// EXCLUDED (deliberately not in the contract net): bankApi, featuresApi.
// These are dead code with no reachable UI caller and are removed in Phase 4 10b.
// Adding them here would only grow allowlist lines for surfaces about to be deleted.

type Invocation = { source: string; run: () => unknown }

function csvFile(): File {
  return new File(["date,name,amount\n2026-01-01,Coffee,1.500\n"], "import.csv", {
    type: "text/csv",
  })
}

// One entry per exported method. `source` is "<apiName>.<method>" and must match
// a key of EXERCISED_APIS. Args are representative only — the response is mocked,
// so post-fetch parsing/formatting is irrelevant; we only care which URL is hit.
export const INVOCATIONS: Invocation[] = [
  // categoriesApi
  { source: "categoriesApi.list", run: () => categoriesApi.list() },
  { source: "categoriesApi.create", run: () => categoriesApi.create("Food") },
  { source: "categoriesApi.delete", run: () => categoriesApi.delete(1) },
  { source: "categoriesApi.remap", run: () => categoriesApi.remap(1, 2) },

  // merchantsApi
  { source: "merchantsApi.list", run: () => merchantsApi.list() },
  { source: "merchantsApi.create", run: () => merchantsApi.create("Sultan Center") },
  { source: "merchantsApi.delete", run: () => merchantsApi.delete(1) },
  { source: "merchantsApi.update", run: () => merchantsApi.update(1, "Sultan Center") },
  { source: "merchantsApi.remap", run: () => merchantsApi.remap(1, 2) },

  // transactionsApi
  { source: "transactionsApi.search", run: () => transactionsApi.search({}) },
  { source: "transactionsApi.searchAll", run: () => transactionsApi.searchAll({}) },
  { source: "transactionsApi.get", run: () => transactionsApi.get(1) },
  {
    source: "transactionsApi.create",
    run: () =>
      transactionsApi.create({ date: "2026-01-01", category: "Food", name: "Coffee", amount_kd: "1.500" }),
  },
  { source: "transactionsApi.update", run: () => transactionsApi.update(1, { name: "Coffee" }) },
  { source: "transactionsApi.split", run: () => transactionsApi.split(1, []) },
  { source: "transactionsApi.delete", run: () => transactionsApi.delete(1) },
  { source: "transactionsApi.bulkDelete", run: () => transactionsApi.bulkDelete([1]) },
  { source: "transactionsApi.bulkUpdate", run: () => transactionsApi.bulkUpdate([1], {}) },
  { source: "transactionsApi.dupCheck", run: () => transactionsApi.dupCheck("2026-01-01", "Coffee", "1.500") },
  { source: "transactionsApi.byCategory", run: () => transactionsApi.byCategory({ category: "Food" }) },
  { source: "transactionsApi.byCategoryAll", run: () => transactionsApi.byCategoryAll({ category: "Food" }) },
  { source: "transactionsApi.suggestions", run: () => transactionsApi.suggestions("coffee") },
  { source: "transactionsApi.templateSuggestions", run: () => transactionsApi.templateSuggestions("coffee") },
  {
    source: "transactionsApi.templateSuggestionFeedback",
    run: () => transactionsApi.templateSuggestionFeedback({ feedback_key: "k", outcome: "accepted" }),
  },
  { source: "transactionsApi.summary", run: () => transactionsApi.summary() },
  { source: "transactionsApi.topPatterns", run: () => transactionsApi.topPatterns("30") },
  { source: "transactionsApi.exportCsv", run: () => transactionsApi.exportCsv() },
  { source: "transactionsApi.exportXlsx", run: () => transactionsApi.exportXlsx() },

  // analyticsApi
  { source: "analyticsApi.spendByCategory", run: () => analyticsApi.spendByCategory() },
  { source: "analyticsApi.spendByMonth", run: () => analyticsApi.spendByMonth() },
  { source: "analyticsApi.dashboardMetrics", run: () => analyticsApi.dashboardMetrics() },
  { source: "analyticsApi.budgetMetrics", run: () => analyticsApi.budgetMetrics("2026-01", "month") },
  { source: "analyticsApi.safeToSpend", run: () => analyticsApi.safeToSpend("2026-01") },
  { source: "analyticsApi.dashboardBundle", run: () => analyticsApi.dashboardBundle("2026-01") },
  { source: "analyticsApi.incomePattern", run: () => analyticsApi.incomePattern() },
  {
    source: "analyticsApi.expenseBreakdown",
    run: () => analyticsApi.expenseBreakdown({ dimension: "category", range: "month" }),
  },
  { source: "analyticsApi.accountOverview", run: () => analyticsApi.accountOverview() },
  {
    source: "analyticsApi.expenseMerchantTrend",
    run: () => analyticsApi.expenseMerchantTrend({ merchant: "Sultan Center" }),
  },
  { source: "analyticsApi.recurringPatterns", run: () => analyticsApi.recurringPatterns() },
  { source: "analyticsApi.weeklyDigest", run: () => analyticsApi.weeklyDigest() },
  { source: "analyticsApi.snapshot", run: () => analyticsApi.snapshot() },

  // notificationsApi
  { source: "notificationsApi.listBudgetAlerts", run: () => notificationsApi.listBudgetAlerts() },
  { source: "notificationsApi.dismissBudgetAlert", run: () => notificationsApi.dismissBudgetAlert("2026-01:1") },

  // budgetsApi
  { source: "budgetsApi.get", run: () => budgetsApi.get("2026-01") },
  { source: "budgetsApi.save", run: () => budgetsApi.save("2026-01", []) },
  { source: "budgetsApi.getMonths", run: () => budgetsApi.getMonths() },

  // debtApi
  { source: "debtApi.list", run: () => debtApi.list() },
  {
    source: "debtApi.create",
    run: () =>
      debtApi.create({ name: "Visa", debt_type: "credit_card", balance_kd: "100.000", minimum_payment_kd: "10.000" }),
  },
  { source: "debtApi.update", run: () => debtApi.update(1, { name: "Visa" }) },
  { source: "debtApi.delete", run: () => debtApi.delete(1) },
  { source: "debtApi.summary", run: () => debtApi.summary() },
  { source: "debtApi.payoffPlan", run: () => debtApi.payoffPlan("50.000") },

  // goalsApi
  { source: "goalsApi.list", run: () => goalsApi.list() },
  {
    source: "goalsApi.create",
    run: () => goalsApi.create({ name: "Buffer", goal_type: "starter_buffer", target_kd: "500.000" }),
  },
  { source: "goalsApi.update", run: () => goalsApi.update(1, { name: "Buffer" }) },
  { source: "goalsApi.deposit", run: () => goalsApi.deposit(1, "10.000") },
  { source: "goalsApi.delete", run: () => goalsApi.delete(1) },
  { source: "goalsApi.projection", run: () => goalsApi.projection(1) },

  // memorizedApi
  { source: "memorizedApi.list", run: () => memorizedApi.list() },
  { source: "memorizedApi.create", run: () => memorizedApi.create({ canonical: "Coffee" }) },
  { source: "memorizedApi.update", run: () => memorizedApi.update(1, { canonical: "Coffee" }) },
  { source: "memorizedApi.delete", run: () => memorizedApi.delete(1) },
  { source: "memorizedApi.pin", run: () => memorizedApi.pin(1, true) },
  { source: "memorizedApi.bulkDelete", run: () => memorizedApi.bulkDelete([1]) },

  // authApi
  { source: "authApi.me", run: () => authApi.me() },
  { source: "authApi.twoFactorSetup", run: () => authApi.twoFactorSetup() },
  { source: "authApi.twoFactorConfirm", run: () => authApi.twoFactorConfirm("123456") },
  { source: "authApi.twoFactorVerify", run: () => authApi.twoFactorVerify({ code: "123456" }) },
  { source: "authApi.twoFactorDisable", run: () => authApi.twoFactorDisable({ code: "123456" }) },
  { source: "authApi.revokeAllSessions", run: () => authApi.revokeAllSessions() },
  { source: "authApi.logout", run: () => authApi.logout() },
  { source: "authApi.profile", run: () => authApi.profile() },
  { source: "authApi.loadDemoData", run: () => authApi.loadDemoData() },
  { source: "authApi.clearDemoData", run: () => authApi.clearDemoData() },
  { source: "authApi.profileSecurityEvents", run: () => authApi.profileSecurityEvents() },
  { source: "authApi.updateProfile", run: () => authApi.updateProfile({}) },

  // uploadApi
  { source: "uploadApi.preview", run: () => uploadApi.preview(csvFile()) },
  { source: "uploadApi.importCommit", run: () => uploadApi.importCommit([]) },
  { source: "uploadApi.deleteImportBatch", run: () => uploadApi.deleteImportBatch("batch-1") },
]

// Report exported methods on EXERCISED_APIS that no INVOCATION exercises, plus
// any INVOCATION whose source no longer names a real method (rename/typo guard).
export function exercisedMethodGaps(): { missing: string[]; unknown: string[] } {
  const covered = new Set(INVOCATIONS.map((i) => i.source))
  const known = new Set<string>()
  const missing: string[] = []
  for (const [apiName, obj] of Object.entries(EXERCISED_APIS)) {
    for (const key of Object.keys(obj)) {
      const source = `${apiName}.${key}`
      known.add(source)
      if (!covered.has(source)) missing.push(source)
    }
  }
  const unknown = [...covered].filter((s) => !known.has(s))
  return { missing: missing.sort(), unknown: unknown.sort() }
}

export async function captureFrontendCalls(): Promise<FrontendCall[]> {
  const calls: FrontendCall[] = []

  const realFetch = globalThis.fetch
  const realCreate = globalThis.URL.createObjectURL
  const realRevoke = globalThis.URL.revokeObjectURL
  const realClick = globalThis.HTMLAnchorElement?.prototype.click

  // Blob URL helpers aren't implemented in jsdom; stub so the export path (which
  // reads res.blob() then createObjectURL) completes without a post-fetch throw.
  globalThis.URL.createObjectURL = () => "blob:mock"
  globalThis.URL.revokeObjectURL = () => {}
  // The export path clicks a synthesized <a download>; jsdom logs an async
  // "navigation not implemented" for that click. Stub it — we only need the fetch.
  if (globalThis.HTMLAnchorElement) globalThis.HTMLAnchorElement.prototype.click = () => {}

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
    const method = String(init?.method ?? "GET").toUpperCase()
    const path = new URL(url, "http://localhost").pathname
    calls.push({ method, path })
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, data: {}, error: null, meta: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
  }) as typeof fetch

  try {
    for (const inv of INVOCATIONS) {
      try {
        await inv.run()
      } catch {
        // Post-fetch response parsing/formatting can throw on the mocked body —
        // irrelevant here; the fetch URL was already recorded.
      }
    }
  } finally {
    globalThis.fetch = realFetch
    globalThis.URL.createObjectURL = realCreate
    globalThis.URL.revokeObjectURL = realRevoke
    if (globalThis.HTMLAnchorElement && realClick) globalThis.HTMLAnchorElement.prototype.click = realClick
  }

  const unique = new Map<string, FrontendCall>()
  for (const c of calls) unique.set(`${c.method} ${c.path}`, c)
  return [...unique.values()].sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
  )
}
