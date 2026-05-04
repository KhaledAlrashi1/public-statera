"""Add hot-path query indexes for transactions and items.

Revision ID: 8f12c4f4fd5b
Revises: 562edd0d5f2b
Create Date: 2026-02-18 16:30:00
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "8f12c4f4fd5b"
down_revision = "562edd0d5f2b"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.create_index(
            "ix_transactions_user_date_id",
            ["user_id", "date", "id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_transactions_user_category_date",
            ["user_id", "category_id", "date"],
            unique=False,
        )

    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.create_index(
            "ix_items_transaction_sort_order",
            ["transaction_id", "sort_order"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("items", schema=None) as batch_op:
        batch_op.drop_index("ix_items_transaction_sort_order")

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_index("ix_transactions_user_category_date")
        batch_op.drop_index("ix_transactions_user_date_id")
