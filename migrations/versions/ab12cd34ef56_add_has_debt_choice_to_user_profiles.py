"""add has_debt_choice preference to user profiles

Revision ID: ab12cd34ef56
Revises: dd41e5f6a7b8
Create Date: 2026-03-10 14:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "ab12cd34ef56"
down_revision = "dd41e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    if "has_debt_choice" not in existing_columns:
        with op.batch_alter_table("user_profiles", schema=None) as batch_op:
            batch_op.add_column(sa.Column("has_debt_choice", sa.Boolean(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("user_profiles")}

    if "has_debt_choice" in existing_columns:
        with op.batch_alter_table("user_profiles", schema=None) as batch_op:
            batch_op.drop_column("has_debt_choice")
