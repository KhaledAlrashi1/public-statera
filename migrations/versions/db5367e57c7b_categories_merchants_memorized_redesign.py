"""Categories/merchants/memorized redesign

Changes in this revision (all in one atomic pass):
  1. categories: add is_system, delete global rows, ensure every user has an
     Uncategorized category (is_system=True), make user_id NOT NULL.
  2. merchants: delete global rows, make user_id NOT NULL.
  3. memorized_transactions: add category_id / merchant_id FKs, data-migrate
     from the old string columns, drop old string columns.
  4. categories: log archived row count, drop is_archived / archived_at.

Merges heads: bbdbd2eca33b (category nullable) and 9f9c43c2cb55 (bank_consents backfill).

Revision ID: db5367e57c7b
Revises: bbdbd2eca33b, 9f9c43c2cb55
Create Date: 2026-05-01 00:00:00.000000
"""

from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op

revision = "db5367e57c7b"
down_revision = ("bbdbd2eca33b", "9f9c43c2cb55")
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------ #
    # Step 1a: categories — add is_system column                          #
    # ------------------------------------------------------------------ #
    op.add_column(
        "categories",
        sa.Column(
            "is_system",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ------------------------------------------------------------------ #
    # Step 1b: Reassign FK references from global to per-user categories  #
    # then delete the global rows.                                        #
    # Strategy: for each (user, global_category), find/create a          #
    # user-owned category with the same name, then update all FK refs.    #
    # If no name match can be made, NULL out the FK (category optional).  #
    # ------------------------------------------------------------------ #
    global_cats = conn.execute(
        sa.text("SELECT id, name FROM categories WHERE user_id IS NULL ORDER BY id")
    ).fetchall()
    global_cat_count = len(global_cats)
    logger.info("Reassigning references from %d global categories (user_id IS NULL) then deleting.", global_cat_count)

    for (gc_id, gc_name) in global_cats:
        # Find all users who have transactions, budgets, or savings goals
        # pointing to this global category.
        affected_users = conn.execute(
            sa.text("""
                SELECT DISTINCT user_id FROM transactions WHERE category_id = :gid
                UNION
                SELECT DISTINCT user_id FROM budgets WHERE category_id = :gid
                UNION
                SELECT DISTINCT user_id FROM savings_goals WHERE linked_category_id = :gid
            """),
            {"gid": gc_id},
        ).fetchall()

        for (uid,) in affected_users:
            # Find or create a user-owned category with the same name.
            row = conn.execute(
                sa.text(
                    "SELECT id FROM categories "
                    "WHERE user_id = :uid AND lower(name) = lower(:name)"
                ),
                {"uid": uid, "name": gc_name},
            ).fetchone()
            if row:
                user_cat_id = row[0]
            else:
                # Create a user-owned category to receive these references.
                r = conn.execute(
                    sa.text(
                        "INSERT INTO categories (user_id, name, is_income, is_archived, is_system) "
                        "VALUES (:uid, :name, false, false, false) RETURNING id"
                    ),
                    {"uid": uid, "name": gc_name},
                )
                user_cat_id = r.scalar()

            conn.execute(
                sa.text("UPDATE transactions SET category_id = :new WHERE category_id = :old AND user_id = :uid"),
                {"new": user_cat_id, "old": gc_id, "uid": uid},
            )
            conn.execute(
                sa.text("UPDATE budgets SET category_id = :new WHERE category_id = :old AND user_id = :uid"),
                {"new": user_cat_id, "old": gc_id, "uid": uid},
            )
            conn.execute(
                sa.text("UPDATE savings_goals SET linked_category_id = :new WHERE linked_category_id = :old AND user_id = :uid"),
                {"new": user_cat_id, "old": gc_id, "uid": uid},
            )

        # Any remaining FK refs (shouldn't exist, but guard anyway)
        conn.execute(sa.text("UPDATE transactions SET category_id = NULL WHERE category_id = :gid"), {"gid": gc_id})
        conn.execute(sa.text("UPDATE savings_goals SET linked_category_id = NULL WHERE linked_category_id = :gid"), {"gid": gc_id})

        conn.execute(sa.text("DELETE FROM categories WHERE id = :gid"), {"gid": gc_id})

    logger.info("Deleted %d global categories.", global_cat_count)

    # ------------------------------------------------------------------ #
    # Step 1c: Ensure every user has a user-owned Uncategorized row.      #
    # Rows created here are marked is_system=true.                        #
    # Rows already owned by a user with that name are left as-is          #
    # (is_system stays false — the user created those explicitly).        #
    # ------------------------------------------------------------------ #
    users = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    uncat_created = 0
    for (user_id,) in users:
        existing = conn.execute(
            sa.text(
                "SELECT id FROM categories "
                "WHERE user_id = :uid AND lower(name) = 'uncategorized'"
            ),
            {"uid": user_id},
        ).fetchone()
        if not existing:
            conn.execute(
                sa.text(
                    "INSERT INTO categories (user_id, name, is_income, is_archived, is_system) "
                    "VALUES (:uid, 'Uncategorized', false, false, true)"
                ),
                {"uid": user_id},
            )
            uncat_created += 1
    logger.info(
        "Created Uncategorized (is_system=true) for %d user(s).", uncat_created
    )

    # ------------------------------------------------------------------ #
    # Step 1d: Make categories.user_id NOT NULL.                          #
    # ------------------------------------------------------------------ #
    op.alter_column("categories", "user_id", nullable=False)

    # ------------------------------------------------------------------ #
    # Step 2a: Reassign FK references from global to per-user merchants   #
    # then delete the global rows.                                        #
    # ------------------------------------------------------------------ #
    global_merchs = conn.execute(
        sa.text("SELECT id, name FROM merchants WHERE user_id IS NULL ORDER BY id")
    ).fetchall()
    global_merch_count = len(global_merchs)
    logger.info("Reassigning references from %d global merchants (user_id IS NULL) then deleting.", global_merch_count)

    for (gm_id, gm_name) in global_merchs:
        affected_users = conn.execute(
            sa.text("SELECT DISTINCT user_id FROM transactions WHERE merchant_id = :gid"),
            {"gid": gm_id},
        ).fetchall()

        for (uid,) in affected_users:
            row = conn.execute(
                sa.text(
                    "SELECT id FROM merchants "
                    "WHERE user_id = :uid AND lower(name) = lower(:name)"
                ),
                {"uid": uid, "name": gm_name},
            ).fetchone()
            if row:
                user_merch_id = row[0]
            else:
                r = conn.execute(
                    sa.text(
                        "INSERT INTO merchants (user_id, name) "
                        "VALUES (:uid, :name) RETURNING id"
                    ),
                    {"uid": uid, "name": gm_name},
                )
                user_merch_id = r.scalar()

            conn.execute(
                sa.text("UPDATE transactions SET merchant_id = :new WHERE merchant_id = :old AND user_id = :uid"),
                {"new": user_merch_id, "old": gm_id, "uid": uid},
            )

        # NULL out any remaining refs (guard)
        conn.execute(sa.text("UPDATE transactions SET merchant_id = NULL WHERE merchant_id = :gid"), {"gid": gm_id})
        conn.execute(sa.text("DELETE FROM merchants WHERE id = :gid"), {"gid": gm_id})

    logger.info("Deleted %d global merchants.", global_merch_count)

    # ------------------------------------------------------------------ #
    # Step 2b: Make merchants.user_id NOT NULL.                           #
    # ------------------------------------------------------------------ #
    op.alter_column("merchants", "user_id", nullable=False)

    # ------------------------------------------------------------------ #
    # Step 3a: memorized_transactions — add category_id FK column.        #
    # ------------------------------------------------------------------ #
    op.add_column(
        "memorized_transactions",
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_memorized_transactions_category_id",
        "memorized_transactions",
        ["category_id"],
    )

    # ------------------------------------------------------------------ #
    # Step 3b: memorized_transactions — add merchant_id FK column.        #
    # ------------------------------------------------------------------ #
    op.add_column(
        "memorized_transactions",
        sa.Column(
            "merchant_id",
            sa.Integer(),
            sa.ForeignKey("merchants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_memorized_transactions_merchant_id",
        "memorized_transactions",
        ["merchant_id"],
    )

    # ------------------------------------------------------------------ #
    # Step 3c: Data migration — resolve string names to FK IDs.           #
    # Only match user-owned rows to avoid phantoms.                       #
    # Rows that can't be resolved stay NULL (no phantom creation).        #
    # ------------------------------------------------------------------ #
    conn.execute(sa.text("""
        UPDATE memorized_transactions mt
        SET    category_id = (
                   SELECT c.id
                   FROM   categories c
                   WHERE  c.user_id = mt.user_id
                     AND  lower(c.name) = lower(mt.category)
                   ORDER  BY c.id
                   LIMIT  1
               )
        WHERE  mt.category IS NOT NULL
          AND  mt.category != ''
    """))
    conn.execute(sa.text("""
        UPDATE memorized_transactions mt
        SET    merchant_id = (
                   SELECT m.id
                   FROM   merchants m
                   WHERE  m.user_id = mt.user_id
                     AND  lower(m.name) = lower(mt.merchant)
                   ORDER  BY m.id
                   LIMIT  1
               )
        WHERE  mt.merchant IS NOT NULL
          AND  mt.merchant != ''
    """))

    # ------------------------------------------------------------------ #
    # Step 3d: Drop old string columns.                                   #
    # ------------------------------------------------------------------ #
    op.drop_column("memorized_transactions", "category")
    op.drop_column("memorized_transactions", "merchant")

    # ------------------------------------------------------------------ #
    # Step 4a: Log archived category count before dropping columns.       #
    # ------------------------------------------------------------------ #
    result = conn.execute(
        sa.text("SELECT COUNT(*) FROM categories WHERE is_archived = true")
    )
    archived_count = result.scalar() or 0
    logger.info(
        "Dropping archive columns. %d category row(s) were archived — "
        "they become regular (unarchived) categories after this migration.",
        archived_count,
    )

    # ------------------------------------------------------------------ #
    # Step 4b: Drop is_archived / archived_at from categories.            #
    # Drop the composite index that references is_archived first.         #
    # ------------------------------------------------------------------ #
    op.drop_index("ix_categories_user_id_is_archived", table_name="categories")
    op.drop_column("categories", "is_archived")
    op.drop_column("categories", "archived_at")


def downgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------ #
    # Reverse Step 4: re-add archive columns (nullable, all false/null).  #
    # ------------------------------------------------------------------ #
    op.add_column(
        "categories",
        sa.Column("is_archived", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )
    op.add_column(
        "categories",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_categories_user_id_is_archived",
        "categories",
        ["user_id", "is_archived"],
    )

    # ------------------------------------------------------------------ #
    # Reverse Step 3: re-add string columns, best-effort back-fill from   #
    # FK joins, then drop the FK columns.                                 #
    # Note: if categories/merchants were renamed since migration, the      #
    # old string values cannot be recovered — the new names are written.  #
    # ------------------------------------------------------------------ #
    op.add_column(
        "memorized_transactions",
        sa.Column("category", sa.String(64), nullable=True),
    )
    op.add_column(
        "memorized_transactions",
        sa.Column("merchant", sa.String(128), nullable=True),
    )
    conn.execute(sa.text("""
        UPDATE memorized_transactions mt
        SET    category = (
                   SELECT c.name FROM categories c WHERE c.id = mt.category_id
               )
        WHERE  mt.category_id IS NOT NULL
    """))
    conn.execute(sa.text("""
        UPDATE memorized_transactions mt
        SET    merchant = (
                   SELECT m.name FROM merchants m WHERE m.id = mt.merchant_id
               )
        WHERE  mt.merchant_id IS NOT NULL
    """))

    op.drop_index("ix_memorized_transactions_merchant_id", table_name="memorized_transactions")
    op.drop_index("ix_memorized_transactions_category_id", table_name="memorized_transactions")
    op.drop_column("memorized_transactions", "merchant_id")
    op.drop_column("memorized_transactions", "category_id")

    # ------------------------------------------------------------------ #
    # Reverse Step 2: re-allow NULL on merchants.user_id.                 #
    # ------------------------------------------------------------------ #
    op.alter_column("merchants", "user_id", nullable=True)

    # ------------------------------------------------------------------ #
    # Reverse Step 1: re-allow NULL on categories.user_id, drop is_system.#
    # The Uncategorized rows created during upgrade and the system flag   #
    # are left in place — downgrade does not attempt to remove them.      #
    # ------------------------------------------------------------------ #
    op.alter_column("categories", "user_id", nullable=True)
    op.drop_column("categories", "is_system")
