import exec from "k6/execution"
import http from "k6/http"

export const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:5004"
export const PASSWORD = __ENV.LOAD_TEST_PASSWORD || "Password123!"
export const RUN_ID = __ENV.LOAD_TEST_RUN_ID || `${Date.now()}`

const BASE_HEADERS = {
  Accept: "application/json",
  "X-Requested-With": "fetch",
}

function vuForwardedIp() {
  if (__ENV.LOAD_TEST_USE_FORWARDED_IPS !== "1") return null
  const vu = Math.max(1, Number(exec.vu.idInTest || 1))
  const third = Math.floor((vu - 1) / 250) + 1
  const fourth = ((vu - 1) % 250) + 1
  return `10.10.${third}.${fourth}`
}

export function requestHeaders(extra = {}) {
  const headers = { ...BASE_HEADERS, ...extra }
  const forwardedIp = vuForwardedIp()
  if (forwardedIp) headers["X-Forwarded-For"] = forwardedIp
  return headers
}

export function currentMonthKey(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  return `${year}-${month}`
}

export function isoDateDaysAgo(daysAgo) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

export function parseJson(response) {
  try {
    return response.json()
  } catch {
    return null
  }
}

export function requireStatus(response, allowedStatuses, label) {
  const allowed = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses]
  if (allowed.includes(response.status)) return response

  const payload = parseJson(response)
  throw new Error(
    `${label} failed: status=${response.status} body=${JSON.stringify(payload ?? response.body ?? "")}`
  )
}

export function getCsrfToken() {
  const response = http.get(`${BASE_URL}/api/csrf-token`, {
    headers: requestHeaders(),
    tags: { endpoint: "csrf-token" },
  })
  requireStatus(response, 200, "csrf-token")

  const payload = parseJson(response) || {}
  if (!payload.csrf_token) {
    throw new Error(`csrf-token missing from response: ${JSON.stringify(payload)}`)
  }
  return payload.csrf_token
}

export function postJson(path, payload, endpointTag = path) {
  const csrf = getCsrfToken()
  return http.post(`${BASE_URL}${path}`, JSON.stringify(payload), {
    headers: requestHeaders({
      "Content-Type": "application/json",
      "X-CSRFToken": csrf,
    }),
    tags: { endpoint: endpointTag },
  })
}

export function registerUser(email, password = PASSWORD) {
  return postJson(
    "/api/auth/register",
    {
      email,
      password,
      first_name: "Load",
      last_name: "Test",
    },
    "auth-register"
  )
}

export function loginUser(email, password = PASSWORD) {
  return postJson(
    "/api/auth/login",
    {
      email,
      password,
      remember_me: false,
    },
    "auth-login"
  )
}

export function logoutUser() {
  return postJson("/api/auth/logout", {}, "auth-logout")
}

export function updateProfile(payload) {
  return postJson("/api/auth/profile/update", payload, "profile-update")
}

export function saveBudget(month, items) {
  return postJson("/api/budgets", { month, items }, "budget-save")
}

export function createTransaction(payload) {
  return postJson("/api/transactions/create", payload, "transaction-create")
}

export function vuEmail(prefix) {
  return `${prefix}-${RUN_ID}-vu${exec.vu.idInTest}@example.com`
}

export function ensureVuUser(state, prefix, options = {}) {
  if (state.ready) return state

  const email = vuEmail(prefix)
  const registerResponse = registerUser(email)

  if (registerResponse.status === 409) {
    requireStatus(loginUser(email), 200, "login-existing-user")
  } else {
    requireStatus(registerResponse, 201, "register-user")
  }

  if (typeof options.onReady === "function") {
    options.onReady({ email, password: PASSWORD })
  }

  state.ready = true
  state.email = email
  state.password = PASSWORD
  return state
}
