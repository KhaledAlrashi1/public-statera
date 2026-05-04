import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class RecurringPatternsApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("recurring@example.com", "Password123!")

    @staticmethod
    def _date_days_ago(days: int) -> str:
        return (datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date() - timedelta(days=days)).isoformat()

    def _create_expense(self, client, *, name: str, amount_kd: str, days_ago: int, category: str = "Groceries"):
        # This suite intentionally creates many rows in a tight loop.
        # Reset in-memory limiter so the test validates pattern logic, not throttling.
        from backend.security_ops import _rate_limiter
        with self.app.app_context():
            _rate_limiter.reset()
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": self._date_days_ago(days_ago),
                "name": name,
                "category": category,
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def test_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/recurring-patterns")
        self.assertEqual(res.status_code, 401)

    def test_validates_days_range(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")
            self.assertEqual(client.get("/api/recurring-patterns?days=29").status_code, 400)
            self.assertEqual(client.get("/api/recurring-patterns?days=366").status_code, 400)

    def test_returns_empty_when_no_matching_patterns(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")
            self._create_expense(client, name="One-Off Purchase", amount_kd="10.000", days_ago=5)

            res = client.get("/api/recurring-patterns?days=90")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("patterns"), [])

    def test_classifies_monthly_weekly_biweekly_and_irregular(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")

            # Monthly (30-day cadence)
            self._create_expense(client, name="Netflix", amount_kd="3.250", days_ago=90)
            self._create_expense(client, name="Netflix", amount_kd="3.250", days_ago=60)
            self._create_expense(client, name="Netflix", amount_kd="3.250", days_ago=30)

            # Weekly (7-day cadence)
            self._create_expense(client, name="Gym", amount_kd="5.500", days_ago=35)
            self._create_expense(client, name="Gym", amount_kd="5.500", days_ago=28)
            self._create_expense(client, name="Gym", amount_kd="5.500", days_ago=21)
            self._create_expense(client, name="Gym", amount_kd="5.500", days_ago=14)

            # Bi-weekly (14-day cadence)
            self._create_expense(client, name="Installment", amount_kd="22.000", days_ago=56)
            self._create_expense(client, name="Installment", amount_kd="22.000", days_ago=42)
            self._create_expense(client, name="Installment", amount_kd="22.000", days_ago=28)
            self._create_expense(client, name="Installment", amount_kd="22.000", days_ago=14)

            # Irregular cadence
            self._create_expense(client, name="Coffee Beans", amount_kd="7.000", days_ago=50)
            self._create_expense(client, name="Coffee Beans", amount_kd="7.000", days_ago=31)
            self._create_expense(client, name="Coffee Beans", amount_kd="7.000", days_ago=13)

            res = client.get("/api/recurring-patterns?days=120")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            patterns = ((res.get_json() or {}).get("data") or {}).get("patterns") or []
            by_name = {row["name"]: row for row in patterns}

            self.assertEqual(by_name["Netflix"]["frequency"], "monthly")
            self.assertEqual(by_name["Gym"]["frequency"], "weekly")
            self.assertEqual(by_name["Installment"]["frequency"], "bi-weekly")
            self.assertEqual(by_name["Coffee Beans"]["frequency"], "irregular")
            self.assertEqual(by_name["Netflix"]["group"], "Subscriptions")
            self.assertEqual(by_name["Installment"]["group"], "Loan Payments")

            self.assertEqual(by_name["Netflix"]["avg_amount_kd"], "3.250")
            self.assertEqual(by_name["Installment"]["avg_amount_kd"], "22.000")
            self.assertEqual(by_name["Gym"]["occurrences"], 4)

    def test_uses_category_and_name_hints_for_recurring_group(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")

            self._create_expense(
                client,
                name="MEW Electricity Bill",
                amount_kd="18.500",
                days_ago=60,
                category="Utilities",
            )
            self._create_expense(
                client,
                name="MEW Electricity Bill",
                amount_kd="18.500",
                days_ago=30,
                category="Utilities",
            )
            self._create_expense(
                client,
                name="Car Installment",
                amount_kd="75.000",
                days_ago=56,
                category="Debt",
            )
            self._create_expense(
                client,
                name="Car Installment",
                amount_kd="75.000",
                days_ago=28,
                category="Debt",
            )

            res = client.get("/api/recurring-patterns?days=90")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            patterns = ((res.get_json() or {}).get("data") or {}).get("patterns") or []
            by_name = {row["name"]: row for row in patterns}

            self.assertEqual(by_name["MEW Electricity Bill"]["group"], "Utilities")
            self.assertEqual(by_name["Car Installment"]["group"], "Loan Payments")

    def test_sorts_by_avg_amount_desc(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")
            self._create_expense(client, name="Low", amount_kd="2.000", days_ago=28)
            self._create_expense(client, name="Low", amount_kd="2.000", days_ago=14)
            self._create_expense(client, name="High", amount_kd="30.000", days_ago=28)
            self._create_expense(client, name="High", amount_kd="30.000", days_ago=14)

            res = client.get("/api/recurring-patterns?days=90")
            self.assertEqual(res.status_code, 200)
            patterns = ((res.get_json() or {}).get("data") or {}).get("patterns") or []
            self.assertGreaterEqual(len(patterns), 2)
            self.assertEqual(patterns[0]["name"], "High")
            self.assertEqual(patterns[1]["name"], "Low")

    def test_feature_flag_disabled_returns_empty(self):
        with self.app.test_client() as client:
            self._login(client, "recurring@example.com", "Password123!")
            self._create_expense(client, name="Netflix", amount_kd="3.250", days_ago=30)
            self._create_expense(client, name="Netflix", amount_kd="3.250", days_ago=15)

            self.app.config["ENABLE_RECURRING_PATTERNS"] = False
            try:
                res = client.get("/api/recurring-patterns?days=90")
                self.assertEqual(res.status_code, 200)
                data = (res.get_json() or {}).get("data") or {}
                self.assertEqual(data.get("patterns"), [])
            finally:
                self.app.config["ENABLE_RECURRING_PATTERNS"] = True


if __name__ == "__main__":
    unittest.main()
