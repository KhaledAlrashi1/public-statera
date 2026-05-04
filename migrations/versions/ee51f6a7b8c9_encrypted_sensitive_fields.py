"""Encrypted sensitive fields: totp_secret→Text, add access/refresh tokens to bank_connections.

Revision ID: ee51f6a7b8c9
Revises: dd41e5f6a7b8
Create Date: 2026-03-05 17:00:00

Changes
-------
* ``users.totp_secret``: VARCHAR(64) → TEXT.  The column is now managed by the
  ``EncryptedString`` TypeDecorator (AES-256-GCM).  Existing plaintext values are
  returned as-is on reads and re-encrypted automatically on the next write.  Run
  ``scripts/reencrypt_secrets.py`` to proactively encrypt all legacy rows.

* ``bank_connections.access_token``: new TEXT column (nullable) — encrypted OAuth
  access token for real Open Banking providers (feature-flagged off until CBK
  sandbox approval).

* ``bank_connections.refresh_token``: new TEXT column (nullable) — encrypted OAuth
  refresh token.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "ee51f6a7b8c9"
down_revision = "dd41e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    bank_columns = {column["name"] for column in inspector.get_columns("bank_connections")}

    # Widen totp_secret from VARCHAR(64) to TEXT to hold AES-GCM ciphertext.
    op.alter_column(
        "users",
        "totp_secret",
        type_=sa.Text(),
        existing_type=sa.String(64),
        existing_nullable=True,
    )

    # Add encrypted OAuth token columns to bank_connections.
    if "access_token" not in bank_columns:
        op.add_column(
            "bank_connections",
            sa.Column("access_token", sa.Text(), nullable=True),
        )
    if "refresh_token" not in bank_columns:
        op.add_column(
            "bank_connections",
            sa.Column("refresh_token", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    bank_columns = {column["name"] for column in inspector.get_columns("bank_connections")}

    if "refresh_token" in bank_columns:
        op.drop_column("bank_connections", "refresh_token")
    if "access_token" in bank_columns:
        op.drop_column("bank_connections", "access_token")

    # Truncate any ciphertext values to fit back in VARCHAR(64).
    # This is a best-effort downgrade — plaintext values survive, ciphertext is lost.
    op.execute(
        "UPDATE users SET totp_secret = LEFT(totp_secret, 64) "
        "WHERE totp_secret IS NOT NULL AND LENGTH(totp_secret) > 64"
    )
    op.alter_column(
        "users",
        "totp_secret",
        type_=sa.String(64),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
