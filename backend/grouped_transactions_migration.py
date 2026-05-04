"""Legacy grouped-transaction migration helpers.

The grouped `items` table has been removed. Historical data must already be
flattened to atomic transactions before this module is invoked.
"""

from __future__ import annotations

from typing import Any


def flatten_grouped_transactions(*, dry_run: bool = True, user_id: int | None = None) -> dict[str, Any]:
    """Return a no-op summary now that grouped transactions no longer exist."""
    return {
        "dry_run": dry_run,
        "grouped_transactions_found": 0,
        "grouped_transactions_flattened": 0,
        "new_transactions_created": 0,
        "skipped_mismatch": 0,
        "users": ([] if user_id is None else [{"user_id": int(user_id), "grouped_transactions": 0, "new_transactions_created": 0, "rows_after_flatten": 0, "skipped_mismatch": 0}]),
    }
