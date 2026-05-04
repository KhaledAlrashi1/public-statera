import os
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from preflight_base import resolve_test_database_url


ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = ROOT / "migrations" / "alembic.ini"
SCRIPT_LOCATION = ROOT / "migrations"


class MigrationIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._env_keys = [
            "DATABASE_URL",
            "TEST_DATABASE_URL",
            "PERSONAL_STATERA_DEV_MODE",
            "SECRET_KEY",
            "ENABLE_TEMPLATE_SUGGESTIONS",
            "RATE_LIMIT_BACKEND",
        ]
        cls._prev_env = {key: os.environ.get(key) for key in cls._env_keys}

        db_url = resolve_test_database_url()
        os.environ["DATABASE_URL"] = db_url
        os.environ["TEST_DATABASE_URL"] = db_url
        os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
        os.environ["SECRET_KEY"] = "test-secret-key-for-migration-integrity"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        from backend import create_app, db

        cls.db = db
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.script = ScriptDirectory.from_config(cls._make_alembic_config())
        cls.head_revision = cls.script.get_current_head()

    @classmethod
    def tearDownClass(cls):
        for key, value in cls._prev_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    @classmethod
    def _make_alembic_config(cls) -> Config:
        config = Config(str(ALEMBIC_INI))
        config.set_main_option("script_location", str(SCRIPT_LOCATION))
        return config

    def setUp(self):
        self._reset_database()

    def _reset_database(self) -> None:
        with self.app.app_context():
            self.db.session.remove()
            with self.db.engine.begin() as conn:
                conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
                conn.execute(text("CREATE SCHEMA public"))
                conn.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
                conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
            self.db.session.remove()

    def _upgrade(self, revision: str) -> None:
        with self.app.app_context():
            self.db.session.remove()
            command.upgrade(self._make_alembic_config(), revision)
            self.db.session.remove()

    def _downgrade(self, revision: str) -> None:
        with self.app.app_context():
            self.db.session.remove()
            command.downgrade(self._make_alembic_config(), revision)
            self.db.session.remove()

    def _current_revision(self) -> str | None:
        with self.app.app_context():
            with self.db.engine.connect() as conn:
                return MigrationContext.configure(conn).get_current_revision()

    def _seed_pre_d1_records(self) -> dict[str, int]:
        created_at = datetime(2026, 2, 21, 12, 0, tzinfo=timezone.utc)

        with self.app.app_context():
            with self.db.engine.begin() as conn:
                user_id = conn.execute(
                    text(
                        """
                        INSERT INTO users (email, password_hash, display_name, created_at, is_active)
                        VALUES (:email, :password_hash, :display_name, :created_at, TRUE)
                        RETURNING id
                        """
                    ),
                    {
                        "email": "migration-integrity@example.com",
                        "password_hash": "not-used-in-this-suite",
                        "display_name": "Migration Integrity",
                        "created_at": created_at,
                    },
                ).scalar_one()

                conn.execute(
                    text(
                        """
                        INSERT INTO user_profiles (
                            user_id,
                            monthly_income_kd,
                            payday_day,
                            country,
                            created_at,
                            updated_at
                        )
                        VALUES (:user_id, NULL, NULL, :country, :created_at, :updated_at)
                        """
                    ),
                    {
                        "user_id": user_id,
                        "country": "KW",
                        "created_at": created_at,
                        "updated_at": created_at,
                    },
                )

                income_prefix_id = conn.execute(
                    text(
                        """
                        INSERT INTO categories (user_id, name, is_income)
                        VALUES (:user_id, :name, NULL)
                        RETURNING id
                        """
                    ),
                    {"user_id": user_id, "name": "Income Salary"},
                ).scalar_one()
                heuristic_false_negative_id = conn.execute(
                    text(
                        """
                        INSERT INTO categories (user_id, name, is_income)
                        VALUES (:user_id, :name, NULL)
                        RETURNING id
                        """
                    ),
                    {"user_id": user_id, "name": "Salary Payment"},
                ).scalar_one()
                groceries_id = conn.execute(
                    text(
                        """
                        INSERT INTO categories (user_id, name, is_income)
                        VALUES (:user_id, :name, NULL)
                        RETURNING id
                        """
                    ),
                    {"user_id": user_id, "name": "Groceries"},
                ).scalar_one()

                transaction_id = conn.execute(
                    text(
                        """
                        INSERT INTO transactions (
                            user_id,
                            date,
                            merchant_id,
                            category_id,
                            name,
                            memo,
                            name_key,
                            amount_kd,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :user_id,
                            :txn_date,
                            NULL,
                            :category_id,
                            :name,
                            NULL,
                            :name_key,
                            :amount_kd,
                            :created_at,
                            :updated_at
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "user_id": user_id,
                        "txn_date": date(2026, 2, 20),
                        "category_id": groceries_id,
                        "name": "Weekly Groceries",
                        "name_key": "weekly groceries",
                        "amount_kd": Decimal("25.000"),
                        "created_at": created_at,
                        "updated_at": created_at,
                    },
                ).scalar_one()

        return {
            "user_id": user_id,
            "income_prefix_id": income_prefix_id,
            "heuristic_false_negative_id": heuristic_false_negative_id,
            "groceries_id": groceries_id,
            "transaction_id": transaction_id,
        }

    def _insert_pre_b9_goals(self, user_id: int) -> dict[str, int]:
        created_at = datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc)

        with self.app.app_context():
            with self.db.engine.begin() as conn:
                matched_goal_id = conn.execute(
                    text(
                        """
                        INSERT INTO savings_goals (
                            user_id,
                            name,
                            goal_type,
                            target_kd,
                            current_kd,
                            target_date,
                            linked_category,
                            is_active,
                            notes,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :user_id,
                            :name,
                            :goal_type,
                            :target_kd,
                            :current_kd,
                            :target_date,
                            :linked_category,
                            TRUE,
                            :notes,
                            :created_at,
                            :updated_at
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "user_id": user_id,
                        "name": "Emergency Fund",
                        "goal_type": "custom",
                        "target_kd": Decimal("750.000"),
                        "current_kd": Decimal("125.000"),
                        "target_date": date(2026, 12, 31),
                        "linked_category": "Groceries",
                        "notes": "Should resolve to the matching category",
                        "created_at": created_at,
                        "updated_at": created_at,
                    },
                ).scalar_one()

                unmatched_goal_id = conn.execute(
                    text(
                        """
                        INSERT INTO savings_goals (
                            user_id,
                            name,
                            goal_type,
                            target_kd,
                            current_kd,
                            target_date,
                            linked_category,
                            is_active,
                            notes,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :user_id,
                            :name,
                            :goal_type,
                            :target_kd,
                            :current_kd,
                            :target_date,
                            :linked_category,
                            TRUE,
                            :notes,
                            :created_at,
                            :updated_at
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "user_id": user_id,
                        "name": "Legacy Alias",
                        "goal_type": "custom",
                        "target_kd": Decimal("300.000"),
                        "current_kd": Decimal("5.000"),
                        "target_date": None,
                        "linked_category": "Ghost Category",
                        "notes": "This string is intentionally unmatched",
                        "created_at": created_at,
                        "updated_at": created_at,
                    },
                ).scalar_one()

        return {
            "matched_goal_id": matched_goal_id,
            "unmatched_goal_id": unmatched_goal_id,
        }

    def _category_flags(self, user_id: int) -> dict[str, bool]:
        with self.app.app_context():
            with self.db.engine.connect() as conn:
                rows = conn.execute(
                    text(
                        """
                        SELECT name, is_income
                        FROM categories
                        WHERE user_id = :user_id
                        ORDER BY name
                        """
                    ),
                    {"user_id": user_id},
                ).mappings()
                return {row["name"]: bool(row["is_income"]) for row in rows}

    def _goal_rows_at_head(self, user_id: int) -> list[dict]:
        with self.app.app_context():
            with self.db.engine.connect() as conn:
                return list(
                    conn.execute(
                        text(
                            """
                            SELECT
                                sg.id,
                                sg.name,
                                sg.linked_category_id,
                                c.name AS linked_category_name
                            FROM savings_goals sg
                            LEFT JOIN categories c ON c.id = sg.linked_category_id
                            WHERE sg.user_id = :user_id
                            ORDER BY sg.id
                            """
                        ),
                        {"user_id": user_id},
                    ).mappings()
                )

    def _goal_rows_pre_b9(self, user_id: int) -> list[dict]:
        with self.app.app_context():
            with self.db.engine.connect() as conn:
                return list(
                    conn.execute(
                        text(
                            """
                            SELECT id, name, linked_category
                            FROM savings_goals
                            WHERE user_id = :user_id
                            ORDER BY id
                            """
                        ),
                        {"user_id": user_id},
                    ).mappings()
                )

    def test_alembic_heads_resolve_to_one_head(self):
        self.assertEqual(
            len(self.script.get_heads()),
            1,
            f"Expected a single Alembic head, found {self.script.get_heads()}",
        )

    def test_head_schema_does_not_restore_legacy_items_table(self):
        self._upgrade("head")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            self.assertNotIn("items", set(inspector.get_table_names()))

    def test_full_upgrade_downgrade_upgrade_chain_is_traversable(self):
        self._upgrade("head")
        self.assertEqual(self._current_revision(), self.head_revision)

        self._downgrade("base")
        self.assertIsNone(self._current_revision())

        self._upgrade("head")
        self.assertEqual(self._current_revision(), self.head_revision)

    def test_import_row_hash_migration_round_trip(self):
        self._upgrade("f1b2c3d4e5f6")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            base_columns = {column["name"] for column in inspector.get_columns("transactions")}
            self.assertNotIn("import_batch_id", base_columns)
            self.assertNotIn("import_row_hash", base_columns)

        self._upgrade("0a4c6b8d9e1f")
        self.assertEqual(self._current_revision(), "0a4c6b8d9e1f")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            upgraded_columns = {column["name"] for column in inspector.get_columns("transactions")}
            self.assertIn("import_batch_id", upgraded_columns)
            self.assertIn("import_row_hash", upgraded_columns)

            index_names = {index["name"] for index in inspector.get_indexes("transactions")}
            self.assertIn("ix_transactions_import_batch_id", index_names)
            self.assertIn("ix_transactions_import_row_hash", index_names)

            with self.db.engine.connect() as conn:
                indexdef = conn.execute(
                    text(
                        """
                        SELECT indexdef
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                          AND tablename = 'transactions'
                          AND indexname = 'ix_transactions_import_row_hash'
                        """
                    )
                ).scalar_one()
            self.assertIn("UNIQUE INDEX", indexdef)
            self.assertIn("WHERE (import_row_hash IS NOT NULL)", indexdef)

        self._downgrade("f1b2c3d4e5f6")
        self.assertEqual(self._current_revision(), "f1b2c3d4e5f6")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            downgraded_columns = {column["name"] for column in inspector.get_columns("transactions")}
            self.assertNotIn("import_batch_id", downgraded_columns)
            self.assertNotIn("import_row_hash", downgraded_columns)

            index_names = {index["name"] for index in inspector.get_indexes("transactions")}
            self.assertNotIn("ix_transactions_import_batch_id", index_names)
            self.assertNotIn("ix_transactions_import_row_hash", index_names)

    def test_migration_uq_txn_user_triplet_drop_round_trip(self):
        self._upgrade("0a4c6b8d9e1f")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("transactions")}
            self.assertIn("uq_txn_user_triplet", unique_names)

        self._upgrade("1b5d7f9a0c2e")
        self.assertEqual(self._current_revision(), "1b5d7f9a0c2e")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("transactions")}
            self.assertNotIn("uq_txn_user_triplet", unique_names)

        self._downgrade("0a4c6b8d9e1f")
        self.assertEqual(self._current_revision(), "0a4c6b8d9e1f")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("transactions")}
            self.assertIn("uq_txn_user_triplet", unique_names)

    def test_migration_uq_txn_user_triplet_drop_is_noop_when_constraint_missing(self):
        self._upgrade("0a4c6b8d9e1f")

        with self.app.app_context():
            with self.db.engine.begin() as conn:
                conn.execute(text("ALTER TABLE transactions DROP CONSTRAINT uq_txn_user_triplet"))

        self._upgrade("1b5d7f9a0c2e")
        self.assertEqual(self._current_revision(), "1b5d7f9a0c2e")

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            unique_names = {constraint["name"] for constraint in inspector.get_unique_constraints("transactions")}
            self.assertNotIn("uq_txn_user_triplet", unique_names)

    def test_historical_records_survive_round_trip_except_documented_lossy_values(self):
        self._upgrade("c6c888325571")
        ids = self._seed_pre_d1_records()

        self._upgrade("d1e2f3a4b5c6")
        self.assertEqual(
            self._category_flags(ids["user_id"]),
            {
                "Groceries": False,
                "Income Salary": True,
                "Salary Payment": False,
            },
        )

        self._upgrade("a8b9c0d1e2f3")
        goal_ids = self._insert_pre_b9_goals(ids["user_id"])

        self._upgrade("head")
        self.assertEqual(self._current_revision(), self.head_revision)

        with self.app.app_context():
            inspector = inspect(self.db.engine)
            head_columns = {column["name"] for column in inspector.get_columns("savings_goals")}
            self.assertIn("linked_category_id", head_columns)
            self.assertNotIn("linked_category", head_columns)

            with self.db.engine.connect() as conn:
                txn_row = conn.execute(
                    text(
                        """
                        SELECT name, amount_kd, source
                        FROM transactions
                        WHERE id = :transaction_id
                        """
                    ),
                    {"transaction_id": ids["transaction_id"]},
                ).mappings().one()
                counts = conn.execute(
                    text(
                        """
                        SELECT
                            (SELECT COUNT(*) FROM users) AS users_count,
                            (SELECT COUNT(*) FROM categories WHERE user_id = :user_id) AS categories_count,
                            (SELECT COUNT(*) FROM transactions WHERE user_id = :user_id) AS transactions_count,
                            (SELECT COUNT(*) FROM savings_goals WHERE user_id = :user_id) AS goals_count
                        """
                    ),
                    {"user_id": ids["user_id"]},
                ).mappings().one()

        self.assertEqual(txn_row["name"], "Weekly Groceries")
        self.assertEqual(txn_row["amount_kd"], Decimal("25.000"))
        self.assertEqual(txn_row["source"], "manual")
        self.assertEqual(dict(counts), {
            "users_count": 1,
            "categories_count": 3,
            "transactions_count": 1,
            "goals_count": 2,
        })
        self.assertEqual(
            self._goal_rows_at_head(ids["user_id"]),
            [
                {
                    "id": goal_ids["matched_goal_id"],
                    "name": "Emergency Fund",
                    "linked_category_id": ids["groceries_id"],
                    "linked_category_name": "Groceries",
                },
                {
                    "id": goal_ids["unmatched_goal_id"],
                    "name": "Legacy Alias",
                    "linked_category_id": None,
                    "linked_category_name": None,
                },
            ],
        )

        self._downgrade("a8b9c0d1e2f3")
        self.assertEqual(self._current_revision(), "a8b9c0d1e2f3")
        self.assertEqual(
            self._goal_rows_pre_b9(ids["user_id"]),
            [
                {
                    "id": goal_ids["matched_goal_id"],
                    "name": "Emergency Fund",
                    "linked_category": "Groceries",
                },
                # b9c0d1e2f3a4 is intentionally lossy for unmatched strings.
                {
                    "id": goal_ids["unmatched_goal_id"],
                    "name": "Legacy Alias",
                    "linked_category": None,
                },
            ],
        )
        self.assertEqual(
            self._category_flags(ids["user_id"]),
            {
                "Groceries": False,
                "Income Salary": True,
                "Salary Payment": False,
            },
        )

        self._upgrade("head")
        self.assertEqual(self._current_revision(), self.head_revision)
        self.assertEqual(
            self._goal_rows_at_head(ids["user_id"]),
            [
                {
                    "id": goal_ids["matched_goal_id"],
                    "name": "Emergency Fund",
                    "linked_category_id": ids["groceries_id"],
                    "linked_category_name": "Groceries",
                },
                {
                    "id": goal_ids["unmatched_goal_id"],
                    "name": "Legacy Alias",
                    "linked_category_id": None,
                    "linked_category_name": None,
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
