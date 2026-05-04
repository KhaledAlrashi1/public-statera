import calendar
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

from backend.money_math import format_kd

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class SafeToSpendApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("safe@example.com", "Password123!")

    @staticmethod
    def _today_local():
        return datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()

    @classmethod
    def _current_month_key(cls) -> str:
        now = cls._today_local()
        return f"{now.year}-{now.month:02d}"

    @classmethod
    def _today_iso(cls) -> str:
        return cls._today_local().isoformat()

    @staticmethod
    def _next_month_key(month_key: str) -> str:
        year, month = int(month_key[:4]), int(month_key[5:7])
        if month == 12:
            return f"{year + 1}-01"
        return f"{year}-{month + 1:02d}"

    def _set_profile_income(self, client, *, income_kd: str | None):
        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": income_kd, "payday_day": None},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _create_income(self, client, *, amount_kd: str, name: str = "Salary"):
        self._create_transaction(client, category="Income Salary", amount_kd=amount_kd, name=name)

    def _save_budget(self, client, month: str, amount_kd: str = "300.000"):
        res = self._post(
            client,
            "/api/budgets",
            json={
                "month": month,
                "items": [
                    {"category": "Groceries", "amount_kd": amount_kd},
                ],
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _create_debt(self, client, *, name: str = "Card", minimum_payment_kd: str = "75.000"):
        res = self._post(
            client,
            "/api/debt-accounts",
            json={
                "name": name,
                "debt_type": "credit_card",
                "balance_kd": "1000.000",
                "minimum_payment_kd": minimum_payment_kd,
                "due_day": 15,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def _create_goal(
        self,
        client,
        *,
        name: str = "Goal",
        target_kd: str = "300.000",
        current_kd: str = "0.000",
        target_date: str | None = None,
        linked_category: str | None = None,
    ):
        res = self._post(
            client,
            "/api/savings-goals",
            json={
                "name": name,
                "goal_type": "custom",
                "target_kd": target_kd,
                "current_kd": current_kd,
                "target_date": target_date,
                "linked_category": linked_category,
                "notes": None,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        data = (res.get_json() or {}).get("data") or {}
        goal = data.get("goal") or {}
        return int(goal["id"])

    def _create_transaction(self, client, *, category: str, amount_kd: str, name: str = "Txn"):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": self._today_iso(),
                "name": name,
                "category": category,
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def test_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/safe-to-spend")
        self.assertEqual(res.status_code, 401)

    def test_validates_month_format(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            res = client.get("/api/safe-to-spend?month=2026-2")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_complete_data_returns_expected_values(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._save_budget(client, month, amount_kd="800.000")
            self._create_debt(client, minimum_payment_kd="75.000")
            self._create_transaction(client, category="Groceries", amount_kd="120.000", name="Expense")
            self._create_income(client, amount_kd="1200.000")

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("month"), month)
            self.assertEqual(data.get("monthly_income_kd"), "1200.000")
            self.assertEqual(data.get("total_budget_kd"), "800.000")
            self.assertEqual(data.get("debt_minimum_total_kd"), "75.000")
            self.assertEqual(data.get("savings_goal_count"), 0)
            self.assertEqual(data.get("savings_goal_monthly_total_kd"), "0.000")
            self.assertEqual(data.get("savings_goal_budget_covered_kd"), "0.000")
            self.assertEqual(data.get("savings_goal_reserve_kd"), "0.000")
            self.assertEqual(data.get("committed_kd"), "875.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("budget_allocations"), "800.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("debt_minimums"), "75.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("savings_goal_reserve"), "0.000")
            self.assertEqual(data.get("actual_spend_kd"), "120.000")
            self.assertEqual(data.get("remaining_budget_kd"), "205.000")
            self.assertTrue(data.get("data_complete"))
            self.assertNotIn("income_not_set", data.get("warnings") or [])
            self.assertNotIn("budgets_not_set", data.get("warnings") or [])

            days_remaining = int(data.get("days_remaining") or 0)
            expected_daily = format_kd(Decimal("205.000") / Decimal(max(days_remaining, 1)))
            self.assertEqual(data.get("daily_rate_kd"), expected_daily)

    def test_profile_income_does_not_override_detected_income(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._set_profile_income(client, income_kd="1800.000")
            self._create_income(client, amount_kd="1200.000")
            self._save_budget(client, month, amount_kd="300.000")

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("monthly_income_kd"), "1200.000")
            self.assertTrue(data.get("income_auto_detected"))

    def test_missing_income_marks_incomplete(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._save_budget(client, month, amount_kd="100.000")
            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertFalse(data.get("data_complete"))
            self.assertIsNone(data.get("monthly_income_kd"))
            self.assertIn("income_not_set", data.get("warnings") or [])
            self.assertEqual(data.get("remaining_budget_kd"), "0.000")
            self.assertEqual(data.get("daily_rate_kd"), "0.000")

    def test_zero_profile_income_is_treated_as_income_not_set(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._set_profile_income(client, income_kd="0.000")
            self._save_budget(client, month, amount_kd="100.000")

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertFalse(data.get("data_complete"))
            self.assertIsNone(data.get("monthly_income_kd"))
            self.assertIn("income_not_set", data.get("warnings") or [])
            self.assertEqual(data.get("remaining_budget_kd"), "0.000")
            self.assertEqual(data.get("daily_rate_kd"), "0.000")

    def test_missing_budgets_marks_incomplete(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._create_income(client, amount_kd="1000.000")
            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertFalse(data.get("data_complete"))
            self.assertIn("budgets_not_set", data.get("warnings") or [])

    def test_no_debts_adds_optional_warning_but_stays_complete(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._create_income(client, amount_kd="1000.000")
            self._save_budget(client, month, amount_kd="100.000")
            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertTrue(data.get("data_complete"))
            self.assertIn("debts_not_set_optional", data.get("warnings") or [])
            self.assertEqual(data.get("savings_goal_count"), 0)

    def test_goal_only_reserves_required_monthly_contribution(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            target_date = (self._today_local() + timedelta(days=61)).isoformat()
            self._create_income(client, amount_kd="1200.000")
            self._save_budget(client, month, amount_kd="800.000")
            self._create_goal(
                client,
                name="Vacation",
                target_kd="500.000",
                current_kd="200.000",
                target_date=target_date,
            )

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("debt_minimum_total_kd"), "0.000")
            self.assertEqual(data.get("savings_goal_count"), 1)
            self.assertEqual(data.get("savings_goal_monthly_total_kd"), "100.000")
            self.assertEqual(data.get("savings_goal_budget_covered_kd"), "0.000")
            self.assertEqual(data.get("savings_goal_reserve_kd"), "100.000")
            self.assertEqual(data.get("committed_kd"), "900.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("debt_minimums"), "0.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("savings_goal_reserve"), "100.000")
            self.assertEqual(data.get("remaining_budget_kd"), "300.000")

    def test_goal_pace_is_used_when_target_date_is_missing(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._create_income(client, amount_kd="1000.000")
            self._save_budget(client, month, amount_kd="300.000")
            goal_id = self._create_goal(
                client,
                name="Buffer",
                target_kd="500.000",
                current_kd="0.000",
                target_date=None,
            )

            deposit = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "90.000"},
            )
            self.assertEqual(deposit.status_code, 200, deposit.get_data(as_text=True))

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("savings_goal_monthly_total_kd"), "30.000")
            self.assertEqual(data.get("savings_goal_reserve_kd"), "30.000")
            self.assertEqual(data.get("committed_kd"), "330.000")
            self.assertEqual(data.get("remaining_budget_kd"), "670.000")

    def test_debt_and_goal_reserves_both_reduce_safe_to_spend(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            target_date = (self._today_local() + timedelta(days=61)).isoformat()
            self._create_income(client, amount_kd="1200.000")
            self._save_budget(client, month, amount_kd="800.000")
            self._create_debt(client, minimum_payment_kd="75.000")
            self._create_goal(
                client,
                name="Vacation",
                target_kd="500.000",
                current_kd="200.000",
                target_date=target_date,
            )
            self._create_transaction(client, category="Groceries", amount_kd="120.000", name="Expense")

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("debt_minimum_total_kd"), "75.000")
            self.assertEqual(data.get("savings_goal_reserve_kd"), "100.000")
            self.assertEqual(data.get("committed_kd"), "975.000")
            self.assertEqual(data.get("actual_spend_kd"), "120.000")
            self.assertEqual(data.get("remaining_budget_kd"), "105.000")

    def test_linked_goal_budget_prevents_double_counting(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            target_date = (self._today_local() + timedelta(days=61)).isoformat()
            self._create_income(client, amount_kd="1000.000")
            budget_res = self._post(
                client,
                "/api/budgets",
                json={
                    "month": month,
                    "items": [
                        {"category": "Groceries", "amount_kd": "300.000"},
                        {"category": "Savings", "amount_kd": "80.000"},
                    ],
                },
            )
            self.assertEqual(budget_res.status_code, 200, budget_res.get_data(as_text=True))
            self._create_goal(
                client,
                name="Emergency Buffer",
                target_kd="240.000",
                current_kd="0.000",
                target_date=target_date,
                linked_category="Savings",
            )

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}

            self.assertEqual(data.get("total_budget_kd"), "380.000")
            self.assertEqual(data.get("savings_goal_monthly_total_kd"), "80.000")
            self.assertEqual(data.get("savings_goal_budget_covered_kd"), "80.000")
            self.assertEqual(data.get("savings_goal_reserve_kd"), "0.000")
            self.assertEqual(data.get("committed_kd"), "380.000")
            self.assertEqual((data.get("committed_breakdown_kd") or {}).get("budget_allocations"), "380.000")
            self.assertEqual(data.get("remaining_budget_kd"), "620.000")

    def test_split_items_use_item_level_income_expense_classification(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            month = self._current_month_key()
            self._create_income(client, amount_kd="1000.000")
            self._save_budget(client, month, amount_kd="500.000")

            expense_res = self._post(
                client,
                "/api/transactions/create",
                json={
                    "date": self._today_iso(),
                    "name": "Groceries Expense",
                    "category": "Groceries",
                    "amount_kd": "10.000",
                },
            )
            self.assertEqual(expense_res.status_code, 201, expense_res.get_data(as_text=True))

            income_res = self._post(
                client,
                "/api/transactions/create",
                json={
                    "date": self._today_iso(),
                    "name": "Salary Adjustment",
                    "category": "Income Salary",
                    "amount_kd": "4.000",
                },
            )
            self.assertEqual(income_res.status_code, 201, income_res.get_data(as_text=True))

            res = client.get(f"/api/safe-to-spend?month={month}")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("actual_spend_kd"), "10.000")

    def test_future_month_returns_zero_elapsed_and_no_spend(self):
        with self.app.test_client() as client:
            self._login(client, "safe@example.com", "Password123!")
            current_month = self._current_month_key()
            next_month = self._next_month_key(current_month)
            year, month = int(next_month[:4]), int(next_month[5:7])
            self._save_budget(client, next_month, amount_kd="100.000")

            res = client.get(f"/api/safe-to-spend?month={next_month}")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("days_elapsed"), 0)
            self.assertEqual(data.get("days_remaining"), calendar.monthrange(year, month)[1])
            self.assertEqual(data.get("actual_spend_kd"), "0.000")


if __name__ == "__main__":
    unittest.main()
