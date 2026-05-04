from decimal import Decimal

from preflight_base import PreflightApiTestBase


class AnalyticsTransactionAggregationTests(PreflightApiTestBase):
    def test_spend_by_category_no_double_count(self):
        self._create_user("analytics-aggregation@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "analytics-aggregation@example.com", "Password123!")

        for name, category, amount in (
            ("Food Spend", "Food", "50.000"),
            ("Transport Spend", "Transport", "30.000"),
        ):
            res = self._post(
                client,
                "/api/transactions/create",
                json={
                    "date": "2026-03-01",
                    "name": name,
                    "category": category,
                    "amount_kd": amount,
                },
            )
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        resp = client.get("/api/spend-by-category?month=2026-03")
        self.assertEqual(resp.status_code, 200, resp.get_data(as_text=True))
        data = (((resp.get_json() or {}).get("data")) or {}).get("items") or {}
        total = sum(Decimal(str(value)) for value in data.values())
        self.assertEqual(total, Decimal("80.000"))
