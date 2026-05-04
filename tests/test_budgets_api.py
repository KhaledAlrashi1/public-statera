import os
import unittest

from preflight_base import resolve_test_database_url


class BudgetsApiTests(unittest.TestCase):
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
        os.environ["SECRET_KEY"] = "test-secret-key-for-budgets"
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
            return user.id

    def _login(self, client, email: str, password: str):
        res = self._post(client, "/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _create_transaction(self, client, *, month: str, category: str, amount_kd: str, name: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": f"{month}-10",
                "name": name,
                "category": category,
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

    def test_budgets_requires_auth(self):
        client = self.app.test_client()

        res_get = client.get("/api/budgets?month=2026-01")
        self.assertEqual(res_get.status_code, 401)

        res_post = self._post(client, "/api/budgets", json={"month": "2026-01", "items": []})
        self.assertEqual(res_post.status_code, 401)

    def test_budgets_validates_month_format(self):
        self._create_user("budget-month@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "budget-month@example.com", "Password123!")

        bad_get = client.get("/api/budgets?month=2026-1")
        self.assertEqual(bad_get.status_code, 400)
        self.assertIn("YYYY-MM", (bad_get.get_json() or {}).get("error", ""))

        bad_post = self._post(client, "/api/budgets", json={"month": "2026-13", "items": []})
        self.assertEqual(bad_post.status_code, 400)
        self.assertIn("YYYY-MM", (bad_post.get_json() or {}).get("error", ""))

    def test_budgets_profile_context_uses_income(self):
        self._create_user("budget-profile@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "budget-profile@example.com", "Password123!")
        month = "2026-02"

        profile_update = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": "9999.000", "payday_day": 25},
        )
        self.assertEqual(profile_update.status_code, 200, profile_update.get_data(as_text=True))
        self._create_transaction(
            client,
            month=month,
            category="Income Salary",
            amount_kd="2000.000",
            name="Salary",
        )

        save = self._post(
            client,
            "/api/budgets",
            json={
                "month": month,
                "items": [
                    {"category": "Groceries", "amount_kd": "300.000"},
                    {"category": "Rent", "amount_kd": "500.000"},
                ],
            },
        )
        self.assertEqual(save.status_code, 200, save.get_data(as_text=True))
        payload = save.get_json() or {}
        context = payload.get("profile_context") or {}
        self.assertAlmostEqual(context.get("budget_total_kd", 0), 800.0, places=3)
        self.assertAlmostEqual(context.get("monthly_income_kd", 0), 2000.0, places=3)
        self.assertAlmostEqual(context.get("budget_to_income_pct", 0), 40.0, places=1)
        self.assertEqual(context.get("payday_day"), 25)

        fetch = client.get(f"/api/budgets?month={month}")
        self.assertEqual(fetch.status_code, 200, fetch.get_data(as_text=True))
        fetched_context = (fetch.get_json() or {}).get("profile_context") or {}
        self.assertAlmostEqual(fetched_context.get("budget_total_kd", 0), 800.0, places=3)
        self.assertAlmostEqual(fetched_context.get("monthly_income_kd", 0), 2000.0, places=3)
        self.assertAlmostEqual(fetched_context.get("budget_to_income_pct", 0), 40.0, places=1)
        self.assertEqual(fetched_context.get("payday_day"), 25)

    def test_budgets_reject_duplicate_categories_case_insensitive(self):
        self._create_user("budget-duplicates@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "budget-duplicates@example.com", "Password123!")

        save = self._post(
            client,
            "/api/budgets",
            json={
                "month": "2026-02",
                "items": [
                    {"category": "Groceries", "amount_kd": "100.000"},
                    {"category": " groceries ", "amount_kd": "200.000"},
                ],
            },
        )
        self.assertEqual(save.status_code, 400, save.get_data(as_text=True))
        payload = save.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "budget_duplicate_category")
        self.assertIn("Duplicate categories: Groceries", payload.get("error") or "")
        self.assertEqual((payload.get("meta") or {}).get("duplicate_categories"), ["Groceries"])

        fetch = client.get("/api/budgets?month=2026-02")
        self.assertEqual(fetch.status_code, 200, fetch.get_data(as_text=True))
        self.assertEqual(((fetch.get_json() or {}).get("items") or []), [])
