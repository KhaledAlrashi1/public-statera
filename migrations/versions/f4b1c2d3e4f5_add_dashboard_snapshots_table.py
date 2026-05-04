"""add dashboard snapshots table

Revision ID: f4b1c2d3e4f5
Revises: dd41e5f6a7b8
Create Date: 2026-03-06 18:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f4b1c2d3e4f5"
down_revision = "dd41e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "dashboard_snapshots" not in inspector.get_table_names():
        op.create_table(
            "dashboard_snapshots",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("months_count", sa.Integer(), nullable=False, server_default="24"),
            sa.Column("window_end_month", sa.String(length=7), nullable=False),
            sa.Column("months_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("monthly_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("expense_by_category_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "months_count",
                "window_end_month",
                name="uq_dashboard_snapshot_user_window",
            ),
        )
        op.create_index(
            "ix_dashboard_snapshots_user_computed",
            "dashboard_snapshots",
            ["user_id", "computed_at"],
            unique=False,
        )
        op.create_index(
            op.f("ix_dashboard_snapshots_user_id"),
            "dashboard_snapshots",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_dashboard_snapshots_window_end_month"),
            "dashboard_snapshots",
            ["window_end_month"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "dashboard_snapshots" in inspector.get_table_names():
        op.drop_index(op.f("ix_dashboard_snapshots_window_end_month"), table_name="dashboard_snapshots")
        op.drop_index(op.f("ix_dashboard_snapshots_user_id"), table_name="dashboard_snapshots")
        op.drop_index("ix_dashboard_snapshots_user_computed", table_name="dashboard_snapshots")
        op.drop_table("dashboard_snapshots")
