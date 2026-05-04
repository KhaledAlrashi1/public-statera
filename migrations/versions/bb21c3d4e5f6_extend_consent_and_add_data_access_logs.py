"""extend consent and add data access logs

Revision ID: bb21c3d4e5f6
Revises: aa91b2c3d4e5
Create Date: 2026-03-05 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "bb21c3d4e5f6"
down_revision = "aa91b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    bank_connection_columns = {col["name"] for col in inspector.get_columns("bank_connections")}
    with op.batch_alter_table("bank_connections", schema=None) as batch_op:
        if "account_number_masked" not in bank_connection_columns:
            batch_op.add_column(sa.Column("account_number_masked", sa.String(length=20), nullable=True))

    bank_consent_columns = {col["name"] for col in inspector.get_columns("bank_consents")}
    with op.batch_alter_table("bank_consents", schema=None) as batch_op:
        if "purpose_of_use" not in bank_consent_columns:
            batch_op.add_column(
                sa.Column(
                    "purpose_of_use",
                    sa.String(length=512),
                    nullable=False,
                    server_default="Personal financial analytics",
                )
            )
        if "consent_reference" not in bank_consent_columns:
            batch_op.add_column(sa.Column("consent_reference", sa.String(length=128), nullable=True))
        if "data_recipient_name" not in bank_consent_columns:
            batch_op.add_column(
                sa.Column(
                    "data_recipient_name",
                    sa.String(length=255),
                    nullable=False,
                    server_default="DinarTrack",
                )
            )
        if "scope_description" not in bank_consent_columns:
            batch_op.add_column(
                sa.Column(
                    "scope_description",
                    sa.Text(),
                    nullable=False,
                    server_default="Read-only access to transaction history for analytics",
                )
            )
        if "ip_address_granted" not in bank_consent_columns:
            batch_op.add_column(sa.Column("ip_address_granted", sa.String(length=64), nullable=True))
        if "user_agent_granted" not in bank_consent_columns:
            batch_op.add_column(sa.Column("user_agent_granted", sa.String(length=255), nullable=True))

    existing_tables = set(inspector.get_table_names())
    if "data_access_logs" not in existing_tables:
        op.create_table(
            "data_access_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("connection_id", sa.Integer(), nullable=True),
            sa.Column("consent_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("records_accessed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("date_range_start", sa.Date(), nullable=True),
            sa.Column("date_range_end", sa.Date(), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["connection_id"], ["bank_connections.id"], ),
            sa.ForeignKeyConstraint(["consent_id"], ["bank_consents.id"], ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    existing_indexes = {
        idx["name"] for idx in inspector.get_indexes("data_access_logs")
    }
    with op.batch_alter_table("data_access_logs", schema=None) as batch_op:
        if "ix_data_access_logs_action" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_data_access_logs_action"), ["action"], unique=False)
        if "ix_data_access_logs_connection_id" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_data_access_logs_connection_id"), ["connection_id"], unique=False)
        if "ix_data_access_logs_consent_id" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_data_access_logs_consent_id"), ["consent_id"], unique=False)
        if "ix_data_access_logs_created_at" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_data_access_logs_created_at"), ["created_at"], unique=False)
        if "ix_data_access_logs_user_connection_created" not in existing_indexes:
            batch_op.create_index(
                "ix_data_access_logs_user_connection_created",
                ["user_id", "connection_id", "created_at"],
                unique=False,
            )
        if "ix_data_access_logs_user_id" not in existing_indexes:
            batch_op.create_index(batch_op.f("ix_data_access_logs_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_tables = set(inspector.get_table_names())
    if "data_access_logs" in existing_tables:
        existing_indexes = {
            idx["name"] for idx in inspector.get_indexes("data_access_logs")
        }
        with op.batch_alter_table("data_access_logs", schema=None) as batch_op:
            if "ix_data_access_logs_user_id" in existing_indexes:
                batch_op.drop_index(batch_op.f("ix_data_access_logs_user_id"))
            if "ix_data_access_logs_user_connection_created" in existing_indexes:
                batch_op.drop_index("ix_data_access_logs_user_connection_created")
            if "ix_data_access_logs_created_at" in existing_indexes:
                batch_op.drop_index(batch_op.f("ix_data_access_logs_created_at"))
            if "ix_data_access_logs_consent_id" in existing_indexes:
                batch_op.drop_index(batch_op.f("ix_data_access_logs_consent_id"))
            if "ix_data_access_logs_connection_id" in existing_indexes:
                batch_op.drop_index(batch_op.f("ix_data_access_logs_connection_id"))
            if "ix_data_access_logs_action" in existing_indexes:
                batch_op.drop_index(batch_op.f("ix_data_access_logs_action"))
        op.drop_table("data_access_logs")

    bank_consent_columns = {col["name"] for col in inspector.get_columns("bank_consents")}
    with op.batch_alter_table("bank_consents", schema=None) as batch_op:
        if "user_agent_granted" in bank_consent_columns:
            batch_op.drop_column("user_agent_granted")
        if "ip_address_granted" in bank_consent_columns:
            batch_op.drop_column("ip_address_granted")
        if "scope_description" in bank_consent_columns:
            batch_op.drop_column("scope_description")
        if "data_recipient_name" in bank_consent_columns:
            batch_op.drop_column("data_recipient_name")
        if "consent_reference" in bank_consent_columns:
            batch_op.drop_column("consent_reference")
        if "purpose_of_use" in bank_consent_columns:
            batch_op.drop_column("purpose_of_use")

    bank_connection_columns = {col["name"] for col in inspector.get_columns("bank_connections")}
    with op.batch_alter_table("bank_connections", schema=None) as batch_op:
        if "account_number_masked" in bank_connection_columns:
            batch_op.drop_column("account_number_masked")
