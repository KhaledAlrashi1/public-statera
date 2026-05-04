import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from preflight_base import PreflightApiTestBase

_DEFAULT_PROFILE_TZ = ZoneInfo("Asia/Kuwait")


class IncomeConsistencyApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("income-consistency@example.com", "Password123!")

    @staticmethod
    def _current_month_key() -> str:
        today = datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date()
        return f"{today.year}-{today.month:02d}"

    @staticmethod
    def _today_iso() -> str:
        return datetime.now(timezone.utc).astimezone(_DEFAULT_PROFILE_TZ).date().isoformat()

    def _set_profile_income(self, client, *, monthly_income_kd: str, payday_day: int):
        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": monthly_income_kd, "payday_day": payday_day},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _save_budget(self, client, month: str, *, amount_kd: str):
        res = self._post(
            client,
            "/api/budgets",
            json={
                "month": month,
                "items": [{"category": "Groceries", "amount_kd": amount_kd}],
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _create_income_transaction(self, client, *, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": self._today_iso(),
                "name": "Salary",
                "category": "Income Salary",
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def _income_pattern_payload(self, client) -> dict:
        res = client.get("/api/income-pattern")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return (res.get_json() or {}).get("data") or {}

    def _safe_to_spend_payload(self, client, month: str) -> dict:
        res = client.get(f"/api/safe-to-spend?month={month}")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return (res.get_json() or {}).get("data") or {}

    def _dashboard_bundle_payload(self, client, month: str) -> dict:
        res = client.get(f"/api/dashboard-bundle?month={month}")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return (res.get_json() or {}).get("data") or {}

    def test_safe_to_spend_income_pattern_and_dashboard_bundle_share_income_resolution(self):
        with self.app.test_client() as client:
            self._login(client, "income-consistency@example.com", "Password123!")
            month = self._current_month_key()

            self._set_profile_income(client, monthly_income_kd="1800.000", payday_day=25)
            self._save_budget(client, month, amount_kd="300.000")

            safe_payload = self._safe_to_spend_payload(client, month)
            bundle_payload = self._dashboard_bundle_payload(client, month)
            bundle_safe_payload = (bundle_payload.get("safe_to_spend") or {})
            income_pattern_payload = self._income_pattern_payload(client)

            self.assertEqual(safe_payload.get("monthly_income_kd"), "1800.000")
            self.assertEqual(safe_payload.get("income_source"), "declared_in_profile")
            self.assertFalse(safe_payload.get("income_auto_detected"))
            self.assertEqual(bundle_safe_payload.get("monthly_income_kd"), "1800.000")
            self.assertEqual(bundle_safe_payload.get("income_source"), "declared_in_profile")
            self.assertFalse(bundle_safe_payload.get("income_auto_detected"))
            self.assertEqual(income_pattern_payload.get("monthly_income_kd"), "1800.000")
            self.assertEqual(income_pattern_payload.get("income_source"), "declared_in_profile")
            self.assertFalse(income_pattern_payload.get("income_auto_detected"))

            self._create_income_transaction(client, amount_kd="1200.000")

            refreshed_safe_payload = self._safe_to_spend_payload(client, month)
            refreshed_bundle_payload = self._dashboard_bundle_payload(client, month)
            refreshed_bundle_safe_payload = (refreshed_bundle_payload.get("safe_to_spend") or {})
            refreshed_income_pattern_payload = self._income_pattern_payload(client)

            self.assertEqual(refreshed_safe_payload.get("monthly_income_kd"), "1200.000")
            self.assertEqual(refreshed_safe_payload.get("income_source"), "detected_from_transactions")
            self.assertTrue(refreshed_safe_payload.get("income_auto_detected"))
            self.assertEqual(refreshed_bundle_safe_payload.get("monthly_income_kd"), "1200.000")
            self.assertEqual(refreshed_bundle_safe_payload.get("income_source"), "detected_from_transactions")
            self.assertTrue(refreshed_bundle_safe_payload.get("income_auto_detected"))
            self.assertEqual(refreshed_income_pattern_payload.get("monthly_income_kd"), "1200.000")
            self.assertEqual(refreshed_income_pattern_payload.get("income_source"), "detected_from_transactions")
            self.assertTrue(refreshed_income_pattern_payload.get("income_auto_detected"))


if __name__ == "__main__":
    unittest.main()
