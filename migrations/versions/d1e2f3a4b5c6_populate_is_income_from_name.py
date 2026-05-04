"""Populate is_income on categories from historical name heuristic.

Categories whose names start with 'income' (case-insensitive) are marked
is_income=True; all others are set to is_income=False. This backfills the
column added in the previous migration so existing data works correctly.

Revision ID: d1e2f3a4b5c6
Revises: c6c888325571
Create Date: 2026-02-21 21:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "d1e2f3a4b5c6"
down_revision = "c6c888325571"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Mark income categories (matches old name.ilike("income%") heuristic)
    conn.execute(
        sa.text("UPDATE categories SET is_income = TRUE WHERE lower(name) LIKE 'income%'")
    )
    # All others are expense categories
    conn.execute(
        sa.text("UPDATE categories SET is_income = FALSE WHERE is_income IS NULL")
    )


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE categories SET is_income = NULL"))
