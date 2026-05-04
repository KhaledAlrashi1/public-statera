"""Add worker_task_runs table

Revision ID: f0a1b2c3d4e5
Revises: b9c0d1e2f3a4
Create Date: 2026-03-10 18:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f0a1b2c3d4e5"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "worker_task_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_name", sa.String(length=128), nullable=False),
        sa.Column("last_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(length=32), nullable=False, server_default="never"),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_name", name="uq_worker_task_runs_task_name"),
    )
    op.create_index("ix_worker_task_runs_last_finished_at", "worker_task_runs", ["last_finished_at"])
    op.create_index("ix_worker_task_runs_task_name", "worker_task_runs", ["task_name"])


def downgrade() -> None:
    op.drop_index("ix_worker_task_runs_task_name", table_name="worker_task_runs")
    op.drop_index("ix_worker_task_runs_last_finished_at", table_name="worker_task_runs")
    op.drop_table("worker_task_runs")
