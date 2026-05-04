import unittest

from preflight_base import PreflightApiTestBase


class AuthRegisterTests(PreflightApiTestBase):
    def test_duplicate_email_uses_same_masked_response_as_invalid_email(self):
        self._create_user("existing@example.com", "Password123!")
        client = self.app.test_client()

        invalid = self._post(
            client,
            "/api/auth/register",
            json={"email": "not-an-email", "password": "Password123!"},
        )
        duplicate = self._post(
            client,
            "/api/auth/register",
            json={"email": "existing@example.com", "password": "Password123!"},
        )

        self.assertEqual(invalid.status_code, 400, invalid.get_data(as_text=True))
        self.assertEqual(duplicate.status_code, 400, duplicate.get_data(as_text=True))
        self.assertEqual(
            (invalid.get_json() or {}).get("errors"),
            (duplicate.get_json() or {}).get("errors"),
        )

    def test_register_normalizes_email_and_rejects_case_variant_duplicate(self):
        first_client = self.app.test_client()
        first = self._post(
            first_client,
            "/api/auth/register",
            json={"email": "User@Example.COM", "password": "Password123!"},
        )
        self.assertEqual(first.status_code, 201, first.get_data(as_text=True))
        self.assertEqual(((first.get_json() or {}).get("user") or {}).get("email"), "user@example.com")

        second_client = self.app.test_client()
        duplicate = self._post(
            second_client,
            "/api/auth/register",
            json={"email": "user@example.com", "password": "Password123!"},
        )
        self.assertEqual(duplicate.status_code, 400, duplicate.get_data(as_text=True))

        with self.app.app_context():
            users = self.User.query.all()
            self.assertEqual(len(users), 1)
            self.assertEqual(users[0].email, "user@example.com")

    def test_register_rejects_malformed_email_with_invalid_domain_labels(self):
        client = self.app.test_client()

        for raw_email in ("user@.example.com", "user@example..com", "user@example-.com"):
            with self.subTest(raw_email=raw_email):
                res = self._post(
                    client,
                    "/api/auth/register",
                    json={"email": raw_email, "password": "Password123!"},
                )
                self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
                self.assertEqual(
                    (res.get_json() or {}).get("errors"),
                    ["Unable to create account with that email address."],
                )

    def test_register_rejects_password_shorter_than_8_characters(self):
        client = self.app.test_client()

        res = self._post(
            client,
            "/api/auth/register",
            json={"email": "short-pass@example.com", "password": "short"},
        )

        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        self.assertEqual(
            (res.get_json() or {}).get("errors"),
            ["Password must be at least 8 characters."],
        )

        with self.app.app_context():
            self.assertEqual(self.User.query.count(), 0)

    def test_register_sets_permanent_session_cookie_and_me_succeeds(self):
        client = self.app.test_client()

        res = self._post(
            client,
            "/api/auth/register",
            json={"email": "persistent@example.com", "password": "Password123!"},
        )

        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))

        me_res = client.get("/api/auth/me")
        self.assertEqual(me_res.status_code, 200, me_res.get_data(as_text=True))
        self.assertEqual(((me_res.get_json() or {}).get("user") or {}).get("email"), "persistent@example.com")

        session_cookie = client.get_cookie(self.app.config.get("SESSION_COOKIE_NAME", "session"))
        self.assertIsNotNone(session_cookie)
        self.assertIsNotNone(session_cookie.expires)


if __name__ == "__main__":
    unittest.main()
