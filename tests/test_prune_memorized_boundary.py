"""
Boundary tests for prune_all_stale_memorized_transactions() — Section 2 acceptance gate.

Each test maps to one row of the spec boundary table. All seven rows must pass.
An additional cross-user isolation test verifies that a pinned row for user A
is not deleted while user B's stale unpinned row is correctly deleted.

Spec (from docs/bugfixes/memorized-not-showing.md):
  Delete rows where ALL of the following hold:
    is_pinned = FALSE
    count <= 2
    last_seen < (now - 90 days)

The previous unconditional last_seen < 180-day clause has been removed.
"""

import unittest
from datetime import datetime, timedelta, timezone

from preflight_base import PreflightApiTestBase


def _days_ago(n: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


class PruneAllBoundaryTests(PreflightApiTestBase):
    """Each test verifies one cell in the spec boundary table."""

    def _seed(
        self,
        user_id: int,
        *,
        canonical: str,
        count: int,
        last_seen: datetime,
        is_pinned: bool = False,
    ):
        from backend.lib.suggestions import _txn_norm
        norm = _txn_norm(canonical)
        row = self.MemorizedTransaction(
            canonical=canonical,
            norm=norm,
            category=None,
            merchant=None,
            count=count,
            last_seen=last_seen,
            user_id=user_id,
            is_pinned=is_pinned,
            pinned_at=datetime.now(timezone.utc) if is_pinned else None,
        )
        self.db.session.add(row)
        self.db.session.commit()
        return row.id

    def _count_for_user(self, user_id: int) -> int:
        with self.app.app_context():
            return self.MemorizedTransaction.query.filter_by(user_id=user_id).count()

    def _run_prune(self, now: datetime | None = None) -> int:
        from backend.lib.suggestions import prune_all_stale_memorized_transactions
        with self.app.app_context():
            return prune_all_stale_memorized_transactions(now=now)

    # ------------------------------------------------------------------
    # Row 1: Stale unpinned singleton — must be deleted
    # is_pinned=FALSE, count=1, last_seen=91 days ago → DELETE
    # ------------------------------------------------------------------
    def test_stale_unpinned_singleton_is_deleted(self):
        uid = self._create_user("prune_b1@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Coffee", count=1, last_seen=_days_ago(91))
        self.assertEqual(self._count_for_user(uid), 1)
        deleted = self._run_prune()
        self.assertGreaterEqual(deleted, 1)
        self.assertEqual(self._count_for_user(uid), 0)

    # ------------------------------------------------------------------
    # Row 2: Stale unpinned double — must be deleted
    # is_pinned=FALSE, count=2, last_seen=91 days ago → DELETE
    # ------------------------------------------------------------------
    def test_stale_unpinned_double_is_deleted(self):
        uid = self._create_user("prune_b2@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Tea", count=2, last_seen=_days_ago(91))
        deleted = self._run_prune()
        self.assertGreaterEqual(deleted, 1)
        self.assertEqual(self._count_for_user(uid), 0)

    # ------------------------------------------------------------------
    # Row 3: Stale unpinned triple — must be KEPT
    # is_pinned=FALSE, count=3, last_seen=91 days ago → KEEP
    # ------------------------------------------------------------------
    def test_stale_unpinned_triple_is_kept(self):
        uid = self._create_user("prune_b3@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Lunch", count=3, last_seen=_days_ago(91))
        self._run_prune()
        self.assertEqual(self._count_for_user(uid), 1)

    # ------------------------------------------------------------------
    # Row 4: Fresh unpinned singleton — must be KEPT
    # is_pinned=FALSE, count=1, last_seen=89 days ago → KEEP
    # ------------------------------------------------------------------
    def test_fresh_unpinned_singleton_is_kept(self):
        uid = self._create_user("prune_b4@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Dinner", count=1, last_seen=_days_ago(89))
        self._run_prune()
        self.assertEqual(self._count_for_user(uid), 1)

    # ------------------------------------------------------------------
    # Row 5: Stale pinned singleton — must be KEPT
    # is_pinned=TRUE, count=1, last_seen=91 days ago → KEEP
    # ------------------------------------------------------------------
    def test_stale_pinned_singleton_is_kept(self):
        uid = self._create_user("prune_b5@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Gym", count=1, last_seen=_days_ago(91), is_pinned=True)
        self._run_prune()
        self.assertEqual(self._count_for_user(uid), 1)

    # ------------------------------------------------------------------
    # Row 6: Stale pinned with very old last_seen — must be KEPT
    # is_pinned=TRUE, count=1, last_seen=365 days ago → KEEP
    # (this was the scenario that the old 180-day clause wrongly deleted)
    # ------------------------------------------------------------------
    def test_stale_pinned_very_old_is_kept(self):
        uid = self._create_user("prune_b6@example.com", "Password123!")
        with self.app.app_context():
            self._seed(uid, canonical="Rent", count=1, last_seen=_days_ago(365), is_pinned=True)
        self._run_prune()
        self.assertEqual(self._count_for_user(uid), 1)

    # ------------------------------------------------------------------
    # Row 7: Boundary — exactly 90 days ago — must be KEPT (strict less-than)
    # is_pinned=FALSE, count=1, last_seen=exactly 90 days ago → KEEP
    # ------------------------------------------------------------------
    def test_boundary_exactly_90_days_is_kept(self):
        uid = self._create_user("prune_b7@example.com", "Password123!")
        now = datetime.now(timezone.utc)
        cutoff_exact = now - timedelta(days=90)
        with self.app.app_context():
            self._seed(uid, canonical="Fuel", count=1, last_seen=cutoff_exact)
        self._run_prune(now=now)
        self.assertEqual(self._count_for_user(uid), 1)


class PruneCrossUserIsolationTest(PreflightApiTestBase):
    """
    Seed data for two users.
    User A has a pinned stale row (must survive) and an unpinned stale singleton (must go).
    User B has an unpinned stale singleton (must go) and a fresh row (must survive).
    Run the global prune once.
    Assert the correct rows are present for each user.
    """

    def test_cross_user_prune_isolation(self):
        uid_a = self._create_user("prune_iso_a@example.com", "Password123!")
        uid_b = self._create_user("prune_iso_b@example.com", "Password123!")

        from backend.lib.suggestions import _txn_norm, prune_all_stale_memorized_transactions

        with self.app.app_context():
            # User A — pinned stale (keep) + unpinned stale singleton (delete)
            pinned_row = self.MemorizedTransaction(
                canonical="A-Pinned", norm=_txn_norm("A-Pinned"),
                count=1, last_seen=_days_ago(200),
                user_id=uid_a, is_pinned=True, pinned_at=datetime.now(timezone.utc),
            )
            stale_row_a = self.MemorizedTransaction(
                canonical="A-Stale", norm=_txn_norm("A-Stale"),
                count=1, last_seen=_days_ago(91),
                user_id=uid_a, is_pinned=False,
            )
            # User B — stale singleton (delete) + fresh (keep)
            stale_row_b = self.MemorizedTransaction(
                canonical="B-Stale", norm=_txn_norm("B-Stale"),
                count=2, last_seen=_days_ago(91),
                user_id=uid_b, is_pinned=False,
            )
            fresh_row_b = self.MemorizedTransaction(
                canonical="B-Fresh", norm=_txn_norm("B-Fresh"),
                count=1, last_seen=_days_ago(5),
                user_id=uid_b, is_pinned=False,
            )
            self.db.session.add_all([pinned_row, stale_row_a, stale_row_b, fresh_row_b])
            self.db.session.commit()

            deleted = prune_all_stale_memorized_transactions()

        self.assertEqual(deleted, 2, f"Expected 2 rows deleted, got {deleted}")

        with self.app.app_context():
            remaining_a = [
                r.canonical for r in
                self.MemorizedTransaction.query.filter_by(user_id=uid_a).all()
            ]
            remaining_b = [
                r.canonical for r in
                self.MemorizedTransaction.query.filter_by(user_id=uid_b).all()
            ]

        self.assertIn("A-Pinned", remaining_a, "Pinned row for user A must survive")
        self.assertNotIn("A-Stale", remaining_a, "Stale unpinned row for user A must be deleted")

        self.assertNotIn("B-Stale", remaining_b, "Stale unpinned row for user B must be deleted")
        self.assertIn("B-Fresh", remaining_b, "Fresh row for user B must survive")


if __name__ == "__main__":
    unittest.main()
