import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  __resetApiClientStateForTests,
  analyticsApi,
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
        profile_context: {
          budget_total_kd: 120,
          monthly_income_kd: 500,
          budget_to_income_pct: 24,
          payday_day: 25,
        },
      },
      error: null,
      meta: {},
    })

    const result = await budgetsApi.get("2026-02")
    expect(result.month).toBe("2026-02")
    expect(result.items).toHaveLength(1)
    expect(result.profile_context?.budget_total_kd).toBe(120)
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
          debt_minimum_total_kd: "75.000",
          savings_goal_count: 0,
          savings_goal_unscheduled_count: 0,
          savings_goal_monthly_total_kd: "0.000",
          savings_goal_budget_covered_kd: "0.000",
          savings_goal_reserve_kd: "0.000",
          committed_kd: "875.000",
          committed_breakdown_kd: {
            budget_allocations: "800.000",
            debt_minimums: "75.000",
            savings_goal_reserve: "0.000",
            savings_goal_budget_covered: "0.000",
          },
          actual_spend_kd: "120.000",
          remaining_budget_kd: "205.000",
          daily_rate_kd: "7.590",
          data_complete: true,
          warnings: [],
        },
        debt_summary: {
          total_balance_kd: "400.000",
          total_minimum_kd: "75.000",
          account_count: 1,
        },
        budget: {
          month: "2026-02",
          items: [{ id: 1, month: "2026-02", category: "Food", amount_kd: "100.000" }],
          profile_context: {
            budget_total_kd: 100,
            monthly_income_kd: 500,
            budget_to_income_pct: 20,
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
    expect(result.safe_to_spend.committed_kd).toBe("875.000")
    expect(result.debt_summary.account_count).toBe(1)
    expect(result.budget.items).toHaveLength(1)
    expect(result.account_overview.total_income_mtd).toBe("500.000")
  })

})
