"""Password hash verification helpers with legacy-hash fallback support."""

from __future__ import annotations

from flask import current_app
from werkzeug.security import check_password_hash as werkzeug_check_password_hash

from backend import bcrypt


def verify_password(stored_hash: str | None, password: str) -> tuple[bool, bool]:
    """Return (is_valid, needs_rehash_with_bcrypt)."""
    if not stored_hash or not isinstance(stored_hash, str):
        return False, False

    try:
        if bcrypt.check_password_hash(stored_hash, password):
            return True, False
    except (TypeError, ValueError):
        # Happens for legacy/non-bcrypt hashes or malformed data.
        pass
    except Exception:  # noqa: BLE001 - password backend compatibility checks should fall back cleanly across environments.
        current_app.logger.exception("Unexpected password verification failure.")
        return False, False

    try:
        if werkzeug_check_password_hash(stored_hash, password):
            return True, True
    except Exception:  # noqa: BLE001 - password backend compatibility checks should fall back cleanly across environments.
        return False, False

    return False, False
