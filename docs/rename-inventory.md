# DinarTrack → Personal Statera Rename Inventory

Generated: 2026-04-24. This document is the authoritative working record for the rename pass.
Commit this file first; execute the changes in subsequent commits.

Total occurrences found: 70 across 37 files.

---

## Category A — User-facing strings

Anything rendered to a user, sent in email, or shown in a consent record.

### `backend/models.py`

| Line | Current value | Action |
|------|--------------|--------|
| 831 | `default="DinarTrack"` (BankConsent.data_recipient_name) | Change to `"Personal Statera"`. Write Alembic migration to backfill existing rows. |

### `backend/routes/auth.py`

| Line | Current value | Action |
|------|--------------|--------|
| 455 | `issuer = "DinarTrack"` (TOTP issuer string — appears in authenticator app) | Change to `"Personal Statera"`. **Note:** existing TOTP tokens will continue to work; the issuer string is display-only in authenticator apps. |

### `backend/routes/bank.py`

| Line | Current value | Action |
|------|--------------|--------|
| 545 | `data_recipient_name="DinarTrack"` (passed when creating a BankConsent) | Change to `"Personal Statera"`. |

### `backend/templates/email/*.html` and `*.txt`

| File | Occurrences | Action |
|------|------------|--------|
| `budget_alert.html` | 1 | Change `DinarTrack` → `Personal Statera` |
| `budget_alert.txt` | 1 | Change `DinarTrack` → `Personal Statera` |
| `consent_expiry.html` | 1 | Change `DinarTrack` → `Personal Statera` |
| `consent_expiry.txt` | 1 | Change `DinarTrack` → `Personal Statera` |
| `consent_receipt_grant.html` | 2 | Change both occurrences |
| `consent_receipt_grant.txt` | 3 | Change all three occurrences |
| `consent_receipt_revoke.html` | 1 | Change `DinarTrack` → `Personal Statera` |
| `consent_receipt_revoke.txt` | 2 | Change both occurrences |

**Note:** These templates are rendered server-side by Flask (Jinja2). Postmark is configured to send these as plain/HTML email bodies, not as Postmark-hosted templates. No Postmark template dashboard update is needed — the content lives entirely in `backend/templates/email/`.

**Manual Postmark updates required:** None — all email content is in local Jinja2 templates.

---

## Category B — Environment variable names

### `DINARTRACK_DEV_MODE` (primary)

| File | Line | Action |
|------|------|--------|
| `backend/__init__.py` | 261, 274, 282, 293 | Add deprecation shim; read `PERSONAL_STATERA_DEV_MODE` first, fall back to `DINARTRACK_DEV_MODE` with `warnings.warn`. Update all log strings. |
| `backend/email_service.py` | 44 | Update to read new var name (via shim or direct). |
| `backend/lib/crypto.py` | 83, 97 | Update to read new var name. |
| `backend/routes/password_reset.py` | 85 | Update. |
| `backend/routes/profile_security_links.py` | 108, 228 | Update both. |
| `.env.example` | 31 | Change `DINARTRACK_DEV_MODE=true` → `PERSONAL_STATERA_DEV_MODE=true`. Add commented line showing the deprecated name with a note. |
| `docker-compose.yml` | 49, 102, 137 | Change all three `DINARTRACK_DEV_MODE` references to `PERSONAL_STATERA_DEV_MODE`. |
| `docker-compose.prod.yml` | 35 | Change `DINARTRACK_DEV_MODE: "false"` → `PERSONAL_STATERA_DEV_MODE: "false"`. |
| `Makefile` | 20, 25 | Update both inline env var assignments. |
| `frontend/README.md` | 15 | Update the example command. |

---

## Category C — Internal identifiers

### Docker Compose project name

| File | Current | Action |
|------|---------|--------|
| `.env.example` (implied by `COMPOSE_PROJECT_NAME`) | Already `personal_statera` | No change needed — docker-compose.yml uses `COMPOSE_PROJECT_NAME` from `.env`. |

**Note:** `COMPOSE_PROJECT_NAME=personal_statera` is already set correctly in `.env.example` and `.env`. The docker-compose files do not hardcode a project name independently. No orphan container cleanup needed.

### nginx upstream name

| File | Line | Current | Action |
|------|------|---------|--------|
| `nginx/nginx.conf` | 1, 32, 42, 48 | `dinartrack_backend` | Rename to `personal_statera_backend`. This is internal nginx config only — no external visibility. |

### Scripts

