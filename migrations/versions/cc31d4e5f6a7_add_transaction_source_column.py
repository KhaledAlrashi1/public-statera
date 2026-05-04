"""add transaction source column

Revision ID: cc31d4e5f6a7
Revises: bb21c3d4e5f6
Create Date: 2026-03-05 15:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "cc31d4e5f6a7"
down_revision = "bb21c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("transactions")}
    if "source" not in columns:
        with op.batch_alter_table("transactions", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "source",
                    sa.String(length=32),
                    nullable=True,
                    server_default="manual",
                )
            )

    op.execute(sa.text("UPDATE transactions SET source = 'manual' WHERE source IS NULL"))

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.alter_column("source", existing_type=sa.String(length=32), nullable=False)

    inspector = sa.inspect(bind)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        if "ix_transactions_source" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_transactions_source"), ["source"], unique=False)
        if "ix_transactions_user_source_date" not in existing_indexes:
            batch_op.create_index("ix_transactions_user_source_date", ["user_id", "source", "date"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("transactions")}
    if "source" not in columns:
        return

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        if "ix_transactions_user_source_date" in existing_indexes:
            batch_op.drop_index("ix_transactions_user_source_date")
        if "ix_transactions_source" in existing_indexes:
            batch_op.drop_index(batch_op.f("ix_transactions_source"))
        batch_op.drop_column("source")
