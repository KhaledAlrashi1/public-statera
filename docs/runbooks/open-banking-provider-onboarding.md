# Open Banking Provider Onboarding

Use this checklist when a real provider sandbox or production partner is ready.

## Minimum details required

Provide all of these before backend integration work starts:

- OAuth authorization URL
- OAuth token URL
- Client ID
- Client secret
- Redirect URI to register with the provider
- Transactions endpoint URL
- Accounts endpoint URL
- Required scopes for read-only transaction access
- Consent expiry duration and refresh rules
- Sandbox test users or institution fixtures
- Pagination format for account and transaction APIs
- Transaction response schema samples
- Error response samples and rate-limit headers

## Current app readiness

Already in place:

- `BankConnection`, `BankConsent`, `BankSyncRun`, `RawBankTransaction`, and `DataAccessLog`
- 2FA gate for bank operations
- consent ledger and data-access log endpoints
- background cleanup for raw rows and revoked-consent retention
- encrypted fields for provider access/refresh tokens
- provider registry with readiness metadata at `GET /api/bank/providers`
- OAuth authorization bootstrap at `POST /api/bank/connect/oauth-begin`
- callback stub at `GET /api/bank/connect/oauth-callback/<provider>`

Not implemented yet:

- token exchange / refresh logic
- account selection flow
- transaction payload mapper for the real provider
- webhook or incremental sync handling

## Environment variables to populate

Set these when the provider gives sandbox details:

- `OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL`
- `OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL`
- `OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID`
- `OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET`
- `OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI`
- `OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE`
- `OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL`
- `OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL`

Recommended callback path:

- `/api/bank/connect/oauth-callback/oauth_sandbox`

Optional label override:

- `OPEN_BANKING_OAUTH_SANDBOX_LABEL`

## First implementation slice once details arrive

1. Add a provider adapter under `backend/providers/`.
2. Implement token exchange inside the callback scaffold.
3. Store encrypted access/refresh tokens on `BankConnection`.
4. Fetch accounts and let the user confirm which account to link.
5. Map provider transactions into `RawBankTransaction`.
6. Reuse existing preview/commit flow for duplicate detection and audit logging.

## Questions to send the provider

- Which OAuth grant type is required?
- Is PKCE required?
- Are refresh tokens issued, and how long do they last?
- What scopes are mandatory for transactions and balances?
- Are historical transactions limited in the sandbox?
- How are pending transactions represented?
- What is the unique transaction ID contract?
- What rate limits apply per client and per user?
- Are consent revocations pushed via webhook or only exposed via polling?
