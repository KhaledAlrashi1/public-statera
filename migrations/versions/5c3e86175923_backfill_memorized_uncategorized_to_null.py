"""Backfill memorized_transactions category 'Uncategorized' -> NULL.

Rows created before the learn_transaction fix (commit f340b92) stored the
literal string 'Uncategorized' instead of NULL for transactions with no
category. This migration normalizes them so the suggestion endpoint returns
NULL, which the frontend correctly renders as an empty category field rather
than the string 'Uncategorized'.

Revision ID: 5c3e86175923
Revises: 747ff70f09bf
Create Date: 2026-04-28 00:00:00
"""

from alembic import op
from sqlalchemy.sql import text


revision = "5c3e86175923"
down_revision = "747ff70f09bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        text("UPDATE memorized_transactions SET category = NULL WHERE category = 'Uncategorized'")
    )


def downgrade() -> None:
    # Intentionally a no-op. The pre-fix rows that held 'Uncategorized' cannot be
    # distinguished from rows that legitimately have NULL, and re-inserting the string
    # would reintroduce the bug this migration fixes.
    pass
