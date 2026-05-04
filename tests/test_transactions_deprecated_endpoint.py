import unittest

from preflight_base import PreflightApiTestBase


class DeprecatedTransactionsEndpointTests(PreflightApiTestBase):
    def test_deprecated_unpaginated_transactions_route_is_removed(self):
        self._create_user("tx-legacy-route@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "tx-legacy-route@example.com", "Password123!")

        res = client.get("/api/transactions")
        self.assertEqual(res.status_code, 404, res.get_data(as_text=True))

        res_expand = client.get("/api/transactions?expand_items=true")
        self.assertEqual(res_expand.status_code, 404, res_expand.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
