"""On-demand maintenance helpers."""

from __future__ import annotations

from typing import Any

from flask import has_app_context


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except Exception:  # noqa: BLE001 - maintenance cleanup should continue past non-critical failures.
        return default
    return parsed if parsed > 0 else default


def run_maintenance_pass(
    *,
    security_events_days: int,
    product_events_days: int = 90,
) -> dict[str, int]:
    """Run one full maintenance pass and return deletion counters."""
    from backend.tasks import (
        execute_cleanup_account_tokens,
        execute_cleanup_memorized_transactions,
        execute_cleanup_product_events,
        execute_cleanup_rate_limiter,
        execute_cleanup_security_data,
    )

    execute_cleanup_rate_limiter()
    expired_deleted, used_deleted = execute_cleanup_account_tokens()
    security_events_deleted = execute_cleanup_security_data(
        security_events_days=security_events_days,
    )
    # Extended cleanups require Flask app context and are intentionally non-fatal.
    if has_app_context():
        try:
            execute_cleanup_product_events(product_events_days=product_events_days)
        except Exception:  # noqa: BLE001 - maintenance cleanup should continue past non-critical failures.
            pass
        try:
            execute_cleanup_memorized_transactions()
        except Exception:  # noqa: BLE001 - maintenance cleanup should continue past non-critical failures.
            pass

    return {
        "account_action_tokens_expired_deleted": int(expired_deleted or 0),
        "account_action_tokens_used_deleted": int(used_deleted or 0),
        "security_events_deleted": int(security_events_deleted or 0),
    }
