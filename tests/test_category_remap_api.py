import unittest

from preflight_base import PreflightApiTestBase


class CategoryRemapApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("category-remap@example.com", "Password123!")

    def _create_category(self, client, name: str) -> int:
        res = self._post(client, "/api/categories", json={"name": name})
        self.assertIn(res.status_code, {200, 201}, res.get_data(as_text=True))
        item = ((res.get_json() or {}).get("data") or {}).get("item") or {}
        self.assertIsInstance(item.get("id"), int)
        return int(item["id"])

    def _create_transaction(self, client, *, category: str, name: str, amount_kd: str = "3.500") -> int:
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-03-11",
                "category": category,
                "name": name,
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        item = ((res.get_json() or {}).get("item") or {})
        self.assertIsInstance(item.get("id"), int)
        return int(item["id"])

    def _create_goal(self, client, *, name: str, linked_category: str) -> int:
        res = self._post(
            client,
            "/api/savings-goals",
            json={
                "name": name,
                "goal_type": "custom",
                "target_kd": "100.000",
                "current_kd": "5.000",
                "linked_category": linked_category,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        goal = (((res.get_json() or {}).get("data") or {}).get("goal") or {})
        self.assertIsInstance(goal.get("id"), int)
        return int(goal["id"])

    def test_remap_moves_transactions_updates_goals_and_can_archive_source(self):
        client = self.app.test_client()
        self._login(client, "category-remap@example.com", "Password123!")

        source_id = self._create_category(client, "Coffe")
        target_id = self._create_category(client, "Coffee")

        first_txn_id = self._create_transaction(client, category="Coffe", name="Morning typo")
        second_txn_id = self._create_transaction(client, category="Coffe", name="Afternoon typo", amount_kd="4.250")
        goal_id = self._create_goal(client, name="Coffee Budget", linked_category="Coffe")

        remap = self._post(
            client,
            f"/api/categories/{source_id}/remap",
            json={"target_id": target_id, "archive_source": True},
        )
        self.assertEqual(remap.status_code, 200, remap.get_data(as_text=True))
        data = (remap.get_json() or {}).get("data") or {}
        self.assertEqual(data.get("remapped_count"), 2)
        self.assertEqual(data.get("goal_count"), 1)
        self.assertTrue(data.get("source_archived"))

        with self.app.app_context():
            from backend.models import Category, SavingsGoal, Transaction

            first_txn = self.db.session.get(Transaction, first_txn_id)
            second_txn = self.db.session.get(Transaction, second_txn_id)
            goal = self.db.session.get(SavingsGoal, goal_id)
            source = self.db.session.get(Category, source_id)

            self.assertIsNotNone(first_txn)
            self.assertIsNotNone(second_txn)
            self.assertIsNotNone(goal)
            self.assertIsNotNone(source)
            self.assertEqual(int(first_txn.category_id), target_id)
            self.assertEqual(int(second_txn.category_id), target_id)
            self.assertEqual(int(goal.linked_category_id), target_id)
            self.assertTrue(bool(source.is_archived))

    def test_remap_with_cross_user_target_returns_404(self):
        self._create_user("category-remap-other@example.com", "Password123!")

        client_a = self.app.test_client()
        self._login(client_a, "category-remap@example.com", "Password123!")
        source_id = self._create_category(client_a, "Source Only")

        client_b = self.app.test_client()
        self._login(client_b, "category-remap-other@example.com", "Password123!")
        foreign_target_id = self._create_category(client_b, "Foreign Target")

        remap = self._post(
            client_a,
            f"/api/categories/{source_id}/remap",
            json={"target_id": foreign_target_id},
        )
        self.assertEqual(remap.status_code, 404, remap.get_data(as_text=True))

    def test_remap_with_cross_user_source_returns_404(self):
        self._create_user("category-remap-other@example.com", "Password123!")

        client_a = self.app.test_client()
        self._login(client_a, "category-remap@example.com", "Password123!")
        own_target_id = self._create_category(client_a, "Owned Target")

        client_b = self.app.test_client()
        self._login(client_b, "category-remap-other@example.com", "Password123!")
        foreign_source_id = self._create_category(client_b, "Foreign Source")

        remap = self._post(
            client_a,
            f"/api/categories/{foreign_source_id}/remap",
            json={"target_id": own_target_id},
        )
        self.assertEqual(remap.status_code, 404, remap.get_data(as_text=True))

    def test_remap_to_nonexistent_target_returns_404(self):
        client = self.app.test_client()
        self._login(client, "category-remap@example.com", "Password123!")
        source_id = self._create_category(client, "Typpo")

        remap = self._post(
            client,
            f"/api/categories/{source_id}/remap",
            json={"target_id": 999999},
        )
        self.assertEqual(remap.status_code, 404, remap.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
