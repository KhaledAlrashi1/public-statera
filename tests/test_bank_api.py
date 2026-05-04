import unittest
import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from preflight_base import PreflightApiTestBase

from backend import db
from backend.lib.transactions import create_transaction_with_dup_check
from backend.models import BankConsent, BankSyncRun
from backend.providers.fakebank import _make_pool


class BankFeatureFlagDisabledTest(PreflightApiTestBase):
    """All endpoints must 404 when Open Banking feature flag is disabled."""

    def setUp(self):
        super().setUp()
        self.app.config["ENABLE_OPEN_BANKING"] = False
        self._create_user("flag@example.com", "pass1234")

    def test_feature_flag_disabled_all_endpoints_404(self):
        with self.app.test_client() as client:
            self._login(client, "flag@example.com", "pass1234")
            for method, url in [
                ("POST", "/api/bank/connect"),
                ("POST", "/api/bank/connect/oauth-begin"),
                ("GET", "/api/bank/providers"),
                ("GET", "/api/bank/connections"),
                ("POST", "/api/bank/connections/1/sync-preview"),
                ("POST", "/api/bank/connections/1/sync-runs/1/commit"),
                ("POST", "/api/bank/connections/1/revoke"),
            ]:
                if method == "GET":
                    res = client.get(url)
                else:
                    res = self._post(client, url, json={})
                self.assertEqual(res.status_code, 404, f"Expected 404 for {method} {url}")
                body = res.get_json() or {}
                self.assertEqual(body.get("error_code"), "feature_disabled")


