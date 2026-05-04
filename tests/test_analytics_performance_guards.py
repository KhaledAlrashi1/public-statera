from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event

from backend.models import SavingsGoal
from preflight_base import PreflightApiTestBase


class AnalyticsPerformanceGuardTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.user_id = self._create_user("analytics-perf@example.com", "Password123!")

    @staticmethod
    def _current_month_key() -> str:
        now = datetime.now(timezone.utc)
        return f"{now.year}-{now.month:02d}"

    def _login_client(self):
        client = self.app.test_client()
        self._login(client, "analytics-perf@example.com", "Password123!")
        return client

    def _set_profile_income(self, client, income_kd: str):
        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": income_kd, "payday_day": None},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def _save_budget(self, client, month: str, amount_kd: str):
        res = self._post(
            client,
            "/api/budgets",
            json={"month": month, "items": [{"category": "Groceries", "amount_kd": amount_kd}]},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    @contextmanager
    def _capture_select_statements(self):
        with self.app.app_context():
            engine = self.db.engine

        statements: list[str] = []

        def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
            if statement.lstrip().lower().startswith("select"):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", _before_cursor_execute)
        try:
            yield statements
        finally:
            event.remove(engine, "before_cursor_execute", _before_cursor_execute)

    def test_safe_to_spend_eager_loads_linked_goal_categories(self):
        client = self._login_client()
        month = self._current_month_key()
        self._set_profile_income(client, "2500.000")
        self._save_budget(client, month, "450.000")

        with self.app.app_context():
            categories = []
            for idx in range(12):
                category = self.Category(
                    user_id=self.user_id,
                    name=f"Goal Category {idx}",
                    is_income=False,
                )
                self.db.session.add(category)
                categories.append(category)
            self.db.session.flush()

            target_date = date.today() + timedelta(days=180)
            for idx, category in enumerate(categories):
                self.db.session.add(
                    SavingsGoal(
                        user_id=self.user_id,
                        name=f"Goal {idx}",
                        goal_type="custom",
                        target_kd=Decimal("600.000"),
                        current_kd=Decimal("100.000"),
                        target_date=target_date,
                        linked_category_id=category.id,
                        is_active=True,
                    )
                )
            self.db.session.commit()

        with self._capture_select_statements() as statements:
            res = client.get(f"/api/safe-to-spend?month={month}")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        savings_goal_queries = [stmt for stmt in statements if "from savings_goals" in stmt.lower()]
        self.assertEqual(len(savings_goal_queries), 1)

        per_goal_category_fetches = [
            stmt
            for stmt in statements
            if "from categories" in stmt.lower() and "where categories.id =" in stmt.lower()
        ]
        self.assertEqual(per_goal_category_fetches, [])
