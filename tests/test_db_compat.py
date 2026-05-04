import os
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql

from backend.db_compat import month_bucket
from preflight_base import resolve_test_database_url


class DbCompatTests(unittest.TestCase):
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
        os.environ["SECRET_KEY"] = "test-secret-key-for-db-compat"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        from backend import create_app, db, bcrypt
        from backend.models import User, Category, Transaction

        cls.db = db
        cls.bcrypt = bcrypt
        cls.User = User
        cls.Category = Category
        cls.Transaction = Transaction
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
            self._seed_transactions()

    def _create_user(self, email: str) -> int:
        user = self.User(
            email=email,
            password_hash=self.bcrypt.generate_password_hash("Password123!").decode("utf-8"),
        )
        self.db.session.add(user)
        self.db.session.flush()
        return user.id

    def _create_category(self, user_id: int, name: str, is_income: bool = False) -> int:
        category = self.Category(user_id=user_id, name=name, is_income=is_income)
        self.db.session.add(category)
        self.db.session.flush()
        return category.id

    def _create_txn(self, user_id: int, category_id: int, d: date, name: str, amount_kd: str):
        txn = self.Transaction(
            user_id=user_id,
            date=d,
            category_id=category_id,
            name=name,
            name_key=name.lower(),
            amount_kd=Decimal(amount_kd).quantize(Decimal("0.001")),
        )
        self.db.session.add(txn)

    def _seed_transactions(self):
        self.user_id = self._create_user("dbcompat-a@example.com")
        self.other_user_id = self._create_user("dbcompat-b@example.com")
        self.category_id = self._create_category(self.user_id, "Groceries")
        self.other_category_id = self._create_category(self.other_user_id, "Groceries")

        self._create_txn(self.user_id, self.category_id, date(2026, 1, 31), "Boundary Jan", "10.000")
        self._create_txn(self.user_id, self.category_id, date(2026, 2, 1), "Boundary Feb", "20.000")
        self._create_txn(self.user_id, self.category_id, date(2026, 2, 15), "Mid Feb", "5.000")
        self._create_txn(self.user_id, self.category_id, date(2026, 3, 1), "Start Mar", "15.000")
        self._create_txn(self.other_user_id, self.other_category_id, date(2026, 2, 10), "Other User", "999.000")
        self.db.session.commit()

    def test_month_bucket_requires_app_context(self):
        with self.assertRaises(RuntimeError):
            month_bucket(self.Transaction.date)

        with self.app.app_context():
            expr = month_bucket(self.Transaction.date)
            self.assertIsNotNone(expr)

    def test_month_bucket_compiles_postgresql_dialect_with_to_char_and_literal(self):
        with self.app.app_context():
            with patch.object(self.db.engine.dialect, "name", "postgresql"):
                expr = month_bucket(self.Transaction.date)
            compiled = str(
                select(expr.label("ym")).compile(
                    dialect=postgresql.dialect(),
                    compile_kwargs={"literal_binds": True},
                )
            )
        self.assertIn("to_char", compiled.lower())
        self.assertIn("'YYYY-MM'", compiled)

    def test_group_by_and_order_by_use_month_bucket_expression(self):
        with self.app.app_context():
            ym_expr = month_bucket(self.Transaction.date)
            rows = (
                self.db.session.query(
                    ym_expr.label("ym"),
                    func.sum(self.Transaction.amount_kd).label("total"),
                )
                .filter(self.Transaction.user_id == self.user_id)
                .group_by(ym_expr)
                .order_by(ym_expr)
                .all()
            )

        payload = [(ym, float(total or 0)) for ym, total in rows]
        self.assertEqual(
            payload,
            [
                ("2026-01", 10.0),
                ("2026-02", 25.0),
                ("2026-03", 15.0),
            ],
        )

    def test_month_bucket_eq_and_in_filters(self):
        with self.app.app_context():
            ym_expr = month_bucket(self.Transaction.date)

            feb_total = (
                self.db.session.query(func.sum(self.Transaction.amount_kd))
                .filter(self.Transaction.user_id == self.user_id)
                .filter(ym_expr == "2026-02")
                .scalar()
            )
            range_total = (
                self.db.session.query(func.sum(self.Transaction.amount_kd))
                .filter(self.Transaction.user_id == self.user_id)
                .filter(ym_expr.in_(["2026-01", "2026-03"]))
                .scalar()
            )

        self.assertAlmostEqual(float(feb_total or 0), 25.0, places=3)
        self.assertAlmostEqual(float(range_total or 0), 25.0, places=3)

    def test_month_bucket_month_boundaries(self):
        with self.app.app_context():
            ym_expr = month_bucket(self.Transaction.date)
            rows = (
                self.db.session.query(self.Transaction.date, ym_expr.label("ym"))
                .filter(self.Transaction.user_id == self.user_id)
                .filter(self.Transaction.date.in_([date(2026, 1, 31), date(2026, 2, 1)]))
                .order_by(self.Transaction.date.asc())
                .all()
            )

        self.assertEqual(rows[0][1], "2026-01")
        self.assertEqual(rows[1][1], "2026-02")


if __name__ == "__main__":
    unittest.main()
