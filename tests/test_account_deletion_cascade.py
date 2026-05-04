import json
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import or_

from preflight_base import PreflightApiTestBase


class AccountDeletionCoverageContractTests(unittest.TestCase):
    def test_purge_registry_covers_every_model_with_user_fk(self):
        from backend import db
        from backend.lib.account_deletion import USER_OWNED_PURGE_MODELS

        actual_models = set()
        for mapper in db.Model.registry.mappers:
            model = mapper.class_
            table = getattr(model, "__table__", None)
            if table is None or "user_id" not in table.columns:
                continue

            user_id_col = table.columns["user_id"]
            if not any(
                fk.column.table.name == "users" and fk.column.name == "id"
                for fk in user_id_col.foreign_keys
            ):
                continue
            actual_models.add(model)

        self.assertEqual(
            {model.__name__ for model in USER_OWNED_PURGE_MODELS},
            {model.__name__ for model in actual_models},
            "Account deletion purge coverage must stay aligned with every model that owns user_id rows.",
        )


class AccountDeletionCascadeTests(PreflightApiTestBase):
    def _seed_user_workspace(self, user_id: int, label: str):
        from backend.models import (
            AccountActionToken,
            BankConnection,
            BankConsent,
            BankSyncRun,
            Budget,
            Category,
            DataAccessLog,
            DashboardSnapshot,
            DebtAccount,
            Merchant,
            MemorizedTransaction,
            ProductEvent,
            RawBankTransaction,
            SavingsGoal,
            SecurityEvent,
            TemplateSuggestionFeedback,
            Transaction,
            UserProfile,
        )

        with self.app.app_context():
            category = Category(user_id=user_id, name=f"{label} Category", is_income=False)
            merchant = Merchant(user_id=user_id, name=f"{label} Merchant")
            self.db.session.add_all([category, merchant])
            self.db.session.flush()

            txn = Transaction(
                user_id=user_id,
                date=date(2026, 3, 5),
                category_id=category.id,
                merchant_id=merchant.id,
                name=f"{label} Transaction",
                name_key=f"{label} transaction".lower(),
                amount_kd=Decimal("5.000"),
            )
            self.db.session.add(txn)
            self.db.session.flush()
            self.db.session.add(
                Budget(
                    user_id=user_id,
                    month="2026-03",
                    category_id=category.id,
                    amount_kd=Decimal("50.000"),
                )
            )
            self.db.session.add(
                DebtAccount(
                    user_id=user_id,
                    name=f"{label} Debt",
                    debt_type="other",
                    balance_kd=Decimal("100.000"),
                    minimum_payment_kd=Decimal("10.000"),
                )
            )
            self.db.session.add(
                SavingsGoal(
                    user_id=user_id,
                    name=f"{label} Goal",
                    goal_type="custom",
                    target_kd=Decimal("200.000"),
                    current_kd=Decimal("25.000"),
                    linked_category_id=category.id,
                    is_active=True,
                )
            )
            self.db.session.add(
                UserProfile(
                    user_id=user_id,
                    monthly_income_kd=Decimal("500.000"),
                    payday_day=25,
                    country="Kuwait",
                )
            )

            conn = BankConnection(
                user_id=user_id,
                provider="fakebank",
                institution_name=f"{label} Bank",
                status="active",
            )
            self.db.session.add(conn)
            self.db.session.flush()

            consent = BankConsent(
                connection_id=conn.id,
                user_id=user_id,
                scopes='["transactions:read"]',
                purpose_of_use="Personal financial analytics",
                scope_description="Read-only access to transaction history for analytics",
                data_recipient_name="Personal Statera",
                status="active",
            )
            self.db.session.add(consent)
            self.db.session.flush()

            run = BankSyncRun(connection_id=conn.id, user_id=user_id, status="staged", staged_count=1)
            self.db.session.add(run)
            self.db.session.flush()

            self.db.session.add(
                RawBankTransaction(
                    connection_id=conn.id,
                    sync_run_id=run.id,
                    user_id=user_id,
                    provider_tx_id=f"{label.lower()}-provider-tx-1",
                    date=date(2026, 3, 5),
                    description=f"{label} Raw",
                    amount_kd=Decimal("5.000"),
                    status="staged",
                    transaction_id=txn.id,
                )
            )
            self.db.session.add(
                DataAccessLog(
                    user_id=user_id,
                    connection_id=conn.id,
                    consent_id=consent.id,
                    action="sync_preview",
                    records_accessed=1,
                    date_range_start=date(2026, 3, 5),
                    date_range_end=date(2026, 3, 5),
                    ip_address="127.0.0.1",
                )
            )

            self.db.session.add(ProductEvent(user_id=user_id, event_name=f"{label.lower()}.seed"))
            self.db.session.add(SecurityEvent(user_id=user_id, event_type=f"{label.lower()}.seed"))
            self.db.session.add(
                DashboardSnapshot(
                    user_id=user_id,
                    months_count=6,
                    window_end_month="2026-03",
                    months_json=json.dumps(["2026-01", "2026-02", "2026-03"]),
                    monthly_json=json.dumps(
                        [{"month": "2026-03", "income_kd": 500.0, "expense_kd": 5.0}]
                    ),
                    expense_by_category_json=json.dumps({ "2026-03": {f"{label} Category": 5.0} }),
                )
            )
            self.db.session.add(
                MemorizedTransaction(
                    user_id=user_id,
                    canonical=f"{label} Memorized",
                    norm=f"{label} memorized".lower(),
                    category=f"{label} Category",
                    merchant=f"{label} Merchant",
                    count=2,
                )
            )
            self.db.session.add(
                TemplateSuggestionFeedback(
                    user_id=user_id,
                    signature_key=f"{label.lower()}-feedback-key",
                    accepted_count=1,
                )
            )
            self.db.session.add(
                AccountActionToken(
                    user_id=user_id,
                    purpose="password_change",
                    token_hash=f"{label.lower()}-token-hash",
                    payload_json=json.dumps({"email": f"{label.lower()}@example.com"}),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                )
            )
            self.db.session.commit()

    def test_account_deletion_removes_all_target_user_rows_and_preserves_global_data(self):
        deleted_user_id = self._create_user("cascade-delete@example.com", "Password123!")
        preserved_user_id = self._create_user("cascade-keep@example.com", "Password123!")

        with self.app.app_context():
            from backend.models import Category, Merchant

            self.db.session.add(Category(user_id=None, name="Global Preserve Category", is_income=False))
            self.db.session.add(Merchant(user_id=None, name="Global Preserve Merchant"))
            self.db.session.commit()

        self._seed_user_workspace(deleted_user_id, "Delete")
        self._seed_user_workspace(preserved_user_id, "Keep")

        client = self.app.test_client()
        self._login(client, "cascade-delete@example.com", "Password123!")

        step1 = client.delete(
            "/api/account",
            json={"password": "Password123!"},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step1.status_code, 202, step1.get_data(as_text=True))
        token = ((step1.get_json() or {}).get("data") or {}).get("confirmation_token")
        self.assertTrue(token)

        with patch("backend.tasks.delete_account_data.apply_async", side_effect=RuntimeError("force sync delete")):
            step2 = client.delete(
                "/api/account",
                json={"password": "Password123!", "confirmation_token": token},
                headers=self._csrf_headers(client),
            )
        self.assertEqual(step2.status_code, 200, step2.get_data(as_text=True))
        self.assertTrue(((step2.get_json() or {}).get("data") or {}).get("deleted"))

        with self.app.app_context():
            from backend.models import (
                AccountActionToken,
                BankConnection,
                BankConsent,
                BankSyncRun,
                Budget,
                Category,
                DataAccessLog,
                DashboardSnapshot,
                DebtAccount,
                MemorizedTransaction,
                Merchant,
                ProductEvent,
                RawBankTransaction,
                SavingsGoal,
                SecurityEvent,
                TemplateSuggestionFeedback,
                Transaction,
                User,
                UserProfile,
            )

            self.assertEqual(User.query.filter_by(id=deleted_user_id).count(), 1)
            self.assertEqual(User.query.filter_by(id=deleted_user_id, is_active=False).count(), 1)
            self.assertEqual(UserProfile.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Transaction.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Budget.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(DashboardSnapshot.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(DebtAccount.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(BankConnection.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(BankConsent.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(BankSyncRun.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(RawBankTransaction.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(DataAccessLog.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(ProductEvent.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(SecurityEvent.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(MemorizedTransaction.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(TemplateSuggestionFeedback.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(AccountActionToken.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Category.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Merchant.query.filter_by(user_id=deleted_user_id).count(), 0)

            self.assertEqual(User.query.filter_by(id=preserved_user_id).count(), 1)
            self.assertEqual(UserProfile.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Transaction.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Budget.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(DashboardSnapshot.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(DebtAccount.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(BankConnection.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(BankConsent.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(BankSyncRun.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(RawBankTransaction.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(DataAccessLog.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(ProductEvent.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(SecurityEvent.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(MemorizedTransaction.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(TemplateSuggestionFeedback.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(AccountActionToken.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Category.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Merchant.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Category.query.filter_by(user_id=None, name="Global Preserve Category").count(), 1)
            self.assertEqual(Merchant.query.filter_by(user_id=None, name="Global Preserve Merchant").count(), 1)

            orphan_raw_bank_count = (
                self.db.session.query(RawBankTransaction.id)
                .outerjoin(BankConnection, RawBankTransaction.connection_id == BankConnection.id)
                .outerjoin(BankSyncRun, RawBankTransaction.sync_run_id == BankSyncRun.id)
                .filter(or_(BankConnection.id.is_(None), BankSyncRun.id.is_(None)))
                .count()
            )
            self.assertEqual(orphan_raw_bank_count, 0)

            orphan_access_log_count = (
                self.db.session.query(DataAccessLog.id)
                .outerjoin(BankConnection, DataAccessLog.connection_id == BankConnection.id)
                .outerjoin(BankConsent, DataAccessLog.consent_id == BankConsent.id)
                .filter(
                    or_(
                        DataAccessLog.connection_id.is_not(None) & BankConnection.id.is_(None),
                        DataAccessLog.consent_id.is_not(None) & BankConsent.id.is_(None),
                    )
                )
                .count()
            )
            self.assertEqual(orphan_access_log_count, 0)

            deleted_event = (
                SecurityEvent.query
                .filter(SecurityEvent.user_id.is_(None))
                .filter(SecurityEvent.event_type == "account.deleted")
                .order_by(SecurityEvent.id.desc())
                .first()
            )
            self.assertIsNotNone(deleted_event)
            self.assertIn("email_hash", deleted_event.details_json or "")

        relogin_deleted = self._post(
            self.app.test_client(),
            "/api/auth/login",
            json={"email": "cascade-delete@example.com", "password": "Password123!"},
        )
        self.assertEqual(relogin_deleted.status_code, 403, relogin_deleted.get_data(as_text=True))

        relogin_preserved = self._post(
            self.app.test_client(),
            "/api/auth/login",
            json={"email": "cascade-keep@example.com", "password": "Password123!"},
        )
        self.assertEqual(relogin_preserved.status_code, 200, relogin_preserved.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
