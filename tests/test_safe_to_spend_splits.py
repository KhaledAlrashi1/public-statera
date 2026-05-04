from decimal import Decimal

from preflight_base import PreflightApiTestBase


class SafeToSpendSplitTests(PreflightApiTestBase):
    def test_split_legs_fully_counted_without_double_count(self):
        self._create_user("safe-splits@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "safe-splits@example.com", "Password123!")

        profile = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": "500.000", "payday_day": None},
        )
        self.assertEqual(profile.status_code, 200, profile.get_data(as_text=True))

        for name, category, amount in (
            ("Split Food 1", "Food", "30.000"),
            ("Split Health", "Health", "20.000"),
            ("Split Food 2", "Food", "10.000"),
        ):
            created = self._post(
                client,
                "/api/transactions/create",
                json={
                    "date": "2026-03-05",
                    "name": name,
                    "category": category,
                    "amount_kd": amount,
                },
            )
            self.assertEqual(created.status_code, 201, created.get_data(as_text=True))

        budget = self._post(
            client,
            "/api/budgets",
            json={
                "month": "2026-03",
                "items": [
                    {"category": "Food", "amount_kd": "80.000"},
                    {"category": "Health", "amount_kd": "40.000"},
                ],
            },
        )
        self.assertEqual(budget.status_code, 200, budget.get_data(as_text=True))

        resp = client.get("/api/safe-to-spend?month=2026-03")
        self.assertEqual(resp.status_code, 200, resp.get_data(as_text=True))
        data = ((resp.get_json() or {}).get("data")) or {}
        self.assertEqual(Decimal(str(data.get("actual_spend_kd"))), Decimal("60.000"))

        cat_resp = client.get("/api/spend-by-category?month=2026-03")
        self.assertEqual(cat_resp.status_code, 200, cat_resp.get_data(as_text=True))
        cats = (((cat_resp.get_json() or {}).get("data")) or {}).get("items") or {}
        self.assertEqual(Decimal(str(cats.get("Food"))), Decimal("40.000"))
        self.assertEqual(Decimal(str(cats.get("Health"))), Decimal("20.000"))
        self.assertEqual(
            sum(Decimal(str(value)) for value in cats.values()),
            Decimal("60.000"),
        )
