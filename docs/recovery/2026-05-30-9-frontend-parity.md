# Module 9 Close-out — 2026-05-30

**Done-condition met:** full user journey verified clean on staterafinance.app.
**Sentry:** zero new errors during Module 9 session.
**Test suite:** 151 tests, 0 typecheck errors.

---

## What was done

### Sub-items completed this session

| Sub-item | SHA | Summary |
|----------|-----|---------|
| 9.7a | 4fc2ac7 | CRUD update URL drift: POST /:id/update → PATCH /:id across 6 resource types |
| 9.7b | 6b90db8 | CRUD delete URL drift + readErrorCode fix (phantom `error_code` → top-level `code`) |
| 9.7c | ce8f670 | POST /api/auth/profile/update — profile preferences write path |
| 9.7d | 7ab611e | Remove Flask-era password-change UI |
| 9.7e | cfc272f | Unwrap 2FA setup/verify envelopes via readApiData — QR and BACKUP_CODES_LOW toast were silently dead |
| 0003 hotfix | 030b930 | Register is_tombstone in _journal.json; column applied to prod; login audit rows confirmed |
| 9.7f | ab4c09a | Remove Flask-era account-deletion UI |

### Full Module 9 sub-item history

9.1 (income_source enum) → 9.2 (analytics URL prefix) → 9.3a (OIDC login UI) → 9.3b (dead-code removal) → 9.4 (/me route) → 9.5a–f (bulk CRUD audit) → 9.6 (profile route) → 9.7a–f (auth + 2FA fixes) + 0003 migration hotfix.

### Runbook cleanup (missed in 8e 829f8ef)

- `docs/runbooks/activation-reporting.md` — deleted (Flask-era Celery job, no Hono equivalent)
- `docs/runbooks/open-banking-provider-onboarding.md` — deleted (CBK Open Banking deferred indefinitely)
- `docs/runbooks/key-rotation.md` — replaced with Hono-era stub; Flask content removed

---

## What was deliberately NOT done

### 1. Account deletion UI — TODO(account-deletion-ui)

**Why deferred:** The Flask two-step password+confirmation_token flow was removed in 9.7f. The Hono backend (delete-reauth OIDC flow → intent cookie → DELETE /api/account) is fully implemented and tested. The new UI needs to be designed and built. **Bundled with TODO(GDPR-data-export) — neither ships alone.**

**Impact:** Users cannot delete their account from the UI. The backend is functional. The Danger Zone section of ProfilePage is completely absent.

**What it needs:** A "Delete account" button that redirects to GET /api/auth/delete-reauth → user completes Google re-auth → callback issues `statera_delete_intent` cookie → frontend sends DELETE /api/account. Show a confirmation dialog before the redirect. After successful delete, clear session and navigate to login.

### 2. Key rotation runbook — TODO(key-rotation-runbook)

**Why deferred:** The Flask procedure referenced `scripts/reencrypt_secrets.py`, `.venv/bin/python`, and SQLAlchemy — all removed. The Hono stack doesn't yet have a re-encryption script. The stub at `docs/runbooks/key-rotation.md` documents what facts survive and what needs to be written.

### 3. Migration journal CI guard — TODO(migration-journal-guard)

**Why deferred:** Adding a CI check that fails when a `.sql` file isn't listed in `_journal.json` would prevent the is_tombstone class of silent migration drift. Not scoped for this session; added as a standing TODO.

### 4. Contract-validation tooling — TODO(module-9-contract-validation)

**Why deferred:** No mechanism validates Hono response shapes against frontend declared types. The 9.4 stub bug (returning `{session}` instead of `{user}`) passed smoke tests and typecheck for months. MSW-based fetch-level mocking or shared contract types would catch this class of bug at test time rather than after deployment. Not scoped for Module 9 close-out; remains an open TODO from the 8e entry.

### 5. CSP enforcement — TODO(module-8e-csp-enforcement)

CSP is still in Report-Only mode. The observation window opened 2026-05-24. Decision criteria: zero violation reports over ≥7 consecutive days. This was not the focus of this session; carries forward.

---

## Open decisions

1. **Account deletion UX shape**: the OIDC re-auth redirect flow means the user leaves the app and returns. Should the UI warn users about this? Should there be a "Download your data first" prompt before the redirect?

2. **GDPR data-export format**: JSON dump? CSV per resource type? Both? What's the right scope (include security_events? deleted-account data?).

3. **Key rotation timing**: no scheduled rotation is in place. Add a rotation reminder to the operations calendar?

---

## Suggested opening prompt for the next session

```
Continue public-statera work. Module 9 is COMPLETE (done-condition met 2026-05-30).

Two launch blockers remain before announcing the site:
1. TODO(account-deletion-ui): implement OIDC re-auth delete flow in ProfilePage
2. TODO(GDPR-data-export): GET /api/account/data-export before account deletion

Start with a proposal for the account-deletion UI: show what ProfilePage's Danger Zone should look like, what the re-auth redirect UX should be, and the exact API calls. Wait for approval before writing any code.
```
