"""Tests for GET /api/snapshot — Financial Snapshot endpoint."""

from __future__ import annotations

import unittest
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from tests.preflight_base import PreflightApiTestBase


class SnapshotApiTests(PreflightApiTestBase):
    """Integration tests for the /api/snapshot endpoint."""

    def _register_and_login(self, client, email="snap@example.com", password="Pass1234!"):
        res = self._post(client, "/api/auth/register", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        self._login(client, email, password)

    def _add_transaction(self, client, amount_kd, is_income=False, days_ago=5):
        """Helper: POST a transaction via /api/transactions/create."""
        from datetime import date, timedelta
        txn_date = (date.today() - timedelta(days=days_ago)).isoformat()
        # Income categories must start with "income" (name-based detection) or have is_income=True.
        cat_name = "Income" if is_income else "Food"
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": txn_date,
                "name": "test txn",
                "category": cat_name,
                "amount_kd": str(amount_kd),
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    # ------------------------------------------------------------------
    # Auth guards
    # ------------------------------------------------------------------

    def test_requires_login(self):
        with self.app.test_client() as client:
            res = client.get("/api/snapshot")
            self.assertEqual(res.status_code, 401)

    # ------------------------------------------------------------------
    # Basic structure
    # ------------------------------------------------------------------

    def test_returns_expected_keys(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.get("/api/snapshot")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()["data"]
            self.assertIn("net_position", data)
            self.assertIn("cash_flow", data)
            self.assertIn("accounts", data)
            self.assertIn("generated_at", data)

    def test_net_position_keys(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.get("/api/snapshot")
            np = res.get_json()["data"]["net_position"]
            for key in ("income_total_kd", "expense_total_kd", "net_kd", "total_debt_kd", "total_savings_kd"):
                self.assertIn(key, np)

    def test_cash_flow_windows(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            cf = res = client.get("/api/snapshot").get_json()["data"]["cash_flow"]
            for window in ("30d", "60d", "90d"):
                self.assertIn(window, cf)
                for k in ("income_kd", "expense_kd", "net_kd"):
                    self.assertIn(k, cf[window])

    # ------------------------------------------------------------------
    # Net position accuracy
    # ------------------------------------------------------------------

    def test_net_position_computed_correctly(self):
        """Income 500 KD, expense 200 KD → net 300 KD."""
        with self.app.test_client() as client:
            self._register_and_login(client, "snap2@example.com")
            self._add_transaction(client, "500.000", is_income=True, days_ago=10)
            self._add_transaction(client, "200.000", is_income=False, days_ago=5)
            res = client.get("/api/snapshot")
            np = res.get_json()["data"]["net_position"]
            self.assertAlmostEqual(float(np["income_total_kd"]), 500.0, places=2)
            self.assertAlmostEqual(float(np["expense_total_kd"]), 200.0, places=2)
            self.assertAlmostEqual(float(np["net_kd"]), 300.0, places=2)

    # ------------------------------------------------------------------
    # Cash flow window
    # ------------------------------------------------------------------

    def test_cash_flow_30d_includes_recent_txns(self):
        """Transaction 5 days ago should appear in 30d window."""
        with self.app.test_client() as client:
            self._register_and_login(client, "snap3@example.com")
            self._add_transaction(client, "100.000", is_income=True, days_ago=5)
            cf = client.get("/api/snapshot").get_json()["data"]["cash_flow"]
            self.assertGreater(cf["30d"]["income_kd"], 0)

    def test_cash_flow_30d_excludes_old_txns(self):
        """Transaction 60 days ago should NOT appear in 30d window."""
        with self.app.test_client() as client:
            self._register_and_login(client, "snap4@example.com")
            self._add_transaction(client, "999.000", is_income=True, days_ago=60)
            cf = client.get("/api/snapshot").get_json()["data"]["cash_flow"]
            self.assertEqual(cf["30d"]["income_kd"], 0.0)
            # but should appear in 90d
            self.assertGreater(cf["90d"]["income_kd"], 0)

    # ------------------------------------------------------------------
    # Empty state
    # ------------------------------------------------------------------

    def test_empty_user_returns_zeroes(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "snap5@example.com")
            data = client.get("/api/snapshot").get_json()["data"]
            np = data["net_position"]
            self.assertEqual(float(np["net_kd"]), 0.0)
            self.assertEqual(float(np["total_debt_kd"]), 0.0)
            self.assertEqual(data["accounts"], [])

    # ------------------------------------------------------------------
    # Debt and savings reflected
    # ------------------------------------------------------------------

    def test_debt_total_included(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "snap6@example.com")
            # Add a debt account.
            self._post(
                client,
                "/api/debt-accounts",
                json={
                    "name": "Car Loan",
                    "debt_type": "car_loan",
                    "balance_kd": "2500.000",
                    "minimum_payment_kd": "100.000",
                },
            )
            np = client.get("/api/snapshot").get_json()["data"]["net_position"]
            self.assertAlmostEqual(float(np["total_debt_kd"]), 2500.0, places=2)

    # ------------------------------------------------------------------
    # accounts list
    # ------------------------------------------------------------------

    def test_accounts_list_is_list(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "snap7@example.com")
            accounts = client.get("/api/snapshot").get_json()["data"]["accounts"]
            self.assertIsInstance(accounts, list)


if __name__ == "__main__":
    unittest.main()
