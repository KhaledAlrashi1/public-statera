import unittest

from preflight_base import PreflightApiTestBase


class DemoDataApiTests(PreflightApiTestBase):
    def test_demo_data_load_populates_empty_account(self):
        user_id = self._create_user("demo-load@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "demo-load@example.com", "Password123!")

        res = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        summary = (payload.get("data") or {})
        self.assertEqual(summary.get("months_seeded"), 6)
        self.assertGreater(summary.get("transactions_created", 0), 40)
        self.assertGreater(summary.get("budgets_created", 0), 0)

        with self.app.app_context():
            from backend.models import Budget, DebtAccount, ProductEvent, SavingsGoal, Transaction, UserProfile

            profile = UserProfile.query.filter_by(user_id=user_id).first()
            self.assertIsNotNone(profile)
            self.assertEqual(str(profile.monthly_income_kd), "1800.000")
            self.assertEqual(profile.payday_day, 25)

            self.assertGreater(Transaction.query.filter_by(user_id=user_id).count(), 40)
            self.assertGreater(Budget.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DebtAccount.query.filter_by(user_id=user_id).count(), 1)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=user_id).count(), 1)
            self.assertIsNotNone(
                ProductEvent.query.filter_by(user_id=user_id, event_name="demo_data_loaded").first()
            )

    def test_demo_data_load_rejects_non_empty_account(self):
        self._create_user("demo-conflict@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "demo-conflict@example.com", "Password123!")

        first = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))

        second = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(second.status_code, 409, second.get_data(as_text=True))
        payload = second.get_json() or {}
        self.assertEqual(payload.get("error_code"), "demo_data_not_empty")

    def test_profile_reports_active_demo_workspace(self):
        self._create_user("demo-profile@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "demo-profile@example.com", "Password123!")

        load = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(load.status_code, 200, load.get_data(as_text=True))

        res = client.get("/api/auth/profile")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        demo_workspace = payload.get("demo_workspace") or {}
        self.assertTrue(demo_workspace.get("active"))
        self.assertGreater(demo_workspace.get("transactions", 0), 40)
        self.assertGreater(demo_workspace.get("budgets", 0), 0)
        self.assertIn("monthly_income_kd", demo_workspace.get("profile_seeded_fields") or [])

    def test_clear_demo_data_removes_seeded_artifacts_but_preserves_manual_entries(self):
        user_id = self._create_user("demo-clear@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "demo-clear@example.com", "Password123!")

        load = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(load.status_code, 200, load.get_data(as_text=True))

        manual = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-03-06",
                "category": "Food",
                "name": "Real Lunch",
                "amount_kd": "5.000",
                "items_json": [{"name": "Real Lunch", "category": "Food", "amount_kd": "5.000"}],
            },
        )
        self.assertEqual(manual.status_code, 201, manual.get_data(as_text=True))

        clear = self._post(client, "/api/auth/demo-data/clear", json={})
        self.assertEqual(clear.status_code, 200, clear.get_data(as_text=True))
        payload = clear.get_json() or {}
        data = payload.get("data") or {}
        self.assertGreater(data.get("transactions_cleared", 0), 40)
        self.assertGreater(data.get("budgets_cleared", 0), 0)

        with self.app.app_context():
            from backend.models import Budget, DebtAccount, SavingsGoal, Transaction, UserProfile

            self.assertEqual(Transaction.query.filter_by(user_id=user_id, source="demo").count(), 0)
            self.assertEqual(Transaction.query.filter_by(user_id=user_id, source="manual").count(), 1)
            self.assertEqual(Budget.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DebtAccount.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=user_id).count(), 0)
            profile = UserProfile.query.filter_by(user_id=user_id).first()
            self.assertIsNotNone(profile)
            self.assertIsNone(profile.monthly_income_kd)
            self.assertIsNone(profile.payday_day)
            self.assertIsNone(profile.country)

    def test_clear_demo_data_is_rate_limited_per_user(self):
        self._create_user("demo-clear-limit@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "demo-clear-limit@example.com", "Password123!")

        load = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(load.status_code, 200, load.get_data(as_text=True))

        first = self._post(client, "/api/auth/demo-data/clear", json={})
        second = self._post(client, "/api/auth/demo-data/clear", json={})
        third = self._post(client, "/api/auth/demo-data/clear", json={})
        fourth = self._post(client, "/api/auth/demo-data/clear", json={})

        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))
        self.assertEqual(second.status_code, 409, second.get_data(as_text=True))
        self.assertEqual(third.status_code, 409, third.get_data(as_text=True))
        self.assertEqual(fourth.status_code, 429, fourth.get_data(as_text=True))
        self.assertEqual(fourth.headers.get("X-RateLimit-Limit"), "3")
        self.assertEqual(fourth.headers.get("Retry-After"), "600")
        payload = fourth.get_json() or {}
        self.assertEqual(payload.get("error_code"), "rate_limit_exceeded")


if __name__ == "__main__":
    unittest.main()
