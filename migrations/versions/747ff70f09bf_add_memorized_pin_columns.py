"""Add is_pinned and pinned_at columns to memorized_transactions.

Allows users to pin frequently-used memorized transactions so they always
appear at the top of the management list.

Revision ID: 747ff70f09bf
Revises: 1b5d7f9a0c2e
Create Date: 2026-04-24 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "747ff70f09bf"
down_revision = "1b5d7f9a0c2e"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "memorized_transactions",
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "memorized_transactions",
        sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("memorized_transactions", "pinned_at")
    op.drop_column("memorized_transactions", "is_pinned")
