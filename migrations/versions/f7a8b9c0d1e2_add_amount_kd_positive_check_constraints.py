"""Add CHECK (amount_kd > 0) constraints to transactions and items tables

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-10 16:10:00.000000

These constraints enforce the application invariant that amount_kd is
always strictly positive at the database level, complementing the
application-layer validation in backend/lib/validation.py.

Historical data must be pre-validated before this revision is applied to
an existing database. The required PostgreSQL audit query now lives in
scripts/audit_historical_data_integrity.sql under the
"f7a8b9c0d1e2 preflight" section. If any transaction or legacy item row
has amount_kd <= 0, this migration must not be applied until those rows
are remediated.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def _has_check_constraint(table_name: str, constraint_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return False
    return any(
        constraint.get("name") == constraint_name
        for constraint in inspector.get_check_constraints(table_name)
    )


def upgrade() -> None:
    op.create_check_constraint(
        "ck_transactions_amount_kd_positive",
        "transactions",
        sa.text("amount_kd > 0"),
    )
    op.create_check_constraint(
        "ck_items_amount_kd_positive",
        "items",
        sa.text("amount_kd > 0"),
    )


def downgrade() -> None:
    if _has_check_constraint("items", "ck_items_amount_kd_positive"):
        op.drop_constraint("ck_items_amount_kd_positive", "items", type_="check")
    if _has_check_constraint("transactions", "ck_transactions_amount_kd_positive"):
        op.drop_constraint("ck_transactions_amount_kd_positive", "transactions", type_="check")
