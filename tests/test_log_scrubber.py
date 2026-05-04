"""Tests for backend.lib.log_scrubber — sensitive value redaction."""

from __future__ import annotations

import logging
import unittest


class LogScrubberTest(unittest.TestCase):
    # ------------------------------------------------------------------
    # _scrub_dict
    # ------------------------------------------------------------------

    def test_scrubs_password_key(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"password": "hunter2", "email": "user@example.com"})
        self.assertEqual(result["password"], "[REDACTED]")
        self.assertEqual(result["email"], "[REDACTED]")

    def test_scrubs_access_token(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"access_token": "tok_abc123"})
        self.assertEqual(result["access_token"], "[REDACTED]")

    def test_scrubs_name_phone_and_iban_keys(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict(
            {
                "name": "Alice Example",
                "phone": "+965 5555 1234",
                "iban": "KW81CBKU0000000000001234560101",
            }
        )
        self.assertEqual(result["name"], "[REDACTED]")
        self.assertEqual(result["phone"], "[REDACTED]")
        self.assertEqual(result["iban"], "[REDACTED]")

    def test_scrubs_totp_secret(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"totp_secret": "BASE32SECRET"})
        self.assertEqual(result["totp_secret"], "[REDACTED]")

    def test_scrubs_encryption_key(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"encryption_key": "ab" * 32})
        self.assertEqual(result["encryption_key"], "[REDACTED]")

    def test_case_insensitive_key_matching(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"PASSWORD": "secret"})
        self.assertEqual(result["PASSWORD"], "[REDACTED]")

    def test_nested_dict_scrubbing(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"user": {"password": "secret", "name": "Alice"}})
        self.assertEqual(result["user"]["password"], "[REDACTED]")
        self.assertEqual(result["user"]["name"], "[REDACTED]")

    def test_list_of_dicts_scrubbed(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"items": [{"password": "s"}, {"name": "ok"}]})
        self.assertEqual(result["items"][0]["password"], "[REDACTED]")
        self.assertEqual(result["items"][1]["name"], "[REDACTED]")

    def test_non_sensitive_keys_pass_through(self):
        from backend.lib.log_scrubber import _scrub_dict
        result = _scrub_dict({"user_id": 42, "action": "login"})
        self.assertEqual(result["user_id"], 42)
        self.assertEqual(result["action"], "login")

    def test_encrypted_value_redacted_in_string_field(self):
        """Encrypted ciphertext (enc1: prefix) in a non-sensitive field is redacted."""
        from backend.lib.log_scrubber import _scrub_dict
        fake_ct = "enc1:" + "A" * 50
        result = _scrub_dict({"description": fake_ct})
        self.assertEqual(result["description"], "[REDACTED]")

    def test_max_depth_guard(self):
        """Deeply nested dicts don't cause infinite recursion."""
        from backend.lib.log_scrubber import _scrub_dict
        d: dict = {"a": {}}
        node = d
        for _ in range(20):
            node["a"] = {"a": {}}
            node = node["a"]
        # Should not raise.
        _scrub_dict(d)

    # ------------------------------------------------------------------
    # sentry_before_send
    # ------------------------------------------------------------------

    def test_sentry_before_send_scrubs_request_data(self):
        from backend.lib.log_scrubber import sentry_before_send
        event = {
            "request": {
                "data": {"password": "hunter2", "email": "a@b.com"},
                "headers": {"Authorization": "Bearer tok"},
            }
        }
        result = sentry_before_send(event, {})
        self.assertEqual(result["request"]["data"]["password"], "[REDACTED]")
        self.assertEqual(result["request"]["data"]["email"], "[REDACTED]")
        self.assertEqual(result["request"]["headers"]["Authorization"], "[REDACTED]")

    def test_sentry_before_send_scrubs_string_bodies_and_breadcrumb_pii(self):
        from backend.lib.log_scrubber import sentry_before_send
        event = {
            "request": {
                "data": "email=user@example.com iban=KW81CBKU0000000000001234560101",
            },
            "breadcrumbs": {
                "values": [
                    {"data": {"phone": "+965 5555 1234"}},
                ]
            },
        }
        result = sentry_before_send(event, {})
        self.assertEqual(result["request"]["data"], "email=[REDACTED] iban=[REDACTED]")
        self.assertEqual(result["breadcrumbs"]["values"][0]["data"]["phone"], "[REDACTED]")

    def test_sentry_before_send_scrubs_extra(self):
        from backend.lib.log_scrubber import sentry_before_send
        event = {"extra": {"token": "abc123"}}
        result = sentry_before_send(event, {})
        self.assertEqual(result["extra"]["token"], "[REDACTED]")

    def test_sentry_before_send_returns_event_on_exception(self):
        """Scrubber must never swallow the event even if it errors internally."""
        from backend.lib.log_scrubber import sentry_before_send
        # Malformed event — should not raise.
        event = {"request": None}
        result = sentry_before_send(event, {})
        self.assertIsNotNone(result)

    # ------------------------------------------------------------------
    # _LogScrubFilter
    # ------------------------------------------------------------------

    def test_log_filter_redacts_enc1_in_message(self):
        from backend.lib.log_scrubber import _LogScrubFilter
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Storing value=enc1:" + "B" * 50, args=(), exc_info=None
        )
        f = _LogScrubFilter()
        f.filter(record)
        self.assertNotIn("enc1:", record.getMessage())
        self.assertIn("[REDACTED]", record.getMessage())

    def test_log_filter_redacts_email_iban_and_name_key_value_pairs(self):
        from backend.lib.log_scrubber import _LogScrubFilter
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg=(
                "Merchant create failed for user_id=7 "
                "name=Alice Example email=alice@example.com "
                "iban=KW81CBKU0000000000001234560101"
            ),
            args=(),
            exc_info=None,
        )
        f = _LogScrubFilter()
        f.filter(record)
        message = record.getMessage()
        self.assertIn("name=[REDACTED]", message)
        self.assertIn("email=[REDACTED]", message)
        self.assertIn("iban=[REDACTED]", message)
        self.assertNotIn("alice@example.com", message)
        self.assertNotIn("KW81CBKU0000000000001234560101", message)

    def test_log_filter_scrubs_structured_dict_messages(self):
        from backend.lib.log_scrubber import _LogScrubFilter
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg={"email": "user@example.com", "name": "Alice Example", "user_id": 42},
            args=(),
            exc_info=None,
        )
        f = _LogScrubFilter()
        f.filter(record)
        self.assertEqual(record.msg["email"], "[REDACTED]")
        self.assertEqual(record.msg["name"], "[REDACTED]")
        self.assertEqual(record.msg["user_id"], 42)

    def test_log_filter_passes_clean_messages(self):
        from backend.lib.log_scrubber import _LogScrubFilter
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Normal log message", args=(), exc_info=None
        )
        f = _LogScrubFilter()
        result = f.filter(record)
        self.assertTrue(result)
        self.assertEqual(record.getMessage(), "Normal log message")


if __name__ == "__main__":
    unittest.main()
