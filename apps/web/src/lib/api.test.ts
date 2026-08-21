import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  __resetApiClientStateForTests,
  analyticsApi,
  authApi,
  budgetsApi,
  memorizedApi,
  notificationsApi,
  transactionsApi,
} from "./api"

const fetchMock = vi.fn()

function txn(id: number) {
  return {
    id,
    date: `2026-02-${String(id).padStart(2, "0")}`,
    name: `Txn ${id}`,
    category: "Groceries",
    merchant: null,
    amount_kd: "1.000",
    memo: null,
  }
}

function mockJsonResponse(payload: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  )
}

describe("transactionsApi pagination", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    __resetApiClientStateForTests()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("adds include_total=false when requested for search", async () => {
    mockJsonResponse({
      items: [],
      total: -1,
      offset: 0,
      limit: 20,
      has_more: false,
    })

    await transactionsApi.search({
      q: "coffee",
      limit: 20,
      offset: 0,
      include_total: false,
    })

    const firstUrl = String(fetchMock.mock.calls[0][0])
    expect(firstUrl).toContain("/api/transactions/search?")
    expect(firstUrl).toContain("include_total=false")
  })

  it("adds date bounds when requested for search", async () => {
    mockJsonResponse({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
      has_more: false,
    })

    await transactionsApi.search({
      q: "coffee",
      date_from: "2026-02-01",
      date_to: "2026-02-29",
      limit: 20,
      offset: 0,
    })

    const firstUrl = String(fetchMock.mock.calls[0][0])
    expect(firstUrl).toContain("/api/transactions/search?")
    expect(firstUrl).toContain("date_from=2026-02-01")
    expect(firstUrl).toContain("date_to=2026-02-29")
  })

  it("searchAll uses no-total pagination and follows has_more", async () => {
    mockJsonResponse({
      items: [txn(1), txn(2)],
      total: -1,
      offset: 0,
      limit: 20,
      has_more: true,
    })
    mockJsonResponse({
      items: [txn(3)],
      total: -1,
      offset: 2,
      limit: 20,
      has_more: false,
    })

    const rows = await transactionsApi.searchAll({
      q: "txn",
      pageSize: 20,
      maxRows: 100,
      maxPages: 5,
    })

    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain("include_total=false")
    expect(String(fetchMock.mock.calls[1][0])).toContain("include_total=false")
    expect(String(fetchMock.mock.calls[1][0])).toContain("offset=2")
  })

  it("byCategoryAll uses no-total pagination and follows has_more", async () => {
    mockJsonResponse({
      ok: true,
      category: "Groceries",
      items: [txn(4), txn(5)],
      has_more: true,
      total: -1,
    })
    mockJsonResponse({
      ok: true,
      category: "Groceries",
      items: [txn(6)],
      has_more: false,
      total: -1,
    })

    const rows = await transactionsApi.byCategoryAll({
      category: "Groceries",
      pageSize: 20,
      maxRows: 100,
      maxPages: 5,
    })

    expect(rows.map((r) => r.id)).toEqual([4, 5, 6])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain("include_total=false")
    expect(String(fetchMock.mock.calls[1][0])).toContain("include_total=false")
    expect(String(fetchMock.mock.calls[0][0])).toContain("category=Groceries")
  })

})

