"""
Tests for memorized-transaction management endpoints:
  GET  /api/memorized-transactions         (list + pagination + ordering)
  POST /api/memorized-transactions/<id>/pin
  POST /api/memorized-transactions/bulk-delete

Covers pin/unpin state, list ordering (pinned first), bulk-delete with
cross-user isolation, and validation errors.
"""

import unittest

from preflight_base import PreflightApiTestBase


class MemorizedPinTests(PreflightApiTestBase):
    def _seed(self, client, name: str, category: str | None = None) -> dict:
        res = self._post(client, "/api/memorized-transactions", json={
            "canonical": name,
            "category": category,
        })
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return (res.get_json() or {}).get("item", {})

    def _setup_user(self, email: str):
        uid = self._create_user(email, "Password123!")
        client = self.app.test_client()
        self._login(client, email, "Password123!")
        return uid, client

    # --- pin/unpin ---

    def test_pin_sets_is_pinned_and_pinned_at(self):
        _, client = self._setup_user("pin1@example.com")
        item = self._seed(client, "KFC", "Dining")
        mem_id = item["id"]

        res = self._post(client, f"/api/memorized-transactions/{mem_id}/pin", json={"pinned": True})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        data = (res.get_json() or {}).get("item", {})
        self.assertTrue(data["is_pinned"])
        self.assertIsNotNone(data["pinned_at"])

    def test_unpin_clears_is_pinned_and_pinned_at(self):
        _, client = self._setup_user("pin2@example.com")
        item = self._seed(client, "KFC", "Dining")
        mem_id = item["id"]

        self._post(client, f"/api/memorized-transactions/{mem_id}/pin", json={"pinned": True})
        res = self._post(client, f"/api/memorized-transactions/{mem_id}/pin", json={"pinned": False})
        self.assertEqual(res.status_code, 200)
        data = (res.get_json() or {}).get("item", {})
        self.assertFalse(data["is_pinned"])
        self.assertIsNone(data["pinned_at"])

    def test_pin_defaults_to_true(self):
        _, client = self._setup_user("pin3@example.com")
        item = self._seed(client, "KFC", "Dining")
        mem_id = item["id"]
        res = self._post(client, f"/api/memorized-transactions/{mem_id}/pin", json={})
        self.assertEqual(res.status_code, 200)
        self.assertTrue((res.get_json() or {}).get("item", {})["is_pinned"])

    def test_pin_cross_user_isolation(self):
        _, client_a = self._setup_user("pin_iso_a@example.com")
        _, client_b = self._setup_user("pin_iso_b@example.com")
        item_a = self._seed(client_a, "KFC", "Dining")
        mem_id = item_a["id"]
        res = self._post(client_b, f"/api/memorized-transactions/{mem_id}/pin", json={"pinned": True})
        self.assertEqual(res.status_code, 404)

    def test_pin_not_found(self):
        _, client = self._setup_user("pin404@example.com")
        res = self._post(client, "/api/memorized-transactions/99999/pin", json={"pinned": True})
        self.assertEqual(res.status_code, 404)

    # --- list ordering (pinned first) ---

    def test_pinned_items_appear_first_in_list(self):
        _, client = self._setup_user("listorder@example.com")
        unpinned = self._seed(client, "McDonald's", "Dining")
        pinned = self._seed(client, "KFC", "Dining")
        self._post(client, f"/api/memorized-transactions/{pinned['id']}/pin", json={"pinned": True})

        res = client.get("/api/memorized-transactions?include_singletons=true&limit=10")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items", [])
        self.assertGreaterEqual(len(items), 2)
        # Pinned item must be first
        self.assertEqual(items[0]["id"], pinned["id"])
        self.assertTrue(items[0]["is_pinned"])

    def test_list_includes_is_pinned_field(self):
        _, client = self._setup_user("listfield@example.com")
        self._seed(client, "KFC", "Dining")
        res = client.get("/api/memorized-transactions?include_singletons=true&limit=10")
        self.assertEqual(res.status_code, 200)
        items = (res.get_json() or {}).get("items", [])
        self.assertGreater(len(items), 0)
        self.assertIn("is_pinned", items[0])
        self.assertIn("pinned_at", items[0])


class MemorizedBulkDeleteTests(PreflightApiTestBase):
    def _seed(self, client, name: str) -> dict:
        res = self._post(client, "/api/memorized-transactions", json={"canonical": name})
        self.assertEqual(res.status_code, 201)
        return (res.get_json() or {}).get("item", {})

    def _setup_user(self, email: str):
        uid = self._create_user(email, "Password123!")
        client = self.app.test_client()
        self._login(client, email, "Password123!")
        return uid, client

    def test_bulk_delete_removes_requested_ids(self):
        _, client = self._setup_user("bulk1@example.com")
        a = self._seed(client, "KFC")
        b = self._seed(client, "McDonald's")
        c = self._seed(client, "Burger King")

        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={"ids": [a["id"], b["id"]]})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual((res.get_json() or {}).get("deleted"), 2)

        list_res = client.get("/api/memorized-transactions?include_singletons=true&limit=10")
        ids_remaining = [i["id"] for i in (list_res.get_json() or {}).get("items", [])]
        self.assertNotIn(a["id"], ids_remaining)
        self.assertNotIn(b["id"], ids_remaining)
        self.assertIn(c["id"], ids_remaining)

    def test_bulk_delete_cross_user_isolation(self):
        _, client_a = self._setup_user("bulk_iso_a@example.com")
        _, client_b = self._setup_user("bulk_iso_b@example.com")
        item_a = self._seed(client_a, "KFC")

        res = self._post(client_b, "/api/memorized-transactions/bulk-delete", json={"ids": [item_a["id"]]})
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.get_json() or {}).get("deleted"), 0, "B must not delete A's entries")

    def test_bulk_delete_empty_ids_rejected(self):
        _, client = self._setup_user("bulk_empty@example.com")
        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={"ids": []})
        self.assertEqual(res.status_code, 400)

    def test_bulk_delete_missing_ids_rejected(self):
        _, client = self._setup_user("bulk_missing@example.com")
        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={})
        self.assertEqual(res.status_code, 400)

    def test_bulk_delete_over_limit_rejected(self):
        _, client = self._setup_user("bulk_over@example.com")
        ids = list(range(1, 202))
        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={"ids": ids})
        self.assertEqual(res.status_code, 400)

    def test_bulk_delete_invalid_id_type_rejected(self):
        _, client = self._setup_user("bulk_type@example.com")
        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={"ids": ["not-an-int"]})
        self.assertEqual(res.status_code, 400)

    def test_bulk_delete_requires_auth(self):
        client = self.app.test_client()
        res = self._post(client, "/api/memorized-transactions/bulk-delete", json={"ids": [1, 2]})
        self.assertIn(res.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
