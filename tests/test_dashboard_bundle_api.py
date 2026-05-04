import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from preflight_base import PreflightApiTestBase

from backend import db


class DashboardBundleApiTests(PreflightApiTestBase):
    def _ensure_category(self, user_id: int, name: str, *, is_income: bool = False) -> int:
        from backend.models import Category

        category = Category.query.filter_by(user_id=user_id, name=name).first()
        if category:
            category.is_income = is_income
            db.session.flush()
            return int(category.id)

        category = Category(user_id=user_id, name=name, is_income=is_income)
        db.session.add(category)
        db.session.flush()
        return int(category.id)

    def _add_transaction(
        self,
        *,
        user_id: int,
        category_id: int,
        txn_date: date,
        name: str,
        amount_kd: str,
    ) -> None:
        from backend.models import Transaction

        amount = Decimal(amount_kd).quantize(Decimal("0.001"))
        txn = Transaction(
            user_id=user_id,
            date=txn_date,
            category_id=category_id,
            name=name,
            name_key=name.lower(),
            amount_kd=amount,
            source="manual",
        )
        db.session.add(txn)

    def test_dashboard_bundle_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/dashboard-bundle")
        self.assertEqual(res.status_code, 401)

    def test_dashboard_bundle_rejects_invalid_month(self):
        self._create_user("bundle-invalid@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "bundle-invalid@example.com", "Password123!")

        res = client.get("/api/dashboard-bundle?month=2026-2")
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))

    def test_dashboard_bundle_returns_combined_month_payload(self):
        user_id = self._create_user("bundle@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "bundle@example.com", "Password123!")

        today = date.today()
        month_key = f"{today.year}-{today.month:02d}"

        with self.app.app_context():
            from backend.budget_alerts import build_budget_alert_key
            from backend.models import Budget, DashboardSnapshot, DebtAccount, ProductEvent, UserProfile

            food_category_id = self._ensure_category(user_id, "Food")
            income_category_id = self._ensure_category(user_id, "Income: Salary", is_income=True)
            snapshot_computed_at = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)

            db.session.add(
                UserProfile(
                    user_id=user_id,
                    monthly_income_kd=Decimal("500.000"),
                    payday_day=25,
                    email_notifications_enabled=True,
                )
            )
            db.session.add(
                Budget(
                    user_id=user_id,
                    month=month_key,
                    category_id=food_category_id,
                    amount_kd=Decimal("100.000"),
                )
            )
            db.session.add(
                DebtAccount(
                    user_id=user_id,
                    name="Visa",
                    debt_type="credit_card",
                    balance_kd=Decimal("400.000"),
                    minimum_payment_kd=Decimal("25.000"),
                    due_day=20,
                    is_active=True,
                )
            )
            self._add_transaction(
                user_id=user_id,
                category_id=income_category_id,
                txn_date=today.replace(day=max(1, min(today.day, 5))),
                name="Salary",
                amount_kd="500.000",
            )
            self._add_transaction(
                user_id=user_id,
                category_id=food_category_id,
                txn_date=today.replace(day=max(1, min(today.day, 6))),
                name="Groceries",
                    amount_kd="80.000",
            )
            db.session.add(
                DashboardSnapshot(
                    user_id=user_id,
                    months_count=24,
                    window_end_month=month_key,
                    months_json=json.dumps([month_key]),
                    monthly_json=json.dumps([{"month": month_key, "income_kd": 500.0, "expense_kd": 80.0}]),
                    expense_by_category_json=json.dumps({month_key: {"Food": 80.0}}),
                    computed_at=snapshot_computed_at,
                )
            )
            db.session.add(
                ProductEvent(
                    user_id=user_id,
                    event_name="budget_alert",
                    properties_json=json.dumps(
                        {
                            "alert_key": build_budget_alert_key(month_key, food_category_id),
                            "month": month_key,
                            "category": "Food",
                            "category_id": food_category_id,
                            "budget_kd": "100.000",
                            "spent_kd": "95.000",
                            "ratio": 0.95,
                            "threshold": 0.9,
                        }
                    ),
                    event_ts=datetime.now(timezone.utc),
                )
            )
            db.session.commit()

        res = client.get(f"/api/dashboard-bundle?month={month_key}")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = ((res.get_json() or {}).get("data")) or {}

        self.assertEqual(payload.get("month"), month_key)
        self.assertEqual(payload.get("snapshot_computed_at"), snapshot_computed_at.isoformat())
        safe_to_spend = payload.get("safe_to_spend") or {}
        self.assertEqual(safe_to_spend.get("month"), month_key)
        self.assertEqual(safe_to_spend.get("monthly_income_kd"), "500.000")
        self.assertEqual(safe_to_spend.get("committed_kd"), "125.000")

        debt_summary = payload.get("debt_summary") or {}
        self.assertEqual(debt_summary.get("account_count"), 1)
        self.assertEqual(debt_summary.get("total_minimum_kd"), "25.000")

        budget = payload.get("budget") or {}
        self.assertEqual(budget.get("month"), month_key)
        self.assertEqual(len(budget.get("items") or []), 1)
        self.assertEqual((budget.get("items") or [])[0].get("category"), "Food")
        self.assertEqual((budget.get("profile_context") or {}).get("budget_total_kd"), 100.0)

        budget_alerts = payload.get("budget_alerts") or {}
        self.assertEqual(budget_alerts.get("month"), month_key)
        self.assertEqual(len(budget_alerts.get("items") or []), 1)
        self.assertEqual((budget_alerts.get("items") or [])[0].get("category"), "Food")

        account_overview = payload.get("account_overview") or {}
        self.assertEqual(account_overview.get("month"), month_key)
        self.assertEqual(account_overview.get("total_spend_mtd"), "80.000")
        self.assertEqual(account_overview.get("total_income_mtd"), "500.000")


if __name__ == "__main__":
    unittest.main()
