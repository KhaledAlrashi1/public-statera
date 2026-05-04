"""Tests for async account deletion (202 dispatch + poll endpoint) and 2FA bank gate."""

from __future__ import annotations

import unittest
from unittest.mock import patch, MagicMock

from tests.preflight_base import PreflightApiTestBase


class AccountDeletionAsyncTests(PreflightApiTestBase):
    """Integration tests for the async account deletion flow."""

    def _register_and_login(self, client, email="deltest@example.com", password="Pass1234!"):
        res = self._post(
            client,
            "/api/auth/register",
            json={"email": email, "password": password},
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        self._login(client, email, password)

    # ------------------------------------------------------------------
    # Step 1: issue confirmation token
    # ------------------------------------------------------------------

    def test_step1_returns_confirmation_token(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.delete(
                "/api/account",
                json={"password": "Pass1234!"},
                headers=self._csrf_headers(client),
            )
            data = res.get_json()
            self.assertEqual(res.status_code, 202, data)
            self.assertIn("confirmation_token", data["data"])
            self.assertIn("expires_in", data["data"])

    # ------------------------------------------------------------------
    # Step 2: confirm deletion → dispatches async task
    # ------------------------------------------------------------------

    def test_step2_dispatches_celery_task_and_returns_task_id(self):
        """Confirm deletion should queue a Celery task and log out the user."""
        with self.app.test_client() as client:
            self._register_and_login(client)

            # Step 1: get token.
            res = client.delete(
                "/api/account",
                json={"password": "Pass1234!"},
                headers=self._csrf_headers(client),
            )
            token = res.get_json()["data"]["confirmation_token"]

            # Step 2: confirm with a mocked Celery task.
            mock_result = MagicMock()
            mock_result.id = "fake-celery-task-id-123"
            with patch("backend.tasks.delete_account_data.apply_async", return_value=mock_result):
                res2 = client.delete(
                    "/api/account",
                    json={"password": "Pass1234!", "confirmation_token": token},
                    headers=self._csrf_headers(client),
                )

            data2 = res2.get_json()
            self.assertEqual(res2.status_code, 200, data2)
            self.assertTrue(data2["ok"])
            poll_token = str(data2["data"]["task_id"])
            self.assertTrue(poll_token)
            self.assertNotEqual(poll_token, "fake-celery-task-id-123")
            self.assertTrue(poll_token.startswith("enc1:"))
            self.assertNotIn("fake-celery-task-id-123", poll_token)

            # User should be logged out.
            me_res = client.get("/api/auth/me")
            self.assertEqual(me_res.status_code, 401)

            poll_res = client.get(f"/api/account/deletion-status/{poll_token}")
            poll_data = poll_res.get_json() or {}
            self.assertEqual(poll_res.status_code, 200, poll_data)
            self.assertIn((poll_data.get("data") or {}).get("status"), ("pending", "failed", "complete"))

    def test_step2_wrong_confirmation_token_returns_400(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            # Skip step 1 — use a garbage token.
            res = client.delete(
                "/api/account",
                json={"password": "Pass1234!", "confirmation_token": "wrong-token"},
                headers=self._csrf_headers(client),
            )
            self.assertEqual(res.status_code, 400)

    def test_step2_wrong_password_returns_401(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.delete(
                "/api/account",
                json={"password": "wrongpass"},
                headers=self._csrf_headers(client),
            )
            self.assertEqual(res.status_code, 401)

    def test_auth_me_requires_authentication(self):
        with self.app.test_client() as client:
            res = client.get("/api/auth/me")
            self.assertEqual(res.status_code, 401)

    # ------------------------------------------------------------------
    # Deletion-status poll endpoint
    # ------------------------------------------------------------------

    def test_poll_sync_task_returns_complete(self):
        """When task_id='sync' (no Celery worker), poll returns complete."""
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.get(
                "/api/account/deletion-status/sync",
                headers=self._csrf_headers(client),
            )
            data = res.get_json()
            self.assertEqual(res.status_code, 200)
            self.assertEqual(data["data"]["status"], "complete")

    def test_poll_rejects_unsigned_raw_task_id(self):
        """Unsigned raw task ids are rejected; the public route expects an opaque token."""
        with self.app.test_client() as client:
            res = client.get(
                "/api/account/deletion-status/nonexistent-task-id-xyz",
                headers=self._csrf_headers(client),
            )
            data = res.get_json()
            self.assertEqual(res.status_code, 400)
            self.assertEqual(data.get("error_code"), "invalid_task_id")

    def test_poll_empty_task_id_returns_400(self):
        with self.app.test_client() as client:
            self._register_and_login(client)
            res = client.get(
                "/api/account/deletion-status/",
                headers=self._csrf_headers(client),
            )
            # Flask will 404 on empty path segment before our handler.
            self.assertIn(res.status_code, (400, 404, 405))

    # ------------------------------------------------------------------
    # Celery task logic: delete_account_data
    # ------------------------------------------------------------------

    def test_celery_task_soft_deletes_user_row(self):
        """The delete_account_data task must disable the user row in place."""
        import hashlib
        from backend.tasks import delete_account_data

        with self.app.app_context():
            # Create a user directly.
            user = self.User(
                email="async-del@example.com",
                password_hash=self.bcrypt.generate_password_hash("pass").decode(),
            )
            self.db.session.add(user)
            self.db.session.commit()
            uid = user.id
            email_hash = hashlib.sha256(b"async-del@example.com").hexdigest()

        # Run the task synchronously (eager mode).
        with patch("backend.security_ops._rate_limiter._get_redis_client") as mock_redis:
            mock_client = MagicMock()
            mock_client.set.return_value = True  # Lock acquired.
            mock_redis.return_value = mock_client

            result = delete_account_data.apply(
                kwargs={"user_id": uid, "email_hash": email_hash}
            ).get(timeout=10)

        self.assertEqual(result["status"], "deleted")
        self.assertEqual(result["user_id"], uid)

        with self.app.app_context():
            user_row = self.db.session.get(self.User, uid)
            self.assertIsNotNone(user_row, "User row should be retained as a tombstone.")
            self.assertFalse(bool(user_row.is_active), "User should have been soft-deleted by the task.")

    def test_celery_task_is_idempotent(self):
        """Calling delete_account_data twice for the same user_id is a no-op on second call."""
        import hashlib
        from backend.tasks import delete_account_data

        with self.app.app_context():
            user = self.User(
                email="idempotent-del@example.com",
                password_hash=self.bcrypt.generate_password_hash("pass").decode(),
            )
            self.db.session.add(user)
            self.db.session.commit()
            uid = user.id
            email_hash = hashlib.sha256(b"idempotent-del@example.com").hexdigest()

        with patch("backend.security_ops._rate_limiter._get_redis_client") as mock_redis:
            mock_client = MagicMock()
            mock_client.set.return_value = True
            mock_redis.return_value = mock_client

            delete_account_data.apply(
                kwargs={"user_id": uid, "email_hash": email_hash}
            ).get(timeout=10)

            # Second call: user already gone.
            result2 = delete_account_data.apply(
                kwargs={"user_id": uid, "email_hash": email_hash}
            ).get(timeout=10)

        self.assertEqual(result2["status"], "already_deleted")


class BankConnect2FAGateTests(PreflightApiTestBase):
    """Tests that bank connect/sync require 2FA when REQUIRE_2FA_FOR_BANK_CONNECT=True."""

    def setUp(self):
        super().setUp()
        self.app.config["ENABLE_OPEN_BANKING"] = True
        self.app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = True

    def tearDown(self):
        self.app.config["ENABLE_OPEN_BANKING"] = False
        self.app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = True
        super().tearDown()

    def _register_login_no_2fa(self, client):
        res = self._post(
            client,
            "/api/auth/register",
            json={"email": "nofa@example.com", "password": "Pass1234!"},
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        self._login(client, "nofa@example.com", "Pass1234!")

    def test_connect_without_2fa_returns_403(self):
        with self.app.test_client() as client:
            self._register_login_no_2fa(client)
            res = self._post(
                client,
                "/api/bank/connect",
                json={"provider": "fakebank", "institution_name": "Test Bank"},
            )
            data = res.get_json()
            self.assertEqual(res.status_code, 403, data)
            self.assertEqual(data.get("error_code"), "2fa_required")

    def test_connect_without_2fa_flag_off_allows_connect(self):
        """When REQUIRE_2FA_FOR_BANK_CONNECT=False the gate should pass."""
        self.app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = False
        with self.app.test_client() as client:
            self._register_login_no_2fa(client)
            res = self._post(
                client,
                "/api/bank/connect",
                json={"provider": "fakebank", "institution_name": "Test Bank"},
            )
            data = res.get_json()
            # Either 201 (success) or a provider error — NOT a 403.
            self.assertNotEqual(res.status_code, 403, data)

    def test_sync_preview_without_2fa_returns_403(self):
        """Sync-preview also requires 2FA when the gate is enabled."""
        with self.app.test_client() as client:
            self._register_login_no_2fa(client)
            res = self._post(
                client,
                "/api/bank/connections/999/sync-preview",
                json={},
            )
            data = res.get_json()
            self.assertEqual(res.status_code, 403, data)
            self.assertEqual(data.get("error_code"), "2fa_required")


if __name__ == "__main__":
    unittest.main()
