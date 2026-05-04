"""Add first_name and last_name columns to users; backfill from display_name.

Revision ID: a2b3c4d5e6f7
Revises: d1e2f3a4b5c6
Create Date: 2026-02-23 12:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a2b3c4d5e6f7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("last_name", sa.String(64), nullable=True))

    # Backfill: split existing display_name by the first space.
    # "Ali Al-Rashidi" → first_name="Ali", last_name="Al-Rashidi"
    # "Ali"            → first_name="Ali", last_name=NULL
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, display_name FROM users WHERE display_name IS NOT NULL AND display_name != ''")
    ).fetchall()
    for row in rows:
        user_id, display_name = row[0], row[1]
        parts = display_name.strip().split(" ", 1)
        first = parts[0].strip() or None
        last = parts[1].strip() if len(parts) > 1 else None
        conn.execute(
            sa.text("UPDATE users SET first_name = :fn, last_name = :ln WHERE id = :id"),
            {"fn": first, "ln": last, "id": user_id},
        )


def downgrade():
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("last_name")
        batch_op.drop_column("first_name")
