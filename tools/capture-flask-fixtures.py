"""
Capture Flask analytics fixtures for Module 5c equivalence tests.

Each subcommand seeds deterministic test data into the live Flask/PostgreSQL
container via a single SQLAlchemy session, calls the corresponding Flask payload
builder, prints the JSON output, then rolls back the entire transaction — leaving
the database completely unmodified.

Usage
-----
    python3 tools/capture-flask-fixtures.py --list
    python3 tools/capture-flask-fixtures.py income-pattern
    python3 tools/capture-flask-fixtures.py recurring-patterns
    python3 tools/capture-flask-fixtures.py snapshot

Environment variables
---------------------
    DATABASE_URL   PostgreSQL connection string.
                   Default: postgresql://finance:change-me@localhost:5436/personal_statera
    FLASK_APP_DIR  Path to the private Flask repo root.
                   Default: ../personal-finance (sibling of this repo on disk).
                   Override: FLASK_APP_DIR=/path/to/personal-finance python3 tools/...

Not re-captured here
--------------------
F1-F5 (safe-to-spend) and R10 (weekly-digest) fixtures were captured via a
predecessor script (/tmp/capture_fixtures.py) that lives outside this repo.
Those fixture values are hardcoded directly in the test files:

    apps/api/src/routes/aggregation.test.ts   (F1-F5 / R9, R10)

The predecessor script is not included in this repository. If a Flask change
requires re-capture of those fixtures before Flask is decommissioned, add
safe-to-spend and weekly-digest subcommands here at that point. Until then,
the hardcoded values in the test files are the source of truth.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from typing import Any, Callable

# ── Environment bootstrap ─────────────────────────────────────────────────────
# All via setdefault — override by passing DATABASE_URL=... on the command line.
# Must be set before any Flask or SQLAlchemy module is imported.

_ENV_DEFAULTS: dict[str, str] = {
    "DATABASE_URL": "postgresql://finance:change-me@localhost:5436/personal_statera",
    "DINARTRACK_DEV_MODE": "true",
    "SECRET_KEY": "b0e5cd15eef84a6b6ebc9e0cb23bbfa90ea9c7deba24ab81dde3b50c46c6d8de",
    "ENCRYPTION_KEY": "",
}
for _key, _default in _ENV_DEFAULTS.items():
    os.environ.setdefault(_key, _default)

# tools/capture-flask-fixtures.py → dirname → tools/ → dirname → repo root
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# personal-finance repo lives as a sibling of public-statera on disk
_DEFAULT_FLASK_DIR = os.path.join(os.path.dirname(_REPO_ROOT), "personal-finance")
FLASK_APP_DIR: str = os.environ.get("FLASK_APP_DIR", _DEFAULT_FLASK_DIR)


# ── Flask bootstrap (lazy — only imported when a live subcommand invokes it) ──

def _bootstrap_flask():
    """
    Insert FLASK_APP_DIR into sys.path and import the Flask app factory + db.
    Safe to call multiple times; Python's import cache prevents double-import.
    """
    if FLASK_APP_DIR not in sys.path:
        sys.path.insert(0, FLASK_APP_DIR)
    try:
        from backend import create_app, db  # type: ignore[import]
    except ModuleNotFoundError as exc:
        print(
            f"ERROR: Could not import Flask backend from {FLASK_APP_DIR!r}.\n"
            f"  Set FLASK_APP_DIR=<path> to override the default location.\n"
            f"  Original error: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)
    return create_app, db


def _run_with_session(fn: Callable[..., None]) -> None:
    """
    Create a Flask app context, run fn(db), then unconditionally roll back the
    session. Every INSERT and schema change made inside fn is undone; the live
    PostgreSQL container is unmodified after every run.

    fn signature: fn(db) -> None
      db is the SQLAlchemy db object from `backend` (has .session, .text, etc.)

    Schema additions (ALTER TABLE ... ADD COLUMN IF NOT EXISTS) run at the top
    of the transaction so they are included in the rollback. PostgreSQL DDL is
    fully transactional; MySQL is not — this tool targets the local PG container.
    """
    create_app, db = _bootstrap_flask()
    app = create_app()
    with app.app_context():
        try:
            # Safety additions for schema revisions that predate these columns.
            # IF NOT EXISTS makes them idempotent on current schema.
            db.session.execute(db.text(
                "ALTER TABLE categories "
                "ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE"
            ))
            db.session.execute(db.text(
                "ALTER TABLE categories "
                "ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ"
            ))
            db.session.flush()
            fn(db)
        finally:
            db.session.rollback()
            print("\n=== Transaction rolled back — DB unmodified. ===", flush=True)


# ── Shared seed helpers ───────────────────────────────────────────────────────
# All helpers use raw SQL (avoids ORM schema-drift between Flask models and
# whichever schema revision the tool runs against).
# RETURNING id is PostgreSQL-specific; this tool targets the local dev container.

NOW = datetime.now(timezone.utc)


def raw_insert(db: Any, table: str, cols: list[str], values: list[Any]) -> int:
    col_str = ", ".join(cols)
    placeholders = ", ".join(f":v{i}" for i in range(len(values)))
    params = {f"v{i}": v for i, v in enumerate(values)}
    result = db.session.execute(
        db.text(f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) RETURNING id"),
        params,
    )
    return result.scalar()


def make_user(db: Any, suffix: str) -> int:
    return raw_insert(
        db,
        "users",
        ["email", "password_hash", "is_active", "session_version", "created_at", "totp_enabled"],
        [f"fixture_{suffix}@capture.test", "x" * 60, True, 1, NOW, False],
    )


def make_category(db: Any, user_id: int, name: str, *, is_income: bool) -> int:
    return raw_insert(
        db,
        "categories",
        ["user_id", "name", "is_income", "is_archived"],
        [user_id, name, is_income, False],
    )


def make_merchant(db: Any, user_id: int, name: str) -> int:
    # Flask's merchants table has no name_key column (unique constraint is on name directly).
    return raw_insert(
        db,
        "merchants",
        ["user_id", "name"],
        [user_id, name],
    )


def make_transaction(
    db: Any,
    user_id: int,
    tx_date: date,
    name: str,
    amount: str,
    category_id: int,
    *,
    merchant_id: int | None = None,
) -> int:
    # category_id is NOT NULL in Flask's schema; always required.
    # merchant_id is nullable; omit when not needed.
    cols = [
        "user_id", "date", "name", "name_key", "amount_kd",
        "category_id", "source", "created_at", "updated_at",
    ]
    values: list[Any] = [
        user_id, tx_date, name, name.lower().replace(" ", "_"),
        amount, category_id, "manual", NOW, NOW,
    ]
    if merchant_id is not None:
        cols.append("merchant_id")
        values.append(merchant_id)
    return raw_insert(db, "transactions", cols, values)


def make_budget(db: Any, user_id: int, month: str, category_id: int, amount: str) -> int:
    return raw_insert(
        db,
        "budgets",
        ["user_id", "month", "category_id", "amount_kd", "updated_at"],
        [user_id, month, category_id, amount, NOW],
    )


def make_profile(
    db: Any,
    user_id: int,
    *,
    monthly_income_kd: str | None = None,
    payday_day: int | None = None,
) -> None:
    """
    Insert a user_profiles row. Only columns with non-None values are
    included; all others take their DB defaults (timezone defaults to
    'Asia/Kuwait' via server_default).
    """
    cols = [
        "user_id", "created_at", "updated_at",
        "email_notifications_enabled", "setup_guide_seen", "setup_guide_dismissed",
    ]
    values: list[Any] = [user_id, NOW, NOW, True, False, False]
    if monthly_income_kd is not None:
        cols.append("monthly_income_kd")
        values.append(monthly_income_kd)
    if payday_day is not None:
        cols.append("payday_day")
        values.append(payday_day)
    placeholders = ", ".join(f":v{i}" for i in range(len(values)))
    params = {f"v{i}": v for i, v in enumerate(values)}
    db.session.execute(
        db.text(
            f"INSERT INTO user_profiles ({', '.join(cols)}) "
            f"VALUES ({placeholders})"
        ),
        params,
    )


def make_debt(
    db: Any,
    user_id: int,
    name: str,
    *,
    balance: str = "0.000",
    minimum_payment: str = "0.000",
    is_active: bool = True,
) -> int:
    return raw_insert(
        db,
        "debt_accounts",
        [
            "user_id", "name", "debt_type", "balance_kd", "minimum_payment_kd",
            "is_active", "created_at", "updated_at",
        ],
        [user_id, name, "credit_card", balance, minimum_payment, is_active, NOW, NOW],
    )


def make_goal(
    db: Any,
    user_id: int,
    name: str,
    *,
    target: str = "1000.000",
    current: str = "0.000",
    is_active: bool = True,
) -> int:
    return raw_insert(
        db,
        "savings_goals",
        [
            "user_id", "name", "goal_type", "target_kd", "current_kd",
            "is_active", "created_at", "updated_at",
        ],
        [user_id, name, "custom", target, current, is_active, NOW, NOW],
    )


# ── Subcommand implementations (stubs — bodies land in 5c-1, 5c-2, 5c-3) ─────
#
# The harness above (_bootstrap_flask, _run_with_session, seed helpers) is fully
# functional. Each stub below will be replaced with its seed-and-extract body
# when the corresponding sub-commit is implemented and approved.

def cmd_income_pattern(args: argparse.Namespace) -> None:
    """
    Fixtures I1-I6 (six scenarios: income detection, confidence classification,
    bi-weekly multiplier, and not-detected paths).

    Implemented in 5c-1. See the 5c-1 proposal for the full fixture map.
    """
    print("income-pattern: 5c-1 will populate this capture. See the 5c-1 proposal.")


def cmd_recurring_patterns(args: argparse.Namespace) -> None:
    """
    Fixtures P1-P6 (six scenarios: frequency classification, confidence
    downgrades, group classification priority, and the same-day-filter edge case).

    Implemented in 5c-2. See the 5c-2 proposal for the full fixture map.
    """
    print("recurring-patterns: 5c-2 will populate this capture. See the 5c-2 proposal.")


def cmd_snapshot(args: argparse.Namespace) -> None:
    """
    Fixtures S1-S4 (four scenarios: all-time aggregations, active/inactive
    debt and savings filtering, multi-window cash flow, window boundary inclusivity).

    Implemented in 5c-3. See the 5c-3 proposal for the full fixture map.
    """
    print("snapshot: 5c-3 will populate this capture. See the 5c-3 proposal.")


# ── CLI wiring ────────────────────────────────────────────────────────────────

_SUBCOMMANDS: dict[str, tuple[str, Callable[[argparse.Namespace], None]]] = {
    "income-pattern": (
        "Capture I1-I6 fixtures for /api/analytics/income-pattern (5c-1)",
        cmd_income_pattern,
    ),
    "recurring-patterns": (
        "Capture P1-P6 fixtures for /api/analytics/recurring-patterns (5c-2)",
        cmd_recurring_patterns,
    ),
    "snapshot": (
        "Capture S1-S4 fixtures for /api/analytics/snapshot (5c-3)",
        cmd_snapshot,
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="capture-flask-fixtures",
        description="Capture Flask analytics fixtures for Module 5c equivalence tests.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Environment variables:\n"
            "  DATABASE_URL   PostgreSQL DSN "
            "(default: postgresql://finance:change-me@localhost:5436/personal_statera)\n"
            "  FLASK_APP_DIR  Path to the private Flask repo root\n"
            "                 (default: ../personal-finance sibling of this repo)\n"
        ),
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available subcommands and exit.",
    )
    subparsers = parser.add_subparsers(dest="command", metavar="SUBCOMMAND")
    for name, (description, fn) in _SUBCOMMANDS.items():
        sub = subparsers.add_parser(name, help=description)
        sub.set_defaults(func=fn)

    args = parser.parse_args()

    if args.list:
        print("Available subcommands:")
        for name, (description, _) in _SUBCOMMANDS.items():
            print(f"  {name:<24} {description}")
        sys.exit(0)

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
