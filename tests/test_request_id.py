import unittest

from preflight_base import PreflightApiTestBase


class RequestIdTests(PreflightApiTestBase):
    def test_authenticated_api_response_has_generated_request_id(self):
        self._create_user("rid-auth@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "rid-auth@example.com", "Password123!")

        res = client.get("/api/transactions/search?limit=10&offset=0&include_total=false")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        request_id = self._get_request_id(res)
        self.assertRegex(request_id, r"^[0-9a-f]{16}$")

    def test_sequential_requests_receive_distinct_request_ids(self):
        self._create_user("rid-unique@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "rid-unique@example.com", "Password123!")

        first = client.get("/api/transactions/search?limit=10&offset=0&include_total=false")
        second = client.get("/api/transactions/search?limit=10&offset=0&include_total=false")
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))
        self.assertEqual(second.status_code, 200, second.get_data(as_text=True))

        first_id = self._get_request_id(first)
        second_id = self._get_request_id(second)
        self.assertRegex(first_id, r"^[0-9a-f]{16}$")
        self.assertRegex(second_id, r"^[0-9a-f]{16}$")
        self.assertNotEqual(first_id, second_id)

    def test_client_supplied_request_id_is_echoed(self):
        self._create_user("rid-client@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "rid-client@example.com", "Password123!")

        custom_request_id = "client-request-id-123"
        res = client.get(
            "/api/transactions/search?limit=10&offset=0&include_total=false",
            headers={"X-Request-ID": custom_request_id},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(self._get_request_id(res), custom_request_id)


if __name__ == "__main__":
    unittest.main()
