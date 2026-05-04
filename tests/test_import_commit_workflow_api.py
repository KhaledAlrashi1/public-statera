import io
import unittest
from datetime import date
from decimal import Decimal

from preflight_base import PreflightApiTestBase


class ImportCommitWorkflowApiTests(PreflightApiTestBase):
    def _create_transaction(self, client, *, date: str, category: str, name: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": date,
                "category": category,
                "name": name,
                "amount_kd": amount_kd,
                "items_json": [{"name": name, "category": category, "amount_kd": amount_kd}],
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return ((res.get_json() or {}).get("item") or {}).get("id")

    def _preview_csv_payload(self, client, csv_text: str, *, filename: str = "sample.csv"):
        res = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_text.encode("utf-8")), filename)},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return res.get_json() or {}

    def test_import_commit_ignores_partial_import_opt_out_and_returns_precheck_diagnostics(self):
        self._create_user("import-phases@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-phases@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-11",
            category="Food",
            name="Existing Duplicate",
            amount_kd="2.000",
        )

        rows = [
            {"date": "2026-02-10", "category": "Food", "name": "Mixed Tea A", "amount_kd": "1.000"},
            {"date": "2026-02-11", "category": "Food", "name": "Existing Duplicate", "amount_kd": "2.000"},
            {"date": "2026-02-10", "category": "Food", "name": "Mixed Tea A", "amount_kd": "1.000"},
            {"date": "2026-02-12", "category": "Food", "name": "Missing Amount", "amount_kd": ""},
            {"date": "2026-02-13", "category": "Food", "name": "Bad Items", "amount_kd": "3.000", "items": "bad-shape"},
            {"date": "2026-02-14", "category": "Food", "name": "Mixed Tea B", "amount_kd": "1.500"},
        ]

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False, "atomic": False},
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_atomic_precheck_failed")

        meta = payload.get("meta") or {}
        summary = meta.get("summary") or {}
        self.assertEqual(summary.get("planned_rows"), 4)
        self.assertEqual(summary.get("skipped_duplicate"), 0)
        self.assertEqual(summary.get("skipped"), 2)
        row_results = meta.get("row_results") or []
        self.assertEqual(len(row_results), len(rows))
        by_idx = {int(r.get("row_index")): r for r in row_results}

        self.assertEqual((by_idx[0] or {}).get("status"), "blocked_atomic")
        self.assertEqual((by_idx[1] or {}).get("status"), "blocked_atomic")
        self.assertEqual((by_idx[2] or {}).get("status"), "blocked_atomic")
        self.assertEqual((by_idx[3] or {}).get("status"), "skipped_invalid")
        self.assertEqual((by_idx[3] or {}).get("error_code"), "import_row_missing_fields")
        self.assertEqual((by_idx[4] or {}).get("status"), "skipped_invalid")
        self.assertEqual((by_idx[4] or {}).get("error_code"), "import_row_items_invalid")
        self.assertEqual((by_idx[5] or {}).get("status"), "blocked_atomic")

        search = client.get("/api/transactions/search?q=Mixed%20Tea&limit=20&offset=0")
        self.assertEqual(search.status_code, 200, search.get_data(as_text=True))
        items = (search.get_json() or {}).get("items") or []
        self.assertEqual(items, [])

    def test_import_commit_duplicate_rows_are_non_blocking_in_atomic_mode(self):
        self._create_user("import-atomic-mixed@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-atomic-mixed@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-11",
            category="Food",
            name="Existing Duplicate",
            amount_kd="2.000",
        )

        rows = [
            {"date": "2026-02-10", "category": "Food", "name": "Atomic Tea A", "amount_kd": "1.000"},
            {"date": "2026-02-11", "category": "Food", "name": "Existing Duplicate", "amount_kd": "2.000"},
        ]

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False, "atomic": True},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 2)
        self.assertEqual(payload.get("created"), 2)
        row_results = payload.get("row_results") or []
        self.assertEqual(len(row_results), len(rows))
        self.assertEqual((row_results[0] or {}).get("status"), "created")
        self.assertEqual((row_results[1] or {}).get("status"), "created")

        with self.app.app_context():
            self.assertEqual(self.Transaction.query.count(), 3)

    def test_import_zero_amount_row_does_not_block_valid_rows(self):
        user_id = self._create_user("import-zero-ok@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-zero-ok@example.com", "Password123!")

        rows = [
            {"date": "2026-02-15", "category": "Food", "name": "Coffee A", "amount_kd": "1.250"},
            {"date": "2026-02-15", "category": "Food", "name": "Zero Coffee", "amount_kd": "0.000"},
            {"date": "2026-02-16", "category": "Food", "name": "Coffee B", "amount_kd": "2.500"},
        ]

        res = self._post(client, "/api/transactions/import-commit", json={"rows": rows})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 2)
        self.assertEqual(payload.get("imported_count"), 2)
        self.assertEqual(payload.get("created"), 2)
        self.assertEqual(payload.get("auto_excluded_count"), 1)
        row_results = payload.get("row_results") or []
        self.assertEqual([row.get("status") for row in row_results], ["created", "auto_excluded", "created"])

        with self.app.app_context():
            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id).count(), 2)

        search = client.get("/api/transactions/search?q=Coffee&limit=20&offset=0")
        self.assertEqual(search.status_code, 200, search.get_data(as_text=True))
        items = (search.get_json() or {}).get("items") or []
        self.assertEqual(len(items), 2)

    def test_import_auto_excluded_count_in_response(self):
        self._create_user("import-auto-excluded-meta@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-auto-excluded-meta@example.com", "Password123!")

        rows = [
            {"date": "2026-02-18", "category": "Food", "name": "Fresh Juice", "amount_kd": "3.000"},
            {"date": "2026-02-18", "category": "Food", "name": "Refund Row", "amount_kd": "-3.000"},
        ]

        res = self._post(client, "/api/transactions/import-commit", json={"rows": rows})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("auto_excluded_count"), 1)
        auto_excluded_rows = payload.get("auto_excluded_rows") or []
        self.assertEqual(len(auto_excluded_rows), 1)
        self.assertEqual((auto_excluded_rows[0] or {}).get("row_index"), 1)
        self.assertEqual((auto_excluded_rows[0] or {}).get("row_number"), 2)
        self.assertEqual((auto_excluded_rows[0] or {}).get("name"), "Refund Row")
        self.assertEqual((auto_excluded_rows[0] or {}).get("raw_amount"), "-3.000")
        self.assertIn("Negative amounts are not supported", (auto_excluded_rows[0] or {}).get("reason") or "")
        summary = payload.get("summary") or {}
        self.assertEqual(summary.get("auto_excluded"), 1)

    def test_import_all_rows_zero_amount_returns_zero_imported_and_no_error(self):
        user_id = self._create_user("import-all-zero@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-all-zero@example.com", "Password123!")

        rows = [
            {"date": "2026-02-20", "category": "Food", "name": "Zero Tea", "amount_kd": "0.000"},
            {"date": "2026-02-21", "category": "Food", "name": "Zero Snack", "amount_kd": "0"},
        ]

        res = self._post(client, "/api/transactions/import-commit", json={"rows": rows})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 0)
        self.assertEqual(payload.get("imported_count"), 0)
        self.assertEqual(payload.get("created"), 0)
        self.assertEqual(payload.get("updated"), 0)
        self.assertEqual(payload.get("auto_excluded_count"), 2)
        self.assertEqual(
            [row.get("status") for row in (payload.get("row_results") or [])],
            ["auto_excluded", "auto_excluded"],
        )

        with self.app.app_context():
            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id).count(), 0)

    def test_upload_preview_flags_rows_that_would_be_skipped_as_duplicates(self):
        self._create_user("import-preview-dupes@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-preview-dupes@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-11",
            category="Food",
            name="Existing Duplicate",
            amount_kd="2.000",
        )

        csv_data = (
            "Date,Category,Name,Amount (KWD)\n"
            "2026-02-11,Food,Existing Duplicate,2.000\n"
            "2026-02-12,Food,Fresh Tea,1.000\n"
            "2026-02-12,Food,Fresh Tea,1.000\n"
        )
        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_data.encode("utf-8")), "duplicates.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        payload = preview.get_json() or {}
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 3)

        self.assertTrue(rows[0].get("likely_dup"))
        self.assertEqual(rows[0].get("duplicate_reason"), "import_row_duplicate_existing")
        self.assertIn("already exists", rows[0].get("duplicate_message") or "")

        self.assertFalse(rows[1].get("likely_dup"))

        self.assertTrue(rows[2].get("likely_dup"))
        self.assertEqual(rows[2].get("duplicate_reason"), "import_row_duplicate_batch")
        self.assertIn("within this import batch", rows[2].get("duplicate_message") or "")

    def test_upload_preview_flags_fuzzy_duplicate_warnings_without_skipping_rows(self):
        self._create_user("import-preview-fuzzy@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-preview-fuzzy@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-11",
            category="Food",
            name="Coffee House",
            amount_kd="2.000",
        )

        csv_data = (
            "Date,Category,Name,Amount (KWD)\n"
            "2026-02-10,Food,Coffee Huse,2.000\n"
            "2026-02-12,Food,Bakery Order 1041,1.500\n"
            "2026-02-11,Food,Bakery Order 1047,1.500\n"
        )
        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_data.encode("utf-8")), "fuzzy-duplicates.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        payload = preview.get_json() or {}
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 3)

        self.assertTrue(rows[0].get("likely_dup"))
        self.assertEqual(rows[0].get("duplicate_reason"), "import_row_duplicate_fuzzy_existing")
        self.assertIn("existing transaction", (rows[0].get("duplicate_message") or "").lower())
        self.assertIn("2026-02-11", rows[0].get("duplicate_message") or "")

        self.assertTrue(rows[1].get("likely_dup"))
        self.assertEqual(rows[1].get("duplicate_reason"), "import_row_duplicate_fuzzy_batch")
        self.assertIn("another row in this file", (rows[1].get("duplicate_message") or "").lower())

        self.assertTrue(rows[2].get("likely_dup"))
        self.assertEqual(rows[2].get("duplicate_reason"), "import_row_duplicate_fuzzy_batch")

    def test_import_commit_requires_demo_replacement_when_demo_workspace_active(self):
        self._create_user("import-demo-guard@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-demo-guard@example.com", "Password123!")

        load = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(load.status_code, 200, load.get_data(as_text=True))

        rows = [
            {"date": "2026-03-05", "category": "Food", "name": "Real Coffee", "amount_kd": "1.250"},
        ]
        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False},
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "demo_data_replace_required")
        meta = payload.get("meta") or {}
        self.assertTrue(meta.get("active"))
        self.assertGreater(meta.get("transactions", 0), 20)

    def test_import_commit_can_replace_demo_workspace_before_import(self):
        user_id = self._create_user("import-demo-replace@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-demo-replace@example.com", "Password123!")

        load = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(load.status_code, 200, load.get_data(as_text=True))

        rows = [
            {"date": "2026-03-05", "category": "Food", "name": "Real Coffee", "amount_kd": "1.250"},
        ]
        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False, "replace_demo_data": True},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 1)
        self.assertEqual(payload.get("created"), 1)
        replaced = payload.get("demo_workspace_replaced") or {}
        self.assertGreater(replaced.get("transactions_cleared", 0), 20)

        with self.app.app_context():
            from backend.models import Budget, DebtAccount, ProductEvent, SavingsGoal, Transaction

            self.assertEqual(Transaction.query.filter_by(user_id=user_id, source="demo").count(), 0)
            self.assertEqual(Transaction.query.filter_by(user_id=user_id, source="csv_import").count(), 1)
            self.assertEqual(Budget.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(DebtAccount.query.filter_by(user_id=user_id).count(), 0)
            self.assertEqual(SavingsGoal.query.filter_by(user_id=user_id).count(), 0)
            self.assertIsNotNone(
                ProductEvent.query.filter_by(user_id=user_id, event_name="demo_data_cleared").first()
            )
            self.assertIsNotNone(
                ProductEvent.query.filter_by(user_id=user_id, event_name="demo_data_replaced_with_import").first()
            )

    def test_import_commit_updates_existing_transaction_when_transaction_id_present(self):
        self._create_user("import-upsert@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-upsert@example.com", "Password123!")

        txn_id = self._create_transaction(
            client,
            date="2026-02-10",
            category="Food",
            name="Coffee",
            amount_kd="1.250",
        )

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "transaction_id": txn_id,
                        "date": "2026-02-11",
                        "merchant": "Cafe 42",
                        "category": "Dining",
                        "name": "Coffee Beans",
                        "amount_kd": "2.750",
                        "memo": "Updated from spreadsheet",
                    }
                ],
                "allow_duplicates": False,
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 1)
        self.assertEqual(payload.get("created"), 0)
        self.assertEqual(payload.get("updated"), 1)
        self.assertEqual(payload.get("unchanged"), 0)
        row_results = payload.get("row_results") or []
        self.assertEqual((row_results[0] or {}).get("status"), "updated")
        self.assertEqual((row_results[0] or {}).get("transaction_id"), txn_id)

        detail = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 200, detail.get_data(as_text=True))
        txn = ((detail.get_json() or {}).get("transaction") or {})
        self.assertEqual(txn.get("date"), "2026-02-11")
        self.assertEqual(txn.get("merchant"), "Cafe 42")
        self.assertEqual(txn.get("category"), "Dining")
        self.assertEqual(txn.get("name"), "Coffee Beans")
        self.assertEqual(txn.get("amount_kd"), "2.750")
        self.assertEqual(txn.get("memo"), "Updated from spreadsheet")

    def test_import_commit_creates_user_scoped_categories_even_when_global_name_exists(self):
        user_id = self._create_user("import-user-category@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-user-category@example.com", "Password123!")

        with self.app.app_context():
            self.db.session.add(self.Category(user_id=None, name="Travel", is_income=False))
            self.db.session.commit()

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-02-18",
                        "category": "Travel",
                        "name": "Airport Taxi",
                        "amount_kd": "4.500",
                    }
                ],
                "allow_duplicates": False,
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("created"), 1)

        with self.app.app_context():
            user_categories = self.Category.query.filter_by(user_id=user_id, name="Travel").all()
            global_categories = self.Category.query.filter_by(user_id=None, name="Travel").all()
            self.assertEqual(len(global_categories), 1)
            self.assertEqual(len(user_categories), 1)

            txn_id = int(((payload.get("row_results") or [None])[0] or {}).get("transaction_id"))
            txn = self.db.session.get(self.Transaction, txn_id)
            self.assertIsNotNone(txn)
            self.assertEqual(int(txn.category_id), int(user_categories[0].id))

    def test_import_commit_round_trip_updates_forced_duplicate_rows_by_transaction_id(self):
        self._create_user("import-roundtrip-duplicates@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-roundtrip-duplicates@example.com", "Password123!")

        first_id = self._create_transaction(
            client,
            date="2026-02-10",
            category="Food",
            name="Coffee",
            amount_kd="1.000",
        )
        second = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-10",
                "category": "Food",
                "name": "Coffee",
                "amount_kd": "1.000",
                "force": True,
                "items_json": [{"name": "Coffee", "category": "Food", "amount_kd": "1.000"}],
            },
        )
        self.assertEqual(second.status_code, 201, second.get_data(as_text=True))
        second_id = ((second.get_json() or {}).get("item") or {}).get("id")
        self.assertNotEqual(first_id, second_id)

        export_res = client.get("/api/transactions/export-csv")
        self.assertEqual(export_res.status_code, 200, export_res.get_data(as_text=True))

        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(export_res.data), "export.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        rows = (preview.get_json() or {}).get("preview_rows") or []
        self.assertEqual(len(rows), 2)

        commit = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False},
        )
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        payload = commit.get_json() or {}
        self.assertEqual(payload.get("imported"), 0)
        self.assertEqual(payload.get("created"), 0)
        self.assertEqual(payload.get("updated"), 0)
        self.assertEqual(payload.get("unchanged"), 2)
        self.assertEqual(payload.get("skipped_duplicate"), 0)
        self.assertEqual(
            [row.get("status") for row in (payload.get("row_results") or [])],
            ["unchanged", "unchanged"],
        )
        self.assertEqual(
            sorted((row.get("transaction_id") for row in (payload.get("row_results") or []))),
            sorted([first_id, second_id]),
        )

    def test_import_commit_ignores_foreign_transaction_ids_and_imports_as_new_rows(self):
        source_user_id = self._create_user("import-source@example.com", "Password123!")
        source_client = self.app.test_client()
        self._login(source_client, "import-source@example.com", "Password123!")
        original_txn_id = self._create_transaction(
            source_client,
            date="2026-02-10",
            category="Food",
            name="Coffee",
            amount_kd="1.250",
        )

        export_res = source_client.get("/api/transactions/export-csv")
        self.assertEqual(export_res.status_code, 200, export_res.get_data(as_text=True))

        target_user_id = self._create_user("import-target@example.com", "Password123!")
        target_client = self.app.test_client()
        self._login(target_client, "import-target@example.com", "Password123!")

        preview = target_client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(export_res.data), "export.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(target_client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        rows = (preview.get_json() or {}).get("preview_rows") or []
        self.assertEqual((rows[0] or {}).get("transaction_id"), original_txn_id)

        commit = self._post(
            target_client,
            "/api/transactions/import-commit",
            json={"rows": rows, "allow_duplicates": False},
        )
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        payload = commit.get_json() or {}
        self.assertEqual(payload.get("imported"), 1)
        self.assertEqual(payload.get("created"), 1)
        self.assertEqual(payload.get("updated"), 0)
        self.assertEqual(payload.get("skipped"), 0)
        imported_row = (payload.get("row_results") or [None])[0] or {}
        self.assertEqual(imported_row.get("status"), "created")
        self.assertNotEqual(imported_row.get("transaction_id"), original_txn_id)

        with self.app.app_context():
            source_count = self.Transaction.query.filter_by(user_id=source_user_id).count()
            target_rows = self.Transaction.query.filter_by(user_id=target_user_id).all()
            self.assertEqual(source_count, 1)
            self.assertEqual(len(target_rows), 1)
            self.assertEqual(target_rows[0].name, "Coffee")