describe("envelope parsing", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    __resetApiClientStateForTests()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("budgetsApi.get reads budget payload from envelope data", async () => {
    mockJsonResponse({
      ok: true,
      data: {
        month: "2026-02",
        items: [{ id: 1, month: "2026-02", category: "Groceries", amount_kd: "120.000" }],
        // profile_context money is serialized as STRINGS by routes/budgets.ts
        // (:151/:152 .toFixed(3), :147 .toFixed(1)) — the 2026-07-10 typed-drift
        // crash. FIND-S5(b).
        profile_context: {
          budget_total_kd: "120.000",
          monthly_income_kd: "500.000",
          budget_to_income_pct: "24.0",
          payday_day: 25,
        },
      },
      error: null,
      meta: {},
    })

    const result = await budgetsApi.get("2026-02")
    expect(result.month).toBe("2026-02")
    expect(result.items).toHaveLength(1)
    expect(result.profile_context?.budget_total_kd).toBe("120.000")
  })

  it("memorizedApi.list reads pagination from envelope meta", async () => {
    mockJsonResponse({
      ok: true,
      data: {
        items: [
          {
            id: 42,
            canonical: "Coffee",
            category: "Food",
            merchant: "Cafe",
            count: 3,
            last_seen: "2026-02-19T00:00:00+00:00",
          },
        ],
      },
      error: null,
      meta: {
        total: 1,
        offset: 0,
        limit: 20,
        has_more: false,
      },
    })

    const result = await memorizedApi.list({ limit: 20, offset: 0 })
    expect(result.items).toHaveLength(1)
    expect(result.has_more).toBe(false)
    expect(result.total).toBe(1)
    expect(result.offset).toBe(0)
    expect(result.limit).toBe(20)
  })

  it("memorizedApi.create reads item from envelope data", async () => {
    mockJsonResponse({
      ok: true,
      data: {
        item: {
          id: 11,
          canonical: "Taxi",
          category: "Transport",
          merchant: "Cab Co",
          count: 2,
          last_seen: "2026-02-19T00:00:00+00:00",
        },
      },
      error: null,
      meta: {},
    })

    const result = await memorizedApi.create({
      canonical: "Taxi",
      category: "Transport",
      merchant: "Cab Co",
    })
    expect(result.item.id).toBe(11)
    expect(result.item.canonical).toBe("Taxi")
  })

  it("notificationsApi.listBudgetAlerts reads envelope items", async () => {
    mockJsonResponse({
      ok: true,
      data: {
        month: "2026-02",
        items: [
          {
            id: 5,
            type: "budget_alert",
            alert_key: "2026-02:12",
            month: "2026-02",
            category: "Food",
            category_id: 12,
            budget_kd: "100.000",
            spent_kd: "92.000",
            ratio: 0.92,
            threshold: 0.9,
            created_at: "2026-02-15T09:00:00+00:00",
          },
        ],
      },
      error: null,
      meta: {},
    })

    const result = await notificationsApi.listBudgetAlerts()
    expect(result.month).toBe("2026-02")
    expect(result.items).toHaveLength(1)
    expect(result.items[0].category).toBe("Food")
  })

  it("notificationsApi.dismissBudgetAlert posts alert_key to dismiss endpoint", async () => {
    mockJsonResponse({
      ok: true,
      data: { dismissed: true },
      error: null,
      meta: {},
    })

    const result = await notificationsApi.dismissBudgetAlert("2026-02:12")
    expect(result.data?.dismissed).toBe(true)

    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toContain("/api/notifications/budget-alerts/dismiss")
    expect(String(call[0])).not.toContain("/5/")
    const options = call[1] as RequestInit
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({ alert_key: "2026-02:12" })
  })

  it("analyticsApi.dashboardBundle reads nested dashboard data from envelope data", async () => {
    mockJsonResponse({
      ok: true,
      data: {
        month: "2026-02",
        safe_to_spend: {
          month: "2026-02",
          cycle_start: "2026-02-01",
          cycle_end: "2026-02-28",
          days_elapsed: 10,
          days_remaining: 18,
          monthly_income_kd: "1200.000",
          income_auto_detected: false,
          total_budget_kd: "800.000",
          committed_kd: "800.000",
          committed_breakdown_kd: {
            budget_allocations: "800.000",
          },
          actual_spend_kd: "120.000",
          remaining_budget_kd: "280.000",
          daily_rate_kd: "7.590",
          data_complete: true,
          warnings: [],
        },
        budget: {
          month: "2026-02",
          items: [{ id: 1, month: "2026-02", category: "Food", amount_kd: "100.000" }],
          profile_context: {
            budget_total_kd: "100.000",
            monthly_income_kd: "500.000",
            budget_to_income_pct: "20.0",
            payday_day: 25,
          },
        },
        budget_alerts: {
          month: "2026-02",
          items: [],
        },
        account_overview: {
          month: "2026-02",
          total_spend_mtd: "80.000",
          total_income_mtd: "500.000",
          connected_accounts: [],
          manual_entry_summary: {
            transactions_mtd: 2,
            spend_mtd: "80.000",
          },
          top_categories: [],
          month_trend: [],
        },
      },
      error: null,
      meta: {},
    })

    const result = await analyticsApi.dashboardBundle("2026-02")
    expect(result.month).toBe("2026-02")
    expect(result.safe_to_spend.committed_kd).toBe("800.000")
    expect(result.budget.items).toHaveLength(1)
    expect(result.account_overview.total_income_mtd).toBe("500.000")
  })

})

// ── Module 10e-4: magic-link ────────────────────────────────────────────────
//
// These pin the RUNTIME NARROWING that 10e-R186 disposition (c) assigns the weight
// to. `apps/web/tsconfig.json` excludes `src/**/*.test.ts(x)`, so no frontend test
// file is type-checked by any command — a compile-time assertion cannot reach a
// wrong fixture, and a throw can. What these observe is the narrowing's behaviour
// against literal bodies; what they do NOT observe is whether those bodies match
// what the running server sends (that residual is recorded for 10e-close).
describe("authApi magic-link", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    __resetApiClientStateForTests()
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("magicLinkRequest POSTs the address to the request endpoint", async () => {
    mockJsonResponse({ ok: true, data: { sent: true }, error: null, meta: {} })
    await authApi.magicLinkRequest("khaled@example.com")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/auth/magic-link/request")
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ email: "khaled@example.com" }))
  })

  it("narrows the TOTP handoff response to kind pending_2fa", async () => {
    mockJsonResponse({ ok: true, data: { pending_2fa: true }, error: null, meta: {} })
    await expect(authApi.magicLinkVerify("t")).resolves.toEqual({ kind: "pending_2fa" })
  })

  it("narrows the session response to kind session", async () => {
    mockJsonResponse({ ok: true, data: { is_new_user: true }, error: null, meta: {} })
    await expect(authApi.magicLinkVerify("t")).resolves.toEqual({
      kind: "session",
      isNewUser: true,
    })
  })

  // 10e-R189(i). Both wire shapes are 200 with ok:true and are told apart ONLY by
  // which key is present, so the branch ORDER is load-bearing. Swapping the two
  // checks reddens this case; ordering stated in a comment would not.
  it("prefers pending_2fa when a body somehow carries both keys", async () => {
    mockJsonResponse({
      ok: true,
      data: { pending_2fa: true, is_new_user: false },
      error: null,
      meta: {},
    })
    await expect(authApi.magicLinkVerify("t")).resolves.toEqual({ kind: "pending_2fa" })
  })

  // 10e-R189(ii). The narrowing is EXHAUSTIVE and its default THROWS. A default of
  // "assume success" would be FINDING M-1 relocated one layer down — and this is
  // the case that makes a wrong-shaped fixture anywhere in the suite go RED.
  it("throws MAGIC_LINK_UNEXPECTED_RESPONSE on a 200 carrying neither key", async () => {
    mockJsonResponse({ ok: true, data: {}, error: null, meta: {} })
    await expect(authApi.magicLinkVerify("t")).rejects.toMatchObject({
      code: "MAGIC_LINK_UNEXPECTED_RESPONSE",
    })
  })
})
