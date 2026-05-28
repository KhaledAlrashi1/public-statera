// ============================================================
// API Client — talks to the Flask backend
// ============================================================

import type {
  Category,
  CategoryRemapResult,
  CategoryDependentCounts,
  MerchantRemapResult,
  MerchantDependentCounts,
  Merchant,
  Transaction,
  TransactionSearchResult,
  SpendByMonth,
  SpendByCategory,
  BudgetMetricsResponse,
  DashboardMetricsResponse,
  DashboardBundleResponse,
  AccountOverviewResponse,
  SafeToSpendResponse,
  IncomePatternResponse,
  BudgetAlertNotification,
  ExpenseBreakdownResponse,
  ExpenseMerchantTrendResponse,
  RecurringPatternsResponse,
  WeeklyDigestResponse,
  BudgetResponse,
  MemorizedTransaction,
  TransactionSuggestion,
  TransactionTemplateSuggestion,
  BankConnection,
  BankAuthorizationStartResult,
  BankProviderCatalogEntry,
  BankConsentRecord,
  DataAccessLogRecord,
  BankSyncPreviewResult,
  BankCommitResult,
  DemoDataClearResult,
  DemoDataLoadResult,
  DebtAccount,
  DebtAccountSummary,
  DebtPayoffPlansResponse,
  SavingsGoal,
  SavingsGoalProjection,
  SnapshotResponse,
  SpendingIntelligenceResponse,
  User,
  AuthProfileResponse,
  UserProfile,
  AuthResponse,
  SecurityEvent,
  ApiEnvelope,
  ApiMeta,
  ApiPagedMeta,
} from "@/types/api"

export class ApiError extends Error {
  status: number
  code?: string
  meta?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, meta?: Record<string, unknown>) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.meta = meta
  }
}

export function __resetApiClientStateForTests() {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  const rec = asRecord(value)
  if (!rec) return false
  return "ok" in rec && "data" in rec && "error" in rec && "meta" in rec
}

function readApiData<T>(payload: unknown): T {
  if (isApiEnvelope<T>(payload)) {
    return (payload.data ?? {}) as T
  }
  return payload as T
}

function readApiMeta(payload: unknown): ApiMeta {
  if (isApiEnvelope(payload)) {
    const meta = payload.meta
    return meta && typeof meta === "object" ? meta : {}
  }
  return {}
}

function readErrorMessage(payload: unknown, status: number): string {
  const rec = asRecord(payload)
  if (!rec) return `HTTP ${status}`
  const error = rec.error
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object") {
    const msg = (error as Record<string, unknown>).message
    if (typeof msg === "string" && msg.trim()) return msg
  }
  const errors = rec.errors
  if (Array.isArray(errors)) {
    const merged = errors
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
      .join(", ")
    if (merged) return merged
  }
  return `HTTP ${status}`
}

function readErrorCode(payload: unknown): string | undefined {
  const rec = asRecord(payload)
  if (!rec) return undefined
  const direct = rec.code
  return typeof direct === "string" && direct.trim() ? direct : undefined
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function parseTransactionSearchResult(payload: unknown): TransactionSearchResult {
  const data = readApiData<{ items?: Transaction[] } & Partial<TransactionSearchResult>>(payload)
  const meta = readApiMeta(payload) as ApiPagedMeta
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: readNumber(meta.total ?? data.total, 0),
    offset: readNumber(meta.offset ?? data.offset, 0),
    limit: readNumber(meta.limit ?? data.limit, 20),
    has_more: Boolean((meta.has_more ?? data.has_more) || false),
  }
}

function parseByCategoryResult(
  payload: unknown
): { ok: boolean; category: string; month?: string | null; items: Transaction[]; has_more: boolean; total: number } {
  const data = readApiData<{
    category?: string
    month?: string | null
    items?: Transaction[]
    has_more?: boolean
    total?: number
  }>(payload)
  const meta = readApiMeta(payload) as ApiPagedMeta
  return {
    ok: true,
    category: typeof data.category === "string" ? data.category : "",
    month: typeof data.month === "string" || data.month === null ? data.month : undefined,
    items: Array.isArray(data.items) ? data.items : [],
    has_more: Boolean((meta.has_more ?? data.has_more) || false),
    total: readNumber(meta.total ?? data.total, 0),
  }
}

function parseBudgetResponse(payload: unknown, fallbackMonth: string): BudgetResponse {
  const data = readApiData<Partial<BudgetResponse>>(payload)
  return {
    ok: true,
    month: typeof data.month === "string" ? data.month : fallbackMonth,
    items: Array.isArray(data.items) ? data.items : [],
    profile_context: data.profile_context,
  }
}

function parseMemorizedListResult(payload: unknown): {
  ok: boolean
  items: MemorizedTransaction[]
  has_more: boolean
  total: number
  offset: number
  limit: number
} {
  const data = readApiData<{
    items?: MemorizedTransaction[]
    has_more?: boolean
    total?: number
    offset?: number
    limit?: number
  }>(payload)
  const meta = readApiMeta(payload) as ApiPagedMeta
  return {
    ok: true,
    items: Array.isArray(data.items) ? data.items : [],
    has_more: Boolean((meta.has_more ?? data.has_more) || false),
    total: readNumber(meta.total ?? data.total, 0),
    offset: readNumber(meta.offset ?? data.offset, 0),
    limit: readNumber(meta.limit ?? data.limit, 20),
  }
}

