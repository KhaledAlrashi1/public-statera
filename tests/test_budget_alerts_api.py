import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from preflight_base import PreflightApiTestBase

from backend import db


class BudgetAlertsApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.uid = self._create_user("alerts@example.com", "Password123!")
        self.now_utc = datetime.now(timezone.utc).replace(day=15, hour=9, minute=0, second=0, microsecond=0)
        self.month_key = f"{self.now_utc.year}-{self.now_utc.month:02d}"

    def _seed_budget_and_spend(self, *, spent_kd: Decimal):
        from backend.lib.categories import get_or_create_category
        from backend.lib.transactions import create_transaction_with_dup_check
        from backend.models import Budget

        with self.app.app_context():
            category = get_or_create_category("Food", self.uid)
            db.session.add(
                Budget(
                    user_id=self.uid,
                    month=self.month_key,
                    category_id=category.id,
                    amount_kd=Decimal("100.000"),
                )
            )

            tx_date = date(self.now_utc.year, self.now_utc.month, 10)
            txn, is_dup, err = create_transaction_with_dup_check(
                txn_date=tx_date,
                category_name="Food",
                name="Groceries",
                amount=spent_kd,
                user_id=self.uid,
                force=False,
            )
            self.assertIsNotNone(txn)
            self.assertFalse(is_dup)
            self.assertIsNone(err)
            db.session.commit()

    def test_check_budget_alerts_creates_alert_event_at_90pct_threshold(self):
        from backend.models import ProductEvent
        from backend.tasks import execute_check_budget_alerts

        self._seed_budget_and_spend(spent_kd=Decimal("92.000"))

        with self.app.app_context():
            result = execute_check_budget_alerts(now_utc=self.now_utc)

            self.assertEqual(result["month"], self.month_key)
            self.assertEqual(result["alerts_created"], 1)
            self.assertEqual(result["triggered"], 1)

            row = (
                ProductEvent.query
                .filter_by(user_id=self.uid, event_name="budget_alert")
                .order_by(ProductEvent.id.desc())
                .first()
            )
            self.assertIsNotNone(row)
            payload = json.loads(row.properties_json or "{}")
            self.assertEqual(payload.get("month"), self.month_key)
            self.assertEqual(payload.get("category"), "Food")
            self.assertGreaterEqual(float(payload.get("ratio") or 0), 0.9)

    def test_budget_alerts_api_list_and_dismiss(self):
        from backend.tasks import execute_check_budget_alerts

        self._seed_budget_and_spend(spent_kd=Decimal("92.000"))

        with self.app.app_context():
            execute_check_budget_alerts(now_utc=self.now_utc)

        with self.app.test_client() as client:
            self._login(client, "alerts@example.com", "Password123!")
            listed = client.get("/api/notifications/budget-alerts")
            self.assertEqual(listed.status_code, 200, listed.get_data(as_text=True))
            listed_data = ((listed.get_json() or {}).get("data")) or {}
            items = listed_data.get("items") or []
            self.assertEqual(len(items), 1)
            alert_id = items[0]["id"]
            self.assertEqual(items[0]["month"], self.month_key)
            self.assertEqual(items[0]["category"], "Food")

            dismiss = self._post(client, f"/api/notifications/budget-alerts/{alert_id}/dismiss", json={})
            self.assertEqual(dismiss.status_code, 200, dismiss.get_data(as_text=True))
            dismiss_data = ((dismiss.get_json() or {}).get("data")) or {}
            self.assertTrue(dismiss_data.get("dismissed"))

            listed_after = client.get("/api/notifications/budget-alerts")
            self.assertEqual(listed_after.status_code, 200, listed_after.get_data(as_text=True))
            listed_after_items = ((((listed_after.get_json() or {}).get("data")) or {}).get("items")) or []
            self.assertEqual(listed_after_items, [])

    def test_check_budget_alerts_is_idempotent_within_same_month(self):
        from backend.models import ProductEvent
        from backend.tasks import execute_check_budget_alerts

        self._seed_budget_and_spend(spent_kd=Decimal("92.000"))

        with self.app.app_context():
            first = execute_check_budget_alerts(now_utc=self.now_utc)
            second = execute_check_budget_alerts(now_utc=self.now_utc)
            rows = (
                ProductEvent.query
                .filter_by(user_id=self.uid, event_name="budget_alert")
                .all()
            )

        self.assertEqual(first["alerts_created"], 1)
        self.assertEqual(second["alerts_created"], 0)
        self.assertEqual(len(rows), 1)

    def test_check_budget_alerts_enqueues_budget_email_task(self):
        from backend.tasks import execute_check_budget_alerts

        self._seed_budget_and_spend(spent_kd=Decimal("95.000"))

        with self.app.app_context(), patch("backend.tasks.send_budget_alert_email.delay") as mock_delay:
            result = execute_check_budget_alerts(now_utc=self.now_utc)

        self.assertEqual(result["alerts_created"], 1)
        mock_delay.assert_called_once()
        kwargs = mock_delay.call_args.kwargs
        self.assertEqual(kwargs.get("user_id"), self.uid)
        self.assertEqual(kwargs.get("category"), "Food")


if __name__ == "__main__":
    unittest.main()
