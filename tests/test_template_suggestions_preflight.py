import tempfile
import unittest
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from preflight_base import PreflightApiTestBase


class TemplateSuggestionsPreflightTests(PreflightApiTestBase):
    def test_transaction_suggestions_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/transaction-suggestions?q=am&limit=5")
        self.assertEqual(res.status_code, 401)

    def test_messages_snapshot_cleanup(self):
        from backend.lib.messages import messages_db_snapshot

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "chat.db"
            conn = sqlite3.connect(src)
            try:
                conn.execute("CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, date INTEGER)")
                conn.execute("INSERT INTO message (date) VALUES (1)")
                conn.commit()
            finally:
                conn.close()

            with messages_db_snapshot(str(src)) as snap:
                snap_path = Path(snap)
                snap_dir = snap_path.parent
                self.assertTrue(snap_path.exists())
                self.assertTrue(snap_dir.exists())

            self.assertFalse(snap_dir.exists())

    def test_template_suggestions_disabled_returns_empty(self):
        self._create_user("temploff@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "temploff@example.com", "Password123!")
        res = client.get("/api/transaction-template-suggestions?q=am&limit=3")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("items"), [])

    def test_transactions_summary_endpoint(self):
        user_id = self._create_user("summary@example.com", "Password123!")
        with self.app.app_context():
            food = self.Category(user_id=user_id, name="Food")
            income = self.Category(user_id=user_id, name="Income: Salary")
            self.db.session.add(food)
            self.db.session.add(income)
            self.db.session.flush()
            self.db.session.add(
                self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 10).date(),
                    merchant_id=None,
                    category_id=food.id,
                    name="Lunch",
                    name_key="lunch",
                    amount_kd="3.000",
                )
            )
            self.db.session.add(
                self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 11).date(),
                    merchant_id=None,
                    category_id=income.id,
                    name="Salary",
                    name_key="salary",
                    amount_kd="1000.000",
                )
            )
            self.db.session.commit()

        client = self.app.test_client()
        self._login(client, "summary@example.com", "Password123!")
        res = client.get("/api/transactions/summary?month=2026-02")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("month"), "2026-02")
        self.assertEqual(payload.get("transaction_count"), 1)
        self.assertEqual(payload.get("income_count"), 1)

    def test_transaction_suggestions_are_user_scoped(self):
        user1_id = self._create_user("u1@example.com", "Password123!")
        user2_id = self._create_user("u2@example.com", "Password123!")

        with self.app.app_context():
            now = datetime.now(timezone.utc)
            self.db.session.add(
                self.MemorizedTransaction(
                    user_id=user1_id,
                    canonical="Americano",
                    norm=self.__class__._txn_norm_fn("Americano"),
                    category="Coffee",
                    merchant="Pick",
                    count=4,
                    last_seen=now,
                )
            )
            self.db.session.add(
                self.MemorizedTransaction(
                    user_id=user2_id,
                    canonical="Amazon Order",
                    norm=self.__class__._txn_norm_fn("Amazon Order"),
                    category="Shopping",
                    merchant="Amazon",
                    count=10,
                    last_seen=now,
                )
            )
            self.db.session.commit()

        client = self.app.test_client()
        self._login(client, "u1@example.com", "Password123!")
        res = client.get("/api/transaction-suggestions?q=am&limit=5")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        items = payload.get("items", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "Americano")
        self.assertEqual(items[0]["category"], "Coffee")
        self.assertEqual(items[0]["merchant"], "Pick")

    def test_legacy_descriptions_endpoint_returns_404(self):
        user_id = self._create_user("legacycheck@example.com", "Password123!")
        self.assertIsInstance(user_id, int)

        client = self.app.test_client()
        self._login(client, "legacycheck@example.com", "Password123!")
        res = client.get("/api/descriptions?q=am")
        self.assertEqual(res.status_code, 404)

    def test_auth_me_exposes_template_flag(self):
        self._create_user("flags@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "flags@example.com", "Password123!")

        res = client.get("/api/auth/me")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertIn("flags", payload)
        self.assertIn("template_suggestions", payload["flags"])
        self.assertFalse(payload["flags"]["template_suggestions"])
        self.assertIn("open_banking", payload["flags"])
        self.assertFalse(payload["flags"]["open_banking"])

    def test_template_flag_can_be_enabled(self):
        with self.app.app_context():
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = True
            self.assertTrue(self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"])
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = False

    def test_template_suggestions_enabled_returns_templates(self):
        self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = True
        try:
            user_id = self._create_user("templon@example.com", "Password123!")
            with self.app.app_context():
                cat = self.Category(user_id=user_id, name="Coffee")
                merchant = self.Merchant(user_id=user_id, name="Pick")
                self.db.session.add(cat)
                self.db.session.add(merchant)
                self.db.session.flush()

                txn = self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 18).date(),
                    merchant_id=merchant.id,
                    category_id=cat.id,
                    name="Americano",
                    name_key="americano",
                    amount_kd="1.000",
                )
                self.db.session.add(txn)
                self.db.session.commit()

            client = self.app.test_client()
            self._login(client, "templon@example.com", "Password123!")
            res = client.get("/api/transaction-template-suggestions?q=am&limit=3")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            payload = res.get_json()
            self.assertTrue(payload.get("ok"))
            items = payload.get("items", [])
            self.assertGreaterEqual(len(items), 1)
            self.assertEqual(items[0]["merchant"], "Pick")
            self.assertEqual(items[0]["items"][0]["name"], "Americano")
            self.assertEqual(items[0]["items"][0]["category"], "Coffee")
        finally:
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = False

    def test_template_suggestion_feedback_endpoint_tracks_accept_and_reject(self):
        self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = True
        try:
            user_id = self._create_user("templfeedback@example.com", "Password123!")
            with self.app.app_context():
                cat = self.Category(user_id=user_id, name="Coffee")
                merchant = self.Merchant(user_id=user_id, name="Cafe 1")
                self.db.session.add(cat)
                self.db.session.add(merchant)
                self.db.session.flush()

                txn = self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 10).date(),
                    merchant_id=merchant.id,
                    category_id=cat.id,
                    name="Americano",
                    name_key="americano",
                    amount_kd="1.250",
                )
                self.db.session.add(txn)
                self.db.session.commit()

            client = self.app.test_client()
            self._login(client, "templfeedback@example.com", "Password123!")
            suggestions = client.get("/api/transaction-template-suggestions?q=amer&limit=3")
            self.assertEqual(suggestions.status_code, 200, suggestions.get_data(as_text=True))
            suggestion_items = (suggestions.get_json() or {}).get("items") or []
            self.assertGreaterEqual(len(suggestion_items), 1)
            feedback_key = suggestion_items[0].get("feedback_key")
            self.assertIsInstance(feedback_key, str)
            self.assertEqual(len(feedback_key), 64)

            accepted = self._post(
                client,
                "/api/transaction-template-suggestions/feedback",
                json={
                    "feedback_key": feedback_key,
                    "outcome": "accepted",
                    "query": "amer",
                    "source": "test",
                },
            )
            self.assertEqual(accepted.status_code, 200, accepted.get_data(as_text=True))
            accepted_feedback = ((accepted.get_json() or {}).get("data") or {}).get("feedback") or {}
            self.assertEqual(accepted_feedback.get("accepted_count"), 1)
            self.assertEqual(accepted_feedback.get("rejected_count"), 0)

            rejected = self._post(
                client,
                "/api/transaction-template-suggestions/feedback",
                json={
                    "feedback_key": feedback_key,
                    "outcome": "rejected",
                    "query": "amer",
                    "source": "test",
                },
            )
            self.assertEqual(rejected.status_code, 200, rejected.get_data(as_text=True))
            rejected_feedback = ((rejected.get_json() or {}).get("data") or {}).get("feedback") or {}
            self.assertEqual(rejected_feedback.get("accepted_count"), 1)
            self.assertEqual(rejected_feedback.get("rejected_count"), 1)
        finally:
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = False

    def test_template_feedback_updates_template_ranking(self):
        self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = True
        try:
            user_id = self._create_user("templranking@example.com", "Password123!")
            with self.app.app_context():
                cat = self.Category(user_id=user_id, name="Coffee")
                merchant_a = self.Merchant(user_id=user_id, name="Cafe A")
                merchant_b = self.Merchant(user_id=user_id, name="Cafe B")
                self.db.session.add_all([cat, merchant_a, merchant_b])
                self.db.session.flush()

                txn_a = self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 5).date(),
                    merchant_id=merchant_a.id,
                    category_id=cat.id,
                    name="Americano A",
                    name_key="americano a",
                    amount_kd="1.100",
                )
                txn_b = self.Transaction(
                    user_id=user_id,
                    date=datetime(2026, 2, 15).date(),
                    merchant_id=merchant_b.id,
                    category_id=cat.id,
                    name="Americano B",
                    name_key="americano b",
                    amount_kd="1.200",
                )
                self.db.session.add_all([txn_a, txn_b])
                self.db.session.commit()

            client = self.app.test_client()
            self._login(client, "templranking@example.com", "Password123!")

            initial = client.get("/api/transaction-template-suggestions?q=amer&limit=3")
            self.assertEqual(initial.status_code, 200, initial.get_data(as_text=True))
            initial_items = (initial.get_json() or {}).get("items") or []
            self.assertGreaterEqual(len(initial_items), 2)

            first_key = initial_items[0].get("feedback_key")
            second_key = initial_items[1].get("feedback_key")
            self.assertIsInstance(first_key, str)
            self.assertIsInstance(second_key, str)
            self.assertNotEqual(first_key, second_key)

            for _ in range(3):
                accepted = self._post(
                    client,
                    "/api/transaction-template-suggestions/feedback",
                    json={"feedback_key": second_key, "outcome": "accepted", "query": "amer", "source": "test"},
                )
                self.assertEqual(accepted.status_code, 200, accepted.get_data(as_text=True))
                rejected = self._post(
                    client,
                    "/api/transaction-template-suggestions/feedback",
                    json={"feedback_key": first_key, "outcome": "rejected", "query": "amer", "source": "test"},
                )
                self.assertEqual(rejected.status_code, 200, rejected.get_data(as_text=True))

            reranked = client.get("/api/transaction-template-suggestions?q=amer&limit=3")
            self.assertEqual(reranked.status_code, 200, reranked.get_data(as_text=True))
            reranked_items = (reranked.get_json() or {}).get("items") or []

            index_by_key = {
                item.get("feedback_key"): idx
                for idx, item in enumerate(reranked_items)
            }
            self.assertIn(first_key, index_by_key)
            self.assertIn(second_key, index_by_key)
            self.assertLess(index_by_key[second_key], index_by_key[first_key])
        finally:
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = False


if __name__ == "__main__":
    unittest.main()
