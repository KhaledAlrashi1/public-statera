"""Add debt_accounts table.

Revision ID: e7f8a9b0c1d2
Revises: b1c2d3e4f5a6
Create Date: 2026-03-01 00:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e7f8a9b0c1d2"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "debt_accounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("debt_type", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("balance_kd", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("apr_pct", sa.Numeric(6, 3), nullable=True),
        sa.Column("minimum_payment_kd", sa.Numeric(10, 3), nullable=False, server_default="0"),
        sa.Column("due_day", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_unique_constraint(
        "uq_debt_accounts_user_name",
        "debt_accounts",
        ["user_id", "name"],
    )
    op.create_index("ix_debt_accounts_user_id", "debt_accounts", ["user_id"])
    op.create_index("ix_debt_accounts_user_active", "debt_accounts", ["user_id", "is_active"])


def downgrade():
    op.drop_table("debt_accounts")
