"""add email notifications preference to user profiles

Revision ID: dd41e5f6a7b8
Revises: cc31d4e5f6a7
Create Date: 2026-03-05 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "dd41e5f6a7b8"
down_revision = "cc31d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    if "email_notifications_enabled" not in existing_columns:
        with op.batch_alter_table("user_profiles", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "email_notifications_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.true(),
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    if "email_notifications_enabled" in existing_columns:
        with op.batch_alter_table("user_profiles", schema=None) as batch_op:
            batch_op.drop_column("email_notifications_enabled")
