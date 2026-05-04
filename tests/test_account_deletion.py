import json
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pyotp

from preflight_base import PreflightApiTestBase


class AccountDeletionTests(PreflightApiTestBase):
    def _seed_user_data(self, user_id: int):
        from backend.models import (
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
            AccountActionToken,
        )

        with self.app.app_context():
            category = Category(user_id=user_id, name="Delete Category", is_income=False)
            merchant = Merchant(user_id=user_id, name="Delete Merchant")
            self.db.session.add_all([category, merchant])
            self.db.session.flush()

            txn = Transaction(
                user_id=user_id,
                date=date(2026, 3, 5),
                category_id=category.id,
                merchant_id=merchant.id,
                name="Delete Transaction",
                name_key="delete transaction",
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
                    name="Delete Debt",
                    debt_type="other",
                    balance_kd=Decimal("100.000"),
                    minimum_payment_kd=Decimal("10.000"),
                )
            )
            self.db.session.add(
                SavingsGoal(
                    user_id=user_id,
                    name="Delete Goal",
                    goal_type="custom",
                    target_kd=Decimal("200.000"),
                    current_kd=Decimal("25.000"),
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
                institution_name="Delete Bank",
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
                    provider_tx_id="del_provider_tx_1",
                    date=date(2026, 3, 5),
                    description="Delete Raw",
                    amount_kd=Decimal("5.000"),
                    status="staged",
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

            self.db.session.add(ProductEvent(user_id=user_id, event_name="delete.seed"))
            self.db.session.add(SecurityEvent(user_id=user_id, event_type="delete.seed"))
            self.db.session.add(
                DashboardSnapshot(
                    user_id=user_id,
                    months_count=6,
                    window_end_month="2026-03",
                    months_json=json.dumps(["2026-01", "2026-02", "2026-03"]),
                    monthly_json=json.dumps(
                        [{"month": "2026-03", "income_kd": 500.0, "expense_kd": 5.0}]
                    ),
                    expense_by_category_json=json.dumps({"2026-03": {"Delete Category": 5.0}}),
                )
            )
            self.db.session.add(
                MemorizedTransaction(
                    user_id=user_id,
                    canonical="Delete Memorized",
                    norm="delete memorized",
                    category="Delete Category",
                    merchant="Delete Merchant",
                    count=2,
                )
            )
            self.db.session.add(
                TemplateSuggestionFeedback(
                    user_id=user_id,
                    signature_key="delete-feedback-key",
                    accepted_count=1,
                )
            )
            self.db.session.add(
                AccountActionToken(
                    user_id=user_id,
                    purpose="password_change",
                    token_hash="delete-token-hash",
                    payload_json=json.dumps({"email": "delete-user@example.com"}),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                )
            )
            self.db.session.commit()

    def test_account_delete_full_cascade_and_security_event(self):
        user_id = self._create_user("delete-user@example.com", "Password123!")
        self._seed_user_data(user_id)
        client = self.app.test_client()
        self._login(client, "delete-user@example.com", "Password123!")

        with self.app.app_context():
            from backend.models import (
                AccountActionToken,
                DashboardSnapshot,
                MemorizedTransaction,
                TemplateSuggestionFeedback,
            )

            self.assertEqual(DashboardSnapshot.query.filter_by(user_id=user_id).count(), 1)
            self.assertEqual(MemorizedTransaction.query.filter_by(user_id=user_id).count(), 1)
            self.assertEqual(TemplateSuggestionFeedback.query.filter_by(user_id=user_id).count(), 1)
            self.assertEqual(AccountActionToken.query.filter_by(user_id=user_id).count(), 1)

        step1 = client.delete(
            "/api/account",
            json={"password": "Password123!"},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step1.status_code, 202, step1.get_data(as_text=True))
        token = ((step1.get_json() or {}).get("data") or {}).get("confirmation_token")
        self.assertTrue(token)

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

            self.assertEqual(User.query.filter_by(id=user_id).count(), 1)
            self.assertEqual(User.query.filter_by(id=user_id, is_active=False).count(), 1)
            self.assertEqual(UserProfile.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(Transaction.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(Budget.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DashboardSnapshot.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DebtAccount.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(BankConnection.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(BankConsent.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(BankSyncRun.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(RawBankTransaction.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DataAccessLog.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(ProductEvent.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(SecurityEvent.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(MemorizedTransaction.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(TemplateSuggestionFeedback.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(AccountActionToken.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(Category.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(Merchant.query.filter_by(user_id=user_id).count(), 0)

            deleted_event = (
                SecurityEvent.query
                .filter(SecurityEvent.user_id.is_(None))
                .filter(SecurityEvent.event_type == "account.deleted")
                .order_by(SecurityEvent.id.desc())
                .first()
            )
            self.assertIsNotNone(deleted_event)
            self.assertIn("email_hash", deleted_event.details_json or "")

        relogin = self._post(
            self.app.test_client(),
            "/api/auth/login",
            json={"email": "delete-user@example.com", "password": "Password123!"},
        )
        self.assertEqual(relogin.status_code, 403, relogin.get_data(as_text=True))

    def test_account_delete_requires_valid_password(self):
        self._create_user("delete-password@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "delete-password@example.com", "Password123!")

        res = client.delete(
            "/api/account",
            json={"password": "wrong"},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(res.status_code, 401, res.get_data(as_text=True))
        self.assertEqual((res.get_json() or {}).get("error_code"), "current_password_incorrect")

    def test_account_delete_token_expiry(self):
        self._create_user("delete-expiry@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "delete-expiry@example.com", "Password123!")

        step1 = client.delete(
            "/api/account",
            json={"password": "Password123!"},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step1.status_code, 202, step1.get_data(as_text=True))
        token = ((step1.get_json() or {}).get("data") or {}).get("confirmation_token")
        self.assertTrue(token)

        with client.session_transaction() as sess:
            sess["account_delete_token_expires_at"] = 1

        step2 = client.delete(
            "/api/account",
            json={"password": "Password123!", "confirmation_token": token},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step2.status_code, 410, step2.get_data(as_text=True))
        self.assertEqual((step2.get_json() or {}).get("code"), "CONFIRMATION_TOKEN_EXPIRED")
        self.assertEqual((step2.get_json() or {}).get("error_code"), "CONFIRMATION_TOKEN_EXPIRED")

    def test_account_delete_2fa_path_requires_totp_code(self):
        self._create_user("delete-2fa@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "delete-2fa@example.com", "Password123!")

        setup = self._post(client, "/api/auth/2fa/setup", json={})
        secret = (setup.get_json() or {}).get("secret_b32")
        self.assertTrue(secret)
        confirm = self._post(client, "/api/auth/2fa/confirm", json={"code": pyotp.TOTP(secret).now()})
        self.assertEqual(confirm.status_code, 200, confirm.get_data(as_text=True))

        missing_totp = client.delete(
            "/api/account",
            json={"password": "Password123!"},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(missing_totp.status_code, 401, missing_totp.get_data(as_text=True))
        self.assertEqual((missing_totp.get_json() or {}).get("code"), "INVALID_TOTP_CODE")
        self.assertEqual((missing_totp.get_json() or {}).get("error_code"), "INVALID_TOTP_CODE")

        step1 = client.delete(
            "/api/account",
            json={"password": "Password123!", "totp_code": pyotp.TOTP(secret).now()},
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step1.status_code, 202, step1.get_data(as_text=True))
        token = ((step1.get_json() or {}).get("data") or {}).get("confirmation_token")
        self.assertTrue(token)

        step2 = client.delete(
            "/api/account",
            json={
                "password": "Password123!",
                "totp_code": pyotp.TOTP(secret).now(),
                "confirmation_token": token,
            },
            headers=self._csrf_headers(client),
        )
        self.assertEqual(step2.status_code, 200, step2.get_data(as_text=True))
        self.assertTrue(((step2.get_json() or {}).get("data") or {}).get("deleted"))


if __name__ == "__main__":
    unittest.main()
