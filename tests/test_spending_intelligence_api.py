"""Tests for GET /api/spending-intelligence — Spending Intelligence endpoint."""

from __future__ import annotations

import unittest
from datetime import date, timedelta

from tests.preflight_base import PreflightApiTestBase


class SpendingIntelligenceApiTests(PreflightApiTestBase):
    """Integration tests for the /api/spending-intelligence endpoint."""

    def _register_and_login(self, client, email="si@example.com", password="Pass1234!"):
        res = self._post(client, "/api/auth/register", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        self._login(client, email, password)

    def _add_expense(self, client, amount_kd, category="Food", name="Test txn", days_ago=5, merchant=None):
        txn_date = (date.today() - timedelta(days=days_ago)).isoformat()
        return self._add_expense_on(
            client,
            amount_kd,
            txn_date=txn_date,
            category=category,
            name=name,
            merchant=merchant,
        )

    def _add_expense_on(
        self,
        client,
        amount_kd,
        *,
        txn_date,
        category="Food",
        name="Test txn",
        merchant=None,
    ):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": txn_date,
                "name": name,
                "category": category,
                "amount_kd": str(amount_kd),
                "merchant": merchant,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    # ------------------------------------------------------------------
    # Auth guard
    # ------------------------------------------------------------------

    def test_requires_login(self):
        with self.app.test_client() as client:
            res = client.get("/api/spending-intelligence")
            self.assertEqual(res.status_code, 401)

    # ------------------------------------------------------------------
    # Basic structure
    # ------------------------------------------------------------------

    def test_returns_expected_keys(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.get("/api/spending-intelligence")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()["data"]
            for key in (
                "month",
                "prev_month",
                "top_merchants",
                "category_benchmarks",
                "category_deltas",
                "recurring_bills",
                "generated_at",
            ):
                self.assertIn(key, data)

    def test_top_merchants_is_list(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si2@example.com")
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertIsInstance(data["top_merchants"], list)

    def test_category_benchmarks_is_list(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si3b@example.com")
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertIsInstance(data["category_benchmarks"], list)

    def test_category_deltas_is_list(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si3@example.com")
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertIsInstance(data["category_deltas"], list)

    def test_recurring_bills_is_list(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si4@example.com")
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertIsInstance(data["recurring_bills"], list)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def test_invalid_month_returns_400(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si5@example.com")
            res = client.get("/api/spending-intelligence?month=not-a-month")
            self.assertEqual(res.status_code, 400)

    def test_valid_month_param_accepted(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si6@example.com")
            res = client.get("/api/spending-intelligence?month=2026-01")
            self.assertEqual(res.status_code, 200)
            data = res.get_json()["data"]
            self.assertEqual(data["month"], "2026-01")
            self.assertEqual(data["prev_month"], "2025-12")

    # ------------------------------------------------------------------
    # Category deltas
    # ------------------------------------------------------------------

    def test_category_delta_for_new_spending(self):
        """Spending this month with nothing last month → positive delta."""
        with self.app.test_client() as client:
            self._register_and_login(client, "si7@example.com")
            self._add_expense(client, "300.000", category="Dining", name="Restaurant", days_ago=3)
            data = client.get("/api/spending-intelligence").get_json()["data"]
            deltas = {d["category"]: d for d in data["category_deltas"]}
            self.assertIn("Dining", deltas)
            self.assertGreater(deltas["Dining"]["delta_kd"], 0)

    def test_category_delta_keys(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si8@example.com")
            self._add_expense(client, "100.000", category="Groceries", days_ago=2)
            data = client.get("/api/spending-intelligence").get_json()["data"]
            if data["category_deltas"]:
                d = data["category_deltas"][0]
                for k in ("category", "current_kd", "previous_kd", "delta_kd", "delta_pct"):
                    self.assertIn(k, d)

    def test_category_benchmark_uses_trailing_average_window(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si8b@example.com")
            self._add_expense_on(
                client,
                "120.000",
                txn_date="2026-01-05",
                category="Groceries",
                name="Current month groceries",
            )
            self._add_expense_on(
                client,
                "90.000",
                txn_date="2025-12-05",
                category="Groceries",
                name="Last month groceries",
            )
            self._add_expense_on(
                client,
                "60.000",
                txn_date="2025-11-05",
                category="Groceries",
                name="Two months ago groceries",
            )
            data = client.get("/api/spending-intelligence?month=2026-01").get_json()["data"]
            benchmarks = {row["category"]: row for row in data["category_benchmarks"]}
            self.assertIn("Groceries", benchmarks)
            self.assertEqual(benchmarks["Groceries"]["current_kd"], 120.0)
            self.assertEqual(benchmarks["Groceries"]["average_kd"], 50.0)
            self.assertEqual(benchmarks["Groceries"]["delta_kd"], 70.0)

    # ------------------------------------------------------------------
    # Empty state
    # ------------------------------------------------------------------

    def test_empty_user_returns_empty_lists(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si9@example.com")
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertEqual(data["top_merchants"], [])
            self.assertEqual(data["category_benchmarks"], [])
            self.assertEqual(data["category_deltas"], [])
            self.assertEqual(data["recurring_bills"], [])

    # ------------------------------------------------------------------
    # Merchant capped at 5
    # ------------------------------------------------------------------

    def test_top_merchants_capped_at_5(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si10@example.com")
            for i in range(7):
                self._add_expense(
                    client,
                    "50.000",
                    name=f"Merchant{i}",
                    days_ago=i + 1,
                )
            data = client.get("/api/spending-intelligence").get_json()["data"]
            self.assertLessEqual(len(data["top_merchants"]), 5)

    def test_top_merchants_include_transaction_count(self):
        with self.app.test_client() as client:
            self._register_and_login(client, "si11@example.com")
            self._add_expense(client, "25.000", merchant="Coffee Lab", name="Coffee 1", days_ago=2)
            self._add_expense(client, "15.000", merchant="Coffee Lab", name="Coffee 2", days_ago=1)
            data = client.get("/api/spending-intelligence").get_json()["data"]
            top_merchants = {row["merchant"]: row for row in data["top_merchants"]}
            self.assertIn("Coffee Lab", top_merchants)
            self.assertEqual(top_merchants["Coffee Lab"]["transaction_count"], 2)


if __name__ == "__main__":
    unittest.main()
