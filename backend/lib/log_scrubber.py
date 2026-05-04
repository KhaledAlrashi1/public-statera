"""Log and Sentry scrubbing to prevent sensitive values leaking into observability.

Register by passing ``sentry_before_send`` to ``sentry_sdk.init(before_send=...)``
and calling ``apply_log_scrubbing(app)`` after the Flask app is created.
"""

from __future__ import annotations

import logging
import re
from typing import Any

# Field names (case-insensitive) whose values are always replaced.
_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "email",
        "name",
        "full_name",
        "first_name",
        "last_name",
        "display_name",
        "phone",
        "phone_number",
        "mobile",
        "iban",
        "password",
        "password_hash",
        "current_password",
        "new_password",
        "totp_secret",
        "totp_code",
        "backup_code",
        "access_token",
        "refresh_token",
        "authorization",
        "x-csrftoken",
        "x-csrf-token",
        "csrf_token",
        "secret_key",
        "encryption_key",
        "encryption_key_previous",
        "postmark_api_key",
        "api_key",
        "token",
        "token_hash",
        "confirmation_token",
    }
)

# Pattern that matches our encrypted-field ciphertext blobs.
_ENC_PATTERN = re.compile(r"enc1:[A-Za-z0-9_=\-]{20,}")
_EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_IBAN_PATTERN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", re.IGNORECASE)
_KEY_VALUE_PATTERN = re.compile(
    r"(?i)\b("
    r"email|name|full_name|first_name|last_name|display_name|phone|phone_number|mobile|iban"
    r")=([^,\n]*?)(?=\s+\w+=|,|$)"
)

_REDACTED = "[REDACTED]"


def _scrub_string(value: str) -> str:
    """Redact secrets and common PII patterns from free-text log content."""
    scrubbed = _ENC_PATTERN.sub(_REDACTED, value)
    scrubbed = _EMAIL_PATTERN.sub(_REDACTED, scrubbed)
    scrubbed = _IBAN_PATTERN.sub(_REDACTED, scrubbed)
    scrubbed = _KEY_VALUE_PATTERN.sub(lambda match: f"{match.group(1)}={_REDACTED}", scrubbed)
    return scrubbed


def _scrub_dict(d: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    """Recursively scrub sensitive keys from a mapping.  Max depth 8."""
    if depth > 8:
        return d
    result: dict[str, Any] = {}
    for key, value in d.items():
        key_lower = str(key).lower()
        if key_lower in _SENSITIVE_KEYS:
            result[key] = _REDACTED
        elif isinstance(value, dict):
            result[key] = _scrub_dict(value, depth + 1)
        elif isinstance(value, list):
            result[key] = [
                _scrub_dict(item, depth + 1) if isinstance(item, dict)
                else _scrub_string(item) if isinstance(item, str)
                else item
                for item in value
            ]
        elif isinstance(value, str):
            result[key] = _scrub_string(value)
        else:
            result[key] = value
    return result


def sentry_before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
    """Sentry ``before_send`` processor: scrub sensitive data from all events."""
    try:
        request_data: dict[str, Any] = event.get("request") or {}

        # Scrub POST/JSON body.
        if "data" in request_data:
            if isinstance(request_data["data"], dict):
                request_data["data"] = _scrub_dict(request_data["data"])
            elif isinstance(request_data["data"], str):
                request_data["data"] = _scrub_string(request_data["data"])

        # Scrub HTTP headers.
        if "headers" in request_data and isinstance(request_data["headers"], dict):
            request_data["headers"] = _scrub_dict(request_data["headers"])

        if request_data:
            event["request"] = request_data

        # Scrub Sentry extra context.
        if "extra" in event and isinstance(event["extra"], dict):
            event["extra"] = _scrub_dict(event["extra"])

        # Scrub breadcrumb data.
        breadcrumbs = (event.get("breadcrumbs") or {}).get("values") or []
        for crumb in breadcrumbs:
            if isinstance(crumb.get("data"), dict):
                crumb["data"] = _scrub_dict(crumb["data"])

    except Exception:  # noqa: BLE001 - log scrubbing must never raise while handling another failure path.
        pass  # Never let scrubbing break event delivery

    return event


class _LogScrubFilter(logging.Filter):
    """Logging Filter that redacts encrypted-field blobs from log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            if isinstance(record.msg, dict):
                record.msg = _scrub_dict(record.msg)
                record.args = ()
                return True

            msg = record.getMessage()
            scrubbed = _scrub_string(msg)
            if scrubbed != msg:
                record.msg = scrubbed
                record.args = ()
        except Exception:  # noqa: BLE001 - log scrubbing must never raise while handling another failure path.
            pass
        return True


def apply_log_scrubbing(app) -> None:
    """Add the log scrub filter to all handlers on the Flask app logger."""
    scrub_filter = _LogScrubFilter()
    for handler in app.logger.handlers:
        handler.addFilter(scrub_filter)
    # Also add to root logger handlers to catch sqlalchemy / celery logs.
    root = logging.getLogger()
    for handler in root.handlers:
        handler.addFilter(scrub_filter)
