"""
Tests for POST /api/admin/memorized/rebuild-from-transactions (Section 3 — prune fix plan).

Five required tests:
  1. seed + rebuild: transactions are replayed and memorized rows are created
  2. cross-user isolation: rebuilding user A does not affect user B's memorized table
  3. no-auth: 401 without operator token
  4. nonexistent user_id: 404 when user_id does not exist in the DB
  5. idempotency: running rebuild twice produces the same number of memorized rows
"""

import unittest
from datetime import date

from preflight_base import PreflightApiTestBase


_OPERATOR_TOKEN = "operator-token-rebuild-test-0123456789"


class RebuildMemorizedApiTests(PreflightApiTestBase):
    def _operator_headers(self) -> dict[str, str]:
        self.app.config["OPERATOR_API_TOKEN"] = _OPERATOR_TOKEN
        return {"Authorization": f"Bearer {_OPERATOR_TOKEN}"}

    def _seed_transaction(self, user_id: int, name: str, category_name: str = "Dining") -> None:
        with self.app.app_context():
            cat = self.Category.query.filter_by(name=category_name, user_id=user_id).first()
            if cat is None:
                cat = self.Category(name=category_name, user_id=user_id)
                self.db.session.add(cat)
                self.db.session.flush()

            txn = self.Transaction(
                user_id=user_id,
                date=date(2024, 1, 1),
                name=name,
                name_key=name.lower(),
                amount_kd="5.000",
                category_id=cat.id,
            )
            self.db.session.add(txn)
            self.db.session.commit()

    def _memorized_count(self, user_id: int) -> int:
        with self.app.app_context():
            return self.MemorizedTransaction.query.filter_by(user_id=user_id).count()

    def _post_rebuild(self, client, user_id, headers=None):
        return client.post(
            "/api/admin/memorized/rebuild-from-transactions",
            json={"user_id": user_id},
            headers=headers or {},
        )

    # ------------------------------------------------------------------
    # Test 1: seed + rebuild — transactions are replayed into memorized rows
    # ------------------------------------------------------------------
    def test_rebuild_creates_memorized_rows_from_transactions(self):
        uid = self._create_user("rebuild_t1@example.com", "Password123!")
        self._seed_transaction(uid, "KFC")
        self._seed_transaction(uid, "Starbucks")

        client = self.app.test_client()
        headers = self._operator_headers()
        res = self._post_rebuild(client, uid, headers=headers)

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("user_id"), uid)
        self.assertEqual(payload.get("transactions_processed"), 2)

        # Memorized rows should now exist for the two transaction names
        self.assertEqual(self._memorized_count(uid), 2)

    # ------------------------------------------------------------------
    # Test 2: cross-user isolation — rebuilding user A does not touch user B
    # ------------------------------------------------------------------
    def test_rebuild_does_not_affect_other_users(self):
        uid_a = self._create_user("rebuild_iso_a@example.com", "Password123!")
        uid_b = self._create_user("rebuild_iso_b@example.com", "Password123!")

        self._seed_transaction(uid_a, "Coffee A")
        self._seed_transaction(uid_b, "Coffee B")

        client = self.app.test_client()
        headers = self._operator_headers()

        # Rebuild only user A
        res = self._post_rebuild(client, uid_a, headers=headers)
        self.assertEqual(res.status_code, 200)

        # User A should have a memorized row; user B should have none
        self.assertEqual(self._memorized_count(uid_a), 1)
        self.assertEqual(self._memorized_count(uid_b), 0)

    # ------------------------------------------------------------------
    # Test 3: no-auth — 401 without operator token
    # ------------------------------------------------------------------
    def test_rebuild_requires_operator_token(self):
        self.app.config["OPERATOR_API_TOKEN"] = _OPERATOR_TOKEN
        uid = self._create_user("rebuild_noauth@example.com", "Password123!")
        client = self.app.test_client()
        res = self._post_rebuild(client, uid)
        self.assertEqual(res.status_code, 401, res.get_data(as_text=True))

    # ------------------------------------------------------------------
    # Test 4: nonexistent user_id — 404
    # ------------------------------------------------------------------
    def test_rebuild_returns_404_for_nonexistent_user(self):
        client = self.app.test_client()
        headers = self._operator_headers()
        res = self._post_rebuild(client, 999999, headers=headers)
        self.assertEqual(res.status_code, 404, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "user_not_found")

    # ------------------------------------------------------------------
    # Test 5: idempotency — running rebuild twice yields the same row count
    # ------------------------------------------------------------------
    def test_rebuild_is_idempotent_row_count(self):
        uid = self._create_user("rebuild_idem@example.com", "Password123!")
        self._seed_transaction(uid, "Gym")
        self._seed_transaction(uid, "Gym")  # same name → same norm → one memorized row

        client = self.app.test_client()
        headers = self._operator_headers()

        self._post_rebuild(client, uid, headers=headers)
        count_after_first = self._memorized_count(uid)

        self._post_rebuild(client, uid, headers=headers)
        count_after_second = self._memorized_count(uid)

        self.assertEqual(
            count_after_first,
            count_after_second,
            "Rebuild must not create duplicate memorized rows on repeated calls.",
        )


if __name__ == "__main__":
    unittest.main()
