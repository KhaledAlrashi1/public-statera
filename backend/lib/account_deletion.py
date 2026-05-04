"""Helpers for deleting all data owned by a user."""

from __future__ import annotations

import json

from backend import db
from backend.models import (
    AccountActionToken,
    BankConnection,
    BankConsent,
    BankSyncRun,
    Budget,
    Category,
    DashboardSnapshot,
    DataAccessLog,
    DebtAccount,
    Merchant,
    MemorizedTransaction,
    ProductEvent,
    RawBankTransaction,
    SavingsGoal,
    SecurityEvent,
    TemplateSuggestionFeedback,
    Transaction,
    User,
    UserProfile,
)

# Ordered from leaf tables back toward broader user-owned records so FK-linked
# rows are removed before their parent records. `User` itself is excluded
# because account deletion keeps a soft-deleted tombstone row.
USER_OWNED_PURGE_MODELS = (
    DataAccessLog,
    RawBankTransaction,
    BankSyncRun,
    BankConsent,
    BankConnection,
    Transaction,
    Budget,
    DashboardSnapshot,
    DebtAccount,
    SavingsGoal,
    SecurityEvent,
    ProductEvent,
    MemorizedTransaction,
    TemplateSuggestionFeedback,
    AccountActionToken,
    UserProfile,
    Merchant,
    Category,
)


def purge_user_account_rows(
    *,
    user_id: int,
    email_hash: str,
    audit_ip_address: str | None,
    audit_user_agent: str | None,
) -> None:
    """Delete every row owned by a user while preserving an audit tombstone."""
    uid = int(user_id)

    db.session.add(
        SecurityEvent(
            user_id=None,
            event_type="account.deleted",
            ip_address=(audit_ip_address or "unknown"),
            user_agent=(audit_user_agent or None),
            details_json=json.dumps(
                {
                    "deleted_user_id": uid,
                    "email_hash": email_hash,
                }
            ),
        )
    )
    db.session.flush()

    for model in USER_OWNED_PURGE_MODELS:
        model.query.filter(model.user_id == uid).delete(synchronize_session=False)

    user = db.session.get(User, uid)
    if user is not None:
        user.is_active = False
