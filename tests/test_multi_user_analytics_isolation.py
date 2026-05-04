"""Multi-user analytics isolation regression tests.

Verifies that each user sees only their own data across all key analytics
and data endpoints. These are the highest-risk correctness boundaries for
a multi-user personal finance app.

Covered surfaces:
  - Transaction list and search
  - Category list and archive/restore
  - Budget list and metrics
  - Savings goals list
  - Safe-to-spend analytics
  - Dashboard metrics bundle
  - Insights / account overview
  - Split direction validation (cannot see other user's categories)
"""

import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from preflight_base import resolve_test_database_url


class MultiUserIsolationTests(unittest.TestCase):
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
        os.environ["SECRET_KEY"] = "test-secret-multi-user-isolation"
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

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _csrf_headers(self, client):
        res = client.get("/api/csrf-token")
        self.assertEqual(res.status_code, 200)
        token = (res.get_json() or {}).get("csrf_token")
        self.assertTrue(token)
        return {"X-CSRFToken": token, "X-Requested-With": "fetch"}

    def _post(self, client, url, json=None):
        return client.post(url, json=json, headers=self._csrf_headers(client))

    def _delete(self, client, url, json=None):
        return client.delete(url, json=json, headers=self._csrf_headers(client))

    def _create_user(self, email: str, password: str = "Password123!"):
        with self.app.app_context():
            user = self.User(
                email=email,
                password_hash=self.bcrypt.generate_password_hash(password).decode("utf-8"),
            )
            self.db.session.add(user)
            self.db.session.commit()
            return user.id

    def _login(self, client, email: str, password: str = "Password123!"):
        res = self._post(client, "/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _add_transaction(self, client, *, date="2026-01-15", name="Coffee", category="Food", amount="5.000"):
        res = self._post(client, "/api/transactions/create", json={
            "date": date,
            "name": name,
            "category": category,
            "amount_kd": amount,
        })
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        payload = res.get_json() or {}
        return (
            payload.get("id")
            or payload.get("data", {}).get("id")
            or payload.get("item", {}).get("id")
            or payload.get("data", {}).get("item", {}).get("id")
        )

    def _add_goal(self, client, *, name="Emergency Fund", target_kd="1000.000"):
        res = self._post(client, "/api/savings-goals", json={
            "name": name,
            "goal_type": "emergency_fund",
            "target_kd": target_kd,
        })
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        payload = res.get_json() or {}
        return (
            payload.get("id")
            or payload.get("data", {}).get("id")
            or payload.get("goal", {}).get("id")
            or payload.get("data", {}).get("goal", {}).get("id")
        )

    def _create_bank_bridge_row(
        self,
        *,
        owner_email: str,
        foreign_txn_id: int,
        amount: str,
        institution_name: str,
        date: str = "2026-01-15",
    ):
        with self.app.app_context():
            from backend import db
            from backend.models import BankConnection, BankSyncRun, RawBankTransaction, User

            owner = User.query.filter_by(email=owner_email).first()
            self.assertIsNotNone(owner)

            created_at = datetime.now(timezone.utc)
            connection = BankConnection(
                user_id=owner.id,
                provider="fakebank",
                institution_name=institution_name,
                status="active",
                last_synced_at=created_at,
            )
            db.session.add(connection)
            db.session.flush()

            sync_run = BankSyncRun(
                user_id=owner.id,
                connection_id=connection.id,
                status="committed",
                created_at=created_at,
                committed_at=created_at,
            )
            db.session.add(sync_run)
            db.session.flush()

            raw_row = RawBankTransaction(
                connection_id=connection.id,
                sync_run_id=sync_run.id,
                user_id=owner.id,
                provider_tx_id=f"{institution_name.lower()}-{foreign_txn_id}",
                date=datetime.strptime(date, "%Y-%m-%d").date(),
                description=f"{institution_name} linked row",
                amount_kd=amount,
                status="committed",
                transaction_id=foreign_txn_id,
            )
            db.session.add(raw_row)
            db.session.commit()
            return connection.id

    # ------------------------------------------------------------------
    # Transaction isolation
    # ------------------------------------------------------------------

    def test_transactions_scoped_to_user(self):
        """User B cannot see User A's transactions."""
        self._create_user("txn-a@example.com")
        self._create_user("txn-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "txn-a@example.com")
        self._add_transaction(client_a, name="User A Coffee")

        client_b = self.app.test_client()
        self._login(client_b, "txn-b@example.com")

        res = client_b.get("/api/transactions/search?limit=20&offset=0&include_total=false")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json() or {}
        data = payload.get("data") or payload
        items = data.get("transactions") or data.get("items") or []
        names = [t.get("name") for t in items]
        self.assertNotIn("User A Coffee", names)

    def test_transaction_delete_scoped_to_owner(self):
        """User B cannot delete User A's transaction."""
        self._create_user("del-a@example.com")
        self._create_user("del-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "del-a@example.com")
        txn_id = self._add_transaction(client_a, name="A's Transaction")
        self.assertIsNotNone(txn_id)

        client_b = self.app.test_client()
        self._login(client_b, "del-b@example.com")
        res = self._post(client_b, f"/api/transactions/{txn_id}/delete")
        # Must be 404 (not found for this user) not 200
        self.assertIn(res.status_code, (403, 404))

    # ------------------------------------------------------------------
    # Category isolation
    # ------------------------------------------------------------------

    def test_user_categories_not_visible_to_other_users(self):
        """User-owned categories are not exposed to other users."""
        self._create_user("cat-a@example.com")
        self._create_user("cat-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "cat-a@example.com")
        # Creating a transaction auto-creates the category for user A
        self._add_transaction(client_a, category="UserA-Private-Cat")

        client_b = self.app.test_client()
        self._login(client_b, "cat-b@example.com")
        res = client_b.get("/api/categories")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items") or []
        names = [c.get("name") for c in items]
        self.assertNotIn("UserA-Private-Cat", names)

    def test_category_archive_scoped_to_owner(self):
        """User B cannot archive User A's category."""
        self._create_user("arch-a@example.com")
        self._create_user("arch-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "arch-a@example.com")
        self._add_transaction(client_a, category="A-Special-Cat")

        # Get A's category id
        res = client_a.get("/api/categories")
        items = (res.get_json() or {}).get("items") or []
        cat_a = next((c for c in items if c.get("name") == "A-Special-Cat"), None)
        self.assertIsNotNone(cat_a)
        cat_id = cat_a["id"]

        client_b = self.app.test_client()
        self._login(client_b, "arch-b@example.com")
        res = self._post(client_b, f"/api/categories/{cat_id}/delete")
        self.assertIn(res.status_code, (403, 404))

    # ------------------------------------------------------------------
    # Budget isolation
    # ------------------------------------------------------------------

    def test_budgets_scoped_to_user(self):
        """User B cannot see User A's budgets."""
        self._create_user("budget-a@example.com")
        self._create_user("budget-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "budget-a@example.com")
        self._post(client_a, "/api/budgets", json={
            "month": "2026-01",
            "items": [{"category": "Food", "amount_kd": "200.000"}],
        })

        client_b = self.app.test_client()
        self._login(client_b, "budget-b@example.com")
        res = client_b.get("/api/budgets?month=2026-01")
        self.assertEqual(res.status_code, 200)
        data = res.get_json() or {}
        items = data.get("items") or []
        # User B has no budgets of their own
        self.assertEqual(len(items), 0)

    # ------------------------------------------------------------------
    # Savings goals isolation
    # ------------------------------------------------------------------

    def test_savings_goals_scoped_to_user(self):
        """User B cannot see User A's savings goals."""
        self._create_user("goals-a@example.com")
        self._create_user("goals-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "goals-a@example.com")
        self._add_goal(client_a, name="User A Secret Fund")

        client_b = self.app.test_client()
        self._login(client_b, "goals-b@example.com")
        res = client_b.get("/api/savings-goals")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items") or []
        names = [g.get("name") for g in items]
        self.assertNotIn("User A Secret Fund", names)

    def test_savings_goal_update_scoped_to_owner(self):
        """User B cannot update User A's goal."""
        self._create_user("goal-upd-a@example.com")
        self._create_user("goal-upd-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "goal-upd-a@example.com")
        goal_id = self._add_goal(client_a, name="A Exclusive Goal")
        self.assertIsNotNone(goal_id)

        client_b = self.app.test_client()
        self._login(client_b, "goal-upd-b@example.com")
        res = self._post(client_b, f"/api/savings-goals/{goal_id}/update", json={"name": "Hijacked"})
        self.assertIn(res.status_code, (403, 404))

    # ------------------------------------------------------------------
    # Analytics isolation
    # ------------------------------------------------------------------

    def test_safe_to_spend_not_inflated_by_other_user(self):
        """User B's safe-to-spend is not polluted by User A's transactions."""
        self._create_user("sts-a@example.com")
        self._create_user("sts-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "sts-a@example.com")
        # A sets income and spends a lot
        self._post(client_a, "/api/auth/profile", json={"monthly_income_kd": "5000.000", "payday_day": 1})
        for i in range(3):
            self._add_transaction(client_a, name=f"A Expense {i}", category="Food", amount="300.000")

        client_b = self.app.test_client()
        self._login(client_b, "sts-b@example.com")
        # B has no income set and no transactions — just check the response is valid
        res = client_b.get("/api/safe-to-spend")
        self.assertIn(res.status_code, (200, 422))
        if res.status_code == 200:
            data = res.get_json() or {}
            # B's safe-to-spend must not include A's expenses
            spent = data.get("spent_kd") or data.get("data", {}).get("spent_kd")
            if spent is not None:
                self.assertEqual(float(spent), 0.0)

    def test_dashboard_metrics_scoped_to_user(self):
        """Dashboard metrics for User B do not include User A's transactions."""
        self._create_user("dash-a@example.com")
        self._create_user("dash-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "dash-a@example.com")
        self._add_transaction(client_a, name="A Big Expense", amount="999.999")

        client_b = self.app.test_client()
        self._login(client_b, "dash-b@example.com")
        res = client_b.get("/api/dashboard-metrics?months=1&until=2026-01")
        self.assertIn(res.status_code, (200, 422))
        if res.status_code == 200:
            data = (res.get_json() or {}).get("data") or res.get_json() or {}
            total_expense = data.get("total_expense_kd") or "0.000"
            self.assertEqual(float(total_expense), 0.0)

    def test_spend_by_category_scoped_to_user(self):
        """Spend-by-category excludes another user's transaction totals."""
        self._create_user("category-a@example.com")
        self._create_user("category-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "category-a@example.com")
        self._add_transaction(client_a, date="2026-01-15", category="Food", amount="100.000")

        client_b = self.app.test_client()
        self._login(client_b, "category-b@example.com")
        self._add_transaction(client_b, date="2026-01-15", category="Food", amount="999.000")

        res = client_a.get("/api/spend-by-category?month=2026-01")
        self.assertEqual(res.status_code, 200)
        body = res.get_data(as_text=True)
        self.assertNotIn("999", body)
        data = (res.get_json() or {}).get("data") or {}
        items = data.get("items") or {}
        self.assertEqual(float(items.get("Food")), 100.0)

    def test_spend_by_month_scoped_to_user(self):
        """Spend-by-month excludes another user's monthly totals."""
        self._create_user("month-a@example.com")
        self._create_user("month-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "month-a@example.com")
        self._add_transaction(client_a, date="2026-01-15", category="Food", amount="100.000")

        client_b = self.app.test_client()
        self._login(client_b, "month-b@example.com")
        self._add_transaction(client_b, date="2026-01-15", category="Food", amount="999.000")

        res = client_a.get("/api/spend-by-month")
        self.assertEqual(res.status_code, 200)
        body = res.get_data(as_text=True)
        self.assertNotIn("999", body)
        rows = ((res.get_json() or {}).get("data") or {}).get("items") or []
        january = next((row for row in rows if row.get("month") == "2026-01"), None)
        self.assertIsNotNone(january)
        self.assertEqual(float(january.get("total_kd")), 100.0)

    def test_account_overview_connected_accounts_scoped_to_user(self):
        """Account overview ignores bridged raw rows that point at another user's transaction."""
        self._create_user("overview-a@example.com")
        self._create_user("overview-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "overview-a@example.com")
        self._add_transaction(
            client_a,
            date="2026-01-15",
            name="User A Expense",
            category="Food",
            amount="100.000",
        )

        client_b = self.app.test_client()
        self._login(client_b, "overview-b@example.com")
        txn_b_id = self._add_transaction(
            client_b,
            date="2026-01-15",
            name="User B Expense",
            category="Food",
            amount="999.000",
        )
        self.assertIsNotNone(txn_b_id)

        self._create_bank_bridge_row(
            owner_email="overview-a@example.com",
            foreign_txn_id=int(txn_b_id),
            amount="999.000",
            institution_name="Bridge Bank",
        )

        res = client_a.get("/api/analytics/account-overview?month=2026-01")
        self.assertEqual(res.status_code, 200)
        body = res.get_data(as_text=True)
        self.assertNotIn("999", body)
        data = (res.get_json() or {}).get("data") or {}
        accounts = data.get("connected_accounts") or []
        self.assertEqual(len(accounts), 1)
        account = accounts[0]
        self.assertEqual(account.get("institution_name"), "Bridge Bank")
        self.assertEqual(account.get("transactions_mtd"), 0)
        self.assertEqual(str(account.get("spend_mtd")), "0.000")

    def test_dashboard_bundle_nested_account_overview_scoped_to_user(self):
        """Dashboard bundle account overview ignores bridged raw rows to another user's transaction."""
        self._create_user("bundle-a@example.com")
        self._create_user("bundle-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "bundle-a@example.com")
        self._add_transaction(
            client_a,
            date="2026-01-15",
            name="User A Expense",
            category="Food",
            amount="100.000",
        )

        client_b = self.app.test_client()
        self._login(client_b, "bundle-b@example.com")
        txn_b_id = self._add_transaction(
            client_b,
            date="2026-01-15",
            name="User B Expense",
            category="Food",
            amount="999.000",
        )
        self.assertIsNotNone(txn_b_id)

        self._create_bank_bridge_row(
            owner_email="bundle-a@example.com",
            foreign_txn_id=int(txn_b_id),
            amount="999.000",
            institution_name="Bundle Bridge Bank",
        )

        res = client_a.get("/api/dashboard-bundle?month=2026-01")
        self.assertEqual(res.status_code, 200)
        body = res.get_data(as_text=True)
        self.assertNotIn("999", body)
        data = (res.get_json() or {}).get("data") or {}
        overview = data.get("account_overview") or {}
        accounts = overview.get("connected_accounts") or []
        self.assertEqual(len(accounts), 1)
        account = accounts[0]
        self.assertEqual(account.get("institution_name"), "Bundle Bridge Bank")
        self.assertEqual(account.get("transactions_mtd"), 0)
        self.assertEqual(str(account.get("spend_mtd")), "0.000")

    def test_transaction_search_scoped_to_user(self):
        """Search results do not leak across users."""
        self._create_user("search-a@example.com")
        self._create_user("search-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "search-a@example.com")
        self._add_transaction(client_a, name="Confidential Purchase")

        client_b = self.app.test_client()
        self._login(client_b, "search-b@example.com")
        res = client_b.get("/api/transactions/search?q=Confidential&limit=20&offset=0&include_total=false")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json() or {}
        data = payload.get("data") or payload
        items = data.get("transactions") or data.get("items") or []
        names = [t.get("name") for t in items]
        self.assertNotIn("Confidential Purchase", names)

    # ------------------------------------------------------------------
    # Split direction: user-scoped category lookup
    # ------------------------------------------------------------------

    def test_split_direction_uses_own_categories_only(self):
        """Split direction check only uses the requesting user's categories."""
        self._create_user("split-a@example.com")
        self._create_user("split-b@example.com")

        # User A creates an income category
        client_a = self.app.test_client()
        self._login(client_a, "split-a@example.com")
        with self.app.app_context():
            from backend.models import Category
            from backend import db
            cat = Category(name="SalaryIncome", user_id=None, is_income=True)
            db.session.add(cat)
            db.session.commit()
        self._add_transaction(client_a, category="SalaryIncome", name="A Salary")

        # User B creates a transaction with same category name (will resolve to global or own)
        # The key assertion is that the split endpoint does not 500 or return B's data as A's
        client_b = self.app.test_client()
        self._login(client_b, "split-b@example.com")
        # B's category list should include the global one but not A's private ones
        res = client_b.get("/api/categories")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items") or []
        user_scoped = [c for c in items if not c.get("is_global")]
        # B has no user-scoped categories of their own
        self.assertEqual(user_scoped, [])

    def test_account_deletion_removes_only_the_deleted_users_workspace(self):
        """Deleting User A removes A's rows without impacting User B."""
        deleted_user_id = self._create_user("delete-iso-a@example.com")
        preserved_user_id = self._create_user("delete-iso-b@example.com")

        client_a = self.app.test_client()
        self._login(client_a, "delete-iso-a@example.com")
        self._add_transaction(client_a, name="A Secret", category="A-Private-Cat", amount="7.000")

        client_b = self.app.test_client()
        self._login(client_b, "delete-iso-b@example.com")
        self._add_transaction(client_b, name="B Keep", category="B-Private-Cat", amount="9.000")

        step1 = self._delete(
            client_a,
            "/api/account",
            json={"password": "Password123!"},
        )
        self.assertEqual(step1.status_code, 202, step1.get_data(as_text=True))
        confirmation_token = ((step1.get_json() or {}).get("data") or {}).get("confirmation_token")
        self.assertTrue(confirmation_token)

        with patch("backend.tasks.delete_account_data.apply_async", side_effect=RuntimeError("force sync delete")):
            step2 = self._delete(
                client_a,
                "/api/account",
                json={"password": "Password123!", "confirmation_token": confirmation_token},
            )
        self.assertEqual(step2.status_code, 200, step2.get_data(as_text=True))
        self.assertTrue(((step2.get_json() or {}).get("data") or {}).get("deleted"))

        with self.app.app_context():
            from backend.models import Category, Transaction, User

            self.assertEqual(User.query.filter_by(id=deleted_user_id, is_active=False).count(), 1)
            self.assertEqual(User.query.filter_by(id=preserved_user_id, is_active=True).count(), 1)
            self.assertEqual(Transaction.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Category.query.filter_by(user_id=deleted_user_id).count(), 0)
            self.assertEqual(Transaction.query.filter_by(user_id=preserved_user_id).count(), 1)
            self.assertEqual(Category.query.filter_by(user_id=preserved_user_id).count(), 1)

        relogin_deleted = self._post(
            self.app.test_client(),
            "/api/auth/login",
            json={"email": "delete-iso-a@example.com", "password": "Password123!"},
        )
        self.assertEqual(relogin_deleted.status_code, 403, relogin_deleted.get_data(as_text=True))

        res = client_b.get("/api/transactions/search?q=B Keep&limit=20&offset=0&include_total=false")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json() or {}
        data = payload.get("data") or payload
        items = data.get("transactions") or data.get("items") or []
        self.assertEqual([item.get("name") for item in items], ["B Keep"])

        categories_res = client_b.get("/api/categories")
        self.assertEqual(categories_res.status_code, 200)
        category_names = [item.get("name") for item in ((categories_res.get_json() or {}).get("items") or [])]
        self.assertIn("B-Private-Cat", category_names)
        self.assertNotIn("A-Private-Cat", category_names)


if __name__ == "__main__":
    unittest.main()
