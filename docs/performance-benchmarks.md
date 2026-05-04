# Performance Benchmarks

Use the local benchmark harness when analytics, dashboard aggregation, import parsing, or export code changes.

## Fast check

Run against a dedicated PostgreSQL test database:

```bash
TEST_DATABASE_URL=postgresql://... .venv/bin/python scripts/benchmark_performance.py
```

The script seeds a representative dev dataset and fails if these budgets are missed:

- `dashboard_bundle`: cold load under `2000ms` with `1200` seeded transactions
- `upload_preview`: `500` CSV rows previewed under `3000ms`
- `account_overview`: under `1000ms`
- `expense_breakdown`: under `1000ms`
- `safe_to_spend`: under `1000ms`

It also prints the cold-path SQL `SELECT` count for each route so query fan-out is visible during review.

## Sustained load

For longer-running traffic checks, use the existing `k6` scripts in [`tests/load`](../tests/load/README.md):

- `tests/load/dashboard.js`
- `tests/load/import.js`
- `tests/load/auth.js`

Use the benchmark script for repeatable pass/fail budgets and the `k6` suite for concurrency and percentile tracking.
