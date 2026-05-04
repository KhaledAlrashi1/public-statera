"""Add is_archived and archived_at fields to categories

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-03-10 16:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "categories",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_categories_user_id_is_archived",
        "categories",
        ["user_id", "is_archived"],
    )


def downgrade() -> None:
    op.drop_index("ix_categories_user_id_is_archived", table_name="categories")
    op.drop_column("categories", "archived_at")
    op.drop_column("categories", "is_archived")
