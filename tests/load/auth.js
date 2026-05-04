import { check, sleep } from "k6"

import {
  ensureVuUser,
  loginUser,
  logoutUser,
  parseJson,
  requireStatus,
} from "./lib.js"

export const options = {
  vus: Number(__ENV.AUTH_VUS || 50),
  duration: __ENV.AUTH_DURATION || "60s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
}

const state = {
  ready: false,
  email: null,
}

export default function authLoad() {
  ensureVuUser(state, "load-auth", {
    onReady: () => {
      const logoutResponse = logoutUser()
      requireStatus(logoutResponse, 200, "initial-logout")
    },
  })

  const loginResponse = loginUser(state.email)
  requireStatus(loginResponse, 200, "login")

  const loginPayload = parseJson(loginResponse) || {}
  check(loginPayload, {
    "login returns ok=true": (payload) => payload.ok === true,
    "login does not require 2fa": (payload) => payload.requires_2fa !== true,
  })

  const logoutResponse = logoutUser()
  requireStatus(logoutResponse, 200, "logout")

  const logoutPayload = parseJson(logoutResponse) || {}
  check(logoutPayload, {
    "logout returns ok=true": (payload) => payload.ok === true,
  })

  sleep(Number(__ENV.AUTH_SLEEP_SECONDS || 1))
}