function parseMemorizedItemResult(payload: unknown): { ok: boolean; item: MemorizedTransaction } {
  const data = readApiData<{ item?: MemorizedTransaction }>(payload)
  if (!data.item) throw new Error("Invalid memorized transaction response.")
  return { ok: true, item: data.item }
}

type CollectorOptions = {
  pageSize?: number
  maxRows?: number
  maxPages?: number
}

type CollectorPage<T> = {
  items?: T[]
  has_more?: boolean
}

const MIN_COLLECT_PAGE_SIZE = 20
const SEARCH_MAX_PAGE_SIZE = 100 // Keep in sync with backend.constants.MAX_PAGE_SIZE.
const DEFAULT_COLLECT_MAX_ROWS = 5000

function resolveCollectorConfig(options: CollectorOptions | undefined, defaultPageSize: number) {
  const pageSize = Math.max(
    MIN_COLLECT_PAGE_SIZE,
    Math.min(options?.pageSize ?? defaultPageSize, SEARCH_MAX_PAGE_SIZE)
  )
  const maxRows = Math.max(pageSize, options?.maxRows ?? DEFAULT_COLLECT_MAX_ROWS)
  const defaultMaxPages = Math.ceil(maxRows / pageSize) + 1
  const maxPages = Math.max(1, options?.maxPages ?? defaultMaxPages)
  return { pageSize, maxRows, maxPages }
}

async function collectPagedItems<T>(
  fetchPage: (args: { limit: number; offset: number }) => Promise<CollectorPage<T>>,
  options: CollectorOptions | undefined,
  defaultPageSize: number
): Promise<T[]> {
  const { pageSize, maxRows, maxPages } = resolveCollectorConfig(options, defaultPageSize)
  let offset = 0
  let pageCount = 0
  const out: T[] = []

  while (pageCount < maxPages && out.length < maxRows) {
    const page = await fetchPage({ limit: pageSize, offset })
    const batch = page.items || []
    if (batch.length === 0) break

    const remaining = maxRows - out.length
    out.push(...batch.slice(0, remaining))
    pageCount += 1

    if (!page.has_more || out.length >= maxRows) break
    offset += batch.length
  }

  return out
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase()

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "fetch",
    ...(options.headers as Record<string, string>),
  }

  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "include",
  })

  // Handle 401 — dispatch event for AuthContext to catch
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"))
    throw new Error("Authentication required")
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(
      readErrorMessage(data, res.status),
      res.status,
      readErrorCode(data),
      asRecord(data) ?? {}
    )
  }

  return res.json()
}

// ============================================================
// Categories
// ============================================================

export const categoriesApi = {
  list: async () => {
    const payload = await apiFetch<unknown>("/api/categories")
    const data = readApiData<{ items?: Category[] }>(payload)
    return Array.isArray(data.items) ? data.items : []
  },
  create: async (name: string) => {
    const payload = await apiFetch<unknown>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    const data = readApiData<{ item?: Category }>(payload)
    return data.item || (payload as Category)
  },
  delete: async (id: number, reassignTo?: number) => {
    const p = reassignTo != null ? new URLSearchParams({ reassign_to: String(reassignTo) }) : null
    const payload = await apiFetch<unknown>(
      p ? `/api/categories/${id}?${p}` : `/api/categories/${id}`,
      { method: "DELETE" },
    )
    return readApiData<{ deleted?: boolean; dependent_counts?: CategoryDependentCounts; conflicting_periods?: string[] }>(payload)
  },
  remap: async (sourceId: number, targetId: number) => {
    const payload = await apiFetch<unknown>(`/api/categories/${sourceId}/remap`, {
      method: "POST",
      body: JSON.stringify({ target_id: targetId }),
    })
    return readApiData<CategoryRemapResult>(payload)
  },
}

// ============================================================
// Merchants
// ============================================================

