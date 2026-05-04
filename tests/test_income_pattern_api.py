import calendar
import unittest
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class IncomePatternApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("income-pattern@example.com", "Password123!")

    @staticmethod
    def _month_date_iso(months_back: int, day: int) -> str:
        today = datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()
        year = today.year
        month = today.month - months_back
        while month <= 0:
            month += 12
            year -= 1
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(day, last_day)).isoformat()

    def _create_income(self, client, *, months_back: int, day: int, name: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": self._month_date_iso(months_back, day),
                "name": name,
                "category": "Income Salary",
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def _create_expense(self, client, *, months_back: int, day: int, name: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": self._month_date_iso(months_back, day),
                "name": name,
                "category": "Groceries",
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def test_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/income-pattern")
        self.assertEqual(res.status_code, 401)

    def test_returns_not_detected_when_no_income_data(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertFalse(data.get("detected"))
            self.assertEqual(data.get("suggested_monthly_income_kd"), None)
            self.assertEqual(data.get("evidence_months"), 0)

    def test_returns_not_detected_when_income_exists_for_one_month_only(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            self._create_income(client, months_back=0, day=25, name="Salary", amount_kd="1200.000")
            self._create_income(client, months_back=0, day=10, name="Salary", amount_kd="1200.000")

            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertFalse(data.get("detected"))
            self.assertEqual(data.get("evidence_months"), 1)

    def test_detects_consistent_salary_and_payday_hint(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            self._create_income(client, months_back=0, day=27, name="Salary", amount_kd="1200.000")
            self._create_income(client, months_back=1, day=27, name="Salary", amount_kd="1205.000")
            self._create_income(client, months_back=2, day=27, name="Salary", amount_kd="1198.000")
            self._create_expense(client, months_back=0, day=15, name="Salary Grocery", amount_kd="99.000")

            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}

            self.assertTrue(data.get("detected"))
            self.assertEqual(data.get("largest_income_name"), "Salary")
            self.assertEqual(data.get("suggested_monthly_income_kd"), "1201.000")
            self.assertEqual(data.get("suggested_payday_day"), 27)
            self.assertEqual(data.get("confidence"), "high")
            self.assertEqual(data.get("evidence_months"), 3)

    def test_marks_low_confidence_for_high_variance_income(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            self._create_income(client, months_back=0, day=26, name="Variable Salary", amount_kd="1000.000")
            self._create_income(client, months_back=1, day=26, name="Variable Salary", amount_kd="1300.000")
            self._create_income(client, months_back=2, day=26, name="Variable Salary", amount_kd="900.000")

            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertTrue(data.get("detected"))
            self.assertEqual(data.get("confidence"), "low")

    def test_prefers_strongest_income_stream_when_multiple_exist(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            self._create_income(client, months_back=0, day=27, name="Salary", amount_kd="1000.000")
            self._create_income(client, months_back=1, day=27, name="Salary", amount_kd="1000.000")
            self._create_income(client, months_back=2, day=27, name="Salary", amount_kd="1000.000")

            self._create_income(client, months_back=0, day=12, name="Bonus", amount_kd="300.000")
            self._create_income(client, months_back=1, day=12, name="Bonus", amount_kd="300.000")

            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertTrue(data.get("detected"))
            self.assertEqual(data.get("largest_income_name"), "Salary")
            self.assertEqual(data.get("suggested_monthly_income_kd"), "1000.000")

    def test_biweekly_stream_is_scaled_to_monthly_estimate(self):
        with self.app.test_client() as client:
            self._login(client, "income-pattern@example.com", "Password123!")
            self._create_income(client, months_back=0, day=3, name="Freelance", amount_kd="500.000")
            self._create_income(client, months_back=0, day=17, name="Freelance", amount_kd="500.000")
            self._create_income(client, months_back=1, day=3, name="Freelance", amount_kd="500.000")
            self._create_income(client, months_back=1, day=17, name="Freelance", amount_kd="500.000")

            res = client.get("/api/income-pattern")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertTrue(data.get("detected"))
            self.assertEqual(data.get("largest_income_name"), "Freelance")
            self.assertEqual(data.get("suggested_monthly_income_kd"), "1000.000")


if __name__ == "__main__":
    unittest.main()