| File | Line | Current | Action |
|------|------|---------|--------|
| `scripts/pg-backup.sh` | 50 | `backup_prefix="${BACKUP_S3_PREFIX:-dinartrack/backups}"` | Change default to `personal-statera/backups`. |
| `scripts/benchmark_performance.py` | 52 | `os.environ["DINARTRACK_DEV_MODE"] = "true"` | Update to `PERSONAL_STATERA_DEV_MODE`. |
| `scripts/verify_account_deletion.py` | 39, 180, 279 | Three references | Line 39: update env var. Line 180: `data_recipient_name="DinarTrack"` → `"Personal Statera"`. Line 279: email domain `@internal.dinartrack.invalid` → `@internal.personal-statera.invalid`. |

**Log query updates required:** No structured log fields use "dinartrack" as a key or value in the application code. The nginx upstream name is not a log field. No Sentry tag or release uses the old name in any config found. No queries need updating.

---

## Category D — Documentation and comments

| File | Line | Content | Action |
|------|------|---------|--------|
| `backend/lib/crypto.py` | 17, 54 | Docstring and inline comment referencing `DINARTRACK_DEV_MODE` | Update text to reference the new var name. |

**No other documentation files** in `docs/`, `README.md`, `RUNBOOK.md`, or `DOCKER_RUNBOOK.md` contain the string "dinartrack" — those docs were already clean.

---

## Category E — Test fixtures and assertions

| File | Lines | Current | Action |
|------|-------|---------|--------|
| `tests/preflight_base.py` | 58, 67, 85 | `DINARTRACK_DEV_MODE` env var reads/writes | Update to `PERSONAL_STATERA_DEV_MODE` — these are the shared test fixtures. **Must update before other test files.** |
| `tests/test_budget_metrics_api.py` | 16, 24 | Same pattern | Update. |
| `tests/test_budgets_api.py` | 12, 20 | Same pattern | Update. |
| `tests/test_consent_model.py` | 44 | Asserts `data_recipient_name == "DinarTrack"` | Update assertion to `"Personal Statera"`. |
| `tests/test_crypto.py` | 164, 166, 173, 175 | `DINARTRACK_DEV_MODE` pop/set | Update all four. |
| `tests/test_db_compat.py` | 19, 27 | Same env var pattern | Update. |
| `tests/test_email_service.py` | 12, 31, 50 | Same env var pattern | Update all three. |
| `tests/test_migration_integrity.py` | 27, 37 | Same pattern | Update. |
| `tests/test_multi_user_analytics_isolation.py` | 31, 39 | Same pattern | Update. |
| `tests/test_transactions_consistency_api.py` | 14, 22 | Same pattern | Update. |
| `tests/test_account_deletion.py` | 104 | `data_recipient_name="DinarTrack"` fixture | Update to `"Personal Statera"`. |
| `tests/test_account_deletion_cascade.py` | 132 | Same | Update. |

**Migration backfill test:** A new test must assert that the Alembic migration backfill correctly updates `bank_consents.data_recipient_name` from `"DinarTrack"` to `"Personal Statera"`.

---

## Alembic migration required

**Table:** `bank_consents`
**Column:** `data_recipient_name`
**Backfill:** `UPDATE bank_consents SET data_recipient_name = 'Personal Statera' WHERE data_recipient_name = 'DinarTrack'`
**Reversal:** `UPDATE bank_consents SET data_recipient_name = 'DinarTrack' WHERE data_recipient_name = 'Personal Statera'`

**Existing migration** `bb21c3d4e5f6_extend_consent_and_add_data_access_logs.py` line 47 sets `server_default="DinarTrack"`. This migration file is part of history — do **not** edit it. The new migration handles the data backfill; the server_default on the column definition in `models.py` will be updated to `"Personal Statera"` in the application code.

---

## Deprecation shim plan

The `DINARTRACK_DEV_MODE` → `PERSONAL_STATERA_DEV_MODE` transition requires:

1. A shim in every location that reads the env var (listed in Category B above)
2. The shim reads `PERSONAL_STATERA_DEV_MODE` first; if absent, reads `DINARTRACK_DEV_MODE` and emits `warnings.warn(..., DeprecationWarning)`
3. The legacy fallback stays in for one release. A `TODO(remove-dinartrack-shim)` comment marks each shim site for future cleanup.

---

## Summary counts by category

| Category | Files affected | Occurrences |
|----------|---------------|-------------|
| A — User-facing | 12 | 16 |
| B — Env vars | 10 | 17 |
| C — Internal identifiers | 4 | 7 |
| D — Docs/comments | 1 | 2 |
| E — Test fixtures | 12 | 28 |
| **Total** | **37** | **70** |
