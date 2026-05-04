import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from preflight_base import PreflightApiTestBase


class AccountOverviewApiTests(PreflightApiTestBase):
    def _ensure_category(self, user_id: int, name: str) -> int:
        from backend.models import Category

        category = Category.query.filter_by(user_id=user_id, name=name).first()
        if category:
            return int(category.id)
        category = Category(user_id=user_id, name=name)
        self.db.session.add(category)
        self.db.session.flush()
        return int(category.id)

    def _create_connection(self, *, user_id: int, institution_name: str, status: str = "active") -> int:
        from backend.models import BankConnection

        conn = BankConnection(
            user_id=user_id,
            provider="fakebank",
            institution_name=institution_name,
            status=status,
            last_synced_at=datetime.now(timezone.utc),
        )
        self.db.session.add(conn)
        self.db.session.flush()
        return int(conn.id)

    def _add_transaction(
        self,
        *,
        user_id: int,
        txn_date: date,
        category_name: str,
        amount_kd: str,
        name: str,
        source: str = "manual",
        connection_id: int | None = None,
        provider_tx_id: str | None = None,
    ) -> int:
        from backend.models import Transaction, BankSyncRun, RawBankTransaction

        amount = Decimal(amount_kd).quantize(Decimal("0.001"))
        category_id = self._ensure_category(user_id, category_name)
        txn = Transaction(
            user_id=user_id,
            date=txn_date,
            category_id=category_id,
            name=name,
            name_key=name.lower(),
            amount_kd=amount,
            source=source,
        )
        self.db.session.add(txn)
        self.db.session.flush()

        if connection_id is not None:
            run = BankSyncRun(
                connection_id=connection_id,
                user_id=user_id,
                status="committed",
                staged_count=1,
                committed_count=1,
                created_at=datetime.now(timezone.utc),
                committed_at=datetime.now(timezone.utc),
            )
            self.db.session.add(run)
            self.db.session.flush()
            self.db.session.add(
                RawBankTransaction(
                    connection_id=connection_id,
                    sync_run_id=run.id,
                    user_id=user_id,
                    provider_tx_id=provider_tx_id or f"provider-{txn.id}",
                    date=txn_date,
                    description=name,
                    amount_kd=amount,
                    status="committed",
                    transaction_id=txn.id,
                )
            )

        self.db.session.commit()
        return int(txn.id)

    def test_account_overview_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/analytics/account-overview")
        self.assertEqual(res.status_code, 401)

    def test_account_overview_aggregates_multi_source_and_connections(self):
        user_id = self._create_user("overview@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "overview@example.com", "Password123!")

        today = date.today()
        month_key = f"{today.year}-{today.month:02d}"
        prev_month_date = (today.replace(day=1) - timedelta(days=1)).replace(day=10)

        with self.app.app_context():
            nbk_id = self._create_connection(user_id=user_id, institution_name="NBK", status="active")
            self._create_connection(user_id=user_id, institution_name="KFH", status="active")
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(10, today.day or 1)),
                category_name="Groceries",
                amount_kd="40.000",
                name="Manual Groceries",
                source="manual",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(11, today.day or 1)),
                category_name="Transport",
                amount_kd="20.000",
                name="CSV Taxi",
                source="csv_import",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(12, today.day or 1)),
                category_name="Groceries",
                amount_kd="60.000",
                name="NBK Market",
                source="bank_import",
                connection_id=nbk_id,
                provider_tx_id="nbk-1",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(13, today.day or 1)),
                category_name="Income: Salary",
                amount_kd="200.000",
                name="NBK Salary",
                source="bank_import",
                connection_id=nbk_id,
                provider_tx_id="nbk-2",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=prev_month_date,
                category_name="Groceries",
                amount_kd="30.000",
                name="NBK Old Month",
                source="bank_import",
                connection_id=nbk_id,
                provider_tx_id="nbk-old",
            )

        res = client.get(f"/api/analytics/account-overview?month={month_key}")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("month"), month_key)
        self.assertEqual(payload.get("total_spend_mtd"), "120.000")
        self.assertEqual(payload.get("total_income_mtd"), "200.000")

        accounts = payload.get("connected_accounts") or []
        self.assertEqual(len(accounts), 2)
        by_name = {row.get("institution_name"): row for row in accounts}
        self.assertEqual((by_name.get("NBK") or {}).get("transactions_mtd"), 2)
        self.assertEqual((by_name.get("NBK") or {}).get("spend_mtd"), "60.000")
        self.assertEqual((by_name.get("KFH") or {}).get("transactions_mtd"), 0)
        self.assertEqual((by_name.get("KFH") or {}).get("spend_mtd"), "0.000")

        manual_summary = payload.get("manual_entry_summary") or {}
        self.assertEqual(manual_summary.get("transactions_mtd"), 1)
        self.assertEqual(manual_summary.get("spend_mtd"), "40.000")

        top_categories = payload.get("top_categories") or []
        self.assertGreaterEqual(len(top_categories), 1)
        self.assertEqual((top_categories[0] or {}).get("category"), "Groceries")
        self.assertEqual((top_categories[0] or {}).get("amount_kd"), "100.000")

        trend = payload.get("month_trend") or []
        self.assertEqual(len(trend), 6)
        current_row = next((row for row in trend if row.get("month") == month_key), None)
        self.assertIsNotNone(current_row)
        self.assertEqual((current_row or {}).get("spend"), "120.000")
        self.assertEqual((current_row or {}).get("income"), "200.000")

    def test_account_overview_empty_state(self):
        self._create_user("overview-empty@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "overview-empty@example.com", "Password123!")

        res = client.get("/api/analytics/account-overview")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("total_spend_mtd"), "0.000")
        self.assertEqual(payload.get("total_income_mtd"), "0.000")
        self.assertEqual(payload.get("connected_accounts"), [])
        self.assertEqual(
            payload.get("manual_entry_summary"),
            {"transactions_mtd": 0, "spend_mtd": "0.000"},
        )
        trend = payload.get("month_trend") or []
        self.assertEqual(len(trend), 6)
        self.assertTrue(all(row.get("spend") == "0.000" for row in trend))
        self.assertTrue(all(row.get("income") == "0.000" for row in trend))

    def test_account_overview_groups_by_transaction_date_not_created_at_or_profile_timezone(self):
        user_id = self._create_user("overview-timezone@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "overview-timezone@example.com", "Password123!")

        with self.app.app_context():
            from backend.models import Transaction, UserProfile

            profile = UserProfile.query.filter_by(user_id=user_id).first()
            if profile is None:
                profile = UserProfile(user_id=user_id, timezone="America/New_York")
                self.db.session.add(profile)
            else:
                profile.timezone = "America/New_York"

            groceries_id = self._ensure_category(user_id, "Groceries")
            # Local 2026-02-28 23:00 in New York is 2026-03-01 04:00 UTC.
            # Analytics should still group by the stored transaction date.
            self.db.session.add(
                Transaction(
                    user_id=user_id,
                    date=date(2026, 2, 28),
                    category_id=groceries_id,
                    name="Late Night Grocery Run",
                    name_key="late night grocery run",
                    amount_kd=Decimal("18.750"),
                    source="manual",
                    created_at=datetime(2026, 3, 1, 4, 0, tzinfo=timezone.utc),
                    updated_at=datetime(2026, 3, 1, 4, 0, tzinfo=timezone.utc),
                )
            )
            self.db.session.commit()

        february = client.get("/api/analytics/account-overview?month=2026-02")
        self.assertEqual(february.status_code, 200, february.get_data(as_text=True))
        february_payload = february.get_json() or {}
        self.assertEqual(february_payload.get("month"), "2026-02")
        self.assertEqual(february_payload.get("total_spend_mtd"), "18.750")

        february_trend = february_payload.get("month_trend") or []
        february_row = next((row for row in february_trend if row.get("month") == "2026-02"), None)
        self.assertIsNotNone(february_row)
        self.assertEqual((february_row or {}).get("spend"), "18.750")

        march = client.get("/api/analytics/account-overview?month=2026-03")
        self.assertEqual(march.status_code, 200, march.get_data(as_text=True))
        march_payload = march.get_json() or {}
        self.assertEqual(march_payload.get("month"), "2026-03")
        self.assertEqual(march_payload.get("total_spend_mtd"), "0.000")

    def test_expense_breakdown_source_filter(self):
        user_id = self._create_user("overview-source@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "overview-source@example.com", "Password123!")

        today = date.today()
        month_key = f"{today.year}-{today.month:02d}"
        with self.app.app_context():
            conn_id = self._create_connection(user_id=user_id, institution_name="NBK")
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(7, today.day or 1)),
                category_name="Groceries",
                amount_kd="10.000",
                name="Manual Spend",
                source="manual",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(8, today.day or 1)),
                category_name="Groceries",
                amount_kd="25.000",
                name="CSV Spend",
                source="csv_import",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(9, today.day or 1)),
                category_name="Groceries",
                amount_kd="55.000",
                name="Bank Spend",
                source="bank_import",
                connection_id=conn_id,
                provider_tx_id="nbk-source-1",
            )
            self._add_transaction(
                user_id=user_id,
                txn_date=today.replace(day=min(10, today.day or 1)),
                category_name="Income: Salary",
                amount_kd="999.000",
                name="Income Row",
                source="bank_import",
                connection_id=conn_id,
                provider_tx_id="nbk-source-2",
            )

        bank_only = client.get(
            f"/api/expense-breakdown?dimension=category&range=month&month={month_key}&source=bank_import"
        )
        self.assertEqual(bank_only.status_code, 200, bank_only.get_data(as_text=True))
        payload = bank_only.get_json() or {}
        self.assertEqual(payload.get("source"), "bank_import")
        self.assertEqual(payload.get("total_kd"), 55.0)
        rows = payload.get("items") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("name"), "Groceries")
        self.assertEqual(rows[0].get("amount_kd"), 55.0)

        bad = client.get("/api/expense-breakdown?dimension=category&range=month&source=not_valid")
        self.assertEqual(bad.status_code, 400, bad.get_data(as_text=True))
        self.assertIn("source must be one of", (bad.get_json() or {}).get("error", ""))


if __name__ == "__main__":
    unittest.main()
