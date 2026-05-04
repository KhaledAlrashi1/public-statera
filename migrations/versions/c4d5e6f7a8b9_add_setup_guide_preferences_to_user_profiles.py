"""add setup guide preferences to user profiles

Revision ID: c4d5e6f7a8b9
Revises: ab12cd34ef56
Create Date: 2026-03-10 15:35:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c4d5e6f7a8b9"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        if "setup_guide_seen" not in existing_columns:
            batch_op.add_column(
                sa.Column("setup_guide_seen", sa.Boolean(), nullable=False, server_default=sa.false())
            )
        if "setup_guide_dismissed" not in existing_columns:
            batch_op.add_column(
                sa.Column("setup_guide_dismissed", sa.Boolean(), nullable=False, server_default=sa.false())
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    with op.batch_alter_table("user_profiles", schema=None) as batch_op:
        if "setup_guide_dismissed" in existing_columns:
            batch_op.drop_column("setup_guide_dismissed")
        if "setup_guide_seen" in existing_columns:
            batch_op.drop_column("setup_guide_seen")
