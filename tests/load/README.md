# Load Test Suite

These scripts use `k6` to exercise the app under sustained traffic.

## Scripts

- `tests/load/auth.js` - register once per VU, then login/logout loops
- `tests/load/dashboard.js` - authenticated dashboard and analytics reads
- `tests/load/import.js` - authenticated CSV upload-preview requests using a
  1000-row fixture

## Defaults

- base URL: `http://127.0.0.1:5004`
- auth: `50` VUs for `60s`
- dashboard: `100` VUs for `60s`
- import: `10` VUs for `60s`

Override with standard k6 flags or environment variables such as `BASE_URL`.

If you are following this clone's sample `.env`, the host backend runs on
`5004`, so prefer:

```bash
BASE_URL=http://127.0.0.1:5004 k6 run tests/load/dashboard.js
```

## Rate-limit caveat

`/api/auth/*` and `/api/transactions/upload-preview` are intentionally rate
limited by client IP. A direct local k6 run from one machine will hit those
limits quickly.

To distribute auth/import traffic across per-VU IP buckets in a staging setup:

1. run the app behind a trusted proxy
2. set `PROXY_FIX_NUM_PROXIES=1` on the backend
3. run k6 with `LOAD_TEST_USE_FORWARDED_IPS=1`

Do not enable forwarded-IP trust on direct-to-internet deployments.
