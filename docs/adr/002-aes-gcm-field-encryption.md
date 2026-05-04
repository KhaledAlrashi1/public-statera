# ADR 002: AES-GCM Field Encryption for Sensitive Columns

- Status: Accepted
- Date: 2026-03-06

## Context

The application stores a small set of secrets in the database, including the
user TOTP seed. Those values must be protected at rest without forcing the
entire database into an application-specific encryption scheme. The current
implementation uses `EncryptedString` in `backend/lib/crypto.py`, backed by
AES-256-GCM, with ciphertext stored as `enc1:` plus base64-encoded
`nonce || ciphertext`.

The alternatives considered were:

- relying only on disk-level or volume-level encryption
- using database-level encryption without application awareness
- using a non-authenticated mode such as AES-CBC

## Decision

We use application-layer, field-level encryption for explicitly sensitive
columns through a SQLAlchemy type decorator.

The algorithm choice is AES-256-GCM because it provides confidentiality and
integrity in one primitive, is widely reviewed, and is directly supported by
the `cryptography` library used by the project.

Nonce strategy:

- generate a fresh random 12-byte nonce with `secrets.token_bytes(12)` on every
  encrypt operation
- store the nonce alongside the ciphertext in the encoded payload
- keep the format versioned with the `enc1:` prefix so future migrations remain
  possible

Key rotation is handled with `ENCRYPTION_KEY` and `ENCRYPTION_KEY_PREVIOUS`,
allowing rolling decrypt-read support during migration.

## Consequences

Positive:

- database dumps and backups do not expose raw TOTP secrets
- only the fields that need protection pay the encryption complexity cost
- legacy plaintext rows can be read and re-encrypted gradually, enabling
  rolling upgrades
- key rotation is operationally simple and documented in
  `docs/runbooks/key-rotation.md`

Tradeoffs:

- encrypted fields are not meaningfully queryable by value
- key management becomes an application responsibility
- random nonces mean ciphertext is non-deterministic by design, so equality
  matching on encrypted values is not supported
- field-level encryption protects against database exposure, not against a fully
  compromised app process with access to live keys