export const merchantsApi = {
  list: async () => {
    const payload = await apiFetch<unknown>("/api/merchants")
    const data = readApiData<{ items?: Merchant[] }>(payload)
    return Array.isArray(data.items) ? data.items : []
  },
  create: async (name: string) => {
    const payload = await apiFetch<unknown>("/api/merchants", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    const data = readApiData<{ item?: Merchant }>(payload)
    return data.item || (payload as Merchant)
  },
  delete: async (id: number, reassignTo?: number) => {
    const p = reassignTo != null ? new URLSearchParams({ reassign_to: String(reassignTo) }) : null
    const payload = await apiFetch<unknown>(
      p ? `/api/merchants/${id}?${p}` : `/api/merchants/${id}`,
      { method: "DELETE" },
    )
    return readApiData<{ deleted?: boolean; dependent_counts?: MerchantDependentCounts }>(payload)
  },
  update: async (id: number, name: string) => {
    const payload = await apiFetch<ApiEnvelope<{ item?: Merchant }>>(`/api/merchants/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    })
    return readApiData<{ item?: Merchant }>(payload)
  },
  remap: async (sourceId: number, targetId: number) => {
    const payload = await apiFetch<unknown>(`/api/merchants/${sourceId}/remap`, {
      method: "POST",
      body: JSON.stringify({ target_id: targetId }),
    })
    return readApiData<MerchantRemapResult>(payload)
  },
}

// ============================================================
// Transactions
// ============================================================

export const transactionsApi = {
  search: async (params: {
    q?: string
    category?: string
    merchant?: string
    date_from?: string
    date_to?: string
    income_only?: boolean
    exclude_income?: boolean
    limit?: number
    offset?: number
    include_total?: boolean
  }) => {
    const p = new URLSearchParams()
    if (params.q) p.set("q", params.q)
    if (params.category) p.set("category", params.category)
    if (params.merchant) p.set("merchant", params.merchant)
    if (params.date_from) p.set("date_from", params.date_from)
    if (params.date_to) p.set("date_to", params.date_to)
    if (params.income_only) p.set("income_only", "true")
    if (params.exclude_income) p.set("exclude_income", "true")
    p.set("limit", String(params.limit || 20))
    p.set("offset", String(params.offset || 0))
    if (params.include_total === false) p.set("include_total", "false")
    const payload = await apiFetch<unknown>(`/api/transactions/search?${p}`)
    return parseTransactionSearchResult(payload)
  },

  searchAll: async (params?: {
    q?: string
    category?: string
    merchant?: string
    date_from?: string
    date_to?: string
    income_only?: boolean
    exclude_income?: boolean
    pageSize?: number
    maxRows?: number
    maxPages?: number
  }) => {
    const { pageSize, maxRows, maxPages, ...searchParams } = params || {}
    return collectPagedItems<Transaction>(
      ({ limit, offset }) =>
        transactionsApi.search({
          ...searchParams,
          limit,
          offset,
          include_total: false,
        }),
      { pageSize, maxRows, maxPages },
      500
    )
  },

  get: (id: number) =>
    apiFetch<ApiEnvelope<{ item: Transaction }>>(`/api/transactions/${id}`),

  create: (data: {
    date: string
    merchant?: string
    category: string
    name: string
    amount_kd: string
    force?: string
  }) =>
    apiFetch<ApiEnvelope<{ item: Transaction }>>("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Record<string, unknown>) =>
    apiFetch<ApiEnvelope<{ item: Transaction }>>(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  split: (id: number, rows: Array<{ name: string; category: string; amount_kd: string }>) =>
    apiFetch<{ ok: boolean; transactions: Transaction[] }>(`/api/transactions/${id}/split`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  delete: (id: number) =>
    apiFetch<ApiEnvelope<{ deleted: true }>>(`/api/transactions/${id}`, {
      method: "DELETE",
    }),

  bulkDelete: (ids: number[]) =>
    apiFetch<{ ok: boolean; deleted: number }>("/api/transactions/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  bulkUpdate: (ids: number[], changes: { merchant?: string; category?: string; name?: string }) =>
    apiFetch<{ ok: boolean; updated: number }>("/api/transactions/bulk-update", {
      method: "POST",
      body: JSON.stringify({ ids, changes }),
    }),

  dupCheck: (date: string, name: string, amount_kd: string) => {
    const p = new URLSearchParams({ date, name, amount_kd })
    return apiFetch<{ ok: boolean; count: number }>(
      `/api/transactions/dup-check?${p}`
    )
  },

  byCategory: async (params: {
    category: string
    month?: string
    limit?: number
    offset?: number
    include_total?: boolean
  }) => {
    const p = new URLSearchParams()
    p.set("category", params.category)
    if (params.month) p.set("month", params.month)
    if (params.limit !== undefined) p.set("limit", String(params.limit))
    if (params.offset !== undefined) p.set("offset", String(params.offset))
    if (params.include_total === false) p.set("include_total", "false")
    const payload = await apiFetch<unknown>(`/api/transactions/by-category?${p}`)
    return parseByCategoryResult(payload)
  },

  byCategoryAll: async (params: {
    category: string
    month?: string
    pageSize?: number
    maxRows?: number
    maxPages?: number
  }) => {
    const { pageSize, maxRows, maxPages, ...categoryParams } = params
    return collectPagedItems<Transaction>(
      ({ limit, offset }) =>
        transactionsApi.byCategory({
          ...categoryParams,
          limit,
          offset,
          include_total: false,
        }),
      { pageSize, maxRows, maxPages },
      100
    )
  },

  suggestions: (q: string, limit = 12) =>
    apiFetch<{ items: TransactionSuggestion[] }>(
      `/api/transaction-suggestions?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  templateSuggestions: (q: string, limit = 3) =>
    apiFetch<{ items: TransactionTemplateSuggestion[] }>(
      `/api/transaction-template-suggestions?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  templateSuggestionFeedback: (params: {
    feedback_key: string
    outcome: "accepted" | "rejected"
    query?: string
    source?: string
  }) =>
    apiFetch<{ ok: boolean }>(
      "/api/transaction-template-suggestions/feedback",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    ),

  summary: (month?: string) => {
    const p = new URLSearchParams()
    if (month) p.set("month", month)
    const suffix = p.toString()
    return apiFetch<{ ok: boolean; month: string; transaction_count: number; income_count: number }>(
      `/api/transactions/summary${suffix ? `?${suffix}` : ""}`
    )
  },

  topPatterns: (range: "30" | "90" | "365" | "all") =>
    apiFetch<{ ok: boolean; range: string; items: Array<{ name: string; count: number; sum_kd: string }> }>(
      `/api/transactions/top-patterns?range=${range}`
    ),

  exportCsv: () => downloadTransactionExport("csv"),

  exportXlsx: () => downloadTransactionExport("xlsx"),
}

async function downloadTransactionExport(
  format: "csv" | "xlsx"
): Promise<{ truncated: boolean; rowLimit: number }> {
    const extension = format === "csv" ? "csv" : "xlsx"
    const accept =
      format === "csv"
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    const res = await fetch(`/api/transactions/export-${extension}`, {
      method: "GET",
      headers: {
        Accept: accept,
        "X-Requested-With": "fetch",
      },
      credentials: "include",
    })
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"))
      throw new Error("Authentication required")
    }
    if (!res.ok) {
      throw new Error(`Export failed (HTTP ${res.status})`)
    }
    const truncated = res.headers.get("X-Export-Truncated") === "true"
    const rowLimit = Number(res.headers.get("X-Export-Row-Limit") ?? "10000")

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `my-finance-data-${today}.${extension}`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
    return { truncated, rowLimit }
}

// ============================================================
// Spending Analytics
// ============================================================

export const analyticsApi = {
  spendByCategory: async () => {
    const payload = await apiFetch<unknown>("/api/analytics/spend-by-category")
    const data = readApiData<{ items?: SpendByCategory } | SpendByCategory>(payload)
    if (data && typeof data === "object" && !Array.isArray(data) && "items" in data) {
      return (data as { items?: SpendByCategory }).items || {}
    }
    return (data || {}) as SpendByCategory
  },
  spendByMonth: async () => {
    const payload = await apiFetch<unknown>("/api/analytics/spend-by-month")
    const data = readApiData<{ items?: SpendByMonth[] } | SpendByMonth[]>(payload)
    if (Array.isArray(data)) return data
    return Array.isArray(data.items) ? data.items : []
  },
  dashboardMetrics: async (params?: { months?: number; until?: string }) => {
    const p = new URLSearchParams()
    if (params?.months !== undefined) p.set("months", String(params.months))
    if (params?.until) p.set("until", params.until)
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(`/api/analytics/dashboard-metrics${suffix ? `?${suffix}` : ""}`)
    return readApiData<DashboardMetricsResponse>(payload)
  },
  budgetMetrics: async (month: string, range: "month" | "30" | "90" | "365" | "all") => {
    const p = new URLSearchParams({ month, range })
    const payload = await apiFetch<unknown>(`/api/analytics/budget-metrics?${p}`)
    return readApiData<BudgetMetricsResponse>(payload)
  },
  safeToSpend: async (month: string) => {
    const p = new URLSearchParams({ month })
    const payload = await apiFetch<unknown>(`/api/analytics/safe-to-spend?${p}`)
    return readApiData<SafeToSpendResponse>(payload)
  },
  dashboardBundle: async (month: string) => {
    const p = new URLSearchParams({ month })
    const payload = await apiFetch<unknown>(`/api/analytics/dashboard-bundle?${p}`)
    return readApiData<DashboardBundleResponse>(payload)
  },
  incomePattern: async () => {
    const payload = await apiFetch<unknown>("/api/analytics/income-pattern")
    return readApiData<IncomePatternResponse>(payload)
  },
  expenseBreakdown: async (params: {
    dimension: "category" | "merchant" | "transaction"
    range: "month" | "12m" | "all"
    month?: string
    limit?: number
    source?: "manual" | "bank_import" | "csv_import"
  }) => {
    const p = new URLSearchParams()
    p.set("dimension", params.dimension)
    p.set("range", params.range)
    if (params.month) p.set("month", params.month)
    if (params.limit !== undefined) p.set("limit", String(params.limit))
    if (params.source) p.set("source", params.source)
    const payload = await apiFetch<unknown>(`/api/analytics/expense-breakdown?${p}`)
    return readApiData<ExpenseBreakdownResponse>(payload)
  },
  accountOverview: async (params?: { month?: string }) => {
    const p = new URLSearchParams()
    if (params?.month) p.set("month", params.month)
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(`/api/analytics/account-overview${suffix ? `?${suffix}` : ""}`)
    return readApiData<AccountOverviewResponse>(payload)
  },
  expenseMerchantTrend: async (params: {
    merchant: string
    months?: number
    until?: string
  }) => {
    const p = new URLSearchParams()
    p.set("merchant", params.merchant)
    if (params.months !== undefined) p.set("months", String(params.months))
    if (params.until) p.set("until", params.until)
    const payload = await apiFetch<unknown>(`/api/analytics/expense-merchant-trend?${p}`)
    return readApiData<ExpenseMerchantTrendResponse>(payload)
  },
  recurringPatterns: async (params?: { days?: number }) => {
    const p = new URLSearchParams()
    if (params?.days !== undefined) p.set("days", String(params.days))
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(`/api/analytics/recurring-patterns${suffix ? `?${suffix}` : ""}`)
    return readApiData<RecurringPatternsResponse>(payload)
  },
  weeklyDigest: async () => {
    const payload = await apiFetch<unknown>("/api/analytics/weekly-digest")
    return readApiData<WeeklyDigestResponse>(payload)
  },
  snapshot: async () => {
    const payload = await apiFetch<unknown>("/api/analytics/snapshot")
    return readApiData<SnapshotResponse>(payload)
  },
}

// ============================================================
// Notifications
// ============================================================

export const notificationsApi = {
  listBudgetAlerts: async (params?: { month?: string; limit?: number }) => {
    const p = new URLSearchParams()
    if (params?.month) p.set("month", params.month)
    if (params?.limit !== undefined) p.set("limit", String(params.limit))
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(
      `/api/notifications/budget-alerts${suffix ? `?${suffix}` : ""}`
    )
    const data = readApiData<{ month?: string; items?: BudgetAlertNotification[] }>(payload)
    return {
      month: typeof data.month === "string" ? data.month : null,
      items: Array.isArray(data.items) ? data.items : [],
    }
  },

  dismissBudgetAlert: (alertKey: string) =>
    apiFetch<ApiEnvelope<{ dismissed: boolean }>>(
      "/api/notifications/budget-alerts/dismiss",
      {
        method: "POST",
        body: JSON.stringify({ alert_key: alertKey }),
      }
    ),
}

// ============================================================
// Budgets
// ============================================================

export const budgetsApi = {
  get: async (month: string) => {
    const p = new URLSearchParams({ month })
    const payload = await apiFetch<unknown>(`/api/budgets?${p}`)
    return parseBudgetResponse(payload, month)
  },

  save: async (month: string, items: { category: string; amount_kd: string }[]) => {
    const payload = await apiFetch<unknown>("/api/budgets", {
      method: "POST",
      body: JSON.stringify({ month, items }),
    })
    return parseBudgetResponse(payload, month)
  },

  getMonths: async (): Promise<string[]> => {
    const data = await apiFetch<{ ok: boolean; months: string[] }>("/api/budgets/months")
    return Array.isArray(data.months) ? data.months : []
  },
}

// ============================================================
// Debt Accounts
// ============================================================

export const debtApi = {
  list: async (params?: { include_inactive?: boolean }) => {
    const p = new URLSearchParams()
    if (params?.include_inactive) p.set("include_inactive", "true")
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(`/api/debt-accounts${suffix ? `?${suffix}` : ""}`)
    const data = readApiData<{ accounts?: DebtAccount[] }>(payload)
    return Array.isArray(data.accounts) ? data.accounts : []
  },

  create: async (data: {
    name: string
    debt_type: DebtAccount["debt_type"]
    balance_kd: string
    minimum_payment_kd: string
    due_day?: number | null
    apr_pct?: string | null
    notes?: string | null
  }) => {
    const payload = await apiFetch<unknown>("/api/debt-accounts", {
      method: "POST",
      body: JSON.stringify(data),
    })
    const body = readApiData<{ account?: DebtAccount }>(payload)
    if (!body.account) throw new Error("Missing debt account in response.")
    return body.account
  },

  update: async (
    accountId: number,
    data: {
      name?: string
      debt_type?: DebtAccount["debt_type"]
      balance_kd?: string
      minimum_payment_kd?: string
      due_day?: number | null
      apr_pct?: string | null
      notes?: string | null
    }
  ) => {
    const payload = await apiFetch<ApiEnvelope<{ account?: DebtAccount }>>(`/api/debt-accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
    const body = readApiData<{ account?: DebtAccount }>(payload)
    if (!body.account) throw new Error("Missing debt account in response.")
    return body.account
  },

  delete: async (accountId: number) => {
    const payload = await apiFetch<unknown>(`/api/debt-accounts/${accountId}`, {
      method: "DELETE",
    })
    const body = readApiData<{ account?: DebtAccount }>(payload)
    if (!body.account) throw new Error("Missing debt account in response.")
    return body.account
  },

  summary: async () => {
    const payload = await apiFetch<unknown>("/api/debt-accounts/summary")
    const data = readApiData<Partial<DebtAccountSummary>>(payload)
    return {
      total_balance_kd: typeof data.total_balance_kd === "string" ? data.total_balance_kd : "0.000",
      total_minimum_kd: typeof data.total_minimum_kd === "string" ? data.total_minimum_kd : "0.000",
      account_count: typeof data.account_count === "number" ? data.account_count : 0,
    } satisfies DebtAccountSummary
  },

  payoffPlan: async (monthlyPayment: string) => {
    const p = new URLSearchParams({ monthly_payment: monthlyPayment })
    const payload = await apiFetch<unknown>(`/api/debt-accounts/payoff-plan?${p}`)
    const data = readApiData<Partial<DebtPayoffPlansResponse>>(payload)
    return {
      avalanche: data.avalanche || {
        strategy: "avalanche",
        total_months: 0,
        total_interest_paid: "0.000",
        debt_free_date: "",
        payoff_order: [],
        debt_free_impossible: false,
      },
      snowball: data.snowball || {
        strategy: "snowball",
        total_months: 0,
        total_interest_paid: "0.000",
        debt_free_date: "",
        payoff_order: [],
        debt_free_impossible: false,
      },
      minimum_required: typeof data.minimum_required === "string" ? data.minimum_required : "0.000",
    } satisfies DebtPayoffPlansResponse
  },
}

// ============================================================
// Savings Goals
// ============================================================

export const goalsApi = {
  list: async (params?: { include_inactive?: boolean }) => {
    const p = new URLSearchParams()
    if (params?.include_inactive) p.set("include_inactive", "true")
    const suffix = p.toString()
    const payload = await apiFetch<unknown>(`/api/savings-goals${suffix ? `?${suffix}` : ""}`)
    const data = readApiData<{ goals?: SavingsGoal[] }>(payload)
    return Array.isArray(data.goals) ? data.goals : []
  },

  create: async (data: {
    name: string
    goal_type: SavingsGoal["goal_type"]
    target_kd: string
    current_kd?: string
    target_date?: string | null
    linked_category?: string | null
    notes?: string | null
  }) => {
    const payload = await apiFetch<unknown>("/api/savings-goals", {
      method: "POST",
      body: JSON.stringify(data),
    })
    const body = readApiData<{ goal?: SavingsGoal }>(payload)
    if (!body.goal) throw new Error("Missing savings goal in response.")
    return body.goal
  },

  update: async (
    goalId: number,
    data: {
      name?: string
      goal_type?: SavingsGoal["goal_type"]
      target_kd?: string
      current_kd?: string
      target_date?: string | null
      linked_category?: string | null
      notes?: string | null
    }
  ) => {
    const payload = await apiFetch<ApiEnvelope<{ goal?: SavingsGoal }>>(`/api/savings-goals/${goalId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
    const body = readApiData<{ goal?: SavingsGoal }>(payload)
    if (!body.goal) throw new Error("Missing savings goal in response.")
    return body.goal
  },

  deposit: async (goalId: number, amount_kd: string) => {
    const payload = await apiFetch<unknown>(`/api/savings-goals/${goalId}/deposit`, {
      method: "POST",
      body: JSON.stringify({ amount_kd }),
    })
    const body = readApiData<{ goal?: SavingsGoal }>(payload)
    if (!body.goal) throw new Error("Missing savings goal in response.")
    return body.goal
  },

  delete: async (goalId: number) => {
    const payload = await apiFetch<unknown>(`/api/savings-goals/${goalId}`, {
      method: "DELETE",
    })
    const body = readApiData<{ goal?: SavingsGoal }>(payload)
    if (!body.goal) throw new Error("Missing savings goal in response.")
    return body.goal
  },

  projection: async (goalId: number) => {
    const payload = await apiFetch<unknown>(`/api/savings-goals/${goalId}/projection`)
    const body = readApiData<{ projection?: SavingsGoalProjection }>(payload)
    if (!body.projection) throw new Error("Missing savings goal projection in response.")
    return body.projection
  },
}

// ============================================================
// Memorized Transactions
// ============================================================

export const memorizedApi = {
  list: async (params?: { q?: string; sort?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams()
    if (params?.q) p.set("q", params.q)
    if (params?.sort) p.set("sort", params.sort)
    p.set("limit", String(params?.limit || 50))
    p.set("offset", String(params?.offset || 0))
    const payload = await apiFetch<unknown>(`/api/memorized-transactions?${p}`)
    return parseMemorizedListResult(payload)
  },

  create: async (data: { canonical: string; category_id?: number | null; merchant_id?: number | null }) => {
    const payload = await apiFetch<unknown>("/api/memorized-transactions", {
      method: "POST",
      body: JSON.stringify(data),
    })
    return parseMemorizedItemResult(payload)
  },

  update: async (id: number, data: { canonical: string; category_id?: number | null; merchant_id?: number | null }) => {
    const payload = await apiFetch<ApiEnvelope<{ item?: MemorizedTransaction }>>(
      `/api/memorized-transactions/${id}`,
      { method: "PATCH", body: JSON.stringify(data) }
    )
    return parseMemorizedItemResult(payload)
  },

  delete: async (id: number) => {
    await apiFetch<unknown>(`/api/memorized-transactions/${id}`, {
      method: "DELETE",
    })
    return { ok: true }
  },

  pin: async (id: number, pinned: boolean) => {
    const payload = await apiFetch<unknown>(
      `/api/memorized-transactions/${id}/pin`,
      { method: "POST", body: JSON.stringify({ pinned }) }
    )
    return parseMemorizedItemResult(payload)
  },

  bulkDelete: async (ids: number[]) => {
    const payload = await apiFetch<{ deleted?: number }>(
      "/api/memorized-transactions/bulk-delete",
      { method: "POST", body: JSON.stringify({ ids }) }
    )
    const p = payload as Record<string, unknown>
    return { deleted: typeof p.deleted === "number" ? p.deleted : 0 }
  },
}

// ============================================================
// Open Banking
// ============================================================

export const bankApi = {
  listProviders: async () => {
    const payload = await apiFetch<unknown>("/api/bank/providers")
    const data = readApiData<{ providers?: BankProviderCatalogEntry[] }>(payload)
    return Array.isArray(data.providers) ? data.providers : []
  },

  beginAuthorization: async (params: {
    provider: string
    institution_name?: string
    external_institution_id?: string
    scopes?: string[]
    purpose_of_use?: string
  }) => {
    const payload = await apiFetch<unknown>("/api/bank/connect/oauth-begin", {
      method: "POST",
      body: JSON.stringify(params),
    })
    const data = readApiData<Partial<BankAuthorizationStartResult>>(payload)
    if (typeof data.authorization_url !== "string" || !data.authorization_url) {
      throw new Error("Missing provider authorization URL.")
    }
    return {
      provider: typeof data.provider === "string" ? data.provider : params.provider,
      display_name: typeof data.display_name === "string" ? data.display_name : params.provider,
      authorization_url: data.authorization_url,
      redirect_uri: typeof data.redirect_uri === "string" ? data.redirect_uri : null,
      state: typeof data.state === "string" ? data.state : "",
      expires_in_seconds: typeof data.expires_in_seconds === "number" ? data.expires_in_seconds : 0,
    } satisfies BankAuthorizationStartResult
  },

  connect: async (params: {
    provider: string
    institution_name?: string
    external_institution_id?: string
    scopes?: string[]
    purpose_of_use?: string
  }) => {
    const payload = await apiFetch<unknown>("/api/bank/connect", {
      method: "POST",
      body: JSON.stringify(params),
    })
    const data = readApiData<{ connection?: BankConnection }>(payload)
    if (!data.connection) throw new Error("Missing bank connection in response.")
    return data.connection
  },

  listConnections: async () => {
    const payload = await apiFetch<unknown>("/api/bank/connections")
    const data = readApiData<{ connections?: BankConnection[] }>(payload)
    return Array.isArray(data.connections) ? data.connections : []
  },

  listConsents: async () => {
    const payload = await apiFetch<unknown>("/api/bank/consents")
    const data = readApiData<{ consents?: BankConsentRecord[] }>(payload)
    return Array.isArray(data.consents) ? data.consents : []
  },

  getConsent: async (consentId: number) => {
    const payload = await apiFetch<unknown>(`/api/bank/consents/${consentId}`)
    const data = readApiData<{ consent?: BankConsentRecord }>(payload)
    if (!data.consent) throw new Error("Consent not found.")
    return data.consent
  },

  getDataAccessLog: async (params?: { connection_id?: number; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.connection_id) q.set("connection_id", String(params.connection_id))
    if (typeof params?.limit === "number") q.set("limit", String(params.limit))
    const suffix = q.toString()
    const payload = await apiFetch<unknown>(`/api/bank/data-access-log${suffix ? `?${suffix}` : ""}`)
    const data = readApiData<{ log?: DataAccessLogRecord[] }>(payload)
    return Array.isArray(data.log) ? data.log : []
  },

  syncPreview: async (connectionId: number, params?: { cursor?: string | null; limit?: number }) => {
    const payload = await apiFetch<unknown>(`/api/bank/connections/${connectionId}/sync-preview`, {
      method: "POST",
      body: JSON.stringify({
        cursor: params?.cursor ?? undefined,
        limit: params?.limit ?? undefined,
      }),
    })
    return readApiData<BankSyncPreviewResult>(payload)
  },

  commit: async (connectionId: number, syncRunId: number, params?: { default_category?: string }) => {
    const payload = await apiFetch<unknown>(`/api/bank/connections/${connectionId}/sync-runs/${syncRunId}/commit`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    })
    return readApiData<BankCommitResult>(payload)
  },

  revoke: async (connectionId: number) => {
    const payload = await apiFetch<unknown>(`/api/bank/connections/${connectionId}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    })
    const data = readApiData<{ connection_id?: number; status?: string }>(payload)
    return {
      connection_id: data.connection_id ?? connectionId,
      status: data.status ?? "revoked",
    }
  },
}

// ============================================================
// File Upload (special — uses FormData, not JSON)
// ============================================================

export const uploadApi = {
  preview: async (file: File, columnMap?: Record<string, string>) => {
    const fd = new FormData()
    fd.append("file", file)
    if (columnMap) fd.append("column_map", JSON.stringify(columnMap))

    const res = await fetch("/api/transactions/upload-preview", {
      method: "POST",
      headers: { Accept: "application/json", "X-Requested-With": "fetch" },
      credentials: "include",
      body: fd,
    })

    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"))
      throw new Error("Authentication required")
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new ApiError(
        readErrorMessage(data, res.status),
        res.status,
        readErrorCode(data),
        asRecord(data) ?? {}
      )
    }

    return res.json()
  },

  importCommit: (
    rows: unknown[],
    options?: { replaceDemoData?: boolean; atomic?: boolean; fileHash?: string; batchId?: string }
  ) =>
    apiFetch<{
      ok: boolean
      imported: number
      imported_count?: number
      created?: number
      updated?: number
      unchanged?: number
      import_batch_id?: string | null
      skipped: number
      skipped_duplicate: number
      skipped_idempotent?: number
      failed_internal?: number
      auto_excluded_count?: number
      auto_excluded_rows?: Array<Record<string, unknown>>
      row_results?: Array<{
        row_index: number
        status: string
        error_code?: string
        message?: string
        transaction_id?: number
        idempotency_key?: string
      }>
      summary?: Record<string, unknown>
      demo_workspace_replaced?: DemoDataClearResult | null
    }>(
      "/api/transactions/import-commit",
      {
        method: "POST",
        body: JSON.stringify({
          rows,
          replace_demo_data: Boolean(options?.replaceDemoData),
          atomic: options?.atomic ?? true,
          file_hash: options?.fileHash,
          batch_id: options?.batchId,
        }),
      }
    ),

  deleteImportBatch: (batchId: string) =>
    apiFetch<{ ok: boolean; deleted_count: number }>(
      `/api/transactions/import-batch/${encodeURIComponent(batchId)}`,
      {
        method: "DELETE",
      }
    ),
}

export interface FeatureFlags {
  open_banking: boolean
  template_suggestions: boolean
  recurring_patterns: boolean
}

export const featuresApi = {
  get: () =>
    apiFetch<{ ok: boolean; flags: FeatureFlags }>("/api/features"),
}

// ============================================================
// Auth
// ============================================================

export const authApi = {
  me: () =>
    apiFetch<{
      ok: boolean
      user: User | null
      flags?: Partial<FeatureFlags>
    }>("/api/auth/me"),

  twoFactorSetup: () =>
    apiFetch<{
      ok: boolean
      qr_data_uri: string
      secret_b32: string
      backup_codes: string[]
    }>("/api/auth/2fa/setup", {
      method: "POST",
    }),

  twoFactorConfirm: (code: string) =>
    apiFetch<{ ok: boolean; code?: string; error?: string }>("/api/auth/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  twoFactorVerify: (payload: { code: string; type?: "totp" | "backup" }) =>
    apiFetch<AuthResponse>("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  twoFactorDisable: (payload: { code: string }) =>
    apiFetch<{ ok: boolean; code?: string; error?: string }>("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revokeAllSessions: () =>
    apiFetch<{ ok: boolean; session_version: number }>("/api/auth/sessions/revoke-all", {
      method: "POST",
    }),

  deleteAccount: (payload: { password: string; totp_code?: string; confirmation_token?: string }) =>
    apiFetch<{
      ok: boolean
      data?: { confirmation_token?: string; expires_in?: number; deleted?: boolean }
      code?: string
      error?: string
    }>("/api/account", {
      method: "DELETE",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    }),

  profile: () =>
    apiFetch<AuthProfileResponse>("/api/auth/profile"),

  loadDemoData: async () => {
    const payload = await apiFetch<unknown>("/api/auth/demo-data", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const data = readApiData<Partial<DemoDataLoadResult>>(payload)
    return {
      month: typeof data.month === "string" ? data.month : "",
      transactions_created: typeof data.transactions_created === "number" ? data.transactions_created : 0,
      budgets_created: typeof data.budgets_created === "number" ? data.budgets_created : 0,
      debt_accounts_created:
        typeof data.debt_accounts_created === "number" ? data.debt_accounts_created : 0,
      savings_goals_created:
        typeof data.savings_goals_created === "number" ? data.savings_goals_created : 0,
      months_seeded: typeof data.months_seeded === "number" ? data.months_seeded : 0,
    } satisfies DemoDataLoadResult
  },

  clearDemoData: async () => {
    const payload = await apiFetch<unknown>("/api/auth/demo-data/clear", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const data = readApiData<Partial<DemoDataClearResult>>(payload)
    return {
      transactions_cleared:
        typeof data.transactions_cleared === "number" ? data.transactions_cleared : 0,
      budgets_cleared: typeof data.budgets_cleared === "number" ? data.budgets_cleared : 0,
      debt_accounts_cleared:
        typeof data.debt_accounts_cleared === "number" ? data.debt_accounts_cleared : 0,
      savings_goals_cleared:
        typeof data.savings_goals_cleared === "number" ? data.savings_goals_cleared : 0,
      profile_fields_cleared: Array.isArray(data.profile_fields_cleared)
        ? data.profile_fields_cleared.filter((field): field is string => typeof field === "string")
        : [],
    } satisfies DemoDataClearResult
  },

  profileSecurityEvents: (limit = 20, offset = 0) =>
    apiFetch<{ ok: boolean; items: SecurityEvent[]; has_more: boolean; offset: number; limit: number }>(
      `/api/auth/profile/security-events?limit=${Math.max(1, Math.min(limit, 50))}&offset=${Math.max(0, offset)}`
    ),

  updateProfile: (data: {
    first_name?: string | null
    last_name?: string | null
    display_name?: string
    email?: string
    current_password?: string
    monthly_income_kd?: string | null
    payday_day?: number | null
    country?: string
    timezone?: string | null
    email_notifications_enabled?: boolean
    has_debt_choice?: boolean | null
    setup_guide_seen?: boolean
    setup_guide_dismissed?: boolean
  }) =>
    apiFetch<{ ok: boolean; user: User; profile: UserProfile; errors?: string[] }>("/api/auth/profile/update", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  requestEmailChangeLink: (data: { new_email: string; current_password: string }) =>
    apiFetch<{ ok: boolean; message?: string; preview_url?: string; errors?: string[] }>(
      "/api/auth/profile/request-email-change-link",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  requestPasswordChangeLink: (data: { current_password: string }) =>
    apiFetch<{ ok: boolean; message?: string; preview_url?: string; errors?: string[] }>(
      "/api/auth/profile/request-password-change-link",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

}
