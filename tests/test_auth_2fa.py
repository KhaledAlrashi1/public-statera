import json
import unittest
from datetime import datetime, timedelta, timezone

import pyotp

from preflight_base import PreflightApiTestBase


class AuthTwoFactorTests(PreflightApiTestBase):
    def _setup_2fa(self, client):
        res = self._post(client, "/api/auth/2fa/setup", json={})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("secret_b32"))
        self.assertTrue(payload.get("qr_data_uri", "").startswith("data:image/png;base64,"))
        backup_codes = payload.get("backup_codes") or []
        self.assertEqual(len(backup_codes), 8)
        return payload

    def _confirm_2fa(self, client, secret_b32: str):
        code = pyotp.TOTP(secret_b32).now()
        res = self._post(client, "/api/auth/2fa/confirm", json={"code": code})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertTrue((res.get_json() or {}).get("ok"))

    def test_setup_stores_secret_and_hashed_backup_codes(self):
        user_id = self._create_user("twofa-setup@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "twofa-setup@example.com", "Password123!")
        payload = self._setup_2fa(client)

        with self.app.app_context():
            user = self.db.session.get(self.User, user_id)
            self.assertIsNotNone(user)
            self.assertEqual(user.totp_secret, payload["secret_b32"])
            self.assertFalse(bool(user.totp_enabled))
            backup_hashes = json.loads(user.totp_backup_codes_json or "[]")
            self.assertEqual(len(backup_hashes), 8)
            self.assertTrue(all(str(h).startswith("$2") for h in backup_hashes))
            self.assertNotIn(payload["backup_codes"][0], backup_hashes)

    def test_confirm_enables_2fa_with_valid_code(self):
        user_id = self._create_user("twofa-confirm@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "twofa-confirm@example.com", "Password123!")
        setup = self._setup_2fa(client)
        self._confirm_2fa(client, setup["secret_b32"])

        with self.app.app_context():
            user = self.db.session.get(self.User, user_id)
            self.assertTrue(bool(user.totp_enabled))

    def test_login_requires_2fa_and_verify_completes_session(self):
        self._create_user("twofa-login@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "twofa-login@example.com", "Password123!")
        setup = self._setup_2fa(setup_client)
        self._confirm_2fa(setup_client, setup["secret_b32"])
        self._post(setup_client, "/api/auth/logout")

        client = self.app.test_client()
        login = self._post(client, "/api/auth/login", json={"email": "twofa-login@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertTrue((login.get_json() or {}).get("requires_2fa"))

        before = client.get("/api/auth/profile")
        self.assertEqual(before.status_code, 401, before.get_data(as_text=True))

        wrong = self._post(client, "/api/auth/2fa/verify", json={"code": "111111"})
        self.assertEqual(wrong.status_code, 401, wrong.get_data(as_text=True))
        self.assertEqual((wrong.get_json() or {}).get("code"), "INVALID_TOTP_CODE")

        verify = self._post(client, "/api/auth/2fa/verify", json={"code": pyotp.TOTP(setup["secret_b32"]).now()})
        self.assertEqual(verify.status_code, 200, verify.get_data(as_text=True))
        self.assertTrue((verify.get_json() or {}).get("ok"))

        after = client.get("/api/auth/profile")
        self.assertEqual(after.status_code, 200, after.get_data(as_text=True))

    def test_backup_code_works_once(self):
        self._create_user("twofa-backup@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "twofa-backup@example.com", "Password123!")
        setup = self._setup_2fa(setup_client)
        self._confirm_2fa(setup_client, setup["secret_b32"])
        backup_code = (setup.get("backup_codes") or [None])[0]
        self.assertTrue(backup_code)
        self._post(setup_client, "/api/auth/logout")

        client = self.app.test_client()
        login = self._post(client, "/api/auth/login", json={"email": "twofa-backup@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertTrue((login.get_json() or {}).get("requires_2fa"))

        first = self._post(client, "/api/auth/2fa/verify", json={"type": "backup", "code": backup_code})
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))
        self.assertTrue((first.get_json() or {}).get("ok"))
        self._post(client, "/api/auth/logout")

        second_login = self._post(client, "/api/auth/login", json={"email": "twofa-backup@example.com", "password": "Password123!"})
        self.assertEqual(second_login.status_code, 200, second_login.get_data(as_text=True))
        self.assertTrue((second_login.get_json() or {}).get("requires_2fa"))
        second = self._post(client, "/api/auth/2fa/verify", json={"type": "backup", "code": backup_code})
        self.assertEqual(second.status_code, 401, second.get_data(as_text=True))
        self.assertEqual((second.get_json() or {}).get("code"), "INVALID_TOTP_CODE")

    def test_backup_code_warning_when_low(self):
        user_id = self._create_user("twofa-low-backup@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "twofa-low-backup@example.com", "Password123!")
        setup = self._setup_2fa(setup_client)
        self._confirm_2fa(setup_client, setup["secret_b32"])

        with self.app.app_context():
            user = self.db.session.get(self.User, user_id)
            codes = ["low-one", "low-two"]
            hashes = [self.bcrypt.generate_password_hash(code).decode("utf-8") for code in codes]
            user.totp_backup_codes_json = json.dumps(hashes)
            self.db.session.commit()

        self._post(setup_client, "/api/auth/logout")
        client = self.app.test_client()
        login = self._post(client, "/api/auth/login", json={"email": "twofa-low-backup@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertTrue((login.get_json() or {}).get("requires_2fa"))

        verify = self._post(client, "/api/auth/2fa/verify", json={"type": "backup", "code": "low-one"})
        self.assertEqual(verify.status_code, 200, verify.get_data(as_text=True))
        payload = verify.get_json() or {}
        self.assertEqual(payload.get("warning"), "BACKUP_CODES_LOW")
        self.assertEqual(payload.get("backup_codes_remaining"), 1)

    def test_pending_2fa_expired_returns_410(self):
        self._create_user("twofa-expired@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "twofa-expired@example.com", "Password123!")
        setup = self._setup_2fa(setup_client)
        self._confirm_2fa(setup_client, setup["secret_b32"])
        self._post(setup_client, "/api/auth/logout")

        client = self.app.test_client()
        login = self._post(client, "/api/auth/login", json={"email": "twofa-expired@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertTrue((login.get_json() or {}).get("requires_2fa"))

        with client.session_transaction() as sess:
            sess["pending_2fa_at"] = int((datetime.now(timezone.utc) - timedelta(minutes=10)).timestamp())

        verify = self._post(client, "/api/auth/2fa/verify", json={"code": pyotp.TOTP(setup["secret_b32"]).now()})
        self.assertEqual(verify.status_code, 410, verify.get_data(as_text=True))
        self.assertEqual((verify.get_json() or {}).get("code"), "PENDING_2FA_EXPIRED")

    def test_disable_2fa_requires_password_and_code(self):
        user_id = self._create_user("twofa-disable@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "twofa-disable@example.com", "Password123!")
        setup = self._setup_2fa(client)
        self._confirm_2fa(client, setup["secret_b32"])

        wrong_pw = self._post(client, "/api/auth/2fa/disable", json={"password": "Wrong!", "code": pyotp.TOTP(setup["secret_b32"]).now()})
        self.assertEqual(wrong_pw.status_code, 401, wrong_pw.get_data(as_text=True))

        wrong_code = self._post(client, "/api/auth/2fa/disable", json={"password": "Password123!", "code": "123456"})
        self.assertEqual(wrong_code.status_code, 401, wrong_code.get_data(as_text=True))
        self.assertEqual((wrong_code.get_json() or {}).get("code"), "INVALID_TOTP_CODE")

        ok = self._post(client, "/api/auth/2fa/disable", json={"password": "Password123!", "code": pyotp.TOTP(setup["secret_b32"]).now()})
        self.assertEqual(ok.status_code, 200, ok.get_data(as_text=True))
        self.assertTrue((ok.get_json() or {}).get("ok"))

        with self.app.app_context():
            user = self.db.session.get(self.User, user_id)
            self.assertFalse(bool(user.totp_enabled))
            self.assertIsNone(user.totp_secret)
            self.assertIsNone(user.totp_backup_codes_json)

    def test_setup_rejects_when_already_enabled(self):
        self._create_user("twofa-enabled@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "twofa-enabled@example.com", "Password123!")
        setup = self._setup_2fa(client)
        self._confirm_2fa(client, setup["secret_b32"])

        repeat = self._post(client, "/api/auth/2fa/setup", json={})
        self.assertEqual(repeat.status_code, 400, repeat.get_data(as_text=True))
        self.assertEqual((repeat.get_json() or {}).get("code"), "TOTP_ALREADY_ENABLED")

    def test_verify_rate_limited_after_five_attempts(self):
        self._create_user("twofa-ratelimit@example.com", "Password123!")
        setup_client = self.app.test_client()
        self._login(setup_client, "twofa-ratelimit@example.com", "Password123!")
        setup = self._setup_2fa(setup_client)
        self._confirm_2fa(setup_client, setup["secret_b32"])
        self._post(setup_client, "/api/auth/logout")

        client = self.app.test_client()
        login = self._post(client, "/api/auth/login", json={"email": "twofa-ratelimit@example.com", "password": "Password123!"})
        self.assertEqual(login.status_code, 200, login.get_data(as_text=True))
        self.assertTrue((login.get_json() or {}).get("requires_2fa"))

        # First five attempts should be processed (invalid code → 401) and count toward the limit.
        for attempt in range(5):
            res = self._post(client, "/api/auth/2fa/verify", json={"code": "000000"})
            self.assertEqual(res.status_code, 401, f"attempt {attempt+1}: {res.get_data(as_text=True)}")

        sixth = self._post(client, "/api/auth/2fa/verify", json={"code": "000000"})
        self.assertEqual(sixth.status_code, 429, sixth.get_data(as_text=True))
        payload = sixth.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertIn("Rate limit exceeded", payload.get("error", ""))
        self.assertEqual(sixth.headers.get("X-RateLimit-Limit"), "5")
        self.assertEqual(sixth.headers.get("X-RateLimit-Remaining"), "0")
        self.assertEqual(sixth.headers.get("Retry-After"), "60")


if __name__ == "__main__":
    unittest.main()
