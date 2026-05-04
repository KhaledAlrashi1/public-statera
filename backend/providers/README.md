# Provider Contract (CBK-Ready)

This directory contains bank-provider adapters used by `backend/routes/bank.py`.

## Purpose

`backend/providers/` is the abstraction layer for switching from the local `fakebank`
adapter to future CBK-licensed provider integrations without rewriting API routes.

## Current Providers

- `fakebank.py` (development/test shim)
- `oauth_sandbox.py` (config/readiness placeholder for future real providers)
- Registered in `backend/providers/__init__.py`

## Required Adapter Shape

A sync-capable provider module should expose:

1. `PROVIDER_NAME: str`
2. `DISPLAY_NAME: str`
3. `catalog_entry() -> ProviderCatalogEntry`
4. `DEFAULT_LIMIT: int`
5. `fetch_transactions(connection_id: int, cursor: str | None, limit: int) -> tuple[list[ProviderRow], str | None]`
6. `ProviderRow` object with fields:
   - `provider_tx_id: str`
   - `date: datetime.date`
   - `description: str`
   - `amount_kd: Decimal`
   - optional `category_hint: str | None`
   - optional `merchant_hint: str | None`
   - `payload_hash` property (stable hash of source payload)

Catalog-only placeholder providers may omit `fetch_transactions` if they are not
yet sync-capable. In that case, mark `supports_sync_preview=False`.

`catalog_entry()` should describe:

- `connect_mode` (`direct` or `oauth_redirect`)
- `integration_status` (`ready`, `config_missing`, `authorization_bootstrap_ready`, etc.)
- `missing_config` list for missing env/config keys
- `setup_doc` path for onboarding docs

`fetch_transactions` rules:

- Stateless cursor pagination.
- Return deterministic page ordering for a given cursor.
- Raise `ValueError` for invalid cursor/limit input.
- Never mutate app state directly (route layer handles DB writes).

## Security and Data Handling Requirements

- Do not store customer banking credentials in this layer.
- Keep provider IDs opaque; do not expose full account numbers.
- Return only fields needed for analytics/consented processing.
- Ensure retry safety: repeated fetch with same cursor must not produce inconsistent IDs.

## How to Add a New Provider

1. Add `backend/providers/<provider_name>.py`.
2. Implement `catalog_entry()` and, if sync-capable, `ProviderRow` + `fetch_transactions(...)`.
3. Register the provider in `backend/providers/__init__.py`.
5. Add route-level tests:
   - connect/sync-preview/commit happy path
   - invalid cursor handling
   - duplicate detection behavior
6. Gate rollout behind feature flags (`ENABLE_OPEN_BANKING` remains required).

## Current Readiness Strategy

- `fakebank` is fully ready and used for local testing.
- `oauth_sandbox` is the pre-integration shell for a future real provider.
  It exposes the exact config keys still missing so the UI and API can report
  readiness before a provider-specific adapter exists.
- The route layer now handles:
  - `POST /api/bank/connect/oauth-begin` for authorization URL bootstrap
  - `GET /api/bank/connect/oauth-callback/<provider>` for state validation and
    callback deferral until token exchange is implemented

## Notes for Future CBK Integration

- `BankConnection.provider` is string-flexible and can carry CBK ecosystem IDs
  (example: `cbk_obf_v1`).
- `BankConsent.consent_reference` is available for external consent registry IDs.
- `DataAccessLog` + consent ledger endpoints are already in place for transparency.
