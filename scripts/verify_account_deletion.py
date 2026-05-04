#!/usr/bin/env python3
"""Pre-production verification script for account deletion cascade.

Provisions a temporary test user with one row in every user-owned table,
triggers account deletion via the application purge function, then asserts
zero orphaned rows remain for that user across all tables.

Run against a real PostgreSQL instance (staging or a dedicated verify DB)
to validate FK constraint ordering and cascade completeness before release.

Usage:
    DATABASE_URL=postgresql://... ./scripts/python scripts/verify_account_deletion.py
    DATABASE_URL=postgresql://... ./scripts/python scripts/verify_account_deletion.py --verbose

Exit codes:
    0  All checks passed — no orphaned rows found
    1  One or more orphaned rows found — inspect output for details
    2  Setup or teardown error — test user may need manual cleanup
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

# ---------------------------------------------------------------------------
# Bootstrap Flask app context
# ---------------------------------------------------------------------------

# Add project root to path so "backend" package is importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("FLASK_ENV", "production")
os.environ.setdefault("PERSONAL_STATERA_DEV_MODE", "false")

try:
    from run import create_app  # type: ignore[import]
except ImportError:
    print("ERROR: Could not import create_app from run.py. Run this script from the project root.", file=sys.stderr)
    sys.exit(2)

app = create_app()


def _email_hash(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


def _seed(user_id: int, db, verbose: bool) -> None:
    """Insert one row in every user-owned table for the given user_id."""
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
        MemorizedTransaction,
        Merchant,
        ProductEvent,
        RawBankTransaction,
        SavingsGoal,
        SecurityEvent,
        TemplateSuggestionFeedback,
        Transaction,
        UserProfile,
    )

    if verbose:
        print(f"  Seeding workspace for user_id={user_id}")

    cat = Category(user_id=user_id, name="Verify Category", is_income=False)
    merchant = Merchant(user_id=user_id, name="Verify Merchant")
    db.session.add_all([cat, merchant])
    db.session.flush()

    txn = Transaction(
        user_id=user_id,
        date=date(2026, 1, 1),
        category_id=cat.id,
        merchant_id=merchant.id,
        name="Verify Transaction",
        name_key="verify transaction",
        amount_kd=Decimal("1.000"),
    )
    db.session.add(txn)
    db.session.flush()

    db.session.add(Budget(
        user_id=user_id,
        month="2026-01",
        category_id=cat.id,
        amount_kd=Decimal("100.000"),
    ))
    db.session.add(DebtAccount(
        user_id=user_id,
        name="Verify Debt",
        debt_type="other",
        balance_kd=Decimal("50.000"),
        minimum_payment_kd=Decimal("5.000"),
    ))
    db.session.add(SavingsGoal(
        user_id=user_id,
        name="Verify Goal",
        goal_type="custom",
        target_kd=Decimal("200.000"),
        current_kd=Decimal("10.000"),
        linked_category_id=cat.id,
        is_active=True,
    ))
    db.session.add(UserProfile(
        user_id=user_id,
        monthly_income_kd=Decimal("500.000"),
        payday_day=25,
        country="Kuwait",
    ))
    db.session.add(DashboardSnapshot(
        user_id=user_id,
        months_count=1,
        window_end_month="2026-01",
        months_json='["2026-01"]',
        monthly_json='[{"month":"2026-01","income_kd":0,"expense_kd":1.0}]',
        expense_by_category_json='{"2026-01":{"Verify Category":1.0}}',
    ))
    db.session.add(MemorizedTransaction(
        user_id=user_id,
        canonical="Verify Memorized",
        norm="verify memorized",
        category="Verify Category",
        merchant="Verify Merchant",
        count=1,
    ))
    db.session.add(TemplateSuggestionFeedback(
        user_id=user_id,
        signature_key="verify-feedback-key",
        accepted_count=1,
    ))
    db.session.add(ProductEvent(user_id=user_id, event_name="verify.seed"))
    db.session.add(SecurityEvent(user_id=user_id, event_type="verify.seed"))
    db.session.add(AccountActionToken(
        user_id=user_id,
        purpose="password_change",
        token_hash="verify-token-hash-unique",
        payload_json='{}',
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    ))

    conn = BankConnection(
        user_id=user_id,
        provider="verify_bank",
        institution_name="Verify Bank",
        status="active",
    )
    db.session.add(conn)
    db.session.flush()

    consent = BankConsent(
        connection_id=conn.id,
        user_id=user_id,
        scopes='["transactions:read"]',
        purpose_of_use="Verification test",
        scope_description="Read-only access for verification",
        data_recipient_name="Personal Statera",
        status="active",
    )
    db.session.add(consent)
    db.session.flush()

    run = BankSyncRun(connection_id=conn.id, user_id=user_id, status="staged", staged_count=1)
    db.session.add(run)
    db.session.flush()

    db.session.add(RawBankTransaction(
        connection_id=conn.id,
        sync_run_id=run.id,
        user_id=user_id,
        provider_tx_id="verify-provider-tx-1",
        date=date(2026, 1, 1),
        description="Verify Raw",
        amount_kd=Decimal("1.000"),
        status="staged",
        transaction_id=txn.id,
    ))
    db.session.add(DataAccessLog(
        user_id=user_id,
        connection_id=conn.id,
        consent_id=consent.id,
        action="sync_preview",
        records_accessed=1,
        date_range_start=date(2026, 1, 1),
        date_range_end=date(2026, 1, 1),
        ip_address="127.0.0.1",
    ))

    db.session.commit()
    if verbose:
        print("  Workspace seeded.")


def _purge(user_id: int, user_email: str, db, verbose: bool) -> None:
    from backend.lib.account_deletion import purge_user_account_rows

    if verbose:
        print(f"  Triggering purge for user_id={user_id}")
    purge_user_account_rows(
        user_id=user_id,
        email_hash=_email_hash(user_email),
        audit_ip_address="127.0.0.1",
        audit_user_agent="verify_account_deletion.py",
    )
    db.session.commit()
    if verbose:
        print("  Purge committed.")


def _check(user_id: int, db, verbose: bool) -> list[str]:
    """Return a list of failure messages; empty list means pass."""
    from backend.lib.account_deletion import USER_OWNED_PURGE_MODELS

    failures: list[str] = []

    for model in USER_OWNED_PURGE_MODELS:
        count = model.query.filter(model.user_id == user_id).count()
        label = model.__name__
        if count > 0:
            failures.append(f"  FAIL  {label}: {count} orphaned row(s) remain for user_id={user_id}")
        elif verbose:
            print(f"  PASS  {label}")

    return failures


def _cleanup_test_user(user_id: int, user_email: str, db, verbose: bool) -> None:
    """Best-effort cleanup: remove any leftover rows then hard-delete the user."""
    from backend.models import User
    from backend.lib.account_deletion import USER_OWNED_PURGE_MODELS

    if verbose:
        print(f"  Cleaning up test user user_id={user_id}")

    for model in USER_OWNED_PURGE_MODELS:
        try:
            model.query.filter(model.user_id == user_id).delete(synchronize_session=False)
        except Exception:  # noqa: BLE001
            db.session.rollback()

    try:
        user = db.session.get(User, user_id)
        if user:
            db.session.delete(user)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", "-v", action="store_true", help="Print per-table PASS/FAIL lines")
    args = parser.parse_args()
    verbose = args.verbose

    test_email = "verify-cascade-script@internal.personal-statera.invalid"
    user_id: int | None = None

    with app.app_context():
        from backend import db
        from backend.models import User
        import bcrypt  # type: ignore[import]

        # Guard: refuse to run against a DB with real user data at scale.
        real_user_count = User.query.filter(User.email != test_email).count()
        if real_user_count > 500:
            print(
                f"ERROR: This database has {real_user_count} users. "
                "Run against a staging/verify DB, not production.",
                file=sys.stderr,
            )
            return 2

        # Remove any leftover from a previous failed run.
        stale = User.query.filter_by(email=test_email).first()
        if stale:
            _cleanup_test_user(stale.id, test_email, db, verbose)

        print(f"[verify_account_deletion] Creating test user: {test_email}")
        try:
            pw_hash = bcrypt.hashpw(b"VerifyPass123!", bcrypt.gensalt()).decode("utf-8")
            user = User(email=test_email, password_hash=pw_hash, display_name="Verify Script")
            db.session.add(user)
            db.session.commit()
            user_id = int(user.id)
        except Exception as exc:
            print(f"ERROR: Could not create test user: {exc}", file=sys.stderr)
            traceback.print_exc()
            return 2

        try:
            print("[verify_account_deletion] Seeding workspace...")
            _seed(user_id, db, verbose)

            print("[verify_account_deletion] Running purge...")
            _purge(user_id, test_email, db, verbose)

            print("[verify_account_deletion] Checking for orphaned rows...")
            failures = _check(user_id, db, verbose)

        except Exception as exc:
            print(f"ERROR during verify: {exc}", file=sys.stderr)
            traceback.print_exc()
            _cleanup_test_user(user_id, test_email, db, verbose)
            return 2

        finally:
            # Always hard-delete the tombstone user row created by purge.
            try:
                tombstone = db.session.get(User, user_id)
                if tombstone:
                    db.session.delete(tombstone)
                    db.session.commit()
            except Exception:  # noqa: BLE001
                db.session.rollback()

        if failures:
            print("\n[verify_account_deletion] FAILED — orphaned rows found:")
            for msg in failures:
                print(msg)
            return 1

        print("[verify_account_deletion] PASSED — no orphaned rows found.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
