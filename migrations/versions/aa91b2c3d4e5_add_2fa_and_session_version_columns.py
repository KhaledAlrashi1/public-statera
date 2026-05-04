"""add 2fa and session version columns

Revision ID: aa91b2c3d4e5
Revises: f1a2b3c4d5e6
Create Date: 2026-03-05 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "aa91b2c3d4e5"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    with op.batch_alter_table("users", schema=None) as batch_op:
        if "totp_secret" not in existing_columns:
            batch_op.add_column(sa.Column("totp_secret", sa.String(length=64), nullable=True))
        if "totp_enabled" not in existing_columns:
            batch_op.add_column(sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "totp_backup_codes_json" not in existing_columns:
            batch_op.add_column(sa.Column("totp_backup_codes_json", sa.Text(), nullable=True))
        if "session_version" not in existing_columns:
            batch_op.add_column(sa.Column("session_version", sa.Integer(), nullable=False, server_default=sa.text("1")))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    with op.batch_alter_table("users", schema=None) as batch_op:
        if "session_version" in existing_columns:
            batch_op.drop_column("session_version")
        if "totp_backup_codes_json" in existing_columns:
            batch_op.drop_column("totp_backup_codes_json")
        if "totp_enabled" in existing_columns:
            batch_op.drop_column("totp_enabled")
        if "totp_secret" in existing_columns:
            batch_op.drop_column("totp_secret")