class BankApiTest(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.app.config["ENABLE_OPEN_BANKING"] = True
        self.app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = False
        self.app.config.update(
            OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL="",
            OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL="",
            OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID="",
            OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET="",
            OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI="",
            OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL="",
            OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL="",
            OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE=True,
        )
        self.uid_a = self._create_user("alice@example.com", "password1")
        self.uid_b = self._create_user("bob@example.com", "password2")

    def _configure_oauth_sandbox(self):
        self.app.config.update(
            OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL="https://sandbox-bank.example.com/oauth/authorize",
            OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL="https://sandbox-bank.example.com/oauth/token",
            OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID="sandbox-client-id",
            OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET="sandbox-client-secret",
            OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI="http://localhost/api/bank/connect/oauth-callback/oauth_sandbox",
            OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL="https://sandbox-bank.example.com/api/transactions",
            OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL="https://sandbox-bank.example.com/api/accounts",
            OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE=True,
        )

    def test_connect_creates_connection(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = self._post(
                client,
                "/api/bank/connect",
                json={
                    "provider": "fakebank",
                    "institution_name": "My Fake Bank",
                },
            )
        self.assertEqual(res.status_code, 201)
        body = res.get_json() or {}
        self.assertTrue(body.get("ok"))
        conn = body["data"]["connection"]
        self.assertEqual(conn["status"], "active")
        self.assertEqual(conn["provider"], "fakebank")
        self.assertEqual(conn["institution_name"], "My Fake Bank")
        self.assertIsNone(conn["last_synced_at"])

    def test_list_providers_shows_demo_and_future_oauth_provider(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = client.get("/api/bank/providers")

        self.assertEqual(res.status_code, 200)
        providers = ((res.get_json() or {}).get("data") or {}).get("providers") or []
        by_name = {provider["provider"]: provider for provider in providers}
        self.assertIn("fakebank", by_name)
        self.assertTrue(by_name["fakebank"]["ready"])
        self.assertEqual(by_name["fakebank"]["connect_mode"], "direct")
        self.assertIn("oauth_sandbox", by_name)
        self.assertFalse(by_name["oauth_sandbox"]["ready"])
        self.assertEqual(by_name["oauth_sandbox"]["connect_mode"], "oauth_redirect")
        self.assertGreater(len(by_name["oauth_sandbox"]["missing_config"]), 0)

    def test_connect_oauth_sandbox_without_config_returns_provider_not_configured(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = self._post(client, "/api/bank/connect", json={"provider": "oauth_sandbox"})

        self.assertEqual(res.status_code, 409)
        body = res.get_json() or {}
        self.assertEqual(body.get("error_code"), "provider_not_configured")

    def test_begin_oauth_sandbox_with_config_returns_authorization_url_and_stores_state(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = self._post(
                client,
                "/api/bank/connect/oauth-begin",
                json={
                    "provider": "oauth_sandbox",
                    "institution_name": "Sandbox Bank",
                    "scopes": ["transactions:read"],
                },
            )

            self.assertEqual(res.status_code, 200)
            data = ((res.get_json() or {}).get("data")) or {}
            self.assertEqual(data.get("provider"), "oauth_sandbox")
            self.assertTrue(data.get("authorization_url"))
            self.assertTrue(data.get("state"))

            parsed = urlparse(data["authorization_url"])
            query = parse_qs(parsed.query)
            self.assertEqual(parsed.scheme, "https")
            self.assertEqual(query.get("response_type"), ["code"])
            self.assertEqual(query.get("client_id"), ["sandbox-client-id"])
            self.assertEqual(
                query.get("redirect_uri"),
                ["http://localhost/api/bank/connect/oauth-callback/oauth_sandbox"],
            )
            self.assertEqual(query.get("scope"), ["transactions:read"])
            self.assertEqual(query.get("state"), [data["state"]])
            self.assertEqual(query.get("code_challenge_method"), ["S256"])
            self.assertTrue(query.get("code_challenge"))

            with client.session_transaction() as sess:
                pending = (sess.get("bank_oauth_pending") or {}).get(data["state"])
            self.assertIsNotNone(pending)
            self.assertEqual(pending.get("provider"), "oauth_sandbox")
            self.assertEqual(pending.get("institution_name"), "Sandbox Bank")
            self.assertEqual(pending.get("scopes"), ["transactions:read"])
            self.assertTrue(pending.get("code_verifier"))

    def test_oauth_callback_without_pending_state_returns_invalid_state(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = client.get(
                "/api/bank/connect/oauth-callback/oauth_sandbox?state=missing&code=abc123",
                follow_redirects=False,
            )

        self.assertEqual(res.status_code, 400)
        body = res.get_json() or {}
        self.assertEqual(body.get("error_code"), "invalid_oauth_state")

    def test_oauth_callback_with_pending_state_redirects_not_ready_until_exchange_is_wired(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            start = self._post(
                client,
                "/api/bank/connect/oauth-begin",
                json={"provider": "oauth_sandbox"},
            )
            state = (((start.get_json() or {}).get("data")) or {}).get("state")
            self.assertTrue(state)

            res = client.get(
                f"/api/bank/connect/oauth-callback/oauth_sandbox?state={state}&code=abc123",
                follow_redirects=False,
            )
            self.assertEqual(res.status_code, 302)
            self.assertIn("bank_oauth_code=provider_callback_not_ready", res.headers.get("Location", ""))

            with client.session_transaction() as sess:
                self.assertNotIn(state, sess.get("bank_oauth_pending") or {})

    def test_oauth_callback_rejects_state_for_different_authenticated_user(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            start = self._post(
                client,
                "/api/bank/connect/oauth-begin",
                json={"provider": "oauth_sandbox"},
            )
            state = (((start.get_json() or {}).get("data")) or {}).get("state")
            self.assertTrue(state)

            self._login(client, "bob@example.com", "password2")
            res = client.get(
                f"/api/bank/connect/oauth-callback/oauth_sandbox?state={state}&code=abc123",
                follow_redirects=False,
            )

        self.assertEqual(res.status_code, 400)
        body = res.get_json() or {}
        self.assertEqual(body.get("error_code"), "invalid_oauth_state")

    def test_oauth_callback_rejects_expired_state(self):
        self._configure_oauth_sandbox()
        expired_ts = int(time.time()) - (16 * 60)
        payload = f"{self.uid_a}:{'deadbeef' * 4}:{expired_ts}"
        secret = str(self.app.config["SECRET_KEY"])
        sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        expired_state = f"{payload}:{sig}"

        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = client.get(
                f"/api/bank/connect/oauth-callback/oauth_sandbox?state={expired_state}&code=abc123",
                follow_redirects=False,
            )

        self.assertEqual(res.status_code, 400)
        body = res.get_json() or {}
        self.assertEqual(body.get("error_code"), "invalid_oauth_state")

    def test_oauth_callback_rejects_invalid_state_even_when_feature_flag_turns_off(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            start = self._post(
                client,
                "/api/bank/connect/oauth-begin",
                json={"provider": "oauth_sandbox"},
            )
            state = (((start.get_json() or {}).get("data")) or {}).get("state")
            self.assertTrue(state)

            self.app.config["ENABLE_OPEN_BANKING"] = False
            res = client.get(
                "/api/bank/connect/oauth-callback/oauth_sandbox?state=missing&code=abc123",
                follow_redirects=False,
            )

            self.assertEqual(res.status_code, 400)
            body = res.get_json() or {}
            self.assertEqual(body.get("error_code"), "invalid_oauth_state")

            with client.session_transaction() as sess:
                self.assertIn(state, sess.get("bank_oauth_pending") or {})

    def test_oauth_callback_with_valid_state_redirects_feature_disabled_when_flag_toggles_off(self):
        self._configure_oauth_sandbox()
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            start = self._post(
                client,
                "/api/bank/connect/oauth-begin",
                json={"provider": "oauth_sandbox"},
            )
            state = (((start.get_json() or {}).get("data")) or {}).get("state")
            self.assertTrue(state)

            self.app.config["ENABLE_OPEN_BANKING"] = False
            res = client.get(
                f"/api/bank/connect/oauth-callback/oauth_sandbox?state={state}&code=abc123",
                follow_redirects=False,
            )

            self.assertEqual(res.status_code, 302)
            self.assertIn("bank_oauth_code=feature_disabled", res.headers.get("Location", ""))

            with client.session_transaction() as sess:
                self.assertNotIn(state, sess.get("bank_oauth_pending") or {})

    def test_list_connections_empty_then_one(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            res = client.get("/api/bank/connections")
            self.assertEqual(res.status_code, 200)
            self.assertEqual((res.get_json() or {})["data"]["connections"], [])

            self._post(client, "/api/bank/connect", json={"provider": "fakebank"})

            res2 = client.get("/api/bank/connections")
            conns = ((res2.get_json() or {}).get("data") or {}).get("connections") or []
            self.assertEqual(len(conns), 1)

    def test_tenant_isolation_connection_404(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")
            self.assertIsInstance(conn_id, int)

        with self.app.test_client() as client:
            self._login(client, "bob@example.com", "password2")
            preview = self._post(client, f"/api/bank/connections/{conn_id}/sync-preview", json={})
            self.assertEqual(preview.status_code, 404)
            revoke = self._post(client, f"/api/bank/connections/{conn_id}/revoke", json={})
            self.assertEqual(revoke.status_code, 404)

    def test_sync_preview_returns_staged_rows(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            res = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 10},
            )
        self.assertEqual(res.status_code, 200)
        data = ((res.get_json() or {}).get("data")) or {}
        self.assertIn("sync_run_id", data)
        self.assertEqual(data["staged_count"], 10)
        self.assertEqual(data["provider_dup_count"], 0)
        self.assertEqual(len(data["rows"]), 10)
        self.assertIsNotNone(data["next_cursor"])
        row = data["rows"][0]
        for field in ("raw_tx_id", "provider_tx_id", "date", "description", "amount_kd", "likely_dup"):
            self.assertIn(field, row)

    def test_fakebank_pool_is_deterministic(self):
        pool_a = _make_pool(99)
        pool_b = _make_pool(99)
        ids_a = [row.provider_tx_id for row in pool_a]
        ids_b = [row.provider_tx_id for row in pool_b]
        self.assertEqual(ids_a, ids_b)
        self.assertEqual(pool_a[0].provider_tx_id, "fakebank_99_0000")
        self.assertEqual(pool_a[49].provider_tx_id, "fakebank_99_0049")

        pool_c = _make_pool(100)
        self.assertEqual(pool_c[0].provider_tx_id, "fakebank_100_0000")

    def test_provider_dedup_skips_already_staged_rows(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            first = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 5},
            )
            self.assertEqual(((first.get_json() or {}).get("data") or {}).get("staged_count"), 5)

            second = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 5, "cursor": "0"},
            )
            data2 = ((second.get_json() or {}).get("data")) or {}
            self.assertEqual(data2.get("provider_dup_count"), 5)
            self.assertEqual(data2.get("staged_count"), 0)

    def test_commit_imports_transactions(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 5},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")

            commit = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={"default_category": "Bank Import"},
            )
        self.assertEqual(commit.status_code, 200)
        data = ((commit.get_json() or {}).get("data")) or {}
        self.assertGreaterEqual(data.get("committed_count", 0), 0)
        self.assertEqual(
            data.get("committed_count", 0) + data.get("skipped_dup_count", 0),
            5,
        )
        self.assertIsInstance(data.get("transaction_ids"), list)

    def test_commit_busts_dashboard_and_safe_to_spend_caches(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 2},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")

            with patch("backend.routes.bank.cache_bust_dashboard_metrics") as bust_dashboard, patch(
                "backend.routes.bank.cache_bust_safe_to_spend"
            ) as bust_safe:
                commit = self._post(
                    client,
                    f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                    json={"default_category": "Bank Import"},
                )

        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        bust_dashboard.assert_called_once_with(self.uid_a)
        bust_safe.assert_called_once_with(self.uid_a)

    def test_commit_skips_existing_transactions_via_triplet_gate(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")
            self.assertIsInstance(conn_id, int)

        first = _make_pool(conn_id)[0]
        with self.app.app_context():
            txn, is_dup, err = create_transaction_with_dup_check(
                txn_date=first.date,
                category_name="Expenses",
                name=first.description,
                amount=first.amount_kd,
                user_id=self.uid_a,
                force=False,
            )
            self.assertIsNotNone(txn)
            self.assertFalse(is_dup)
            self.assertIsNone(err)
            from backend import db
            db.session.commit()

        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 1, "cursor": "0"},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")

            commit = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={},
            )
        self.assertEqual(commit.status_code, 200)
        data = ((commit.get_json() or {}).get("data")) or {}
        self.assertGreaterEqual(data.get("skipped_dup_count", 0), 1)

    def test_revoke_changes_connection_status(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            revoke = self._post(client, f"/api/bank/connections/{conn_id}/revoke", json={})
        self.assertEqual(revoke.status_code, 200)
        body = revoke.get_json() or {}
        self.assertTrue(body.get("ok"))
        self.assertEqual(((body.get("data") or {}).get("status")), "revoked")

    def test_sync_preview_after_revoke_is_blocked(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")
            self._post(client, f"/api/bank/connections/{conn_id}/revoke", json={})

            res = self._post(client, f"/api/bank/connections/{conn_id}/sync-preview", json={})
        self.assertEqual(res.status_code, 409)
        self.assertEqual((res.get_json() or {}).get("error_code"), "connection_revoked")

    def test_commit_after_revoke_is_blocked(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 3},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")

            self._post(client, f"/api/bank/connections/{conn_id}/revoke", json={})
            commit = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={},
            )
        self.assertEqual(commit.status_code, 409)
        self.assertEqual((commit.get_json() or {}).get("error_code"), "connection_revoked")

    def test_commit_with_expired_consent_returns_consent_expired(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 2},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")
            self.assertIsInstance(run_id, int)

            with self.app.app_context():
                consent = (
                    BankConsent.query
                    .filter_by(connection_id=conn_id, user_id=self.uid_a, status="active")
                    .order_by(BankConsent.id.desc())
                    .first()
                )
                self.assertIsNotNone(consent)
                consent.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
                db.session.commit()

            commit = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={},
            )
            self.assertEqual(commit.status_code, 409)
            self.assertEqual((commit.get_json() or {}).get("error_code"), "consent_expired")

            with self.app.app_context():
                run = BankSyncRun.query.filter_by(id=run_id, connection_id=conn_id).first()
                self.assertIsNotNone(run)
                self.assertEqual(run.status, "abandoned")
                self.assertIsNotNone(run.abandoned_at)

    def test_sync_preview_rate_limited_after_five_requests_per_minute(self):
        with self.app.test_client() as client:
            self._login(client, "alice@example.com", "password1")
            created = self._post(client, "/api/bank/connect", json={"provider": "fakebank"})
            conn_id = ((created.get_json() or {}).get("data") or {}).get("connection", {}).get("id")
            self.assertIsInstance(conn_id, int)

            statuses: list[int] = []
            for cursor in ("0", "1", "2", "3", "4", "5"):
                res = self._post(
                    client,
                    f"/api/bank/connections/{conn_id}/sync-preview",
                    json={"limit": 1, "cursor": cursor},
                )
                statuses.append(res.status_code)

        self.assertEqual(statuses[:5], [200, 200, 200, 200, 200])
        self.assertEqual(statuses[5], 429)


if __name__ == "__main__":
    unittest.main()
