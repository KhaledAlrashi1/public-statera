"""
Tests for learn_transaction() category handling and suggestion API response shape.

Covers:
- Uncategorized is not locked in; a real category learned later overwrites it
- null category in the memorized row propagates to the suggestions API as null (not "Uncategorized")
- Real category propagates correctly through the suggestions API response
- Cross-user isolation: user A's suggestions not visible to user B
"""

import unittest

from preflight_base import PreflightApiTestBase


class LearnTransactionCategoryTests(PreflightApiTestBase):
    """Unit-style tests against learn_transaction() logic via the DB directly."""

    def _learn(self, name: str, user_id: int, category: str | None = None, merchant: str | None = None) -> None:
        from backend.lib.suggestions import learn_transaction
        with self.app.app_context():
            learn_transaction(name, user_id, category=category, merchant=merchant)
            self.db.session.commit()

    def _suggest(self, q: str, user_id: int) -> list[dict]:
        from backend.lib.suggestions import suggest_transactions
        with self.app.app_context():
            return suggest_transactions(q, user_id, limit=10)

    def test_real_category_stored_when_first_seen(self):
        uid = self._create_user("cat_first@example.com", "Password123!")
        self._learn("KFC", uid, category="Dining")
        results = self._suggest("KFC", uid)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["category"], "Dining")

    def test_uncat_not_stored_as_category(self):
        uid = self._create_user("uncat_store@example.com", "Password123!")
        self._learn("KFC", uid, category="Uncategorized")
        results = self._suggest("KFC", uid)
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0]["category"])

    def test_real_category_overwrites_uncat(self):
        """If first save had Uncategorized, a later real category should replace it."""
        uid = self._create_user("overwrite_uncat@example.com", "Password123!")
        self._learn("KFC", uid, category="Uncategorized")
        self._learn("KFC", uid, category="Dining")
        results = self._suggest("KFC", uid)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["category"], "Dining")

    def test_real_category_not_overwritten_by_uncat(self):
        """Once a real category is stored, Uncategorized on a subsequent call must not replace it."""
        uid = self._create_user("keep_real_cat@example.com", "Password123!")
        self._learn("KFC", uid, category="Dining")
        self._learn("KFC", uid, category="Uncategorized")
        results = self._suggest("KFC", uid)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["category"], "Dining")

    def test_null_category_suggestion_does_not_break(self):
        """A memorized row with no category must return null, not crash."""
        uid = self._create_user("null_cat@example.com", "Password123!")
        self._learn("KFC", uid, category=None)
        results = self._suggest("KFC", uid)
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0]["category"])


class SuggestionApiCategoryTests(PreflightApiTestBase):
    """Integration tests against the /api/transaction-suggestions HTTP endpoint."""

    def _login_and_learn(self, email: str, name: str, category: str | None) -> tuple:
        uid = self._create_user(email, "Password123!")
        from backend.lib.suggestions import learn_transaction
        with self.app.app_context():
            learn_transaction(name, uid, category=category)
            self.db.session.commit()
        client = self.app.test_client()
        self._login(client, email, "Password123!")
        return uid, client

    def test_api_returns_real_category_in_suggestion(self):
        _, client = self._login_and_learn("api_cat@example.com", "KFC", "Dining")
        res = client.get("/api/transaction-suggestions?q=KFC&limit=5")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category"], "Dining")

    def test_api_returns_null_category_when_unset(self):
        _, client = self._login_and_learn("api_null_cat@example.com", "KFC", None)
        res = client.get("/api/transaction-suggestions?q=KFC&limit=5")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items", [])
        self.assertEqual(len(items), 1)
        self.assertIsNone(items[0]["category"])

    def test_api_category_isolation_across_users(self):
        """User A's memorized entry must not appear in User B's suggestions."""
        uid_a = self._create_user("iso_a@example.com", "Password123!")
        uid_b = self._create_user("iso_b@example.com", "Password123!")
        from backend.lib.suggestions import learn_transaction
        with self.app.app_context():
            learn_transaction("KFC", uid_a, category="Dining")
            self.db.session.commit()
        client_b = self.app.test_client()
        self._login(client_b, "iso_b@example.com", "Password123!")
        res = client_b.get("/api/transaction-suggestions?q=KFC&limit=5")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items", [])
        self.assertEqual(items, [], "User B must not see User A's memorized entries")


if __name__ == "__main__":
    unittest.main()
