"""backfill bank_consents data_recipient_name DinarTrack -> Personal Statera

Revision ID: 9f9c43c2cb55
Revises: f9c0d1e2a3b4
Create Date: 2026-04-24 00:00:00.000000
"""

from alembic import op
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision = "9f9c43c2cb55"
down_revision = "f9c0d1e2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        text(
            "UPDATE bank_consents SET data_recipient_name = 'Personal Statera'"
            " WHERE data_recipient_name = 'DinarTrack'"
        )
    )


def downgrade() -> None:
    op.execute(
        text(
            "UPDATE bank_consents SET data_recipient_name = 'DinarTrack'"
            " WHERE data_recipient_name = 'Personal Statera'"
        )
    )
