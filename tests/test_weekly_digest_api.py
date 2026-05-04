import calendar
import unittest
from datetime import datetime, timedelta, timezone, date
from unittest.mock import patch
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class WeeklyDigestApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("weekly-digest@example.com", "Password123!")

    @staticmethod
    def _today() -> date:
        return datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()

    @classmethod
    def _week_bounds(cls) -> tuple[date, date]:
        today = cls._today()
        week_start = today - timedelta(days=today.weekday())
        return week_start, week_start + timedelta(days=6)

    @staticmethod
    def _clamped_month_day(year: int, month: int, preferred_day: int) -> date:
        day = max(1, min(preferred_day, calendar.monthrange(year, month)[1]))
        return date(year, month, day)

    @classmethod
    def _expected_days_until_payday(cls, payday_day: int) -> int:
        today = cls._today()
        this_month_payday = cls._clamped_month_day(today.year, today.month, payday_day)
        if today <= this_month_payday:
            return (this_month_payday - today).days

        next_year = today.year + (1 if today.month == 12 else 0)
        next_month = 1 if today.month == 12 else today.month + 1
        next_month_payday = cls._clamped_month_day(next_year, next_month, payday_day)
        return (next_month_payday - today).days

    def _set_profile(self, client, *, monthly_income_kd: str | None, payday_day: int | None):
        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": monthly_income_kd, "payday_day": payday_day},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _save_budget(self, client, month: str, amount_kd: str):
        res = self._post(
            client,
            "/api/budgets",
            json={
                "month": month,
                "items": [{"category": "Groceries", "amount_kd": amount_kd}],
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _create_expense(self, client, *, tx_date: date, name: str, category: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": tx_date.isoformat(),
                "name": name,
                "category": category,
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def test_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/weekly-digest")
        self.assertEqual(res.status_code, 401)

    def test_week_boundaries_are_monday_to_sunday(self):
        week_start, week_end = self._week_bounds()
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")
            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("week_start"), week_start.isoformat())
            self.assertEqual(data.get("week_end"), week_end.isoformat())

    def test_delta_pct_negative_when_spending_drops(self):
        week_start, _week_end = self._week_bounds()
        last_week_start = week_start - timedelta(days=7)
        today = self._today()
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")

            self._create_expense(
                client,
                tx_date=last_week_start + timedelta(days=1),
                name="Last Week Expense",
                category="Groceries",
                amount_kd="40.000",
            )
            self._create_expense(
                client,
                tx_date=today,
                name="This Week Expense",
                category="Groceries",
                amount_kd="20.000",
            )

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("this_week_expense_kd"), "20.000")
            self.assertEqual(data.get("last_week_expense_kd"), "40.000")
            self.assertEqual(data.get("delta_pct"), -50.0)

    def test_delta_pct_is_100_when_last_week_is_zero_and_this_week_positive(self):
        today = self._today()
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")

            self._create_expense(
                client,
                tx_date=today,
                name="Only This Week",
                category="Groceries",
                amount_kd="25.000",
            )

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("delta_pct"), 100.0)

    def test_top_categories_returns_top_three_sorted(self):
        today = self._today()
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")

            self._create_expense(client, tx_date=today, name="Food A", category="Food", amount_kd="20.000")
            self._create_expense(client, tx_date=today, name="Transport A", category="Transport", amount_kd="15.000")
            self._create_expense(client, tx_date=today, name="Bills A", category="Bills", amount_kd="10.000")
            self._create_expense(client, tx_date=today, name="Other A", category="Other", amount_kd="5.000")

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            top = data.get("top_categories") or []
            self.assertEqual(len(top), 3)
            self.assertEqual(top[0]["name"], "Food")
            self.assertEqual(top[1]["name"], "Transport")
            self.assertEqual(top[2]["name"], "Bills")

    def test_days_until_payday_null_when_not_set(self):
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")
            self._set_profile(client, monthly_income_kd="1200.000", payday_day=None)

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertIsNone(data.get("days_until_payday"))

    def test_days_until_payday_uses_profile_day(self):
        payday_day = 27
        expected = self._expected_days_until_payday(payday_day)

        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")
            self._set_profile(client, monthly_income_kd="1200.000", payday_day=payday_day)

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("days_until_payday"), expected)

    def test_includes_safe_to_spend_today_value(self):
        current = self._today()
        month_key = f"{current.year}-{current.month:02d}"
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")
            self._set_profile(client, monthly_income_kd="1000.000", payday_day=25)
            self._save_budget(client, month_key, amount_kd="300.000")

            res = client.get("/api/weekly-digest")
            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            safe_value = str(data.get("safe_to_spend_today_kd") or "")
            self.assertRegex(safe_value, r"^\d+\.\d{3}$")

    def test_uses_cached_safe_to_spend_payload_for_digest_value(self):
        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")

            with patch(
                "backend.routes.analytics._get_safe_to_spend_payload_cached",
                return_value={"daily_rate_kd": "9.999"},
            ) as mock_safe:
                res = client.get("/api/weekly-digest")

            self.assertEqual(res.status_code, 200)
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("safe_to_spend_today_kd"), "9.999")
            mock_safe.assert_called_once()

    def test_uses_profile_timezone_for_week_boundary_buckets(self):
        fixed_now_utc = datetime(2026, 1, 5, 4, 30, tzinfo=timezone.utc)

        with self.app.test_client() as client:
            self._login(client, "weekly-digest@example.com", "Password123!")
            self._post(
                client,
                "/api/auth/profile/update",
                json={"timezone": "America/New_York"},
            )
            self._create_expense(
                client,
                tx_date=date(2026, 1, 4),
                name="Sunday Groceries",
                category="Groceries",
                amount_kd="25.000",
            )

            with patch("backend.routes.analytics.shared.datetime") as mock_datetime:
                mock_datetime.now.return_value = fixed_now_utc
                res = client.get("/api/weekly-digest")

            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = (res.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("week_start"), "2025-12-29")
            self.assertEqual(data.get("week_end"), "2026-01-04")
            self.assertEqual(data.get("this_week_expense_kd"), "25.000")
            self.assertEqual(data.get("last_week_expense_kd"), "0.000")
            self.assertEqual(data.get("days_observed"), 7)


if __name__ == "__main__":
    unittest.main()
