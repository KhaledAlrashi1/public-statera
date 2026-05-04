# Activation Reporting

Use the CLI report to measure whether new users reach the first value moments that matter:

- `signup_completed`
- `app_opened`
- `demo_data_loaded`
- `import_completed`
- `demo_data_replaced_with_import`
- `bank.connected`
- `first_budget_set`

Run it from the backend environment:

```bash
FLASK_APP=run.py ./scripts/flask activation-report --days 30
```

For machine-readable output:

```bash
FLASK_APP=run.py ./scripts/flask activation-report --days 30 --json-output
```

To write an artifact file directly:

```bash
FLASK_APP=run.py ./scripts/flask activation-report --days 30 --output reports/activation-report.latest.json
```

Make targets are also available:

```bash
make activation-report
make activation-report-json
```

Celery beat can keep the artifact fresh automatically:

- `MAINT_ACTIVATION_REPORT_SECONDS` controls the refresh cadence (default: every hour).
- `ACTIVATION_REPORT_DAYS` controls the trailing UTC window size.
- `ACTIVATION_REPORT_PATH` controls where the worker writes the JSON artifact.
- `docker-compose.prod.yml` mounts `./reports` into `/app/reports` for both `backend` and `worker`, so the scheduled artifact survives container restarts.

What the report means:

- `Activated (demo/import/bank)` counts distinct users who reached any of the main value paths.
- `Activation paths` breaks that down by demo exploration, first import, and bank connection.
- `Demo to import users` shows how many users moved from demo exploration to a real import in the same window.
- `demo_data_replaced_with_import` is the direct conversion event for users who replaced the sample workspace with a real import.
- `Signup conversion` reports activation and first-budget conversion against distinct `signup_completed` users.
- `Median signup to activation` measures time from `signup_completed` to the first activation event.

Current limits:

- This is an internal CLI report, not a user-facing dashboard.
- `make activation-report-json` writes `reports/activation-report.latest.json` by default.
- It reflects the trailing UTC day window only.
- It depends on `ProductEvent` retention; if old rows are pruned, long-range trend reporting should come from an external warehouse later.