class ImportUploadEdgeCaseApiTests(PreflightApiTestBase):
    def _create_transaction(self, client, *, date: str, category: str, name: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": date,
                "category": category,
                "name": name,
                "amount_kd": amount_kd,
                "items_json": [{"name": name, "category": category, "amount_kd": amount_kd}],
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return ((res.get_json() or {}).get("item") or {}).get("id")

    def _upload_preview_csv(self, client, csv_text: str, *, filename: str = "sample.csv", encoding: str = "utf-8"):
        return client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_text.encode(encoding)), filename)},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )

    def _preview_csv_payload(self, client, csv_text: str, *, filename: str = "sample.csv"):
        res = self._upload_preview_csv(client, csv_text, filename=filename)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        return res.get_json() or {}

    def test_upload_preview_accepts_utf8_bom_prefix(self):
        self._create_user("import-bom@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-bom@example.com", "Password123!")

        csv_text = "\ufeffDate,Category,Name,Amount (KWD)\n2026-02-10,Food,Bom Tea,1.250\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("count"), 1)
        rows = payload.get("preview_rows") or []
        self.assertEqual((rows[0] or {}).get("name"), "Bom Tea")

    def test_upload_preview_accepts_windows_line_endings(self):
        self._create_user("import-crlf@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-crlf@example.com", "Password123!")

        csv_text = "Date,Category,Name,Amount (KWD)\r\n2026-02-10,Food,CRLF Tea,2.000\r\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("count"), 1)
        rows = payload.get("preview_rows") or []
        self.assertEqual((rows[0] or {}).get("name"), "CRLF Tea")

    def test_upload_preview_parses_amounts_with_currency_symbols_and_commas(self):
        self._create_user("import-currency@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-currency@example.com", "Password123!")

        csv_text = (
            "Date,Category,Name,Amount (KWD)\n"
            "2026-02-10,Food,Big Lunch,\"KD 1,250.000\"\n"
            "2026-02-11,Food,Coffee,KWD 2.500\n"
        )
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 2)
        self.assertEqual((rows[0] or {}).get("amount_kd"), "1250.000")
        self.assertEqual((rows[1] or {}).get("amount_kd"), "2.500")

    def test_upload_preview_rejects_amounts_with_more_than_three_decimals(self):
        self._create_user("import-precision-preview@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-precision-preview@example.com", "Password123!")

        csv_text = "Date,Category,Name,Amount (KWD)\n2026-02-10,Food,Too Precise,1.2345\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "INVALID_ROWS")

    def test_upload_preview_accepts_canonical_export_columns(self):
        self._create_user("import-canonical-columns@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-canonical-columns@example.com", "Password123!")

        csv_text = (
            "transaction_id,date,merchant,category,name,amount_kd,memo\n"
            "42,2026-02-10,Store,Food,Lunch,5.500,Team lunch\n"
        )
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0] or {}).get("transaction_id"), 42)
        self.assertEqual((rows[0] or {}).get("merchant"), "Store")
        self.assertEqual((rows[0] or {}).get("memo"), "Team lunch")

    def test_upload_preview_defaults_blank_category_cells_to_uncategorized(self):
        self._create_user("import-blank-category@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-blank-category@example.com", "Password123!")

        csv_text = (
            "date,merchant,category,name,amount_kd,memo\n"
            "2026-02-10,Store,,Lunch,5.500,Team lunch\n"
        )
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0] or {}).get("category"), "Uncategorized")

    def test_upload_preview_parses_supported_date_formats(self):
        self._create_user("import-date-formats@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-date-formats@example.com", "Password123!")

        csv_text = (
            "Date,Category,Name,Amount (KWD)\n"
            "10/02/2026,Food,Slash Date,1.000\n"
            "11-02-2026,Food,Dash Date,2.000\n"
            "2026-02-12,Food,ISO Date,3.000\n"
        )
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 3)
        out_dates = {row.get("date") for row in rows}
        self.assertIn("2026-02-10", out_dates)
        self.assertIn("2026-02-11", out_dates)
        self.assertIn("2026-02-12", out_dates)

    def test_upload_preview_keeps_blank_date_rows_for_user_fixup(self):
        self._create_user("import-blank-date-preview@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-blank-date-preview@example.com", "Password123!")

        csv_text = (
            "Date,Category,Name,Amount (KWD)\n"
            ",Food,Needs Date,1.000\n"
        )
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        rows = payload.get("preview_rows") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0] or {}).get("date"), "")
        self.assertEqual((rows[0] or {}).get("name"), "Needs Date")

    def test_import_commit_blank_date_row_returns_missing_date_error(self):
        self._create_user("import-blank-date-commit@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-blank-date-commit@example.com", "Password123!")

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "",
                        "category": "Food",
                        "name": "Needs Date",
                        "amount_kd": "1.000",
                    }
                ],
                "allow_duplicates": False,
            },
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_atomic_precheck_failed")
        row_results = ((payload.get("meta") or {}).get("row_results")) or []
        self.assertEqual((row_results[0] or {}).get("status"), "skipped_invalid")
        self.assertEqual((row_results[0] or {}).get("error_code"), "import_row_missing_date")

    def test_import_commit_rejects_amounts_with_more_than_three_decimals(self):
        self._create_user("import-precision-commit@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-precision-commit@example.com", "Password123!")

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-02-10",
                        "category": "Food",
                        "name": "Too Precise",
                        "amount_kd": "1.2345",
                    }
                ],
                "allow_duplicates": False,
            },
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_atomic_precheck_failed")
        row_results = ((payload.get("meta") or {}).get("row_results")) or []
        self.assertEqual((row_results[0] or {}).get("status"), "skipped_invalid")
        self.assertEqual((row_results[0] or {}).get("error_code"), "import_row_invalid_value")
        self.assertIn(
            "more than 3 decimal places",
            ((row_results[0] or {}).get("message") or "").lower(),
        )

    def test_import_commit_rejects_rows_when_items_do_not_sum_exactly(self):
        self._create_user("import-items-sum@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-items-sum@example.com", "Password123!")

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-02-10",
                        "category": "Food",
                        "name": "Mismatch",
                        "amount_kd": "2.000",
                        "items": [
                            {"name": "Mismatch", "category": "Food", "amount_kd": "1.999"},
                        ],
                    }
                ],
                "allow_duplicates": False,
            },
        )
        self.assertEqual(res.status_code, 409, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_atomic_precheck_failed")
        row_results = ((payload.get("meta") or {}).get("row_results")) or []
        self.assertEqual((row_results[0] or {}).get("status"), "skipped_invalid")
        self.assertEqual((row_results[0] or {}).get("error_code"), "import_row_items_sum_mismatch")
        self.assertIn("do not sum", ((row_results[0] or {}).get("message") or "").lower())

    def test_upload_preview_rejects_arabic_numeral_dates_gracefully(self):
        self._create_user("import-arabic-date@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-arabic-date@example.com", "Password123!")

        csv_text = "Date,Category,Name,Amount (KWD)\n١٠/٠٢/٢٠٢٦,Food,Arabic Date,1.000\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "INVALID_ROWS")

    def test_upload_preview_header_only_file_returns_empty_file(self):
        self._create_user("import-header-only@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-header-only@example.com", "Password123!")

        csv_text = "Date,Category,Name,Amount (KWD)\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "EMPTY_FILE")

    def test_upload_preview_file_too_large_returns_limit_error(self):
        self._create_user("import-limit@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-limit@example.com", "Password123!")

        rows = ["Date,Category,Name,Amount (KWD)"]
        rows.extend([f"2026-02-10,Food,Row {idx},1.000" for idx in range(10_001)])
        csv_text = "\n".join(rows) + "\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "FILE_TOO_LARGE")
        self.assertIn("10,001", str(payload.get("error") or ""))

    def test_upload_preview_missing_required_columns_returns_error(self):
        self._create_user("import-missing-cols@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-missing-cols@example.com", "Password123!")

        csv_text = "Date,Category,Merchant,Amount (KWD)\n2026-02-10,Food,Store,1.000\n"
        res = self._upload_preview_csv(client, csv_text)
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "MISSING_COLUMNS")
        meta = payload.get("meta") or {}
        missing = meta.get("missing_columns") or []
        self.assertIn("name", missing)
        self.assertTrue(meta.get("raw_rows"))

    def test_upload_preview_non_utf8_file_returns_400(self):
        self._create_user("import-non-utf8@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-non-utf8@example.com", "Password123!")

        raw = "Date,Category,Name,Amount (KWD)\n2026-02-10,Food,Café,1.000\n".encode("cp1252")
        res = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(raw), "latin1.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "NON_UTF8_FILE")

    def test_upload_preview_renamed_binary_file_returns_invalid_file_type(self):
        self._create_user("import-invalid-file-type@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-invalid-file-type@example.com", "Password123!")

        jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x02\x00\x00\x01\x00\x01\x00\x00"
        res = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(jpeg_bytes), "photo.csv", "image/jpeg")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "invalid_file_type")
        self.assertIn("valid CSV or Excel file", str(payload.get("error") or ""))

    def test_import_two_identical_rows_in_same_file_both_imported(self):
        user_id = self._create_user("import-dedupe-batch@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-dedupe-batch@example.com", "Password123!")

        preview_payload = self._preview_csv_payload(
            client,
            (
                "Date,Category,Name,Amount (KWD)\n"
                "2026-02-12,Food,Batch Tea,1.000\n"
                "2026-02-12,Food,Batch Tea,1.000\n"
            ),
            filename="batch-tea.csv",
        )
        rows = preview_payload.get("preview_rows") or []
        file_hash = preview_payload.get("file_hash")

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": rows, "file_hash": file_hash, "allow_duplicates": False},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("imported"), 2)
        self.assertEqual(payload.get("created"), 2)
        self.assertEqual(payload.get("skipped_idempotent"), 0)
        self.assertTrue(payload.get("import_batch_id"))
        row_results = payload.get("row_results") or []
        self.assertEqual([row.get("status") for row in row_results], ["created", "created"])

        search = client.get("/api/transactions/search?q=Batch%20Tea&limit=20&offset=0")
        self.assertEqual(search.status_code, 200, search.get_data(as_text=True))
        items = (search.get_json() or {}).get("items") or []
        self.assertEqual(len(items), 2)

        with self.app.app_context():
            rows = self.Transaction.query.filter_by(user_id=user_id, name="Batch Tea").all()
            self.assertEqual(len(rows), 2)
            self.assertTrue(all(row.import_row_hash for row in rows))
            self.assertTrue(all(row.import_batch_id == payload.get("import_batch_id") for row in rows))

    def test_import_batch_undo_deletes_correct_rows(self):
        user_id = self._create_user("import-undo@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-undo@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-10",
            category="Food",
            name="Keep Me",
            amount_kd="3.000",
        )

        preview_payload = self._preview_csv_payload(
            client,
            (
                "Date,Category,Name,Amount (KWD)\n"
                "2026-02-12,Food,Undo Tea A,1.000\n"
                "2026-02-13,Food,Undo Tea B,2.000\n"
            ),
            filename="undo-batch.csv",
        )

        commit = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": preview_payload.get("preview_rows") or [],
                "file_hash": preview_payload.get("file_hash"),
            },
        )
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        batch_id = (commit.get_json() or {}).get("import_batch_id")
        self.assertTrue(batch_id)

        with self.app.app_context():
            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id).count(), 3)

        delete_res = client.delete(
            f"/api/transactions/import-batch/{batch_id}",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(delete_res.status_code, 200, delete_res.get_data(as_text=True))
        delete_payload = delete_res.get_json() or {}
        self.assertTrue(delete_payload.get("ok"))
        self.assertEqual(delete_payload.get("deleted_count"), 2)

        with self.app.app_context():
            remaining = self.Transaction.query.filter_by(user_id=user_id).all()
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].name, "Keep Me")
            self.assertIsNone(remaining[0].import_batch_id)

    def test_import_batch_undo_does_not_affect_other_users_transactions(self):
        owner_id = self._create_user("import-undo-owner@example.com", "Password123!")
        owner_client = self.app.test_client()
        self._login(owner_client, "import-undo-owner@example.com", "Password123!")

        preview_payload = self._preview_csv_payload(
            owner_client,
            (
                "Date,Category,Name,Amount (KWD)\n"
                "2026-02-12,Food,Owner Tea A,1.000\n"
                "2026-02-13,Food,Owner Tea B,2.000\n"
            ),
            filename="owner-batch.csv",
        )
        commit = self._post(
            owner_client,
            "/api/transactions/import-commit",
            json={
                "rows": preview_payload.get("preview_rows") or [],
                "file_hash": preview_payload.get("file_hash"),
            },
        )
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        batch_id = (commit.get_json() or {}).get("import_batch_id")
        self.assertTrue(batch_id)

        attacker_id = self._create_user("import-undo-attacker@example.com", "Password123!")
        attacker_client = self.app.test_client()
        self._login(attacker_client, "import-undo-attacker@example.com", "Password123!")

        denied = attacker_client.delete(
            f"/api/transactions/import-batch/{batch_id}",
            headers=self._csrf_headers(attacker_client),
        )
        self.assertEqual(denied.status_code, 404, denied.get_data(as_text=True))
        denied_payload = denied.get_json() or {}
        self.assertFalse(denied_payload.get("ok"))
        self.assertEqual(denied_payload.get("error_code"), "import_batch_not_found")

        with self.app.app_context():
            owner_rows = self.Transaction.query.filter_by(user_id=owner_id).all()
            attacker_rows = self.Transaction.query.filter_by(user_id=attacker_id).all()
            self.assertEqual(len(owner_rows), 2)
            self.assertEqual(len(attacker_rows), 0)
            self.assertTrue(all(row.import_batch_id == batch_id for row in owner_rows))

    def test_import_batch_undo_invalid_batch_id_returns_404(self):
        self._create_user("import-undo-invalid@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-undo-invalid@example.com", "Password123!")

        res = client.delete(
            "/api/transactions/import-batch/not-a-uuid",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(res.status_code, 404, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "import_batch_not_found")

    def test_reimport_same_file_all_rows_skipped_idempotent(self):
        self._create_user("import-all-dupes@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-all-dupes@example.com", "Password123!")

        preview_payload = self._preview_csv_payload(
            client,
            (
                "Date,Category,Name,Amount (KWD)\n"
                "2026-02-12,Food,Existing A,1.000\n"
                "2026-02-13,Food,Existing B,2.000\n"
            ),
            filename="existing.csv",
        )
        existing_rows = preview_payload.get("preview_rows") or []
        file_hash = preview_payload.get("file_hash")

        seed = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": existing_rows, "file_hash": file_hash, "allow_duplicates": False},
        )
        self.assertEqual(seed.status_code, 200, seed.get_data(as_text=True))
        self.assertEqual((seed.get_json() or {}).get("imported"), 2)
        self.assertEqual((seed.get_json() or {}).get("created"), 2)

        replay = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": existing_rows, "file_hash": file_hash, "allow_duplicates": False},
        )
        self.assertEqual(replay.status_code, 200, replay.get_data(as_text=True))
        replay_payload = replay.get_json() or {}
        self.assertTrue(replay_payload.get("ok"))
        self.assertEqual(replay_payload.get("imported"), 0)
        self.assertEqual(replay_payload.get("skipped_idempotent"), 2)
        row_results = replay_payload.get("row_results") or []
        self.assertEqual(
            [row.get("status") for row in row_results],
            ["skipped_idempotent", "skipped_idempotent"],
        )

    def test_skipped_idempotent_does_not_trigger_atomic_blocking(self):
        self._create_user("import-idempotent-non-blocking@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-idempotent-non-blocking@example.com", "Password123!")

        preview_payload = self._preview_csv_payload(
            client,
            (
                "Date,Category,Name,Amount (KWD)\n"
                "2026-02-12,Food,Idem A,1.000\n"
                "2026-02-13,Food,Idem B,2.000\n"
            ),
            filename="idem-a.csv",
        )
        initial_rows = preview_payload.get("preview_rows") or []
        first_hash = preview_payload.get("file_hash")

        seed = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": initial_rows, "file_hash": first_hash},
        )
        self.assertEqual(seed.status_code, 200, seed.get_data(as_text=True))

        mixed_rows = [initial_rows[0], {**initial_rows[1], "name": "Fresh C", "date": "2026-02-14"}]
        replay = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": mixed_rows, "file_hash": first_hash},
        )
        self.assertEqual(replay.status_code, 200, replay.get_data(as_text=True))
        replay_payload = replay.get_json() or {}
        self.assertTrue(replay_payload.get("ok"))
        self.assertEqual(replay_payload.get("imported"), 1)
        self.assertEqual(replay_payload.get("skipped_idempotent"), 1)
        self.assertEqual(
            [row.get("status") for row in (replay_payload.get("row_results") or [])],
            ["skipped_idempotent", "created"],
        )

    def test_transactions_with_same_triplet_different_file_hash_both_imported(self):
        user_id = self._create_user("import-different-file-hash@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-different-file-hash@example.com", "Password123!")

        first_preview = self._preview_csv_payload(
            client,
            "Date,Category,Name,Amount (KWD)\n2026-02-12,Food,Hash Tea,1.000\n",
            filename="hash-a.csv",
        )
        second_preview = self._preview_csv_payload(
            client,
            "Date,Category,Name,Amount (KWD)\n2026-02-12,Food,Hash Tea,1.000\n\n",
            filename="hash-b.csv",
        )

        self.assertNotEqual(first_preview.get("file_hash"), second_preview.get("file_hash"))

        first_commit = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": first_preview.get("preview_rows") or [], "file_hash": first_preview.get("file_hash")},
        )
        second_commit = self._post(
            client,
            "/api/transactions/import-commit",
            json={"rows": second_preview.get("preview_rows") or [], "file_hash": second_preview.get("file_hash")},
        )

        self.assertEqual(first_commit.status_code, 200, first_commit.get_data(as_text=True))
        self.assertEqual(second_commit.status_code, 200, second_commit.get_data(as_text=True))

        with self.app.app_context():
            rows = self.Transaction.query.filter_by(user_id=user_id, name="Hash Tea").all()
            self.assertEqual(len(rows), 2)
            self.assertEqual(len({row.import_row_hash for row in rows}), 2)

    def test_import_commit_reimported_atomic_export_marks_existing_row_unchanged(self):
        user_id = self._create_user("import-legacy-grouped@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-legacy-grouped@example.com", "Password123!")

        with self.app.app_context():
            category = self.Category(user_id=user_id, name="Groceries", is_income=False)
            merchant = self.Merchant(user_id=user_id, name="Local Market")
            self.db.session.add_all([category, merchant])
            self.db.session.flush()

            txn = self.Transaction(
                user_id=user_id,
                date=date(2026, 2, 3),
                category_id=category.id,
                merchant_id=merchant.id,
                name="Weekly Shop",
                memo="Imported legacy split",
                name_key="weekly-shop",
                amount_kd=Decimal("4.000"),
            )
            self.db.session.add(txn)
            self.db.session.commit()

        export_res = client.get("/api/transactions/export-csv")
        self.assertEqual(export_res.status_code, 200, export_res.get_data(as_text=True))

        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(export_res.data), "legacy-export.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        rows = (preview.get_json() or {}).get("preview_rows") or []
        self.assertEqual(len(rows), 1)
        self.assertIsNotNone((rows[0] or {}).get("transaction_id"))

        commit = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": rows,
                "file_hash": (preview.get_json() or {}).get("file_hash"),
                "allow_duplicates": False,
            },
        )
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        payload = commit.get_json() or {}
        self.assertEqual(payload.get("imported"), 0)
        self.assertEqual(payload.get("created"), 0)
        self.assertEqual(payload.get("updated"), 0)
        self.assertEqual(payload.get("unchanged"), 1)
        self.assertEqual(payload.get("skipped_duplicate"), 0)

        with self.app.app_context():
            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id).count(), 1)


if __name__ == "__main__":
    unittest.main()
