"""Drop legacy items table

Revision ID: f1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2026-03-10 22:15:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f1b2c3d4e5f6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "items" not in inspector.get_table_names():
        return

    index_names = {index["name"] for index in inspector.get_indexes("items")}
    if "ix_items_transaction_sort_order" in index_names:
        op.drop_index("ix_items_transaction_sort_order", table_name="items")
    op.drop_table("items")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "items" in inspector.get_table_names():
        return

    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("amount_kd", sa.Numeric(10, 3), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_items_transaction_sort_order", "items", ["transaction_id", "sort_order"])
