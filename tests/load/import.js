import { check, sleep } from "k6"
import http from "k6/http"

import {
  BASE_URL,
  ensureVuUser,
  getCsrfToken,
  parseJson,
  requestHeaders,
  requireStatus,
} from "./lib.js"

const csvFixture = open("tests/load/fixtures/transactions-1000.csv")

export const options = {
  vus: Number(__ENV.IMPORT_VUS || 10),
  duration: __ENV.IMPORT_DURATION || "60s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
}

const state = {
  ready: false,
}

export default function importLoad() {
  ensureVuUser(state, "load-import")

  const csrf = getCsrfToken()
  const response = http.post(
    `${BASE_URL}/api/transactions/upload-preview`,
    {
      file: http.file(csvFixture, "transactions-1000.csv", "text/csv"),
      csrf_token: csrf,
    },
    {
      headers: requestHeaders({
        "X-CSRFToken": csrf,
      }),
      tags: { endpoint: "upload-preview" },
    }
  )

  requireStatus(response, 200, "upload-preview")
  const payload = parseJson(response) || {}

  check(payload, {
    "upload preview returns ok=true": (body) => body.ok === true,
    "upload preview sees 1000 rows": (body) => Number(body.count) === 1000,
  })

  sleep(Number(__ENV.IMPORT_SLEEP_SECONDS || 2))
}
