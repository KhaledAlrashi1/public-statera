# Statera Privacy and Retention Policy

This document describes what data Statera stores and how long it is retained by default.

The repository and service slug are still `personal-finance`.

## Scope

Applies to:

- local, staging, and production deployments of Statera / `personal-finance`
- user profile, transaction, budgeting, debt, goals, and open-banking data

## Data Categories

1. Account and profile data
   - user email, bcrypt password hash
   - `first_name`, `last_name`, `display_name`
   - profile preferences: `monthly_income_kd`, `payday_day`, `country`, `timezone` (default `"Asia/Kuwait"`)
   - TOTP 2FA secret (stored if 2FA is enabled)
2. Financial data entered/imported by user
   - transactions (date, amount_kd, name, category, merchant, is_split, split_group_id)
   - budgets (monthly, per-category)
   - debt accounts (name, type, balance_kd, minimum_payment_kd, is_active)
   - savings goals (name, type, target_kd, current_kd, linked_category_id, is_active)
3. Open-banking connection and consent metadata (hidden, partially implemented)
   - bank connections (`bank_connections`), consent records (`bank_consents`), sync runs (`bank_sync_runs`)
   - OAuth tokens stored encrypted at rest (AES-256-GCM) via `ENCRYPTION_KEY`
4. Raw staged bank rows (temporary/operational)
   - `raw_bank_transactions`
5. Security and product telemetry
   - `security_events`: login/logout events, 2FA, account deletion audit trail
   - `product_events`: feature usage telemetry
   - `memorized_transactions`: anonymized name/category pairs for suggestions
   - `ingested_messages`: iMessage metadata (sender, GUID, timestamp; not full message text for new rows)
     Used to suppress already-reviewed iMessage transactions from reappearing in future fetches, including previewed messages the user intentionally removed from import because they were already handled elsewhere.

## Default Retention Windows

> These defaults are enforced by Celery maintenance tasks in `backend/tasks.py`.  
> When changing any default, update `.env.example`, `tasks.py`, and this document together.

Configured via environment variables:

- `SECURITY_EVENTS_RETENTION_DAYS` (default: `365`)
  - Table: `security_events`
- `INGESTED_MESSAGES_RETENTION_DAYS` (default: `180`)
  - Table: `ingested_messages`
- `PRODUCT_EVENTS_RETENTION_DAYS` (default: `90`)
  - Table: `product_events`
- `BANK_PREVIEW_RETENTION_DAYS` (default: `7`)
  - Staged sync runs and staged raw bank rows
- `BANK_RAW_RETENTION_DAYS` (default: `7`)
  - Committed and skipped-duplicate raw bank rows

## Consent and Access Transparency

> **Open Banking is currently hidden** (`ENABLE_OPEN_BANKING=false` by default).
> The schema, consent ledger, provider registry, and route scaffolding exist,
> but provider token exchange, account selection, and real-provider transaction
> mapping are not complete yet.

For open-banking-enabled environments:

- Consent records are exposed via:
  - `GET /api/bank/consents`
  - `GET /api/bank/consents/:id`
- Data access events are logged in `data_access_logs` and exposed via:
  - `GET /api/bank/data-access-log`

## User-Initiated Deletion

`DELETE /api/account` permanently removes the user and associated data after a
two-step confirmation token flow.

High-level deletion scope includes:

- transactions, budgets, debt accounts, savings goals
- categories, merchants (user-specific only; global rows preserved)
- bank connections, consents, sync runs, raw bank rows, data-access logs
- product events, security events (nulled user_id for audit trail row), memorized transactions
- template suggestion feedback, ingested messages, dashboard snapshots
- user profile, account action tokens

## Security Controls (Related to Privacy)

- Passwords are stored as bcrypt hashes (never plaintext).
- Session cookies are HttpOnly + SameSite; Secure flag is set in production.
- Optional TOTP two-factor authentication (pyotp, per-user opt-in).
- Session version pinning: each user has a `session_version` counter; bumping it
  invalidates all existing sessions immediately.
- Bank OAuth tokens (when Open Banking is enabled) are encrypted at rest with
  AES-256-GCM using `ENCRYPTION_KEY`.
- CSRF protection on all mutating endpoints (Flask-WTF).
- All log output passes through `backend/lib/log_scrubber.py` to strip PII.
- Production transport security enforced via HTTPS/TLS.

## Operational Notes

- Backups may contain personal financial data and must be protected as sensitive data.
- Do not commit secrets or dumps to source control.
- Use platform secret managers for production credentials.

## Change Management

If retention defaults change, update:

1. `.env.example`
2. this `PRIVACY.md`
3. any related runbook/operator docs
