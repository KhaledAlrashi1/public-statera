"""Make transactions.category_id nullable; backfill Uncategorized rows to NULL.

Category is now optional on transaction entry. The literal string 'Uncategorized'
is a display label only — it is never stored. Existing rows whose category points
to a category named 'Uncategorized' are backfilled to NULL so the data model
matches the new intent.

Revision ID: bbdbd2eca33b
Revises: 5c3e86175923
Create Date: 2026-04-28 00:00:00
"""

from alembic import op
from sqlalchemy.sql import text


revision = "bbdbd2eca33b"
down_revision = "5c3e86175923"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("transactions", "category_id", nullable=True)
    op.execute(
        text(
            "UPDATE transactions SET category_id = NULL"
            " WHERE category_id IN"
            " (SELECT id FROM categories WHERE LOWER(name) = 'uncategorized')"
        )
    )


def downgrade() -> None:
    # Re-point NULL rows at the Uncategorized category, creating it per user if missing.
    # We use a single global fallback owned by user_id=NULL to avoid per-user creation
    # complexity in a migration context.
    op.execute(
        text(
            "INSERT INTO categories (name, user_id, is_income, is_archived)"
            " SELECT 'Uncategorized', NULL, FALSE, FALSE"
            " WHERE NOT EXISTS"
            " (SELECT 1 FROM categories WHERE LOWER(name) = 'uncategorized' AND user_id IS NULL)"
        )
    )
    op.execute(
        text(
            "UPDATE transactions SET category_id ="
            " (SELECT id FROM categories WHERE LOWER(name) = 'uncategorized' AND user_id IS NULL LIMIT 1)"
            " WHERE category_id IS NULL"
        )
    )
    op.alter_column("transactions", "category_id", nullable=False)
