# ADR 007: ENABLE_OPEN_BANKING Feature Flag

- Status: Accepted
- Date: 2026-04-24

## Context

The Open Banking integration (`backend/routes/bank.py`,
`backend/routes/bank_sync_worker.py`) is fully scaffolded with:
- OAuth 2.0 consent flow (grant / revoke / expiry)
- FakeBank sandbox provider for local development
- `BankConnection`, `BankConsent`, `RawBankTransaction` models and migrations
- Celery sync task (`execute_sync_bank_accounts`)
- Consent receipt emails

The integration has not been connected to a live Open Banking API provider
because:
1. Kuwait does not yet have a mandated Open Banking standard; available APIs
   are bank-specific and require bilateral agreements.
2. No production API credentials exist for any Kuwaiti bank.
3. The FakeBank provider is sufficient for development and E2E testing.

The flag is read in `backend/__init__.py` and stored as
`app.config["ENABLE_OPEN_BANKING"]`. Route registration for the bank
blueprint is unconditional, but the connection flow itself is gated in the
UI and the sync task checks the flag before running.

## Decision

Keep `ENABLE_OPEN_BANKING` as an environment-variable flag (default: `false`).

To enable (requires a configured Open Banking provider):

```
ENABLE_OPEN_BANKING=true
OPEN_BANKING_PROVIDER=<provider_slug>
OPEN_BANKING_CLIENT_ID=<client_id>
OPEN_BANKING_CLIENT_SECRET=<client_secret>
```

The FakeBank provider (`OPEN_BANKING_PROVIDER=fake`) can be used in staging
without real credentials.

## Consequences

- The bank connection UI is hidden from end users until the flag is set.
- Consent models, migrations, and backend logic are always present (the
  schema is stable regardless of the flag).
- When a real Open Banking provider is integrated, add a concrete provider
  class alongside `FakeBank`, set the flag, and delete this note from the ADR.
