import os
import unittest
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from preflight_base import resolve_test_database_url
from backend.lib.payday import current_pay_period


class BudgetMetricsApiTests(unittest.TestCase):
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
        os.environ["SECRET_KEY"] = "test-secret-key-for-budget-metrics"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        from backend import create_app, db, bcrypt
        from backend.models import User, Category, Merchant, Transaction, Budget

        cls.create_app = create_app
        cls.db = db
        cls.bcrypt = bcrypt
        cls.User = User
        cls.Category = Category
        cls.Merchant = Merchant
        cls.Transaction = Transaction
        cls.Budget = Budget

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

    def _add_transaction(
        self,
        user_id: int,
        d: date,
        category_name: str,
        amount_kd: str,
        name: str,
        merchant_name: Optional[str] = None,
    ):
        with self.app.app_context():
            cat = self.Category.query.filter_by(user_id=user_id, name=category_name).first()
            if not cat:
                cat = self.Category(user_id=user_id, name=category_name)
                self.db.session.add(cat)
                self.db.session.flush()

            merchant_id = None
            if merchant_name:
                merchant = self.Merchant.query.filter_by(user_id=user_id, name=merchant_name).first()
                if not merchant:
                    merchant = self.Merchant(user_id=user_id, name=merchant_name)
                    self.db.session.add(merchant)
                    self.db.session.flush()
                merchant_id = merchant.id

            txn = self.Transaction(
                user_id=user_id,
                date=d,
                category_id=cat.id,
                merchant_id=merchant_id,
                name=name,
                name_key=name.lower(),
                amount_kd=Decimal(amount_kd).quantize(Decimal("0.001")),
            )
            self.db.session.add(txn)
            self.db.session.flush()

            self.db.session.commit()

    def _add_budget(self, user_id: int, month: str, category_name: str, amount_kd: str):
        with self.app.app_context():
            cat = self.Category.query.filter_by(user_id=user_id, name=category_name).first()
            if not cat:
                cat = self.Category(user_id=user_id, name=category_name)
                self.db.session.add(cat)
                self.db.session.flush()

            budget = self.Budget.query.filter_by(
                user_id=user_id,
                month=month,
                category_id=cat.id,
            ).first()
            if budget:
                budget.amount_kd = Decimal(amount_kd).quantize(Decimal("0.001"))
            else:
                budget = self.Budget(
                    user_id=user_id,
                    month=month,
                    category_id=cat.id,
                    amount_kd=Decimal(amount_kd).quantize(Decimal("0.001")),
                )
                self.db.session.add(budget)

            self.db.session.commit()

    def test_budget_metrics_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/budget-metrics?month=2026-01&range=all")
        self.assertEqual(res.status_code, 401)

    def test_budget_metrics_aggregates_and_excludes_income(self):
        user_id = self._create_user("metrics@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "metrics@example.com", "Password123!")

        today = date.today()
        current_month = f"{today.year}-{today.month:02d}"

        prev_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        prev2_year = prev_year if prev_month > 1 else prev_year - 1
        prev2_month = prev_month - 1 if prev_month > 1 else 12

        self._add_transaction(user_id, date(today.year, today.month, 10), "Groceries", "100.000", "Market")
        self._add_transaction(user_id, date(today.year, today.month, 11), "Income: Salary", "2500.000", "Salary")
        self._add_transaction(user_id, date(prev_year, prev_month, 10), "Groceries", "60.000", "Prev Month")
        self._add_transaction(user_id, date(prev2_year, prev2_month, 10), "Groceries", "40.000", "Prev2 Month")

        res = client.get(f"/api/budget-metrics?month={current_month}&range=all")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()

        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("month"), current_month)
        self.assertEqual(payload.get("range"), "all")
        self.assertEqual(payload["spent_by_category"].get("Groceries"), 100.0)
        self.assertNotIn("Income: Salary", payload["spent_by_category"])
        self.assertEqual(payload["range_spent_by_category"].get("Groceries"), 200.0)
        self.assertAlmostEqual(payload["avg12_by_category"].get("Groceries", 0.0), 8.333, places=3)

    def test_budget_metrics_validates_month_and_range(self):
        self._create_user("metrics2@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "metrics2@example.com", "Password123!")

        bad_month = client.get("/api/budget-metrics?month=2026-13&range=all")
        self.assertEqual(bad_month.status_code, 400)
        self.assertIn("YYYY-MM", (bad_month.get_json() or {}).get("error", ""))

        bad_range = client.get("/api/budget-metrics?month=2026-01&range=7")
        self.assertEqual(bad_range.status_code, 400)
        self.assertIn("range must be one of", (bad_range.get_json() or {}).get("error", ""))

    def test_budget_metrics_cycle_true_scopes_to_pay_period(self):
        user_id = self._create_user("metrics-cycle@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "metrics-cycle@example.com", "Password123!")

        today = date.today()
        month = f"{today.year}-{today.month:02d}"
        cycle_start, cycle_end = current_pay_period(27, date(today.year, today.month, 1))

        profile_res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": "1000.000", "payday_day": 27},
        )
        self.assertEqual(profile_res.status_code, 200, profile_res.get_data(as_text=True))

        self._add_transaction(
            user_id,
            cycle_start,
            "Groceries",
            "11.000",
            "Cycle Included",
        )
        self._add_transaction(
            user_id,
            cycle_start - timedelta(days=1),
            "Groceries",
            "99.000",
            "Outside Cycle",
        )

        res_cycle = client.get(f"/api/budget-metrics?month={month}&range=month&cycle=true")
        self.assertEqual(res_cycle.status_code, 200, res_cycle.get_data(as_text=True))
        payload_cycle = res_cycle.get_json() or {}
        self.assertTrue(payload_cycle.get("cycle_enabled"))
        self.assertEqual(payload_cycle.get("cycle_start"), cycle_start.isoformat())
        self.assertEqual(payload_cycle.get("cycle_end"), cycle_end.isoformat())
        self.assertEqual(payload_cycle["spent_by_category"].get("Groceries"), 11.0)

        res_calendar = client.get(f"/api/budget-metrics?month={month}&range=month")
        self.assertEqual(res_calendar.status_code, 200, res_calendar.get_data(as_text=True))
        payload_calendar = res_calendar.get_json() or {}
        self.assertFalse(payload_calendar.get("cycle_enabled"))
        self.assertEqual(payload_calendar["spent_by_category"].get("Groceries", 0.0), 0.0)

    def test_dashboard_metrics_aggregates_income_expenses_and_category_spend(self):
        user_id = self._create_user("dashboardmetrics@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "dashboardmetrics@example.com", "Password123!")

        today = date.today()
        current_month = f"{today.year}-{today.month:02d}"
        prev_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_month_key = f"{prev_year}-{prev_month:02d}"

        self._add_transaction(user_id, date(today.year, today.month, 10), "Groceries", "100.000", "Market")
        self._add_transaction(user_id, date(today.year, today.month, 11), "Income: Salary", "2500.000", "Salary")
        self._add_transaction(user_id, date(prev_year, prev_month, 10), "Transport", "15.000", "Taxi")

        res = client.get(f"/api/dashboard-metrics?months=6&until={current_month}")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}

        self.assertTrue(payload.get("ok"))
        months = payload.get("months") or []
        self.assertIn(current_month, months)
        self.assertIn(prev_month_key, months)

        monthly_map = {row["month"]: row for row in (payload.get("monthly") or [])}
        self.assertAlmostEqual(monthly_map[current_month]["income_kd"], 2500.0, places=3)
        self.assertAlmostEqual(monthly_map[current_month]["expense_kd"], 100.0, places=3)
        self.assertAlmostEqual(monthly_map[prev_month_key]["expense_kd"], 15.0, places=3)

        expense_map = payload.get("expense_by_category") or {}
        self.assertAlmostEqual(expense_map[current_month]["Groceries"], 100.0, places=3)
        self.assertNotIn("Income: Salary", expense_map.get(current_month, {}))

    def test_dashboard_metrics_validates_params(self):
        self._create_user("dashboardmetrics2@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "dashboardmetrics2@example.com", "Password123!")

        bad_months = client.get("/api/dashboard-metrics?months=0")
        self.assertEqual(bad_months.status_code, 400)
        self.assertIn("months must be between", (bad_months.get_json() or {}).get("error", ""))

        bad_until = client.get("/api/dashboard-metrics?until=2026-13")
        self.assertEqual(bad_until.status_code, 400)
        self.assertIn("YYYY-MM", (bad_until.get_json() or {}).get("error", ""))

    def test_dashboard_metrics_cycle_true_includes_cycle_metadata(self):
        user_id = self._create_user("dashboardmetrics3@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "dashboardmetrics3@example.com", "Password123!")

        today = date.today()
        month = f"{today.year}-{today.month:02d}"
        cycle_start, cycle_end = current_pay_period(27, date(today.year, today.month, 1))

        profile_res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": "1000.000", "payday_day": 27},
        )
        self.assertEqual(profile_res.status_code, 200, profile_res.get_data(as_text=True))

        self._add_transaction(user_id, cycle_start, "Groceries", "8.000", "Cycle Expense")

        res = client.get(f"/api/dashboard-metrics?months=6&until={month}&cycle=true")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("cycle_enabled"))
        self.assertEqual(payload.get("cycle_start"), cycle_start.isoformat())
        self.assertEqual(payload.get("cycle_end"), cycle_end.isoformat())

        monthly_map = {row["month"]: row for row in (payload.get("monthly") or [])}
        cycle_start_key = f"{cycle_start.year}-{cycle_start.month:02d}"
        self.assertIn(cycle_start_key, monthly_map)
        self.assertAlmostEqual(monthly_map[cycle_start_key]["expense_kd"], 8.0, places=3)

    def test_expense_breakdown_aggregates_by_dimension_and_excludes_income(self):
        user_id = self._create_user("expensebreakdown@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "expensebreakdown@example.com", "Password123!")

        today = date.today()
        current_month = f"{today.year}-{today.month:02d}"
        prev_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_month_key = f"{prev_year}-{prev_month:02d}"

        self._add_transaction(user_id, date(today.year, today.month, 10), "Groceries", "30.000", "Milk", "Coop")
        self._add_transaction(user_id, date(today.year, today.month, 11), "Groceries", "20.000", "Vegetables", "Coop")
        self._add_transaction(user_id, date(today.year, today.month, 12), "Transport", "10.000", "Ride", "TaxiCo")
        self._add_transaction(user_id, date(prev_year, prev_month, 15), "Groceries", "5.000", "Snacks", "Coop")
        self._add_transaction(user_id, date(today.year, today.month, 13), "Income: Salary", "1000.000", "Salary", "Employer")

        month_res = client.get(f"/api/expense-breakdown?dimension=category&range=month&month={current_month}")
        self.assertEqual(month_res.status_code, 200, month_res.get_data(as_text=True))
        month_payload = month_res.get_json() or {}
        self.assertTrue(month_payload.get("ok"))
        self.assertEqual(month_payload.get("dimension"), "category")
        self.assertEqual(month_payload.get("range"), "month")
        by_name = {row["name"]: row["amount_kd"] for row in (month_payload.get("items") or [])}
        self.assertAlmostEqual(by_name.get("Groceries", 0.0), 50.0, places=3)
        self.assertAlmostEqual(by_name.get("Transport", 0.0), 10.0, places=3)
        self.assertNotIn("Income: Salary", by_name)
        self.assertAlmostEqual(month_payload.get("total_kd", 0.0), 60.0, places=3)

        merchant_res = client.get(f"/api/expense-breakdown?dimension=merchant&range=12m&month={current_month}")
        self.assertEqual(merchant_res.status_code, 200, merchant_res.get_data(as_text=True))
        merchant_payload = merchant_res.get_json() or {}
        by_merchant = {row["name"]: row["amount_kd"] for row in (merchant_payload.get("items") or [])}
        self.assertAlmostEqual(by_merchant.get("Coop", 0.0), 55.0, places=3)
        self.assertAlmostEqual(by_merchant.get("TaxiCo", 0.0), 10.0, places=3)
        self.assertNotIn("Employer", by_merchant)

        tx_res = client.get(f"/api/expense-breakdown?dimension=transaction&range=all&month={prev_month_key}")
        self.assertEqual(tx_res.status_code, 200, tx_res.get_data(as_text=True))
        tx_payload = tx_res.get_json() or {}
        tx_names = [row.get("name") for row in (tx_payload.get("items") or [])]
        self.assertIn("Milk", tx_names)
        self.assertIn("Vegetables", tx_names)
        self.assertNotIn("Salary", tx_names)

    def test_expense_breakdown_validates_parameters(self):
        self._create_user("expensebreakdown2@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "expensebreakdown2@example.com", "Password123!")

        bad_dimension = client.get("/api/expense-breakdown?dimension=tag")
        self.assertEqual(bad_dimension.status_code, 400)
        self.assertIn("dimension must be one of", (bad_dimension.get_json() or {}).get("error", ""))

        bad_range = client.get("/api/expense-breakdown?range=7d")
        self.assertEqual(bad_range.status_code, 400)
        self.assertIn("range must be one of", (bad_range.get_json() or {}).get("error", ""))

        bad_limit = client.get("/api/expense-breakdown?limit=2000")
        self.assertEqual(bad_limit.status_code, 400)
        self.assertIn("limit must be between", (bad_limit.get_json() or {}).get("error", ""))

        bad_month = client.get("/api/expense-breakdown?month=2026-13")
        self.assertEqual(bad_month.status_code, 400)
        self.assertIn("YYYY-MM", (bad_month.get_json() or {}).get("error", ""))

    def test_expense_merchant_trend_returns_monthly_series_and_validates(self):
        user_id = self._create_user("merchanttrend@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "merchanttrend@example.com", "Password123!")

        today = date.today()
        current_month = f"{today.year}-{today.month:02d}"
        prev_year = today.year if today.month > 1 else today.year - 1
        prev_month = today.month - 1 if today.month > 1 else 12
        prev_month_key = f"{prev_year}-{prev_month:02d}"

        self._add_transaction(user_id, date(today.year, today.month, 10), "Groceries", "40.000", "Weekly", "Coop")
        self._add_transaction(user_id, date(prev_year, prev_month, 10), "Groceries", "25.000", "Prev Weekly", "Coop")
        self._add_transaction(user_id, date(today.year, today.month, 12), "Groceries", "10.000", "Other", "OtherShop")

        trend_res = client.get(f"/api/expense-merchant-trend?merchant=Coop&months=6&until={current_month}")
        self.assertEqual(trend_res.status_code, 200, trend_res.get_data(as_text=True))
        payload = trend_res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("merchant"), "Coop")
        series = payload.get("series") or []
        self.assertEqual(len(series), 6)
        by_month = {row["month"]: row["total_kd"] for row in series}
        self.assertAlmostEqual(by_month.get(current_month, 0.0), 40.0, places=3)
        self.assertAlmostEqual(by_month.get(prev_month_key, 0.0), 25.0, places=3)

        bad_months = client.get("/api/expense-merchant-trend?merchant=Coop&months=0")
        self.assertEqual(bad_months.status_code, 400)
        self.assertIn("months must be between", (bad_months.get_json() or {}).get("error", ""))

        bad_until = client.get("/api/expense-merchant-trend?merchant=Coop&until=2026-13")
        self.assertEqual(bad_until.status_code, 400)
        self.assertIn("YYYY-MM", (bad_until.get_json() or {}).get("error", ""))
