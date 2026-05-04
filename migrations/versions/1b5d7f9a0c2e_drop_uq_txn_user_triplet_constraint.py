"""drop uq txn user triplet constraint

Revision ID: 1b5d7f9a0c2e
Revises: 0a4c6b8d9e1f
Create Date: 2026-03-12 19:05:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1b5d7f9a0c2e"
down_revision = "0a4c6b8d9e1f"
branch_labels = None
depends_on = None


def _unique_constraint_names(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {
        constraint["name"]
        for constraint in inspector.get_unique_constraints(table_name)
        if constraint.get("name")
    }


def upgrade() -> None:
    if "uq_txn_user_triplet" in _unique_constraint_names("transactions"):
        op.drop_constraint("uq_txn_user_triplet", "transactions", type_="unique")


def downgrade() -> None:
    if "uq_txn_user_triplet" not in _unique_constraint_names("transactions"):
        op.create_unique_constraint(
            "uq_txn_user_triplet",
            "transactions",
            ["user_id", "date", "name_key", "amount_kd"],
        )
