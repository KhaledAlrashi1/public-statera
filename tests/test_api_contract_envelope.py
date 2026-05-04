import unittest

from preflight_base import PreflightApiTestBase


class ApiContractEnvelopeTests(PreflightApiTestBase):
    def _assert_ok_envelope(self, payload: dict):
        self.assertTrue(payload.get("ok"))
        self.assertIn("data", payload)
        self.assertIn("error", payload)
        self.assertIn("meta", payload)
        self.assertIsNone(payload.get("error"))
        self.assertIsInstance(payload.get("meta"), dict)

    def _create_transaction(self, client, *, date: str, category: str, name: str, amount_kd: str):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": date,
                "category": category,
                "name": name,
                "amount_kd": amount_kd,
                "items_json": [{"name": name, "category": category, "amount_kd": amount_kd}],
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        payload = res.get_json() or {}
        item = payload.get("item") or {}
        self.assertIsInstance(item.get("id"), int)

    def test_categories_get_returns_standard_envelope(self):
        self._create_user("env-categories@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-categories@example.com", "Password123!")

        res = client.get("/api/categories")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self._assert_ok_envelope(payload)

        data = payload.get("data") or {}
        self.assertIsInstance(data.get("items"), list)
        # Legacy compatibility field is still available.
        self.assertIsInstance(payload.get("items"), list)

    def test_merchants_create_returns_standard_envelope(self):
        self._create_user("env-merchants@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-merchants@example.com", "Password123!")

        res = self._post(client, "/api/merchants", json={"name": "Envelope Merchant"})
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self._assert_ok_envelope(payload)

        data_item = ((payload.get("data") or {}).get("item") or {})
        self.assertEqual(data_item.get("name"), "Envelope Merchant")
        self.assertEqual(((payload.get("item") or {}).get("name")), "Envelope Merchant")

    def test_transactions_search_returns_envelope_with_meta(self):
        self._create_user("env-search@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-search@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-10",
            category="Groceries",
            name="Envelope Search",
            amount_kd="3.500",
        )

        res = client.get("/api/transactions/search?q=Envelope&limit=10&offset=0&include_total=false")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertTrue(self._get_request_id(res))
        payload = res.get_json() or {}
        self._assert_ok_envelope(payload)

        data = payload.get("data") or {}
        meta = payload.get("meta") or {}
        self.assertIsInstance(data.get("items"), list)
        self.assertIn("has_more", meta)
        self.assertIn("total", meta)
        self.assertIn("offset", meta)
        self.assertIn("limit", meta)
        # Legacy compatibility fields are still available.
        self.assertIsInstance(payload.get("items"), list)
        self.assertIn("has_more", payload)

    def test_spend_by_month_returns_envelope_rows(self):
        self._create_user("env-analytics@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-analytics@example.com", "Password123!")

        self._create_transaction(
            client,
            date="2026-02-12",
            category="Food",
            name="Envelope Spend",
            amount_kd="2.250",
        )

        res = client.get("/api/spend-by-month")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self._assert_ok_envelope(payload)

        data = payload.get("data") or {}
        rows = data.get("items")
        self.assertIsInstance(rows, list)
        self.assertGreaterEqual(len(rows), 1)
        self.assertEqual((payload.get("meta") or {}).get("count"), len(rows))

    def test_validation_errors_use_standard_error_envelope(self):
        self._create_user("env-errors@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-errors@example.com", "Password123!")

        res = client.get("/api/transactions/search?limit=0")
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertIn("data", payload)
        self.assertIn("error", payload)
        self.assertIn("meta", payload)
        self.assertIsNone(payload.get("data"))
        self.assertIsInstance(payload.get("error"), str)
        self.assertIsInstance(payload.get("meta"), dict)

    def test_auth_and_framework_errors_use_standard_error_envelope(self):
        anon_client = self.app.test_client()

        unauthorized = anon_client.get("/api/categories")
        self.assertEqual(unauthorized.status_code, 401, unauthorized.get_data(as_text=True))
        unauthorized_payload = unauthorized.get_json() or {}
        self.assertFalse(unauthorized_payload.get("ok"))
        self.assertEqual(unauthorized_payload.get("error_code"), "auth_required")
        self.assertEqual(unauthorized_payload.get("code"), "auth_required")
        self.assertIsNone(unauthorized_payload.get("data"))

        not_found = anon_client.get("/api/not-a-real-endpoint")
        self.assertEqual(not_found.status_code, 404, not_found.get_data(as_text=True))
        not_found_payload = not_found.get_json() or {}
        self.assertFalse(not_found_payload.get("ok"))
        self.assertEqual(not_found_payload.get("error_code"), "not_found")
        self.assertEqual(not_found_payload.get("code"), "not_found")

        self._create_user("env-csrf@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-csrf@example.com", "Password123!")
        csrf = client.post("/api/categories", json={"name": "Missing CSRF"})
        self.assertEqual(csrf.status_code, 403, csrf.get_data(as_text=True))
        csrf_payload = csrf.get_json() or {}
        self.assertFalse(csrf_payload.get("ok"))
        self.assertEqual(csrf_payload.get("error_code"), "csrf_invalid")
        self.assertEqual(csrf_payload.get("code"), "csrf_invalid")

    def test_budgets_routes_return_standard_envelope(self):
        self._create_user("env-budgets@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-budgets@example.com", "Password123!")

        save = self._post(
            client,
            "/api/budgets",
            json={
                "month": "2026-02",
                "items": [{"category": "Groceries", "amount_kd": "120.000"}],
            },
        )
        self.assertEqual(save.status_code, 200, save.get_data(as_text=True))
        save_payload = save.get_json() or {}
        self._assert_ok_envelope(save_payload)

        save_data = save_payload.get("data") or {}
        self.assertEqual(save_data.get("month"), "2026-02")
        self.assertIsInstance(save_data.get("items"), list)
        self.assertIsInstance(save_data.get("profile_context"), dict)
        self.assertIsInstance(save_payload.get("items"), list)
        self.assertIsInstance(save_payload.get("profile_context"), dict)

        fetch = client.get("/api/budgets?month=2026-02")
        self.assertEqual(fetch.status_code, 200, fetch.get_data(as_text=True))
        fetch_payload = fetch.get_json() or {}
        self._assert_ok_envelope(fetch_payload)
        fetch_data = fetch_payload.get("data") or {}
        self.assertEqual(fetch_data.get("month"), "2026-02")
        self.assertIsInstance(fetch_data.get("items"), list)

    def test_memorized_routes_return_standard_envelope(self):
        self._create_user("env-memorized@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "env-memorized@example.com", "Password123!")

        created = self._post(
            client,
            "/api/memorized-transactions",
            json={
                "canonical": "Envelope Memorized",
                "category": "Groceries",
                "merchant": "Corner Shop",
            },
        )
        self.assertEqual(created.status_code, 201, created.get_data(as_text=True))
        create_payload = created.get_json() or {}
        self._assert_ok_envelope(create_payload)
        created_item = ((create_payload.get("data") or {}).get("item") or {})
        self.assertIsInstance(created_item.get("id"), int)
        self.assertEqual(created_item.get("canonical"), "Envelope Memorized")
        self.assertEqual(((create_payload.get("item") or {}).get("canonical")), "Envelope Memorized")

        listed = client.get("/api/memorized-transactions?include_singletons=true&limit=10&offset=0")
        self.assertEqual(listed.status_code, 200, listed.get_data(as_text=True))
        list_payload = listed.get_json() or {}
        self._assert_ok_envelope(list_payload)
        list_data = list_payload.get("data") or {}
        list_meta = list_payload.get("meta") or {}
        self.assertIsInstance(list_data.get("items"), list)
        self.assertIn("total", list_meta)
        self.assertIn("offset", list_meta)
        self.assertIn("limit", list_meta)
        self.assertIn("has_more", list_meta)
        self.assertIsInstance(list_payload.get("items"), list)
        self.assertIn("has_more", list_payload)

        deleted = self._post(client, f"/api/memorized-transactions/{created_item['id']}/delete", json={})
        self.assertEqual(deleted.status_code, 200, deleted.get_data(as_text=True))
        delete_payload = deleted.get_json() or {}
        self._assert_ok_envelope(delete_payload)
        self.assertTrue(((delete_payload.get("data") or {}).get("deleted")))

        missing = self._post(
            client,
            f"/api/memorized-transactions/{created_item['id']}/update",
            json={"canonical": "Missing"},
        )
        self.assertEqual(missing.status_code, 404, missing.get_data(as_text=True))
        missing_payload = missing.get_json() or {}
        self.assertFalse(missing_payload.get("ok"))
        self.assertIsNone(missing_payload.get("data"))
        self.assertIsInstance(missing_payload.get("error"), str)
        self.assertIsInstance(missing_payload.get("meta"), dict)

    def test_template_feedback_route_returns_standard_envelope(self):
        self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = True
        try:
            self._create_user("env-template-feedback@example.com", "Password123!")
            client = self.app.test_client()
            self._login(client, "env-template-feedback@example.com", "Password123!")
            self._create_transaction(
                client,
                date="2026-02-19",
                category="Coffee",
                name="Americano",
                amount_kd="1.250",
            )
            suggestions = client.get("/api/transaction-template-suggestions?q=amer&limit=3")
            self.assertEqual(suggestions.status_code, 200, suggestions.get_data(as_text=True))
            suggestion_items = (suggestions.get_json() or {}).get("items") or []
            self.assertGreaterEqual(len(suggestion_items), 1)
            feedback_key = suggestion_items[0].get("feedback_key")
            self.assertIsInstance(feedback_key, str)

            res = self._post(
                client,
                "/api/transaction-template-suggestions/feedback",
                json={
                    "feedback_key": feedback_key,
                    "outcome": "accepted",
                    "query": "amer",
                    "source": "contract_test",
                },
            )
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            payload = res.get_json() or {}
            self._assert_ok_envelope(payload)
            feedback = ((payload.get("data") or {}).get("feedback")) or {}
            self.assertEqual(feedback.get("feedback_key"), feedback_key)
            self.assertEqual(feedback.get("accepted_count"), 1)
            self.assertEqual(feedback.get("rejected_count"), 0)
            self.assertEqual(((payload.get("feedback") or {}).get("feedback_key")), feedback_key)
        finally:
            self.app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = False


if __name__ == "__main__":
    unittest.main()
