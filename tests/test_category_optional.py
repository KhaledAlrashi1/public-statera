"""Tests for optional category on transactions (Section 1 — category-optional plan)."""

import sys
import os
import io
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from preflight_base import PreflightApiTestBase


class CategoryOptionalCreateTests(PreflightApiTestBase):
    """Creating a transaction with no category stores category_id = NULL."""

    def test_create_with_no_category_stores_null(self):
        user_id = self._create_user("nocategory@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "nocategory@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            res = client.post("/api/transactions/create", json={
                "date": "2026-01-15",
                "name": "Coffee no category",
                "amount_kd": "1.500",
            }, headers=headers)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
            item = (res.get_json() or {}).get("item", {})
            # API serializer returns "Uncategorized" for null-category rows (display label)
            self.assertEqual(item.get("category"), "Uncategorized")

        with self.app.app_context():
            from backend.models import Transaction
            txn = Transaction.query.filter_by(user_id=user_id, name="Coffee no category").first()
            self.assertIsNotNone(txn)
            self.assertIsNone(txn.category_id)

    def test_create_with_empty_string_category_stores_null(self):
        user_id = self._create_user("emptycat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "emptycat@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            res = client.post("/api/transactions/create", json={
                "date": "2026-01-15",
                "name": "Empty category txn",
                "amount_kd": "2.000",
                "category": "",
            }, headers=headers)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        with self.app.app_context():
            from backend.models import Transaction
            txn = Transaction.query.filter_by(user_id=user_id, name="Empty category txn").first()
            self.assertIsNone(txn.category_id)

    def test_create_with_uncategorized_string_stores_null(self):
        user_id = self._create_user("uncatstring@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "uncatstring@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            res = client.post("/api/transactions/create", json={
                "date": "2026-01-15",
                "name": "Literal Uncategorized txn",
                "amount_kd": "3.000",
                "category": "Uncategorized",
            }, headers=headers)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        with self.app.app_context():
            from backend.models import Transaction
            txn = Transaction.query.filter_by(user_id=user_id, name="Literal Uncategorized txn").first()
            self.assertIsNone(txn.category_id)

    def test_create_with_real_category_stores_category_id(self):
        self._create_user("withcat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "withcat@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            res = client.post("/api/transactions/create", json={
                "date": "2026-01-15",
                "name": "Groceries txn",
                "amount_kd": "10.000",
                "category": "Food",
            }, headers=headers)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
            item = (res.get_json() or {}).get("item", {})
            self.assertEqual(item.get("category"), "Food")

    def test_cross_user_isolation_null_category(self):
        uid_a = self._create_user("usera_cat@example.com", "pass1234!")
        uid_b = self._create_user("userb_cat@example.com", "pass1234!")

        with self.app.test_client() as client_a:
            self._login(client_a, "usera_cat@example.com", "pass1234!")
            headers_a = self._csrf_headers(client_a)
            res = client_a.post("/api/transactions/create", json={
                "date": "2026-01-15",
                "name": "User A txn",
                "amount_kd": "5.000",
            }, headers=headers_a)
            self.assertEqual(res.status_code, 201)
            txn_id_a = (res.get_json() or {}).get("item", {}).get("id")

        with self.app.test_client() as client_b:
            self._login(client_b, "userb_cat@example.com", "pass1234!")
            headers_b = self._csrf_headers(client_b)
            # User B cannot read or modify User A's transaction
            res = client_b.get(f"/api/transactions/{txn_id_a}")
            self.assertIn(res.status_code, (403, 404))


class CategoryOptionalUpdateTests(PreflightApiTestBase):
    """Updating a transaction to have no category stores NULL."""

    def _create_txn_with_category(self, client, headers, category="Food"):
        res = client.post("/api/transactions/create", json={
            "date": "2026-02-01",
            "name": "Update me",
            "amount_kd": "5.000",
            "category": category,
        }, headers=headers)
        self.assertEqual(res.status_code, 201)
        return (res.get_json() or {}).get("item", {}).get("id")

    def test_update_to_empty_category_stores_null(self):
        self._create_user("update_cat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "update_cat@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            txn_id = self._create_txn_with_category(client, headers)

            res = client.post(f"/api/transactions/{txn_id}/update", json={
                "date": "2026-02-01",
                "name": "Update me",
                "amount_kd": "5.000",
                "category": "",
            }, headers=headers)
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            item = (res.get_json() or {}).get("item", {})
            self.assertEqual(item.get("category"), "Uncategorized")

        with self.app.app_context():
            from backend.models import Transaction
            txn = self.db.session.get(Transaction, txn_id)
            self.assertIsNone(txn.category_id)

    def test_update_to_uncategorized_string_stores_null(self):
        self._create_user("update_uncat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "update_uncat@example.com", "pass1234!")
            headers = self._csrf_headers(client)
            txn_id = self._create_txn_with_category(client, headers)

            res = client.post(f"/api/transactions/{txn_id}/update", json={
                "date": "2026-02-01",
                "name": "Update me",
                "amount_kd": "5.000",
                "category": "Uncategorized",
            }, headers=headers)
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        with self.app.app_context():
            from backend.models import Transaction
            txn = self.db.session.get(Transaction, txn_id)
            self.assertIsNone(txn.category_id)


class CategoryOptionalImportTests(PreflightApiTestBase):
    """CSV import with no category column stores NULL category_id."""

    def test_import_no_category_column_stores_null(self):
        user_id = self._create_user("importnocat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "importnocat@example.com", "pass1234!")
            headers = self._csrf_headers(client)

            csv_content = b"date,name,amount_kd\n2026-03-01,Import No Cat,4.500\n"
            data = {"file": (io.BytesIO(csv_content), "test.csv")}
            res = client.post(
                "/api/transactions/upload-preview",
                data=data,
                content_type="multipart/form-data",
                headers=headers,
            )
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            preview = res.get_json() or {}
            rows = preview.get("preview_rows") or []
            self.assertGreater(len(rows), 0)
            # category should be empty in the preview (not 'Uncategorized')
            self.assertEqual(rows[0].get("category"), "")

    def test_import_empty_category_cell_stores_null(self):
        user_id = self._create_user("importemptycat@example.com", "pass1234!")
        with self.app.test_client() as client:
            self._login(client, "importemptycat@example.com", "pass1234!")
            headers = self._csrf_headers(client)

            csv_content = b"date,name,amount_kd,category\n2026-03-01,Empty Cat Import,3.750,\n"
            data = {"file": (io.BytesIO(csv_content), "test.csv")}
            res = client.post(
                "/api/transactions/upload-preview",
                data=data,
                content_type="multipart/form-data",
                headers=headers,
            )
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            preview = res.get_json() or {}
            rows = preview.get("preview_rows") or []
            self.assertGreater(len(rows), 0)
            self.assertEqual(rows[0].get("category"), "")


class CategoryOptionalLearnTests(PreflightApiTestBase):
    """learn_transaction with null/Uncategorized category stores NULL in memorized_transactions."""

    def test_learn_with_none_category_stores_null(self):
        user_id = self._create_user("learncat@example.com", "pass1234!")
        with self.app.app_context():
            from backend.lib.suggestions import learn_transaction
            from backend.models import MemorizedTransaction, db
            learn_transaction("Some Transaction", user_id, category=None)
            db.session.commit()
            row = MemorizedTransaction.query.filter_by(
                user_id=user_id, canonical="Some Transaction"
            ).first()
            self.assertIsNotNone(row)
            self.assertIsNone(row.category)

    def test_learn_with_uncategorized_string_stores_null(self):
        user_id = self._create_user("learnuncat@example.com", "pass1234!")
        with self.app.app_context():
            from backend.lib.suggestions import learn_transaction
            from backend.models import MemorizedTransaction, db
            learn_transaction("Another Transaction", user_id, category="Uncategorized")
            db.session.commit()
            row = MemorizedTransaction.query.filter_by(
                user_id=user_id, canonical="Another Transaction"
            ).first()
            self.assertIsNotNone(row)
            self.assertIsNone(row.category)


if __name__ == "__main__":
    unittest.main()
