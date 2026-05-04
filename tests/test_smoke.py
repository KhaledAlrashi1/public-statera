"""Smoke test — proves the stack handles the core user journey."""

import unittest

from preflight_base import PreflightApiTestBase


class SmokeTest(PreflightApiTestBase):
    def test_health_probes_unauthenticated(self):
        client = self.app.test_client()
        self.assertEqual(client.get("/healthz").status_code, 200)
        self.assertEqual(client.get("/readyz").status_code, 200)

    def test_protected_route_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/transactions/search")
        self.assertEqual(res.status_code, 401)

    def test_register_login_crud_export_logout(self):
        client = self.app.test_client()
        self._create_user("smoke@example.com", "SmokePass123!")
        self._login(client, "smoke@example.com", "SmokePass123!")

        # Create
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-02-01",
                "name": "Smoke Txn",
                "category": "Groceries",
                "amount_kd": "5.500",
            },
        )
        self.assertEqual(res.status_code, 201)
        txn_id = (res.get_json() or {}).get("item", {}).get("id")
        self.assertIsNotNone(txn_id)

        # Search
        res = client.get("/api/transactions/search?q=Smoke")
        self.assertEqual(res.status_code, 200)
        items = ((res.get_json() or {}).get("data") or {}).get("items", [])
        self.assertTrue(any(t["name"] == "Smoke Txn" for t in items))

        # Export CSV
        res = client.get("/api/transactions/export-csv")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.content_type)

        # Logout
        res = self._post(client, "/api/auth/logout", json={})
        self.assertEqual(res.status_code, 200)

        # Protected route blocked after logout
        res2 = client.get("/api/transactions/search")
        self.assertEqual(res2.status_code, 401)


if __name__ == "__main__":
    unittest.main()
