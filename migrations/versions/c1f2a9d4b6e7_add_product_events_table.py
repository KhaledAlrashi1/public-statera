"""Add product_events table for onboarding and activation analytics.

Revision ID: c1f2a9d4b6e7
Revises: 8f12c4f4fd5b
Create Date: 2026-02-18 22:45:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c1f2a9d4b6e7"
down_revision = "8f12c4f4fd5b"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "product_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_name", sa.String(length=64), nullable=False),
        sa.Column("properties_json", sa.Text(), nullable=True),
        sa.Column("event_ts", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("product_events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_product_events_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_events_event_name"), ["event_name"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_events_event_ts"), ["event_ts"], unique=False)
        batch_op.create_index("ix_product_events_user_event", ["user_id", "event_name"], unique=False)
        batch_op.create_index("ix_product_events_event_ts_name", ["event_name", "event_ts"], unique=False)


def downgrade():
    with op.batch_alter_table("product_events", schema=None) as batch_op:
        batch_op.drop_index("ix_product_events_event_ts_name")
        batch_op.drop_index("ix_product_events_user_event")
        batch_op.drop_index(batch_op.f("ix_product_events_event_ts"))
        batch_op.drop_index(batch_op.f("ix_product_events_event_name"))
        batch_op.drop_index(batch_op.f("ix_product_events_user_id"))
    op.drop_table("product_events")
