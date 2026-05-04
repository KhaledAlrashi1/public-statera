import unittest

from preflight_base import PreflightApiTestBase


class CategoryGovernanceTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.user_id = self._create_user("category-governance@example.com", "Password123!")

    def test_get_or_create_category_requires_user_scope(self):
        from backend.lib.categories import get_or_create_category

        with self.app.app_context():
            with self.assertRaises(ValueError):
                get_or_create_category("Travel", None)  # type: ignore[arg-type]

    def test_import_commit_creates_user_scoped_category_even_when_global_exists(self):
        client = self.app.test_client()
        self._login(client, "category-governance@example.com", "Password123!")

        with self.app.app_context():
            from backend.models import Category

            self.db.session.add(Category(user_id=None, name="Travel", is_income=False))
            self.db.session.commit()

        commit_res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-02-19",
                        "category": "Travel",
                        "name": "Airport taxi",
                        "amount_kd": "8.500",
                    }
                ]
            },
        )
        self.assertEqual(commit_res.status_code, 200, commit_res.get_data(as_text=True))

        with self.app.app_context():
            from backend.models import Category, Transaction

            category_rows = (
                Category.query
                .filter(Category.name == "Travel")
                .order_by(Category.user_id.asc().nullsfirst(), Category.id.asc())
                .all()
            )
            self.assertEqual(len(category_rows), 2)

            global_category = next((row for row in category_rows if row.user_id is None), None)
            user_category = next((row for row in category_rows if row.user_id == self.user_id), None)
            self.assertIsNotNone(global_category)
            self.assertIsNotNone(user_category)

            txn = Transaction.query.filter_by(user_id=self.user_id, name="Airport taxi").first()
            self.assertIsNotNone(txn)
            self.assertEqual(int(txn.category_id), int(user_category.id))

    def test_create_category_is_always_user_owned(self):
        client = self.app.test_client()
        self._login(client, "category-governance@example.com", "Password123!")

        res = self._post(
            client,
            "/api/categories",
            json={"name": "User Owned", "is_income": False},
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        item = ((res.get_json() or {}).get("data") or {}).get("item") or {}

        with self.app.app_context():
            from backend.models import Category

            category = self.db.session.get(Category, int(item["id"]))
            self.assertIsNotNone(category)
            self.assertEqual(int(category.user_id), int(self.user_id))

    def test_user_cannot_create_global_category_via_request_body(self):
        client = self.app.test_client()
        self._login(client, "category-governance@example.com", "Password123!")

        res = self._post(
            client,
            "/api/categories",
            json={"name": "Sneaky Global", "is_income": False, "user_id": None},
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        item = ((res.get_json() or {}).get("data") or {}).get("item") or {}

        with self.app.app_context():
            from backend.models import Category

            category = self.db.session.get(Category, int(item["id"]))
            self.assertIsNotNone(category)
            self.assertEqual(int(category.user_id), int(self.user_id))

    def test_import_commit_creates_user_owned_category(self):
        client = self.app.test_client()
        self._login(client, "category-governance@example.com", "Password123!")

        res = self._post(
            client,
            "/api/transactions/import-commit",
            json={
                "rows": [
                    {
                        "date": "2026-03-01",
                        "category": "NewImportCat",
                        "name": "Imported Row",
                        "amount_kd": "10.000",
                    }
                ]
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        with self.app.app_context():
            from backend.models import Category

            category = Category.query.filter_by(name="NewImportCat").first()
            self.assertIsNotNone(category)
            self.assertEqual(int(category.user_id), int(self.user_id))


if __name__ == "__main__":
    unittest.main()
