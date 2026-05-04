from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class CacheResilienceTests(PreflightApiTestBase):
    def test_dashboard_returns_data_when_redis_down(self):
        self._create_user("cache-resilience@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "cache-resilience@example.com", "Password123!")

        created = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": "2026-03-01",
                "name": "Cache Down Txn",
                "category": "Food",
                "amount_kd": "50.000",
            },
        )
        self.assertEqual(created.status_code, 201, created.get_data(as_text=True))

        with patch("backend.lib.cache._get_redis", side_effect=RuntimeError("redis unavailable")):
            resp = client.get("/api/dashboard-metrics?months=1&until=2026-03")

        self.assertEqual(resp.status_code, 200, resp.get_data(as_text=True))
        payload = resp.get_json() or {}
        self.assertTrue(payload.get("ok"))
