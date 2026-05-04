import re
import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class HealthEndpointsTests(PreflightApiTestBase):
    def test_healthz_is_live_without_auth(self):
        client = self.app.test_client()

        res = client.get("/healthz")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("ok"), True)
        self.assertEqual(payload.get("status"), "ok")
        self.assertEqual(payload.get("service"), "personal-finance")
        self.assertEqual(res.headers.get("Cache-Control"), "no-store")

    def test_readyz_reports_db_ok_and_has_request_id(self):
        client = self.app.test_client()

        res = client.get("/readyz")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("ok"), True)
        self.assertEqual(payload.get("status"), "ready")
        checks = payload.get("checks") or {}
        self.assertEqual(checks.get("db"), "ok")

        request_id = self._get_request_id(res)
        self.assertRegex(request_id, r"^[0-9a-f]{16}$")
        self.assertEqual(res.headers.get("Cache-Control"), "no-store")

    def test_readyz_returns_503_when_db_is_unavailable(self):
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
        self.assertEqual(payload.get("ok"), False)
        self.assertEqual(payload.get("status"), "not_ready")
        self.assertEqual(payload.get("error_code"), "service_unavailable")
        self.assertEqual(payload.get("code"), "service_unavailable")
        checks = payload.get("checks") or {}
        db_check = checks.get("db") or ""
        self.assertTrue(db_check.startswith("error: "))
        self.assertLessEqual(len(db_check), 127)
        self.assertTrue(re.match(r"^[0-9a-f]{16}$", self._get_request_id(res)))

    def test_security_headers_present_on_healthz(self):
        client = self.app.test_client()
        res = client.get("/healthz")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        csp = res.headers.get("Content-Security-Policy", "")
        self.assertIn("default-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("base-uri 'self'", csp)
        self.assertIn("form-action 'self'", csp)
        self.assertIn("frame-ancestors 'none'", csp)

        self.assertEqual(res.headers.get("X-Frame-Options"), "DENY")
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(
            res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin"
        )

    def test_health_routes_are_not_under_api_prefix(self):
        client = self.app.test_client()

        live = client.get("/healthz")
        api_prefixed = client.get("/api/healthz")
        ready = client.get("/readyz")
        api_prefixed_ready = client.get("/api/readyz")

        self.assertEqual(live.status_code, 200, live.get_data(as_text=True))
        self.assertEqual(ready.status_code, 200, ready.get_data(as_text=True))
        self.assertEqual(api_prefixed.status_code, 404, api_prefixed.get_data(as_text=True))
        self.assertEqual(api_prefixed_ready.status_code, 404, api_prefixed_ready.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
