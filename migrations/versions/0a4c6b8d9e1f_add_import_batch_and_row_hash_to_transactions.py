"""add import batch and row hash columns to transactions

Revision ID: 0a4c6b8d9e1f
Revises: f1b2c3d4e5f6
Create Date: 2026-03-12 19:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0a4c6b8d9e1f"
down_revision = "f1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("import_batch_id", sa.String(length=36), nullable=True))
    op.add_column("transactions", sa.Column("import_row_hash", sa.String(length=64), nullable=True))
    op.create_index(
        op.f("ix_transactions_import_batch_id"),
        "transactions",
        ["import_batch_id"],
        unique=False,
    )
    op.create_index(
        "ix_transactions_import_row_hash",
        "transactions",
        ["import_row_hash"],
        unique=True,
        postgresql_where=sa.text("import_row_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_import_row_hash", table_name="transactions")
    op.drop_index(op.f("ix_transactions_import_batch_id"), table_name="transactions")
    op.drop_column("transactions", "import_row_hash")
    op.drop_column("transactions", "import_batch_id")
