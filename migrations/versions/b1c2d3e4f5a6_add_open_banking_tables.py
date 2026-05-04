"""Add open banking skeleton tables.

Revision ID: b1c2d3e4f5a6
Revises: a2b3c4d5e6f7
Create Date: 2026-02-25 09:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bank_connections",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("external_institution_id", sa.String(255), nullable=True),
        sa.Column("institution_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_bank_connections_user_provider_institution",
        "bank_connections",
        ["user_id", "provider", "institution_name"],
    )
    op.create_index("ix_bank_connections_user_id", "bank_connections", ["user_id"])
    op.create_index("ix_bank_connections_user_status", "bank_connections", ["user_id", "status"])

    op.create_table(
        "bank_consents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "connection_id",
            sa.Integer,
            sa.ForeignKey("bank_connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scopes", sa.Text, nullable=False, server_default='["transactions:read"]'),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
    )
    op.create_index("ix_bank_consents_connection_id", "bank_consents", ["connection_id"])
    op.create_index("ix_bank_consents_user_id", "bank_consents", ["user_id"])

    op.create_table(
        "bank_sync_runs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("connection_id", sa.Integer, sa.ForeignKey("bank_connections.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="staged"),
        sa.Column("provider_cursor", sa.String(255), nullable=True),
        sa.Column("staged_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("committed_count", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("abandoned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_bank_sync_runs_connection_id", "bank_sync_runs", ["connection_id"])
    op.create_index("ix_bank_sync_runs_user_status", "bank_sync_runs", ["user_id", "status"])
    op.create_index("ix_bank_sync_runs_created_at", "bank_sync_runs", ["created_at"])

    op.create_table(
        "raw_bank_transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("connection_id", sa.Integer, sa.ForeignKey("bank_connections.id"), nullable=False),
        sa.Column("sync_run_id", sa.Integer, sa.ForeignKey("bank_sync_runs.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider_tx_id", sa.String(255), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.String(128), nullable=False),
        sa.Column("amount_kd", sa.Numeric(10, 3), nullable=False),
        sa.Column("raw_payload_hash", sa.String(64), nullable=True),
        sa.Column("category_hint", sa.String(64), nullable=True),
        sa.Column("merchant_hint", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="staged"),
        sa.Column("transaction_id", sa.Integer, sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_unique_constraint(
        "uq_raw_bank_txn_connection_provider_id",
        "raw_bank_transactions",
        ["connection_id", "provider_tx_id"],
    )
    op.create_index("ix_raw_bank_txns_connection_id", "raw_bank_transactions", ["connection_id"])
    op.create_index("ix_raw_bank_txns_sync_run_id", "raw_bank_transactions", ["sync_run_id"])
    op.create_index("ix_raw_bank_txns_user_id", "raw_bank_transactions", ["user_id"])
    op.create_index("ix_raw_bank_txns_created_at", "raw_bank_transactions", ["created_at"])


def downgrade():
    op.drop_table("raw_bank_transactions")
    op.drop_table("bank_sync_runs")
    op.drop_table("bank_consents")
    op.drop_table("bank_connections")
