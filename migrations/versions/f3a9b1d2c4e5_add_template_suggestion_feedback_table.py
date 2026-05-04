"""Add template_suggestion_feedback table for suggestion ranking feedback.

Revision ID: f3a9b1d2c4e5
Revises: c1f2a9d4b6e7
Create Date: 2026-02-19 22:45:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f3a9b1d2c4e5"
down_revision = "c1f2a9d4b6e7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "template_suggestion_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("signature_key", sa.String(length=64), nullable=False),
        sa.Column("accepted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "signature_key", name="uq_template_feedback_user_signature"),
    )
    with op.batch_alter_table("template_suggestion_feedback", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_template_suggestion_feedback_user_id"), ["user_id"], unique=False)
        batch_op.create_index("ix_template_feedback_user_updated", ["user_id", "updated_at"], unique=False)


def downgrade():
    with op.batch_alter_table("template_suggestion_feedback", schema=None) as batch_op:
        batch_op.drop_index("ix_template_feedback_user_updated")
        batch_op.drop_index(batch_op.f("ix_template_suggestion_feedback_user_id"))
    op.drop_table("template_suggestion_feedback")
