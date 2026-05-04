# Runbook: Encryption Key Rotation

**Service:** Statera / `personal-finance`
**Last reviewed:** 2026-03-05

---

## Overview

Statera uses AES-256-GCM field-level encryption (via the `EncryptedString`
SQLAlchemy TypeDecorator in `backend/lib/crypto.py`) to protect sensitive
columns at rest. Encrypted values are prefixed with `enc1:`.

Affected fields (as of v1.0):
- `users.totp_secret` — TOTP 2FA seed

The encryption key is a 64-character hex string (32 bytes) set via
`ENCRYPTION_KEY` in the environment.

---

## 1. When to Rotate

Rotate the encryption key when:

- A security incident suggests the key may be compromised
- Scheduled rotation policy (e.g., annually)
- A team member with key access leaves the organisation
- The key management system flags the key for rotation

---

## 2. Key Concepts

| Env var | Role |
|---------|------|
| `ENCRYPTION_KEY` | Active key — used for all new encrypt/decrypt operations |
| `ENCRYPTION_KEY_PREVIOUS` | Old key — used **only for decryption** during the migration window |

The `crypto.py` module tries `ENCRYPTION_KEY` first; if decryption fails it
falls back to `ENCRYPTION_KEY_PREVIOUS`. This allows a rolling, zero-downtime
rotation.

---

## 3. Rotation Steps

### Step 1 — Generate a new key

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Example output: a3f8c2d1e9b4567890abcdef1234567890abcdef1234567890abcdef12345678
```

Store the new key securely in your secrets manager **before** proceeding.

### Step 2 — Deploy with both keys active

In `.env.prod`, set:

```env
ENCRYPTION_KEY=<new_key>
ENCRYPTION_KEY_PREVIOUS=<old_key>
```

Redeploy the backend so the new configuration is live:

```bash
bash scripts/deploy.sh
```

At this point:
- New encryptions use `ENCRYPTION_KEY` (new key)
- Existing rows encrypted with the old key are still readable via
  `ENCRYPTION_KEY_PREVIOUS` fallback

**Do not remove `ENCRYPTION_KEY_PREVIOUS` yet.**

### Step 3 — Re-encrypt existing rows

Run the re-encryption script, which re-encrypts all legacy (old-key) ciphertext
using the new key. The script is idempotent — rows already encrypted with the
new key are skipped.

```bash
# Dry run first — prints what would change without writing
ENCRYPTION_KEY=<new_key> \
ENCRYPTION_KEY_PREVIOUS=<old_key> \
DATABASE_URL=$DATABASE_URL \
  .venv/bin/python scripts/reencrypt_secrets.py --dry-run

# Full run after confirming dry-run output looks correct
ENCRYPTION_KEY=<new_key> \
ENCRYPTION_KEY_PREVIOUS=<old_key> \
DATABASE_URL=$DATABASE_URL \
  .venv/bin/python scripts/reencrypt_secrets.py
```

Expected output:
```
Done. updated=<N> skipped=<M> dry_run=False
```

### Step 4 — Verify re-encryption

Confirm no rows still carry the old ciphertext format (all rows should decrypt
successfully with the new key alone):

```bash
ENCRYPTION_KEY=<new_key> \
DATABASE_URL=$DATABASE_URL \
  .venv/bin/python scripts/reencrypt_secrets.py --dry-run
# Expected: Done. updated=0 skipped=<N> dry_run=True
```

### Step 5 — Remove the old key

Once all rows are re-encrypted, remove `ENCRYPTION_KEY_PREVIOUS` from
`.env.prod`:

```env
ENCRYPTION_KEY=<new_key>
# ENCRYPTION_KEY_PREVIOUS removed
```

Redeploy:

```bash
bash scripts/deploy.sh
```

### Step 6 — Revoke the old key in your secrets manager

After the deploy succeeds and monitoring shows no decryption errors, revoke or
archive the old key in AWS Secrets Manager / Vault / wherever it is stored.

---

## 4. Rollback

If anything goes wrong between steps 2 and 4 (e.g., re-encryption script fails
partway through), the system remains operational because `ENCRYPTION_KEY_PREVIOUS`
is still set. Rows are either encrypted with the old key (readable via
fallback) or the new key (readable directly).

To roll back fully:

```env
# Revert in .env.prod
ENCRYPTION_KEY=<old_key>
# Remove ENCRYPTION_KEY_PREVIOUS
```

Re-encrypt rows back to the old key if necessary (swap key arguments in step 3).

---

## 5. Adding New Encrypted Fields

If a developer adds a new column using `EncryptedString`:

1. The column stores plaintext values for any rows inserted before the
   migration (if the column was added to an existing table with backfill).
2. Run `scripts/reencrypt_secrets.py` — or write a targeted migration/script
   for the new table — to encrypt those plaintext values.
3. The script's idempotency check (prefix `enc1:`) ensures already-encrypted
   rows are never double-encrypted.

---

## 6. Key Storage Requirements

- Keys must **never** be committed to git
- Keys must **never** be stored in application logs
- In production, load keys from a secrets manager (AWS Secrets Manager,
  HashiCorp Vault, GCP Secret Manager, etc.)
- Maintain encrypted offline backup of the key (separate from the database
  backup) — without the key, encrypted data is permanently unrecoverable

---

## 7. Rotation Checklist

- [ ] New key generated and stored in secrets manager
- [ ] Both `ENCRYPTION_KEY` and `ENCRYPTION_KEY_PREVIOUS` deployed
- [ ] Dry-run confirms rows to re-encrypt
- [ ] `reencrypt_secrets.py` run successfully (`updated=<N>`, no errors)
- [ ] Verification dry-run shows `updated=0` (all rows on new key)
- [ ] `ENCRYPTION_KEY_PREVIOUS` removed from environment and redeployed
- [ ] Old key archived/revoked in secrets manager
- [ ] Monitoring shows no decryption errors after 24 hours
