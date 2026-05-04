"""Add timezone field to user_profiles, defaulting to Asia/Kuwait

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-03-10 16:15:00.000000

Stores the user's preferred IANA timezone string. The default value
"Asia/Kuwait" reflects the primary target market. No UI or analytics
change is introduced at this point — the field is reserved for future
pay-cycle and analytics localisation work.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

DEFAULT_TIMEZONE = "Asia/Kuwait"


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column(
            "timezone",
            sa.String(64),
            nullable=False,
            server_default=DEFAULT_TIMEZONE,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "timezone")
