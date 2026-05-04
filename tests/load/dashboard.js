import { check, sleep } from "k6"
import http from "k6/http"

import {
  BASE_URL,
  createTransaction,
  currentMonthKey,
  ensureVuUser,
  isoDateDaysAgo,
  parseJson,
  requestHeaders,
  requireStatus,
  saveBudget,
  updateProfile,
} from "./lib.js"

export const options = {
  vus: Number(__ENV.DASHBOARD_VUS || 100),
  duration: __ENV.DASHBOARD_DURATION || "60s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
}

const state = {
  ready: false,
  seeded: false,
}

function seedDashboardData() {
  if (state.seeded) return

  requireStatus(
    updateProfile({
      monthly_income_kd: "2500.000",
      payday_day: 1,
      country: "KW",
    }),
    200,
    "profile-update"
  )

  requireStatus(
    saveBudget(currentMonthKey(), [
      { category: "Groceries", amount_kd: "220.000" },
      { category: "Transport", amount_kd: "80.000" },
      { category: "Utilities", amount_kd: "120.000" },
    ]),
    200,
    "budget-save"
  )

  const txns = [
    { date: isoDateDaysAgo(1), category: "Groceries", name: "Load groceries", amount_kd: "12.500" },
    { date: isoDateDaysAgo(2), category: "Dining", name: "Load cafe", amount_kd: "6.250" },
    { date: isoDateDaysAgo(4), category: "Transport", name: "Load taxi", amount_kd: "4.500" },
    { date: isoDateDaysAgo(8), category: "Utilities", name: "Load phone bill", amount_kd: "18.750" },
  ]

  for (const [index, txn] of txns.entries()) {
    const response = createTransaction({
      date: txn.date,
      category: txn.category,
      name: `${txn.name} vu${__VU}-${index}`,
      amount_kd: txn.amount_kd,
      merchant: "Load Test Merchant",
    })
    requireStatus(response, [201, 409], `seed-transaction-${index}`)
  }

  state.seeded = true
}

function getJson(path, endpointTag) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: requestHeaders(),
    tags: { endpoint: endpointTag },
  })
  requireStatus(response, 200, endpointTag)
  return { response, payload: parseJson(response) || {} }
}

export default function dashboardLoad() {
  ensureVuUser(state, "load-dashboard", {
    onReady: seedDashboardData,
  })

  const dashboard = getJson("/api/dashboard-metrics?months=6", "dashboard-metrics")
  check(dashboard.payload, {
    "dashboard returns month list": (payload) => Array.isArray(payload.data?.months || payload.months),
  })

  const accountOverview = getJson("/api/analytics/account-overview", "account-overview")
  check(accountOverview.payload, {
    "account overview returns ok=true": (payload) => payload.ok === true,
  })

  const budgetMetrics = getJson(`/api/budget-metrics?month=${currentMonthKey()}`, "budget-metrics")
  check(budgetMetrics.payload, {
    "budget metrics returns ok=true": (payload) => payload.ok === true,
  })

  const safeToSpend = getJson(`/api/safe-to-spend?month=${currentMonthKey()}`, "safe-to-spend")
  check(safeToSpend.payload, {
    "safe-to-spend returns ok=true": (payload) => payload.ok === true,
  })

  sleep(Number(__ENV.DASHBOARD_SLEEP_SECONDS || 1))
}
