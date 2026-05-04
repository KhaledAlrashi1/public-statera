"""Migrate SavingsGoal.linked_category string to linked_category_id FK

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-03-10 16:20:00.000000

Replaces the free-text ``linked_category`` string column on savings_goals
with a proper nullable FK ``linked_category_id`` pointing to categories.id.

Migration strategy:
  1. Add linked_category_id column (nullable FK to categories.id).
  2. Populate it by matching the existing string value to the category name
     scoped to the goal's user_id (user-owned category first, then global).
     Rows with no matching category receive NULL (per approved decision).
  3. Drop the old linked_category string column.

Downgrade reverses the process: re-adds the string column, repopulates
it from the FK value (via the category name), then drops the FK column.

Important: this revision is intentionally lossy for unmatched historical
linked_category strings. Once an unmatched value becomes NULL during the
upgrade, a later downgrade cannot reconstruct the original string. Use the
preflight query in scripts/audit_historical_data_integrity.sql to report
these rows before upgrading a live database.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add the new FK column (nullable).
    op.add_column(
        "savings_goals",
        sa.Column(
            "linked_category_id",
            sa.Integer,
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )

    # 2. Populate: match linked_category string → category id, user-scoped first.
    #    Uses a correlated subquery that resolves user-owned categories before
    #    global ones, matching the application's find_category_by_name precedence.
    op.execute(
        sa.text("""
        UPDATE savings_goals sg
        SET linked_category_id = (
            SELECT c.id
            FROM categories c
            WHERE LOWER(c.name) = LOWER(sg.linked_category)
              AND (c.user_id = sg.user_id OR c.user_id IS NULL)
            ORDER BY
                CASE WHEN c.user_id = sg.user_id THEN 0 ELSE 1 END,
                c.id ASC
            LIMIT 1
        )
        WHERE sg.linked_category IS NOT NULL
          AND sg.linked_category != ''
        """)
    )

    # 3. Drop the old string column.
    op.drop_column("savings_goals", "linked_category")


def downgrade() -> None:
    # Re-add the string column.
    op.add_column(
        "savings_goals",
        sa.Column("linked_category", sa.String(64), nullable=True),
    )

    # Repopulate from the FK value (category name).
    op.execute(
        sa.text("""
        UPDATE savings_goals sg
        SET linked_category = (
            SELECT c.name
            FROM categories c
            WHERE c.id = sg.linked_category_id
        )
        WHERE sg.linked_category_id IS NOT NULL
        """)
    )

    # Drop the FK column and its index.
    op.drop_column("savings_goals", "linked_category_id")
