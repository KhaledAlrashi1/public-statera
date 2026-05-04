import calendar
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class AnalyticsWithoutItemsTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.user_id = self._create_user("analytics-no-items@example.com", "Password123!")

    @staticmethod
    def _month_date(months_back: int, day: int) -> date:
        today = datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(day, last_day))

    @staticmethod
    def _month_key(target_date: date) -> str:
        return f"{target_date.year}-{target_date.month:02d}"

    def _seed_workspace_without_items(self) -> dict[str, str]:
        from backend.models import Budget, Category, Merchant, Transaction, UserProfile

        today = datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()
        current_month = self._month_key(today)
        prev_month_date = self._month_date(1, min(today.day, 10) or 1)
        prev_month = self._month_key(prev_month_date)
        current_income_date = self._month_date(0, min(today.day, 5) or 1)
        prev_income_date = self._month_date(1, current_income_date.day)
        current_grocery_date = today if today.day == 1 else today - timedelta(days=1)
        current_netflix_date = today
        prev_grocery_date = self._month_date(1, min(today.day, 9) or 1)
        prev_netflix_date = self._month_date(1, min(today.day, 6) or 1)

        with self.app.app_context():
            income_category = Category(user_id=self.user_id, name="Income Salary", is_income=True)
            groceries_category = Category(user_id=self.user_id, name="Groceries", is_income=False)
            entertainment_category = Category(user_id=self.user_id, name="Entertainment", is_income=False)
            coop_merchant = Merchant(user_id=self.user_id, name="Coop")
            self.db.session.add_all([income_category, groceries_category, entertainment_category, coop_merchant])
            self.db.session.flush()

            self.db.session.add(
                UserProfile(
                    user_id=self.user_id,
                    monthly_income_kd=Decimal("1200.000"),
                    payday_day=25,
                    country="Kuwait",
                )
            )
            self.db.session.add(
                Budget(
                    user_id=self.user_id,
                    month=current_month,
                    category_id=groceries_category.id,
                    amount_kd=Decimal("100.000"),
                )
            )

            self.db.session.add_all([
                Transaction(
                    user_id=self.user_id,
                    date=current_income_date,
                    category_id=income_category.id,
                    merchant_id=None,
                    name="Salary",
                    name_key="salary",
                    amount_kd=Decimal("1000.000"),
                    source="manual",
                ),
                Transaction(
                    user_id=self.user_id,
                    date=prev_income_date,
                    category_id=income_category.id,
                    merchant_id=None,
                    name="Salary",
                    name_key="salary",
                    amount_kd=Decimal("1000.000"),
                    source="manual",
                ),
                Transaction(
                    user_id=self.user_id,
                    date=current_grocery_date,
                    category_id=groceries_category.id,
                    merchant_id=coop_merchant.id,
                    name="Coop Groceries",
                    name_key="coop groceries",
                    amount_kd=Decimal("40.000"),
                    source="manual",
                ),
                Transaction(
                    user_id=self.user_id,
                    date=prev_grocery_date,
                    category_id=groceries_category.id,
                    merchant_id=coop_merchant.id,
                    name="Coop Groceries",
                    name_key="coop groceries",
                    amount_kd=Decimal("30.000"),
                    source="manual",
                ),
                Transaction(
                    user_id=self.user_id,
                    date=current_netflix_date,
                    category_id=entertainment_category.id,
                    merchant_id=None,
                    name="Netflix",
                    name_key="netflix",
                    amount_kd=Decimal("10.000"),
                    source="manual",
                ),
                Transaction(
                    user_id=self.user_id,
                    date=prev_netflix_date,
                    category_id=entertainment_category.id,
                    merchant_id=None,
                    name="Netflix",
                    name_key="netflix",
                    amount_kd=Decimal("10.000"),
                    source="manual",
                ),
            ])
            self.db.session.commit()

        return {
            "current_month": current_month,
            "prev_month": prev_month,
        }

    def test_transaction_analytics_work_without_item_rows(self):
        months = self._seed_workspace_without_items()
        client = self.app.test_client()
        self._login(client, "analytics-no-items@example.com", "Password123!")

        dash_res = client.get(f"/api/dashboard-metrics?months=2&until={months['current_month']}")
        self.assertEqual(dash_res.status_code, 200, dash_res.get_data(as_text=True))
        dash_payload = (dash_res.get_json() or {}).get("data") or {}
        monthly = {row.get("month"): row for row in (dash_payload.get("monthly") or [])}
        self.assertEqual((monthly.get(months["current_month"]) or {}).get("income_kd"), 1000.0)
        self.assertEqual((monthly.get(months["current_month"]) or {}).get("expense_kd"), 50.0)
        self.assertEqual(
            ((dash_payload.get("expense_by_category") or {}).get(months["current_month"]) or {}).get("Groceries"),
            40.0,
        )

        by_category_res = client.get("/api/spend-by-category")
        self.assertEqual(by_category_res.status_code, 200, by_category_res.get_data(as_text=True))
        by_category = ((by_category_res.get_json() or {}).get("data") or {}).get("items") or {}
        self.assertEqual(by_category.get("Groceries"), 70.0)
        self.assertEqual(by_category.get("Entertainment"), 20.0)

        by_month_res = client.get("/api/spend-by-month")
        self.assertEqual(by_month_res.status_code, 200, by_month_res.get_data(as_text=True))
        by_month_rows = ((by_month_res.get_json() or {}).get("data") or {}).get("items") or []
        by_month = {row.get("month"): row.get("total_kd") for row in by_month_rows}
        self.assertEqual(by_month.get(months["current_month"]), 1050.0)
        self.assertEqual(by_month.get(months["prev_month"]), 1040.0)

        budget_metrics_res = client.get(f"/api/budget-metrics?month={months['current_month']}&range=all")
        self.assertEqual(budget_metrics_res.status_code, 200, budget_metrics_res.get_data(as_text=True))
        budget_metrics = (budget_metrics_res.get_json() or {}).get("data") or {}
        self.assertEqual((budget_metrics.get("spent_by_category") or {}).get("Groceries"), 40.0)
        self.assertEqual((budget_metrics.get("spent_by_category") or {}).get("Entertainment"), 10.0)

        overview_res = client.get(f"/api/analytics/account-overview?month={months['current_month']}")
        self.assertEqual(overview_res.status_code, 200, overview_res.get_data(as_text=True))
        overview = (overview_res.get_json() or {}).get("data") or {}
        self.assertEqual(overview.get("total_spend_mtd"), "50.000")
        self.assertEqual(overview.get("total_income_mtd"), "1000.000")
        self.assertEqual((overview.get("top_categories") or [])[0].get("category"), "Groceries")
        self.assertEqual((overview.get("top_categories") or [])[0].get("amount_kd"), "40.000")

        breakdown_res = client.get(
            f"/api/expense-breakdown?dimension=transaction&range=month&month={months['current_month']}"
        )
        self.assertEqual(breakdown_res.status_code, 200, breakdown_res.get_data(as_text=True))
        breakdown = (breakdown_res.get_json() or {}).get("data") or {}
        tx_items = {row.get("name"): row.get("amount_kd") for row in (breakdown.get("items") or [])}
        self.assertEqual(tx_items.get("Coop Groceries"), 40.0)
        self.assertEqual(tx_items.get("Netflix"), 10.0)

        trend_res = client.get(f"/api/expense-merchant-trend?merchant=Coop&months=2&until={months['current_month']}")
        self.assertEqual(trend_res.status_code, 200, trend_res.get_data(as_text=True))
        trend = (trend_res.get_json() or {}).get("data") or {}
        trend_series = {row.get("month"): row.get("total_kd") for row in (trend.get("series") or [])}
        self.assertEqual(trend_series.get(months["current_month"]), 40.0)
        self.assertEqual(trend_series.get(months["prev_month"]), 30.0)

        snapshot_res = client.get("/api/snapshot")
        self.assertEqual(snapshot_res.status_code, 200, snapshot_res.get_data(as_text=True))
        snapshot = (snapshot_res.get_json() or {}).get("data") or {}
        net_position = snapshot.get("net_position") or {}
        self.assertAlmostEqual(net_position.get("income_total_kd", 0), 2000.0, places=3)
        self.assertAlmostEqual(net_position.get("expense_total_kd", 0), 90.0, places=3)

        intelligence_res = client.get(f"/api/spending-intelligence?month={months['current_month']}")
        self.assertEqual(intelligence_res.status_code, 200, intelligence_res.get_data(as_text=True))
        intelligence = (intelligence_res.get_json() or {}).get("data") or {}
        self.assertEqual((intelligence.get("top_merchants") or [])[0].get("merchant"), "Coop")
        self.assertEqual((intelligence.get("top_merchants") or [])[0].get("total_kd"), 70.0)
        groceries_delta = next(
            row for row in (intelligence.get("category_deltas") or []) if row.get("category") == "Groceries"
        )
        self.assertEqual(groceries_delta.get("delta_kd"), 10.0)

    def test_planning_and_pattern_analytics_work_without_item_rows(self):
        months = self._seed_workspace_without_items()
        client = self.app.test_client()
        self._login(client, "analytics-no-items@example.com", "Password123!")

        safe_res = client.get(f"/api/safe-to-spend?month={months['current_month']}")
        self.assertEqual(safe_res.status_code, 200, safe_res.get_data(as_text=True))
        safe_payload = (safe_res.get_json() or {}).get("data") or {}
        self.assertEqual(safe_payload.get("monthly_income_kd"), "1000.000")
        self.assertEqual(safe_payload.get("income_source"), "detected_from_transactions")
        self.assertEqual(safe_payload.get("actual_spend_kd"), "50.000")
        self.assertEqual(safe_payload.get("total_budget_kd"), "100.000")

        bundle_res = client.get(f"/api/dashboard-bundle?month={months['current_month']}")
        self.assertEqual(bundle_res.status_code, 200, bundle_res.get_data(as_text=True))
        bundle = (bundle_res.get_json() or {}).get("data") or {}
        self.assertEqual(((bundle.get("safe_to_spend") or {}).get("monthly_income_kd")), "1000.000")
        self.assertEqual(((bundle.get("account_overview") or {}).get("total_spend_mtd")), "50.000")

        digest_res = client.get("/api/weekly-digest")
        self.assertEqual(digest_res.status_code, 200, digest_res.get_data(as_text=True))
        digest = (digest_res.get_json() or {}).get("data") or {}
        self.assertEqual((digest.get("top_categories") or [])[0].get("name"), "Groceries")

        income_pattern_res = client.get("/api/income-pattern")
        self.assertEqual(income_pattern_res.status_code, 200, income_pattern_res.get_data(as_text=True))
        income_pattern = (income_pattern_res.get_json() or {}).get("data") or {}
        self.assertTrue(income_pattern.get("detected"))
        self.assertEqual(income_pattern.get("largest_income_name"), "Salary")
        self.assertEqual(income_pattern.get("suggested_monthly_income_kd"), "1000.000")
        self.assertEqual(income_pattern.get("monthly_income_kd"), "1000.000")

        recurring_res = client.get("/api/recurring-patterns?days=120")
        self.assertEqual(recurring_res.status_code, 200, recurring_res.get_data(as_text=True))
        recurring = (recurring_res.get_json() or {}).get("data") or {}
        recurring_names = {row.get("name") for row in (recurring.get("patterns") or [])}
        self.assertIn("Netflix", recurring_names)


if __name__ == "__main__":
    unittest.main()
