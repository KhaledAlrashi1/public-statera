"""Open Banking operational helpers used by maintenance tasks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend import db
from backend.lib.cache import cache_bust_dashboard_metrics
from backend.models import BankConsent, BankSyncRun, RawBankTransaction, Transaction


def cleanup_abandoned_bank_previews(preview_days: int = 7) -> dict[str, int]:
    """Mark stale staged sync runs as abandoned and delete their raw rows."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=preview_days)
    stale_runs = (
        BankSyncRun.query
        .filter(
            BankSyncRun.status == "staged",
            BankSyncRun.created_at < cutoff,
        )
        .all()
    )

    raw_deleted = 0
    now = datetime.now(timezone.utc)
    for run in stale_runs:
        deleted = RawBankTransaction.query.filter_by(sync_run_id=run.id).delete(
            synchronize_session=False
        )
        raw_deleted += int(deleted or 0)
        run.status = "abandoned"
        run.abandoned_at = now

    db.session.commit()
    return {
        "runs_abandoned": len(stale_runs),
        "raw_rows_deleted": raw_deleted,
    }


def cleanup_committed_bank_raw_rows(committed_days: int = 7) -> int:
    """Delete committed/skipped raw bank rows older than committed_days.

    Default is 7 days (not 90).  Raw payloads have no analytics value after
    normalization; only the ``transactions`` rows need long-term retention.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=committed_days)
    deleted = RawBankTransaction.query.filter(
        RawBankTransaction.status.in_(["committed", "skipped_dup"]),
        RawBankTransaction.created_at < cutoff,
    ).delete(synchronize_session=False)
    db.session.commit()
    return int(deleted or 0)


def purge_revoked_consent_raw_data(consent_id: int) -> dict[str, int]:
    """Immediately purge raw bank transaction rows associated with a revoked consent.

    Called when a user revokes a bank connection/consent.  Normalized
    ``transactions`` rows (``source='bank_import'``) are NOT deleted here — they
    enter a 30-day grace period managed by the scheduled task
    ``purge_stale_revoked_consent_transactions``.

    Returns a dict with counts of deleted rows.
    """
    consent = db.session.get(BankConsent, consent_id)
    if not consent:
        return {"raw_rows_deleted": 0}

    deleted = RawBankTransaction.query.filter(
        RawBankTransaction.connection_id == consent.connection_id,
    ).delete(synchronize_session=False)
    db.session.commit()
    return {"raw_rows_deleted": int(deleted or 0)}


def purge_stale_revoked_consent_transactions(revoked_grace_days: int = 30) -> dict[str, int]:
    """Purge normalized transactions (source='bank_import') from connections whose
    consent was revoked more than ``revoked_grace_days`` ago.

    The grace period allows users to dispute transactions before data is deleted.
    Returns counts of connections processed and transactions deleted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=revoked_grace_days)

    # Find connection IDs whose ALL consents are revoked and the most recent
    # revocation is older than the grace period.
    from sqlalchemy import func
    from backend.models import BankConnection

    stale_connection_ids = (
        db.session.query(BankConsent.connection_id)
        .join(BankConnection, BankConnection.id == BankConsent.connection_id)
        .filter(BankConnection.status == "revoked")
        .filter(BankConsent.status == "revoked")
        .filter(BankConsent.revoked_at.is_not(None))
        .group_by(BankConsent.connection_id)
        .having(func.max(BankConsent.revoked_at) < cutoff)
        .all()
    )
    connection_ids = [row[0] for row in stale_connection_ids]

    if not connection_ids:
        return {"connections_processed": 0, "transactions_deleted": 0}

    # Map connection → user via sync runs (since Transaction doesn't have connection_id).
    sync_run_user_pairs = (
        db.session.query(BankSyncRun.id, BankSyncRun.user_id)
        .filter(BankSyncRun.connection_id.in_(connection_ids))
        .all()
    )
    user_ids = list({uid for _, uid in sync_run_user_pairs})

    deleted = 0
    if user_ids:
        deleted = Transaction.query.filter(
            Transaction.user_id.in_(user_ids),
            Transaction.source == "bank_import",
        ).delete(synchronize_session=False)

    db.session.commit()
    if deleted:
        for user_id in user_ids:
            cache_bust_dashboard_metrics(user_id)
    return {
        "connections_processed": len(connection_ids),
        "transactions_deleted": int(deleted or 0),
    }
