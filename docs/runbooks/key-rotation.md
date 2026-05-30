# Runbook: Encryption Key Rotation

**Service:** Statera / `public-statera` (Hono + Node.js)
**Stub created:** 2026-05-30 — see TODO(key-rotation-runbook) in CLAUDE.md

---

## Status

**This runbook is a stub. The Hono-era procedure has not been written yet.**

The Flask/SQLAlchemy/Postgres steps from the previous version of this file have been removed — do not follow them; they reference `backend/lib/crypto.py`, `.venv/bin/python`, `scripts/reencrypt_secrets.py`, and a Postgres `DATABASE_URL`, none of which exist in the current stack.

---

## What still applies

The following facts carry over from Flask into the Hono stack unchanged:

| Item | Value |
|------|-------|
| Affected column | `users.totp_secret` (the only AES-encrypted field) |
| Cipher | AES-256-GCM |
| Ciphertext prefix | `enc1:` (preserve exactly — used as a "is encrypted" guard) |
| Active key env var | `ENCRYPTION_KEY` — 64-char hex string (32 bytes) |
| Previous key env var | `ENCRYPTION_KEY_PREVIOUS` — for decryption fallback during the rotation window |
| Crypto module | `apps/api/src/lib/crypto.ts` — `encrypt(plaintext)` / `decrypt(ciphertext)` |

The two-key rolling rotation pattern is the same:
1. Set `ENCRYPTION_KEY=<new>` and `ENCRYPTION_KEY_PREVIOUS=<old>`, redeploy.
2. Re-encrypt all `enc1:` rows on disk to the new key.
3. Once all rows are on the new key, remove `ENCRYPTION_KEY_PREVIOUS`, redeploy.

---

## What needs to be written

A migration script or one-shot Node.js command that:
1. Reads all `users.totp_secret` values where the column is non-NULL.
2. Decrypts each with `decrypt()` (which tries `ENCRYPTION_KEY` first, then `ENCRYPTION_KEY_PREVIOUS`).
3. Re-encrypts with `encrypt()` (always uses `ENCRYPTION_KEY`).
4. Writes back — idempotent (rows already on the new key are skipped via the `enc1:` prefix check).
5. Reports `updated=N skipped=M` and exits non-zero on any decryption failure.

Generate the new key with `openssl rand -hex 32` (hex alphabet is URL-safe; do NOT use `openssl rand -base64`).

See TODO(key-rotation-runbook) in CLAUDE.md for full scope.
