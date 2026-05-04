"""Field-level encryption for sensitive model columns.

Uses AES-256-GCM (via the ``cryptography`` library) for authenticated
encryption.  Each encrypted value is stored as text with the prefix
``enc1:`` followed by URL-safe base64(12-byte nonce || ciphertext).

Key management
--------------
Load the encryption key from the ``ENCRYPTION_KEY`` environment variable.
It must be exactly 64 lowercase hex characters (32 bytes = 256-bit key),
and it **must not** equal ``SECRET_KEY``.

Generate a key::

    python -c "import secrets; print(secrets.token_hex(32))"

For local development with ``PERSONAL_STATERA_DEV_MODE=true``, a fixed insecure
key is used and a warning is emitted.  Never use the dev key in production.

Key rotation
------------
Set ``ENCRYPTION_KEY_PREVIOUS`` to the old key value.  ``decrypt()`` tries
the current key first, then falls back to the previous key.  After rotating,
run ``scripts/reencrypt_secrets.py`` to migrate all ciphertext to the new key,
then clear ``ENCRYPTION_KEY_PREVIOUS``.

SQLAlchemy integration
----------------------
Use ``EncryptedString`` as a column type decorator::

    class MyModel(db.Model):
        secret_field = db.Column(EncryptedString, nullable=True)

- ``None`` values are stored as ``NULL`` and returned as ``None``.
- Legacy plaintext rows (without the ``enc1:`` prefix) are returned as-is on
  reads and will be re-encrypted automatically on the next write.
"""

from __future__ import annotations

import base64
import logging
import os
import secrets
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)

_ENC_PREFIX = "enc1:"
# 32 zero bytes — insecure, only for PERSONAL_STATERA_DEV_MODE.
_DEV_KEY_HEX = "00" * 32

_current_key: AESGCM | None = None
_previous_key: AESGCM | None = None
_initialized = False


def _hex_to_aesgcm(hex_str: str) -> AESGCM:
    """Parse a 64-hex-character key string and return an AESGCM instance."""
    stripped = hex_str.strip()
    try:
        key_bytes = bytes.fromhex(stripped)
    except ValueError as exc:
        raise ValueError(
            "ENCRYPTION_KEY must be exactly 64 lowercase hex characters (32 bytes). "
            "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
        ) from exc
    if len(key_bytes) != 32:
        raise ValueError(
            f"ENCRYPTION_KEY must decode to exactly 32 bytes; got {len(key_bytes)}."
        )
    return AESGCM(key_bytes)


def _load_keys() -> None:
    """Load encryption keys from environment.  Called once per process."""
    global _current_key, _previous_key, _initialized

    # TODO(remove-dinartrack-shim): Remove DINARTRACK_DEV_MODE fallback once all deployments
    # have migrated to PERSONAL_STATERA_DEV_MODE.
    is_dev = (
        os.getenv("PERSONAL_STATERA_DEV_MODE", "").lower() in ("1", "true", "yes")
        or os.getenv("DINARTRACK_DEV_MODE", "").lower() in ("1", "true", "yes")
    )
    raw_key = (os.getenv("ENCRYPTION_KEY") or "").strip()

    if not raw_key:
        if is_dev:
            logger.warning(
                "DEVELOPMENT MODE: Using insecure default ENCRYPTION_KEY. "
                "Set ENCRYPTION_KEY for any non-local use."
            )
            raw_key = _DEV_KEY_HEX
        else:
            raise RuntimeError(
                "ENCRYPTION_KEY environment variable is required.\n"
                "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
                "For local development, set PERSONAL_STATERA_DEV_MODE=true."
            )

    _current_key = _hex_to_aesgcm(raw_key)

    raw_prev = (os.getenv("ENCRYPTION_KEY_PREVIOUS") or "").strip()
    if raw_prev:
        try:
            _previous_key = _hex_to_aesgcm(raw_prev)
            logger.info("ENCRYPTION_KEY_PREVIOUS loaded for key rotation support.")
        except Exception:  # noqa: BLE001 - crypto fallback paths should log and degrade safely when optional branches fail.
            logger.warning("ENCRYPTION_KEY_PREVIOUS is set but invalid; ignoring previous key.")
            _previous_key = None

    _initialized = True


def _ensure_initialized() -> None:
    """Lazily initialize keys on first use."""
    if not _initialized:
        _load_keys()


def encrypt(plaintext: str) -> str:
    """Encrypt *plaintext* and return a prefixed, base64-encoded ciphertext string."""
    _ensure_initialized()
    assert _current_key is not None
    nonce = secrets.token_bytes(12)  # 96-bit nonce — unique per call
    ciphertext = _current_key.encrypt(nonce, plaintext.encode("utf-8"), None)
    blob = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
    return f"{_ENC_PREFIX}{blob}"


def decrypt(value: str) -> str:
    """Decrypt an encrypted string.

    If *value* does not start with the ``enc1:`` prefix it is treated as
    legacy plaintext and returned unchanged (rolling-upgrade safety).
    """
    _ensure_initialized()

    if not value.startswith(_ENC_PREFIX):
        return value  # legacy plaintext row

    blob = value[len(_ENC_PREFIX):]
    try:
        raw = base64.urlsafe_b64decode(blob.encode("ascii"))
    except Exception as exc:  # noqa: BLE001 - crypto fallback paths should log and degrade safely when optional branches fail.
        raise ValueError(f"Encrypted value has invalid base64 encoding: {exc}") from exc

    if len(raw) < 12:
        raise ValueError("Encrypted value is too short to contain a valid nonce.")

    nonce, ciphertext = raw[:12], raw[12:]

    for key in (_current_key, _previous_key):
        if key is None:
            continue
        try:
            return key.decrypt(nonce, ciphertext, None).decode("utf-8")
        except Exception:  # noqa: BLE001 - crypto fallback paths should log and degrade safely when optional branches fail.
            continue

    raise ValueError(
        "Failed to decrypt field: neither the current nor the previous key matched. "
        "Check ENCRYPTION_KEY and ENCRYPTION_KEY_PREVIOUS."
    )


class EncryptedString(TypeDecorator):
    """SQLAlchemy TypeDecorator that transparently encrypts/decrypts column values.

    The underlying storage type is ``Text``.  Existing plaintext values are
    returned as-is and will be encrypted on the next write, making rolling
    upgrades safe.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        """Python → DB: encrypt the value before storing."""
        if value is None:
            return None
        s = str(value)
        if s.startswith(_ENC_PREFIX):
            return s  # already encrypted; avoid double-encryption
        return encrypt(s)

    def process_result_value(self, value: Any, dialect: Any) -> str | None:
        """DB → Python: decrypt the value after loading."""
        if value is None:
            return None
        s = str(value)
        if s.startswith(_ENC_PREFIX):
            return decrypt(s)
        return s  # legacy plaintext — returned as-is


def reset_for_testing(*, key_hex: str | None = None) -> None:
    """Reset key state for unit tests.  Not for production use."""
    global _current_key, _previous_key, _initialized
    _initialized = False
    _current_key = None
    _previous_key = None
    if key_hex is not None:
        _current_key = _hex_to_aesgcm(key_hex)
        _initialized = True
