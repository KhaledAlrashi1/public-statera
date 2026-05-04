import unittest

from werkzeug.security import generate_password_hash

from preflight_base import PreflightApiTestBase


class AuthRecoveryPreflightTests(PreflightApiTestBase):
    def test_login_accepts_mixed_case_email(self):
        self._create_user("case-login@example.com", "Password123!")
        client = self.app.test_client()

        login = self._post(
            client,
            "/api/auth/login",
            json={"email": "Case-Login@Example.COM", "password": "Password123!"},
        )
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertEqual(((login.get_json() or {}).get("user") or {}).get("email"), "case-login@example.com")

    def test_login_with_legacy_hash_rehashes_to_bcrypt(self):
        client = self.app.test_client()
        with self.app.app_context():
            legacy_hash = generate_password_hash("Password123!")
            user = self.User(email="legacyhash@example.com", password_hash=legacy_hash)
            self.db.session.add(user)
            self.db.session.commit()
            user_id = user.id

        login = self._post(client, "/api/auth/login", json={"email": "legacyhash@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))

        with self.app.app_context():
            updated_user = self.db.session.get(self.User, user_id)
            self.assertIsNotNone(updated_user)
            self.assertNotEqual(updated_user.password_hash, legacy_hash)
            self.assertTrue(updated_user.password_hash.startswith("$2"))

    def test_login_with_malformed_hash_returns_401(self):
        client = self.app.test_client()
        with self.app.app_context():
            user = self.User(email="brokenhash@example.com", password_hash="not-a-valid-hash")
            self.db.session.add(user)
            self.db.session.commit()

        login = self._post(client, "/api/auth/login", json={"email": "brokenhash@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 401, login.get_data(as_text=True))
        payload = login.get_json() or {}
        self.assertEqual(payload.get("error"), "Invalid email or password.")
        self.assertEqual(payload.get("error_code"), "auth_invalid_credentials")

    def test_email_change_link_flow(self):
        self._create_user("emailflow@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "emailflow@example.com", "Password123!")

        req = self._post(
            client,
            "/api/auth/profile/request-email-change-link",
            json={"new_email": "emailflow_new@example.com", "current_password": "Password123!"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        req_payload = req.get_json()
        self.assertTrue(req_payload.get("ok"))
        preview_url = req_payload.get("preview_url")
        self.assertTrue(preview_url)

        token = self._token_from_preview_url(preview_url)
        self.assertTrue(token)

        confirm = self._post(client, "/api/auth/profile/confirm-email-change", json={"token": token})
        self.assertEqual(confirm.status_code, 200, confirm.get_data(as_text=True))

        login_old = self._post(client, "/api/auth/login", json={"email": "emailflow@example.com", "password": "Password123!"})
        self.assertEqual(login_old.status_code, 401, login_old.get_data(as_text=True))
        login_new = self._post(client, "/api/auth/login", json={"email": "emailflow_new@example.com", "password": "Password123!"})
        self.assertEqual(login_new.status_code, 200, login_new.get_data(as_text=True))

    def test_email_change_link_request_has_cooldown(self):
        self._create_user("emailcool@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "emailcool@example.com", "Password123!")

        req1 = self._post(
            client,
            "/api/auth/profile/request-email-change-link",
            json={"new_email": "emailcool_new@example.com", "current_password": "Password123!"},
        )
        self.assertEqual(req1.status_code, 200, req1.get_data(as_text=True))

        req2 = self._post(
            client,
            "/api/auth/profile/request-email-change-link",
            json={"new_email": "emailcool2_new@example.com", "current_password": "Password123!"},
        )
        self.assertEqual(req2.status_code, 429, req2.get_data(as_text=True))
        payload = req2.get_json()
        self.assertEqual(payload.get("error_code"), "security_link_cooldown")
        self.assertIn("retry_after", payload)
        self.assertGreater(payload["retry_after"], 0)

    def test_password_change_link_flow(self):
        self._create_user("pwflow@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "pwflow@example.com", "Password123!")

        req = self._post(
            client,
            "/api/auth/profile/request-password-change-link",
            json={"current_password": "Password123!"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        req_payload = req.get_json()
        self.assertTrue(req_payload.get("ok"))
        preview_url = req_payload.get("preview_url")
        self.assertTrue(preview_url)

        token = self._token_from_preview_url(preview_url)
        self.assertTrue(token)

        confirm = self._post(
            client,
            "/api/auth/profile/confirm-password-change",
            json={
                "token": token,
                "new_password": "BrandNew123!",
                "confirm_password": "BrandNew123!",
            },
        )
        self.assertEqual(confirm.status_code, 200, confirm.get_data(as_text=True))

        login_old = self._post(client, "/api/auth/login", json={"email": "pwflow@example.com", "password": "Password123!"})
        self.assertEqual(login_old.status_code, 401, login_old.get_data(as_text=True))
        login_new = self._post(client, "/api/auth/login", json={"email": "pwflow@example.com", "password": "BrandNew123!"})
        self.assertEqual(login_new.status_code, 200, login_new.get_data(as_text=True))

    def test_forgot_password_flow_public(self):
        self._create_user("forgotflow@example.com", "Password123!")
        client = self.app.test_client()

        req = self._post(
            client,
            "/api/auth/forgot-password/request",
            json={"email": "forgotflow@example.com"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        req_payload = req.get_json()
        self.assertTrue(req_payload.get("ok"))
        preview_url = req_payload.get("preview_url")
        self.assertTrue(preview_url)

        token = self._token_from_preview_url(preview_url)
        self.assertTrue(token)

        confirm = self._post(
            client,
            "/api/auth/forgot-password/confirm",
            json={
                "token": token,
                "new_password": "ForgotReset123!",
                "confirm_password": "ForgotReset123!",
            },
        )
        self.assertEqual(confirm.status_code, 200, confirm.get_data(as_text=True))

        login_old = self._post(client, "/api/auth/login", json={"email": "forgotflow@example.com", "password": "Password123!"})
        self.assertEqual(login_old.status_code, 401, login_old.get_data(as_text=True))
        login_new = self._post(client, "/api/auth/login", json={"email": "forgotflow@example.com", "password": "ForgotReset123!"})
        self.assertEqual(login_new.status_code, 200, login_new.get_data(as_text=True))

    def test_forgot_password_request_matches_email_case_insensitively(self):
        user_id = self._create_user("forgotcase@example.com", "Password123!")
        client = self.app.test_client()

        req = self._post(
            client,
            "/api/auth/forgot-password/request",
            json={"email": "ForgotCase@Example.COM"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        self.assertTrue((req.get_json() or {}).get("ok"))

        with self.app.app_context():
            from backend.models import AccountActionToken

            token = (
                AccountActionToken.query
                .filter(AccountActionToken.user_id == user_id)
                .filter(AccountActionToken.purpose == "password_reset")
                .first()
            )
            self.assertIsNotNone(token)

    def test_forgot_password_unknown_email_is_generic(self):
        client = self.app.test_client()
        req = self._post(
            client,
            "/api/auth/forgot-password/request",
            json={"email": "unknown@example.com"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        payload = req.get_json()
        self.assertTrue(payload.get("ok"))

    def test_forgot_password_confirm_requires_token_error_code(self):
        client = self.app.test_client()
        res = self._post(
            client,
            "/api/auth/forgot-password/confirm",
            json={"new_password": "ForgotReset123!", "confirm_password": "ForgotReset123!"},
        )
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        self.assertEqual((res.get_json() or {}).get("error_code"), "auth_action_token_required")

    def test_email_change_normalizes_mixed_case_new_email(self):
        self._create_user("emailcase@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "emailcase@example.com", "Password123!")

        req = self._post(
            client,
            "/api/auth/profile/request-email-change-link",
            json={"new_email": "EmailCase_New@Example.COM", "current_password": "Password123!"},
        )
        self.assertEqual(req.status_code, 200, req.get_data(as_text=True))
        preview_url = (req.get_json() or {}).get("preview_url")
        self.assertTrue(preview_url)

        token = self._token_from_preview_url(preview_url)
        confirm = self._post(client, "/api/auth/profile/confirm-email-change", json={"token": token})
        self.assertEqual(confirm.status_code, 200, confirm.get_data(as_text=True))

        login_old = self._post(
            client,
            "/api/auth/login",
            json={"email": "emailcase@example.com", "password": "Password123!"},
        )
        self.assertEqual(login_old.status_code, 401, login_old.get_data(as_text=True))

        login_new = self._post(
            client,
            "/api/auth/login",
            json={"email": "emailcase_new@example.com", "password": "Password123!"},
        )
        self.assertEqual(login_new.status_code, 200, login_new.get_data(as_text=True))

        with self.app.app_context():
            user = self.User.query.filter_by(email="emailcase_new@example.com").first()
            self.assertIsNotNone(user)

    def test_password_change_invalidates_other_sessions(self):
        self._create_user("session-pw@example.com", "Password123!")
        client_a = self.app.test_client()
        client_b = self.app.test_client()
        self._login(client_a, "session-pw@example.com", "Password123!")
        self._login(client_b, "session-pw@example.com", "Password123!")

        change = self._post(
            client_a,
            "/api/auth/profile/change-password",
            json={
                "current_password": "Password123!",
                "new_password": "Password456!",
                "confirm_password": "Password456!",
            },
        )
        self.assertEqual(change.status_code, 200, change.get_data(as_text=True))

        stale = client_b.get("/api/auth/profile")
        self.assertEqual(stale.status_code, 401, stale.get_data(as_text=True))
        self.assertEqual((stale.get_json() or {}).get("code"), "SESSION_REVOKED")

        active = client_a.get("/api/auth/profile")
        self.assertEqual(active.status_code, 200, active.get_data(as_text=True))

    def test_revoke_all_sessions_invalidates_other_devices(self):
        self._create_user("session-revoke@example.com", "Password123!")
        client_a = self.app.test_client()
        client_b = self.app.test_client()
        self._login(client_a, "session-revoke@example.com", "Password123!")
        self._login(client_b, "session-revoke@example.com", "Password123!")

        revoke = self._post(client_a, "/api/auth/sessions/revoke-all", json={})
        self.assertEqual(revoke.status_code, 200, revoke.get_data(as_text=True))
        self.assertTrue((revoke.get_json() or {}).get("ok"))

        stale = client_b.get("/api/auth/profile")
        self.assertEqual(stale.status_code, 401, stale.get_data(as_text=True))
        self.assertEqual((stale.get_json() or {}).get("code"), "SESSION_REVOKED")

        active = client_a.get("/api/auth/profile")
        self.assertEqual(active.status_code, 200, active.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
