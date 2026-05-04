import unittest
from sqlalchemy import inspect

from preflight_base import PreflightApiTestBase


class ItemsRemovedStage2Tests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("items-removed-stage2@example.com", "Password123!")

    def _login_client(self):
        client = self.app.test_client()
        self._login(client, "items-removed-stage2@example.com", "Password123!")
        return client

    def test_items_table_is_absent_and_item_routes_404(self):
        client = self._login_client()

        create_res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-10",
                "category": "Groceries",
                "name": "Market",
                "amount_kd": "7.000",
            },
        )
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = ((create_res.get_json() or {}).get("item") or {}).get("id")
        self.assertTrue(txn_id)

        with self.app.app_context():
            self.assertFalse(inspect(self.db.engine).has_table("items"))

        list_res = client.get(f"/api/transactions/{txn_id}/items")
        self.assertEqual(list_res.status_code, 404, list_res.get_data(as_text=True))

        update_res = self._post(
            client,
            "/api/items/999/update",
            json={"name": "Nope", "category": "Groceries", "amount_kd": "1.000"},
        )
        self.assertIn(update_res.status_code, {404, 405}, update_res.get_data(as_text=True))

    def test_transactions_search_returns_atomic_rows_even_with_expand_items(self):
        client = self._login_client()

        create_res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-10",
                "category": "Groceries",
                "name": "Market",
                "amount_kd": "7.000",
            },
        )
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = int(((create_res.get_json() or {}).get("item") or {}).get("id"))

        search_res = client.get("/api/transactions/search?expand_items=true&limit=50")
        self.assertEqual(search_res.status_code, 200, search_res.get_data(as_text=True))
        rows = (search_res.get_json() or {}).get("items") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("id"), txn_id)
        self.assertEqual(rows[0].get("transaction_id"), txn_id)
        self.assertEqual(rows[0].get("name"), "Market")
        self.assertEqual(rows[0].get("amount_kd"), "7.000")

    def test_import_commit_rejects_multi_item_rows(self):
        client = self._login_client()

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-02-10",
                        "category": "Groceries",
                        "name": "Weekly shop",
                        "amount_kd": "7.000",
                        "items": [
                            {"name": "Bread", "category": "Groceries", "amount_kd": "5.000"},
                            {"name": "Taxi", "category": "Transport", "amount_kd": "2.000"},
                        ],
                    }
                ]
            },
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_atomic_precheck_failed")
        row = (((payload.get("meta") or {}).get("row_results")) or [None])[0] or {}
        self.assertEqual(row.get("status"), "skipped_invalid")
        self.assertEqual(row.get("error_code"), "import_row_not_atomic")

    def test_template_suggestions_derive_singleton_items_from_transactions(self):
        client = self._login_client()

        create_res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-10",
                "merchant": "Cafe",
                "category": "Coffee",
                "name": "Latte",
                "amount_kd": "2.500",
            },
        )
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))

        with self.app.app_context():
            from backend.lib.suggestions import suggest_transaction_templates

            items = suggest_transaction_templates("lat", 1, limit=3)
        self.assertEqual(len(items), 1)
        first = items[0]
        self.assertEqual(first.get("name"), "Latte")
        self.assertEqual(first.get("merchant"), "Cafe")
        self.assertEqual(first.get("amount_kd"), "2.500")
        self.assertEqual(first.get("items"), [{"name": "Latte", "category": "Coffee", "amount_kd": "2.500"}])


if __name__ == "__main__":
    unittest.main()
