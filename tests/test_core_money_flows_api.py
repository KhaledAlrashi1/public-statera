import io
import unittest
from decimal import Decimal

from preflight_base import PreflightApiTestBase


class CoreMoneyFlowsApiTests(PreflightApiTestBase):
    def _create_transaction(
        self,
        client,
        *,
        date: str,
        category: str,
        name: str,
        amount_kd: str,
        merchant: str | None = None,
        items_json: list[dict] | None = None,
    ) -> int:
        payload = {
            "date": date,
            "category": category,
            "name": name,
            "amount_kd": amount_kd,
            "items_json": items_json
            if items_json is not None
            else [{"name": name, "category": category, "amount_kd": amount_kd}],
        }
        if merchant:
            payload["merchant"] = merchant

        res = self._post(client, "/api/transactions/create", json=payload)
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        item = (res.get_json() or {}).get("item") or {}
        txn_id = item.get("id")
        self.assertIsInstance(txn_id, int)
        return txn_id

    def test_categories_delete_archives_and_preserves_transaction_references(self):
        """Deleting a category soft-archives it.

        Transactions and their items retain the original category so historical
        analytics remain accurate. Budget rows are also preserved. The category
        disappears from the default picker list but remains visible when
        include_archived=true is requested.
        """
        self._create_user("core-cats@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-cats@example.com", "Password123!")

        create_cat = self._post(client, "/api/categories", json={"name": "Dining"})
        self.assertEqual(create_cat.status_code, 201, create_cat.get_data(as_text=True))
        cat_id = ((create_cat.get_json() or {}).get("item") or {}).get("id")
        self.assertIsInstance(cat_id, int)

        txn_id = self._create_transaction(
            client,
            date="2026-02-10",
            category="Dining",
            name="Restaurant bill",
            amount_kd="14.500",
        )

        save_budget = self._post(
            client,
            "/api/budgets",
            json={
                "month": "2026-02",
                "items": [{"category": "Dining", "amount_kd": "80.000"}],
            },
        )
        self.assertEqual(save_budget.status_code, 200, save_budget.get_data(as_text=True))

        delete_cat = self._post(client, f"/api/categories/{cat_id}/delete", json={})
        self.assertEqual(delete_cat.status_code, 200, delete_cat.get_data(as_text=True))
        self.assertTrue((delete_cat.get_json() or {}).get("ok"))

        # Transactions and items keep the original category — no reassignment.
        detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 200, detail.get_data(as_text=True))
        transaction = ((detail.get_json() or {}).get("transaction") or {})
        self.assertEqual(transaction.get("category"), "Dining")
        items = transaction.get("items") or []
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].get("category"), "Dining")

        # Budget rows are preserved with the original category name.
        budgets = client.get("/api/budgets?month=2026-02")
        self.assertEqual(budgets.status_code, 200, budgets.get_data(as_text=True))
        budget_categories = [row.get("category") for row in ((budgets.get_json() or {}).get("items") or [])]
        self.assertIn("Dining", budget_categories)

        # Default category list hides archived entries.
        categories = client.get("/api/categories")
        self.assertEqual(categories.status_code, 200, categories.get_data(as_text=True))
        category_names = [row.get("name") for row in ((categories.get_json() or {}).get("items") or [])]
        self.assertNotIn("Dining", category_names)

        # With include_archived=true the category is visible and flagged.
        all_categories = client.get("/api/categories?include_archived=true")
        self.assertEqual(all_categories.status_code, 200, all_categories.get_data(as_text=True))
        all_category_rows = (all_categories.get_json() or {}).get("items") or []
        dining_row = next((r for r in all_category_rows if r.get("name") == "Dining"), None)
        self.assertIsNotNone(dining_row, "Archived 'Dining' category should appear with include_archived=true")
        self.assertTrue(dining_row.get("is_archived"))

    def test_merchants_update_and_delete_nullifies_linked_transactions(self):
        self._create_user("core-merchants@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-merchants@example.com", "Password123!")

        create_merchant = self._post(client, "/api/merchants", json={"name": "Cafe One"})
        self.assertEqual(create_merchant.status_code, 201, create_merchant.get_data(as_text=True))
        merchant_id = ((create_merchant.get_json() or {}).get("item") or {}).get("id")
        self.assertIsInstance(merchant_id, int)

        update_merchant = self._post(
            client,
            f"/api/merchants/{merchant_id}/update",
            json={"name": "Cafe Prime"},
        )
        self.assertEqual(update_merchant.status_code, 200, update_merchant.get_data(as_text=True))

        txn_id = self._create_transaction(
            client,
            date="2026-02-12",
            category="Groceries",
            name="Coffee beans",
            amount_kd="5.250",
            merchant="Cafe Prime",
        )

        delete_merchant = self._post(client, f"/api/merchants/{merchant_id}/delete", json={})
        self.assertEqual(delete_merchant.status_code, 200, delete_merchant.get_data(as_text=True))
        self.assertTrue((delete_merchant.get_json() or {}).get("ok"))

        detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 200, detail.get_data(as_text=True))
        transaction = ((detail.get_json() or {}).get("transaction") or {})
        self.assertIsNone(transaction.get("merchant"))

        merchants = client.get("/api/merchants")
        self.assertEqual(merchants.status_code, 200, merchants.get_data(as_text=True))
        merchant_names = [row.get("name") for row in ((merchants.get_json() or {}).get("items") or [])]
        self.assertNotIn("Cafe Prime", merchant_names)

    def test_item_routes_are_removed_and_transaction_remains_atomic(self):
        self._create_user("core-items-removed@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-items-removed@example.com", "Password123!")

        txn_id = self._create_transaction(
            client,
            date="2026-02-13",
            category="Groceries",
            name="Milk",
            amount_kd="5.000",
        )

        first_detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(first_detail.status_code, 200, first_detail.get_data(as_text=True))
        first_items = ((first_detail.get_json() or {}).get("transaction") or {}).get("items") or []
        self.assertEqual(len(first_items), 1)
        first_item_id = first_items[0].get("id")
        self.assertIsInstance(first_item_id, int)

        add_item = self._post(
            client,
            f"/api/transactions/{txn_id}/items",
            json={"name": "Banana", "category": "Groceries", "amount_kd": "2.000"},
        )
        self.assertIn(add_item.status_code, {404, 405}, add_item.get_data(as_text=True))

        update_item = self._post(
            client,
            f"/api/items/{first_item_id}/update",
            json={"name": "Banana premium", "category": "Snacks", "amount_kd": "3.500"},
        )
        self.assertIn(update_item.status_code, {404, 405}, update_item.get_data(as_text=True))

        delete_item = self._post(client, f"/api/items/{first_item_id}/delete", json={})
        self.assertEqual(delete_item.status_code, 404, delete_item.get_data(as_text=True))

        final_detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(final_detail.status_code, 200, final_detail.get_data(as_text=True))
        final_txn = ((final_detail.get_json() or {}).get("transaction") or {})
        final_items = final_txn.get("items") or []
        self.assertEqual(len(final_items), 1)
        self.assertEqual(final_txn.get("amount_kd"), "5.000")

    def test_transaction_split_update_and_delete_lifecycle(self):
        self._create_user("core-split-delete@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-split-delete@example.com", "Password123!")

        txn_id = self._create_transaction(
            client,
            date="2026-02-18",
            category="Groceries",
            name="Single item",
            amount_kd="4.000",
            merchant="Local Market",
        )

        split_update = self._post(
            client,
            f"/api/transactions/{txn_id}/split",
            json={
                "rows": [
                    {"name": "Bread", "category": "Groceries", "amount_kd": "2.500"},
                    {"name": "Milk", "category": "Groceries", "amount_kd": "1.500"},
                ]
            },
        )
        self.assertEqual(split_update.status_code, 200, split_update.get_data(as_text=True))
        self.assertTrue((split_update.get_json() or {}).get("ok"))

        detail_after_split = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail_after_split.status_code, 200, detail_after_split.get_data(as_text=True))
        split_txn = ((detail_after_split.get_json() or {}).get("transaction") or {})
        split_items = split_txn.get("items") or []
        self.assertEqual(len(split_items), 1)
        self.assertEqual(split_txn.get("name"), "Bread")
        self.assertEqual(split_txn.get("amount_kd"), "2.500")
        self.assertEqual(split_txn.get("merchant"), "Local Market")

        delete_txn = self._post(client, f"/api/transactions/{txn_id}/delete", json={})
        self.assertEqual(delete_txn.status_code, 200, delete_txn.get_data(as_text=True))
        self.assertTrue((delete_txn.get_json() or {}).get("ok"))

        not_found = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(not_found.status_code, 404, not_found.get_data(as_text=True))

        search = client.get("/api/transactions/search?q=Bread&limit=20&offset=0")
        self.assertEqual(search.status_code, 200, search.get_data(as_text=True))
        items = (search.get_json() or {}).get("items") or []
        self.assertEqual(len(items), 0)

    def test_transactions_reject_amounts_with_more_than_three_decimals(self):
        self._create_user("core-precision@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-precision@example.com", "Password123!")

        create_res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-18",
                "category": "Groceries",
                "name": "Precision Create",
                "amount_kd": "1.2345",
                "items_json": [
                    {"name": "Precision Create", "category": "Groceries", "amount_kd": "1.2345"},
                ],
            },
        )
        self.assertEqual(create_res.status_code, 400, create_res.get_data(as_text=True))
        self.assertIn(
            "more than 3 decimal places",
            ((create_res.get_json() or {}).get("error") or "").lower(),
        )

        txn_id = self._create_transaction(
            client,
            date="2026-02-18",
            category="Groceries",
            name="Precision Update",
            amount_kd="4.000",
        )

        update_res = self._post(
            client,
            f"/api/transactions/{txn_id}/update",
            json={
                "date": "2026-02-18",
                "category": "Groceries",
                "name": "Precision Update",
                "amount_kd": "4.1234",
            },
        )
        self.assertEqual(update_res.status_code, 400, update_res.get_data(as_text=True))
        self.assertIn(
            "more than 3 decimal places",
            ((update_res.get_json() or {}).get("error") or "").lower(),
        )

    def test_transaction_split_route_rewrites_atomic_rows(self):
        user_id = self._create_user("core-atomic-split@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-atomic-split@example.com", "Password123!")

        txn_id = self._create_transaction(
            client,
            date="2026-02-18",
            category="Groceries",
            name="Weekly Shop",
            amount_kd="4.000",
            merchant="Local Market",
        )

        split_res = self._post(
            client,
            f"/api/transactions/{txn_id}/split",
            json={
                "rows": [
                    {"name": "Bread", "category": "Groceries", "amount_kd": "2.500"},
                    {"name": "Milk", "category": "Groceries", "amount_kd": "1.500"},
                ]
            },
        )
        self.assertEqual(split_res.status_code, 200, split_res.get_data(as_text=True))
        payload = split_res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        split_transactions = payload.get("transactions") or []
        self.assertEqual(len(split_transactions), 2)

        detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 200, detail.get_data(as_text=True))
        original = ((detail.get_json() or {}).get("transaction") or {})
        self.assertEqual(original.get("name"), "Bread")
        self.assertEqual(original.get("amount_kd"), "2.500")
        self.assertEqual(original.get("merchant"), "Local Market")
        self.assertEqual(original.get("date"), "2026-02-18")

        search = client.get("/api/transactions/search?q=Milk&limit=20&offset=0")
        self.assertEqual(search.status_code, 200, search.get_data(as_text=True))
        items = (search.get_json() or {}).get("items") or []
        self.assertEqual(len(items), 1)
        self.assertEqual((items[0] or {}).get("name"), "Milk")
        self.assertEqual((items[0] or {}).get("amount_kd"), "1.500")
        self.assertEqual((items[0] or {}).get("merchant"), "Local Market")

        with self.app.app_context():
            rows = (
                self.Transaction.query
                .filter_by(user_id=user_id)
                .order_by(self.Transaction.id.asc())
                .all()
            )
            self.assertEqual(len(rows), 2)
            self.assertEqual([row.name for row in rows], ["Bread", "Milk"])
            self.assertEqual(
                sum((row.amount_kd for row in rows), Decimal("0")),
                Decimal("4.000"),
            )
            self.assertEqual([format(row.amount_kd, ".3f") for row in rows], ["2.500", "1.500"])

    def test_transaction_split_route_rejects_total_mismatch(self):
        user_id = self._create_user("core-split-mismatch@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-split-mismatch@example.com", "Password123!")

        txn_id = self._create_transaction(
            client,
            date="2026-02-18",
            category="Groceries",
            name="Weekly Shop",
            amount_kd="4.000",
        )

        split_res = self._post(
            client,
            f"/api/transactions/{txn_id}/split",
            json={
                "rows": [
                    {"name": "Bread", "category": "Groceries", "amount_kd": "2.500"},
                    {"name": "Milk", "category": "Groceries", "amount_kd": "1.499"},
                ]
            },
        )
        self.assertEqual(split_res.status_code, 400, split_res.get_data(as_text=True))
        payload = split_res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "validation_error")
        self.assertIn(
            "must sum to the original transaction total",
            (payload.get("error") or "").lower(),
        )

        detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 200, detail.get_data(as_text=True))
        txn = ((detail.get_json() or {}).get("transaction") or {})
        self.assertEqual(txn.get("name"), "Weekly Shop")
        self.assertEqual(txn.get("amount_kd"), "4.000")

        with self.app.app_context():
            rows = (
                self.Transaction.query
                .filter_by(user_id=user_id)
                .order_by(self.Transaction.id.asc())
                .all()
            )
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].name, "Weekly Shop")
            self.assertEqual(rows[0].amount_kd, Decimal("4.000"))

    def test_upload_preview_and_import_commit_duplicate_behaviors(self):
        self._create_user("core-upload@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "core-upload@example.com", "Password123!")

        csv_data = (
            "Date,Category,Name,Amount (KWD)\n"
            "2026-02-10,Food,Lunch,3.250\n"
            "2026-02-11,Transport,Taxi,2.000\n"
        )
        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_data.encode("utf-8")), "sample.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        preview_payload = preview.get_json() or {}
        self.assertTrue(preview_payload.get("ok"))
        self.assertEqual(preview_payload.get("count"), 2)

        rows_skip_dupe = [
            {"date": "2026-02-12", "category": "Food", "name": "Tea", "amount_kd": "1.000"},
            {"date": "2026-02-12", "category": "Food", "name": "Tea", "amount_kd": "1.000"},
        ]
        commit_skip = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows_skip_dupe, "allow_duplicates": False},
        )
        self.assertEqual(commit_skip.status_code, 409, commit_skip.get_data(as_text=True))
        skip_payload = commit_skip.get_json() or {}
        self.assertFalse(skip_payload.get("ok"))
        self.assertEqual(skip_payload.get("error_code"), "import_atomic_precheck_failed")

        search_tea = client.get("/api/transactions/search?q=Tea&limit=20&offset=0")
        self.assertEqual(search_tea.status_code, 200, search_tea.get_data(as_text=True))
        tea_items = (search_tea.get_json() or {}).get("items") or []
        self.assertEqual(len(tea_items), 0)

        rows_allow_dupe = [
            {"date": "2026-02-14", "category": "Food", "name": "Coffee", "amount_kd": "2.000"},
            {"date": "2026-02-14", "category": "Food", "name": "Coffee", "amount_kd": "2.000"},
        ]
        commit_allow = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows_allow_dupe, "allow_duplicates": True},
        )
        self.assertEqual(commit_allow.status_code, 200, commit_allow.get_data(as_text=True))
        allow_payload = commit_allow.get_json() or {}
        self.assertTrue(allow_payload.get("ok"))
        self.assertEqual(allow_payload.get("imported"), 2)
        self.assertEqual(allow_payload.get("skipped_duplicate"), 0)

        search_coffee = client.get("/api/transactions/search?q=Coffee&limit=20&offset=0")
        self.assertEqual(search_coffee.status_code, 200, search_coffee.get_data(as_text=True))
        coffee_items = (search_coffee.get_json() or {}).get("items") or []
        self.assertEqual(len(coffee_items), 2)

if __name__ == "__main__":
    unittest.main()
