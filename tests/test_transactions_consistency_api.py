import os
import unittest

from sqlalchemy import text

from preflight_base import resolve_test_database_url


class TransactionsConsistencyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._env_keys = [
            "DATABASE_URL",
            "PERSONAL_STATERA_DEV_MODE",
            "SECRET_KEY",
            "ENABLE_TEMPLATE_SUGGESTIONS",
            "RATE_LIMIT_BACKEND",
        ]
        cls._prev_env = {k: os.environ.get(k) for k in cls._env_keys}

        os.environ["DATABASE_URL"] = resolve_test_database_url()
        os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
        os.environ["SECRET_KEY"] = "test-secret-key-for-transactions-consistency"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        from backend import create_app, db, bcrypt
        from backend.models import User

        cls.create_app = create_app
        cls.db = db
        cls.bcrypt = bcrypt
        cls.User = User

        cls.app = create_app()
        cls.app.config["TESTING"] = True

    @classmethod
    def tearDownClass(cls):
        for key, value in cls._prev_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def setUp(self):
        from backend.security_ops import _rate_limiter
        with self.app.app_context():
            _rate_limiter.reset()
            self.db.session.remove()
            self.db.session.execute(text("DROP TABLE IF EXISTS items CASCADE"))
            self.db.session.commit()
            self.db.drop_all()
            self.db.create_all()

    def _csrf_headers(self, client):
        res = client.get("/api/csrf-token")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        token = (res.get_json() or {}).get("csrf_token")
        self.assertTrue(token)
        return {
            "X-CSRFToken": token,
            "X-Requested-With": "fetch",
        }

    def _post(self, client, url, json=None):
        return client.post(url, json=json, headers=self._csrf_headers(client))

    def _create_user(self, email: str, password: str):
        with self.app.app_context():
            user = self.User(
                email=email,
                password_hash=self.bcrypt.generate_password_hash(password).decode("utf-8"),
            )
            self.db.session.add(user)
            self.db.session.commit()

    def _login(self, client, email: str, password: str):
        res = self._post(client, "/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def test_create_rejects_empty_or_invalid_item_payload(self):
        self._create_user("tx-consistency-1@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-1@example.com", "Password123!")

        res = self._post(client, "/api/transactions/create", json={
            "date": "2026-02-10",
            "category": "Groceries",
            "name": "Market",
            "amount_kd": "10.000",
            "items_json": [],
        })
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        self.assertIn("At least one line item", (res.get_json() or {}).get("error", ""))

        res2 = self._post(client, "/api/transactions/create", json={
            "date": "2026-02-10",
            "category": "Groceries",
            "name": "Market",
            "amount_kd": "10.000",
            "items_json": [{"name": "Milk", "category": "Groceries", "amount_kd": "0"}],
        })
        self.assertEqual(res2.status_code, 400, res2.get_data(as_text=True))
        self.assertIn("greater than zero", (res2.get_json() or {}).get("error", ""))

    def test_update_keeps_transaction_fields_consistent_with_single_item_payload(self):
        self._create_user("tx-consistency-2@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-2@example.com", "Password123!")

        create_res = self._post(client, "/api/transactions/create", json={
            "date": "2026-02-11",
            "merchant": "Coop",
            "category": "Groceries",
            "name": "Initial",
            "amount_kd": "7.000",
            "items_json": [
                {"name": "Initial", "category": "Groceries", "amount_kd": "7.000"},
            ],
        })
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = (create_res.get_json() or {}).get("item", {}).get("id")
        self.assertTrue(txn_id)

        update_res = self._post(client, f"/api/transactions/{txn_id}/update", json={
            "date": "2026-02-12",
            "merchant": "Coop Hyper",
            "memo": "updated",
            "items_json": [
                {"name": "Weekly groceries", "category": "Groceries", "amount_kd": "8.500"},
            ],
        })
        self.assertEqual(update_res.status_code, 200, update_res.get_data(as_text=True))
        updated_item = (update_res.get_json() or {}).get("item") or {}
        self.assertEqual(updated_item.get("item_count"), 1)
        self.assertEqual(len(updated_item.get("items") or []), 1)
        self.assertEqual((updated_item.get("items") or [{}])[0].get("name"), "Weekly groceries")

        detail_res = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail_res.status_code, 200, detail_res.get_data(as_text=True))
        payload = detail_res.get_json() or {}
        txn = payload.get("transaction") or {}
        items = txn.get("items") or []

        self.assertEqual(txn.get("date"), "2026-02-12")
        self.assertEqual(txn.get("merchant"), "Coop Hyper")
        self.assertEqual(txn.get("memo"), "updated")
        self.assertEqual(txn.get("name"), "Weekly groceries")
        self.assertEqual(txn.get("category"), "Groceries")
        self.assertEqual(txn.get("amount_kd"), "8.500")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].get("name"), "Weekly groceries")
        self.assertEqual(items[0].get("category"), "Groceries")
        self.assertEqual(items[0].get("amount_kd"), "8.500")

    def test_update_rejects_multi_item_payloads(self):
        self._create_user("tx-consistency-2b@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-2b@example.com", "Password123!")

        create_res = self._post(client, "/api/transactions/create", json={
            "date": "2026-02-11",
            "merchant": "Coop",
            "category": "Groceries",
            "name": "Initial",
            "amount_kd": "7.000",
            "items_json": [
                {"name": "Initial", "category": "Groceries", "amount_kd": "7.000"},
            ],
        })
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = (create_res.get_json() or {}).get("item", {}).get("id")
        self.assertTrue(txn_id)

        update_res = self._post(client, f"/api/transactions/{txn_id}/update", json={
            "date": "2026-02-12",
            "merchant": "Coop Hyper",
            "items_json": [
                {"name": "Bread", "category": "Groceries", "amount_kd": "5.000"},
                {"name": "Taxi", "category": "Transport", "amount_kd": "2.000"},
            ],
        })
        self.assertEqual(update_res.status_code, 400, update_res.get_data(as_text=True))
        self.assertIn("no longer supported", (update_res.get_json() or {}).get("error", ""))

    def test_search_validates_limit_and_offset(self):
        self._create_user("tx-consistency-3@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-3@example.com", "Password123!")

        bad_limit = client.get("/api/transactions/search?limit=0")
        self.assertEqual(bad_limit.status_code, 400)
        self.assertIn("limit must be between", (bad_limit.get_json() or {}).get("error", ""))

        bad_offset = client.get("/api/transactions/search?offset=-1")
        self.assertEqual(bad_offset.status_code, 400)
        self.assertIn("offset must be >=", (bad_offset.get_json() or {}).get("error", ""))

    def test_search_include_total_false_uses_has_more_without_total_count(self):
        self._create_user("tx-consistency-3b@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-3b@example.com", "Password123!")

        for day, amount in [(10, "1.000"), (11, "2.000"), (12, "3.000")]:
            res = self._post(client, "/api/transactions/create", json={
                "date": f"2026-02-{day}",
                "category": "Groceries",
                "name": f"Item {day}",
                "amount_kd": amount,
                "items_json": [{"name": f"Item {day}", "category": "Groceries", "amount_kd": amount}],
            })
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        page1 = client.get("/api/transactions/search?limit=2&offset=0&include_total=false")
        self.assertEqual(page1.status_code, 200, page1.get_data(as_text=True))
        page1_payload = page1.get_json() or {}
        self.assertEqual(page1_payload.get("total"), -1)
        self.assertEqual(len(page1_payload.get("items") or []), 2)
        self.assertTrue(page1_payload.get("has_more"))

        page2 = client.get("/api/transactions/search?limit=2&offset=2&include_total=false")
        self.assertEqual(page2.status_code, 200, page2.get_data(as_text=True))
        page2_payload = page2.get_json() or {}
        self.assertEqual(page2_payload.get("total"), -1)
        self.assertEqual(len(page2_payload.get("items") or []), 1)
        self.assertFalse(page2_payload.get("has_more"))

    def test_foreign_user_cannot_access_transaction_resource_routes(self):
        self._create_user("tx-owner@example.com", "Password123!")
        self._create_user("tx-foreign@example.com", "Password456!")

        owner = self.app.test_client()
        self._login(owner, "tx-owner@example.com", "Password123!")
        create_res = self._post(owner, "/api/transactions/create", json={
            "date": "2026-02-13",
            "merchant": "Corner Shop",
            "category": "Groceries",
            "name": "Owner Transaction",
            "amount_kd": "5.000",
            "items_json": [
                {"name": "Owner Transaction", "category": "Groceries", "amount_kd": "5.000"},
            ],
        })
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = (create_res.get_json() or {}).get("item", {}).get("id")
        self.assertTrue(txn_id)

        foreign = self.app.test_client()
        self._login(foreign, "tx-foreign@example.com", "Password456!")

        detail = foreign.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail.status_code, 404)

        update = self._post(foreign, f"/api/transactions/{txn_id}/update", json={
            "date": "2026-02-13",
            "category": "Groceries",
            "name": "Hijacked",
            "amount_kd": "5.000",
        })
        self.assertEqual(update.status_code, 404)

        split = self._post(foreign, f"/api/transactions/{txn_id}/split", json={
            "rows": [
                {"name": "Bread", "category": "Groceries", "amount_kd": "2.000"},
                {"name": "Milk", "category": "Groceries", "amount_kd": "3.000"},
            ],
        })
        self.assertEqual(split.status_code, 404)

        delete = self._post(foreign, f"/api/transactions/{txn_id}/delete", json={})
        self.assertEqual(delete.status_code, 404)

        owner_detail = owner.get(f"/api/transactions/{txn_id}")
        self.assertEqual(owner_detail.status_code, 200, owner_detail.get_data(as_text=True))
        owner_txn = (owner_detail.get_json() or {}).get("transaction") or {}
        self.assertEqual(owner_txn.get("name"), "Owner Transaction")

    def test_by_category_include_total_false_uses_has_more_without_total_count(self):
        self._create_user("tx-consistency-3c@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-3c@example.com", "Password123!")

        for day, amount in [(10, "1.000"), (11, "2.000"), (12, "3.000")]:
            res = self._post(client, "/api/transactions/create", json={
                "date": f"2026-02-{day}",
                "category": "Groceries",
                "name": f"Groceries {day}",
                "amount_kd": amount,
                "items_json": [{"name": f"Groceries {day}", "category": "Groceries", "amount_kd": amount}],
            })
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        page1 = client.get("/api/transactions/by-category?category=Groceries&limit=2&offset=0&include_total=false")
        self.assertEqual(page1.status_code, 200, page1.get_data(as_text=True))
        page1_payload = page1.get_json() or {}
        self.assertTrue(page1_payload.get("ok"))
        self.assertEqual(page1_payload.get("total"), -1)
        self.assertEqual(len(page1_payload.get("items") or []), 2)
        self.assertTrue(page1_payload.get("has_more"))

        page2 = client.get("/api/transactions/by-category?category=Groceries&limit=2&offset=2&include_total=false")
        self.assertEqual(page2.status_code, 200, page2.get_data(as_text=True))
        page2_payload = page2.get_json() or {}
        self.assertTrue(page2_payload.get("ok"))
        self.assertEqual(page2_payload.get("total"), -1)
        self.assertEqual(len(page2_payload.get("items") or []), 1)
        self.assertFalse(page2_payload.get("has_more"))

    def test_bulk_update_updates_transaction_category(self):
        self._create_user("tx-consistency-bulk@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-bulk@example.com", "Password123!")

        create_res = self._post(client, "/api/transactions/create", json={
            "date": "2026-02-11",
            "merchant": "Coop",
            "category": "Groceries",
            "name": "Initial",
            "amount_kd": "7.000",
            "items_json": [
                {"name": "Initial", "category": "Groceries", "amount_kd": "7.000"},
            ],
        })
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = (create_res.get_json() or {}).get("item", {}).get("id")
        self.assertTrue(txn_id)

        bulk_res = self._post(
            client,
            "/api/transactions/bulk-update",
            json={"ids": [txn_id], "changes": {"category": "Household"}},
        )
        self.assertEqual(bulk_res.status_code, 200, bulk_res.get_data(as_text=True))

        detail_res = client.get(f"/api/transactions/{txn_id}")
        self.assertEqual(detail_res.status_code, 200, detail_res.get_data(as_text=True))
        txn = (detail_res.get_json() or {}).get("transaction") or {}
        self.assertEqual(txn.get("category"), "Household")
        items = txn.get("items") or []
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].get("category"), "Household")

    def test_top_patterns_excludes_income_and_returns_top_rows(self):
        self._create_user("tx-consistency-4@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-4@example.com", "Password123!")

        for payload in [
            {
                "date": "2026-02-10",
                "category": "Coffee",
                "name": "Latte",
                "amount_kd": "2.000",
                "items_json": [{"name": "Latte", "category": "Coffee", "amount_kd": "2.000"}],
            },
            {
                "date": "2026-02-11",
                "category": "Coffee",
                "name": "Latte",
                "amount_kd": "2.500",
                "items_json": [{"name": "Latte", "category": "Coffee", "amount_kd": "2.500"}],
            },
            {
                "date": "2026-02-12",
                "category": "Groceries",
                "name": "Market",
                "amount_kd": "7.000",
                "items_json": [{"name": "Market", "category": "Groceries", "amount_kd": "7.000"}],
            },
            {
                "date": "2026-02-12",
                "category": "Income: Salary",
                "name": "Salary",
                "amount_kd": "1000.000",
                "items_json": [{"name": "Salary", "category": "Income: Salary", "amount_kd": "1000.000"}],
            },
        ]:
            res = self._post(client, "/api/transactions/create", json=payload)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        top_res = client.get("/api/transactions/top-patterns?range=all")
        self.assertEqual(top_res.status_code, 200, top_res.get_data(as_text=True))
        top_payload = top_res.get_json() or {}

        self.assertTrue(top_payload.get("ok"))
        items = top_payload.get("items") or []
        self.assertGreaterEqual(len(items), 2)
        self.assertEqual(items[0].get("name"), "Latte")
        self.assertEqual(items[0].get("count"), 2)
        self.assertAlmostEqual(float(items[0].get("sum_kd")), 4.5, places=3)
        names = [it.get("name") for it in items]
        self.assertNotIn("Salary", names)

    def test_search_supports_income_only_and_date_bounds(self):
        self._create_user("tx-consistency-5@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-5@example.com", "Password123!")

        for payload in [
            {
                "date": "2026-01-20",
                "category": "Income: Salary",
                "name": "January Salary",
                "amount_kd": "1000.000",
                "items_json": [{"name": "January Salary", "category": "Income: Salary", "amount_kd": "1000.000"}],
            },
            {
                "date": "2026-02-20",
                "category": "Income",
                "name": "Freelance",
                "amount_kd": "200.000",
                "items_json": [{"name": "Freelance", "category": "Income", "amount_kd": "200.000"}],
            },
            {
                "date": "2026-02-21",
                "category": "Groceries",
                "name": "Market",
                "amount_kd": "20.000",
                "items_json": [{"name": "Market", "category": "Groceries", "amount_kd": "20.000"}],
            },
        ]:
            res = self._post(client, "/api/transactions/create", json=payload)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        income_res = client.get("/api/transactions/search?income_only=true&date_from=2026-02-01&limit=50")
        self.assertEqual(income_res.status_code, 200, income_res.get_data(as_text=True))
        income_payload = income_res.get_json() or {}
        names = [row.get("name") for row in (income_payload.get("items") or [])]
        self.assertEqual(names, ["Freelance"])

        conflict_res = client.get("/api/transactions/search?income_only=true&exclude_income=true")
        self.assertEqual(conflict_res.status_code, 400)
        self.assertIn("cannot both be true", (conflict_res.get_json() or {}).get("error", ""))

    def test_search_rejects_inverted_date_range(self):
        self._create_user("tx-consistency-6@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-6@example.com", "Password123!")

        res = client.get("/api/transactions/search?date_from=2026-02-10&date_to=2026-02-01")
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "invalid_date_range")
        self.assertIn("date_from must be on or before date_to", payload.get("error") or "")

    def test_search_treats_sql_wildcards_as_literal_characters(self):
        self._create_user("tx-consistency-7@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-7@example.com", "Password123!")

        for payload in [
            {
                "date": "2026-02-10",
                "category": "Groceries",
                "name": "Discount 100%",
                "amount_kd": "10.000",
                "items_json": [{"name": "Discount 100%", "category": "Groceries", "amount_kd": "10.000"}],
            },
            {
                "date": "2026-02-11",
                "category": "Groceries",
                "name": "Discount 100x",
                "amount_kd": "11.000",
                "items_json": [{"name": "Discount 100x", "category": "Groceries", "amount_kd": "11.000"}],
            },
            {
                "date": "2026-02-12",
                "category": "Groceries",
                "name": "Invoice_1",
                "amount_kd": "12.000",
                "items_json": [{"name": "Invoice_1", "category": "Groceries", "amount_kd": "12.000"}],
            },
            {
                "date": "2026-02-13",
                "category": "Groceries",
                "name": "InvoiceA1",
                "amount_kd": "13.000",
                "items_json": [{"name": "InvoiceA1", "category": "Groceries", "amount_kd": "13.000"}],
            },
        ]:
            res = self._post(client, "/api/transactions/create", json=payload)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        percent_res = client.get("/api/transactions/search", query_string={"q": "%", "limit": 50})
        self.assertEqual(percent_res.status_code, 200, percent_res.get_data(as_text=True))
        percent_names = [row.get("name") for row in ((percent_res.get_json() or {}).get("items") or [])]
        self.assertEqual(percent_names, ["Discount 100%"])

        underscore_res = client.get("/api/transactions/search", query_string={"q": "_", "limit": 50})
        self.assertEqual(underscore_res.status_code, 200, underscore_res.get_data(as_text=True))
        underscore_names = [row.get("name") for row in ((underscore_res.get_json() or {}).get("items") or [])]
        self.assertEqual(underscore_names, ["Invoice_1"])

    def test_by_category_search_treats_sql_wildcards_as_literal_characters(self):
        self._create_user("tx-consistency-8@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-consistency-8@example.com", "Password123!")

        for payload in [
            {
                "date": "2026-02-14",
                "category": "Groceries",
                "name": "Category Search One",
                "amount_kd": "4.000",
                "items_json": [{"name": "Apples_1", "category": "Groceries", "amount_kd": "4.000"}],
            },
            {
                "date": "2026-02-15",
                "category": "Groceries",
                "name": "Category Search Two",
                "amount_kd": "5.000",
                "items_json": [{"name": "ApplesA1", "category": "Groceries", "amount_kd": "5.000"}],
            },
        ]:
            res = self._post(client, "/api/transactions/create", json=payload)
            self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        res = client.get(
            "/api/transactions/by-category",
            query_string={"category": "Groceries", "q": "_", "limit": 50},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        names = [row.get("name") for row in ((res.get_json() or {}).get("items") or [])]
        self.assertEqual(names, ["Apples_1"])
