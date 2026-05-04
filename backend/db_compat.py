"""
db_compat.py - Dialect-agnostic SQL expression helpers.

Supported dialects: postgresql.

Rules:
  - Helpers are lazy: they read db.engine.dialect only when called,
    which requires an active Flask app context (true inside route handlers).
  - Never import at module level from here into models.py (circular risk).
"""

from __future__ import annotations

from sqlalchemy import func, literal


def month_bucket(date_col):
    """
    Returns a SQLAlchemy column expression producing 'YYYY-MM' from a Date column.

    Usage:
        ym_expr = month_bucket(Transaction.date)
        query.filter(ym_expr == "2026-02")
        query.filter(ym_expr.in_(month_keys))
        query.with_entities(ym_expr.label("ym"), ...)
        query.group_by(ym_expr)  # always expression, not alias string
        query.order_by(ym_expr)

    PostgreSQL: func.to_char(date_col, 'YYYY-MM')
    """
    from backend import db  # late import avoids circular dependency at module load time

    if db.engine.dialect.name == "postgresql":
        # Use literal() to guarantee SQL string literal binding in compiled SQL.
        return func.to_char(date_col, literal("YYYY-MM"))
    raise RuntimeError("month_bucket requires a PostgreSQL database connection.")
