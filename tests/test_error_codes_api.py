import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class ErrorCodesApiTests(PreflightApiTestBase):
    def _assert_code_fields(self, payload: dict, expected: str):
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), expected)
        self.assertEqual(payload.get("code"), expected)

    def test_upload_validation_errors_include_code_fields(self):
        self._create_user("err-upload@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "err-upload@example.com", "Password123!")

        no_file = client.post(
            "/api/transactions/upload-preview",
            data={},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(no_file.status_code, 400, no_file.get_data(as_text=True))
        self._assert_code_fields(no_file.get_json() or {}, "upload_preview_file_required")

        no_rows = self._post(client, "/api/transactions/import-commit", json={"rows": []})
        self.assertEqual(no_rows.status_code, 400, no_rows.get_data(as_text=True))
        self._assert_code_fields(no_rows.get_json() or {}, "import_rows_required")

    def test_transaction_route_validation_errors_include_code_fields(self):
        self._create_user("err-transactions@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "err-transactions@example.com", "Password123!")

        bad_month = client.get("/api/transactions/summary?month=202602")
        self.assertEqual(bad_month.status_code, 400, bad_month.get_data(as_text=True))
        self._assert_code_fields(bad_month.get_json() or {}, "validation_error")

        bad_range = client.get("/api/transactions/top-patterns?range=7")
        self.assertEqual(bad_range.status_code, 400, bad_range.get_data(as_text=True))
        self._assert_code_fields(bad_range.get_json() or {}, "validation_error")

        missing_dup_fields = client.get("/api/transactions/dup-check?date=2026-02-19")
        self.assertEqual(missing_dup_fields.status_code, 400, missing_dup_fields.get_data(as_text=True))
        self._assert_code_fields(missing_dup_fields.get_json() or {}, "validation_error")

    def test_transaction_duplicate_conflict_includes_code_fields(self):
        self._create_user("err-duplicate-create@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "err-duplicate-create@example.com", "Password123!")

        payload = {
            "date": "2026-02-19",
            "category": "Groceries",
            "name": "Milk",
            "amount_kd": "3.000",
        }
        created = self._post(client, "/api/transactions/create", json=payload)
        self.assertEqual(created.status_code, 201, created.get_data(as_text=True))

        duplicate = self._post(client, "/api/transactions/create", json=payload)
        self.assertEqual(duplicate.status_code, 409, duplicate.get_data(as_text=True))
        duplicate_payload = duplicate.get_json() or {}
        self.assertTrue(duplicate_payload.get("duplicate"))
        self._assert_code_fields(duplicate_payload, "transaction_duplicate_conflict")

    def test_demo_data_conflict_includes_code_fields(self):
        self._create_user("err-demo-data@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "err-demo-data@example.com", "Password123!")

        first = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))

        second = self._post(client, "/api/auth/demo-data", json={})
        self.assertEqual(second.status_code, 409, second.get_data(as_text=True))
        self._assert_code_fields(second.get_json() or {}, "demo_data_not_empty")

    def test_session_revoked_includes_code_fields(self):
        self._create_user("err-session-revoked@example.com", "Password123!")
        client_a = self.app.test_client()
        client_b = self.app.test_client()
        self._login(client_a, "err-session-revoked@example.com", "Password123!")
        self._login(client_b, "err-session-revoked@example.com", "Password123!")

        revoke = self._post(client_a, "/api/auth/sessions/revoke-all", json={})
        self.assertEqual(revoke.status_code, 200, revoke.get_data(as_text=True))

        stale = client_b.get("/api/auth/profile")
        self.assertEqual(stale.status_code, 401, stale.get_data(as_text=True))
        self._assert_code_fields(stale.get_json() or {}, "SESSION_REVOKED")

    def test_rate_limit_errors_include_code_fields(self):
        self._create_user("err-rate-limit@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "err-rate-limit@example.com", "Password123!")

        with patch("backend.security_ops._rate_limiter.is_allowed", return_value=(False, 0)):
            limited = client.get("/api/auth/profile/security-events")

        self.assertEqual(limited.status_code, 429, limited.get_data(as_text=True))
        payload = limited.get_json() or {}
        self._assert_code_fields(payload, "rate_limit_exceeded")
        self.assertGreater(payload.get("retry_after", 0), 0)
        self.assertEqual(limited.headers.get("Retry-After"), str(payload.get("retry_after")))

    def test_readyz_failure_includes_code_fields(self):
        from backend.routes import health as health_routes

        client = self.app.test_client()
        with patch.object(
            health_routes.db.session,
            "execute",
            side_effect=Exception("unable to connect to database for readiness probe"),
        ):
            res = client.get("/readyz")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("status"), "not_ready")
        self._assert_code_fields(payload, "service_unavailable")


if __name__ == "__main__":
    unittest.main()
