import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from backend.email_service import render_email_template, send_email


class EmailServiceTests(unittest.TestCase):
    def setUp(self):
        self._env_keys = [
            "PERSONAL_STATERA_DEV_MODE",
            "DINARTRACK_DEV_MODE",
            "FLASK_ENV",
            "EMAIL_DEV_LOG_PATH",
            "POSTMARK_API_KEY",
            "MAIL_FROM_ADDRESS",
            "MAIL_FROM",
        ]
        self._prev_env = {key: os.environ.get(key) for key in self._env_keys}

    def tearDown(self):
        for key, value in self._prev_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_send_email_writes_dev_log_in_dev_mode(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = os.path.join(tmpdir, "email_dev.log")
            os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
            os.environ["FLASK_ENV"] = "development"
            os.environ["EMAIL_DEV_LOG_PATH"] = log_path

            ok = send_email(
                to="user@example.com",
                subject="Test Subject",
                html_body="<p>Hello</p>",
                text_body="Hello",
            )

            self.assertTrue(ok)
            self.assertTrue(os.path.exists(log_path))
            with open(log_path, "r", encoding="utf-8") as handle:
                content = handle.read()
            self.assertIn("user@example.com", content)
            self.assertIn("Test Subject", content)

    def test_send_email_uses_postmark_payload_in_production(self):
        os.environ["PERSONAL_STATERA_DEV_MODE"] = "false"
        os.environ.pop("DINARTRACK_DEV_MODE", None)
        os.environ["FLASK_ENV"] = "production"
        os.environ["POSTMARK_API_KEY"] = "pm_test_token"
        os.environ["MAIL_FROM_ADDRESS"] = "no-reply@example.com"

        mock_client = Mock()
        mock_client.emails.send = Mock(return_value={"ErrorCode": 0})

        with patch("backend.email_service._POSTMARK_AVAILABLE", True), patch(
            "backend.email_service.PostmarkClient",
            return_value=mock_client,
        ) as mock_ctor:
            ok = send_email(
                to="user@example.com",
                subject="Budget Alert",
                html_body="<p>Hello</p>",
                text_body="Hello",
            )

        self.assertTrue(ok)
        mock_ctor.assert_called_once_with(server_token="pm_test_token")
        mock_client.emails.send.assert_called_once()
        kwargs = mock_client.emails.send.call_args.kwargs
        self.assertEqual(kwargs["From"], "no-reply@example.com")
        self.assertEqual(kwargs["To"], "user@example.com")
        self.assertEqual(kwargs["Subject"], "Budget Alert")

    def test_render_email_templates(self):
        html_budget, text_budget = render_email_template(
            "budget_alert",
            {
                "ratio_pct": "90.0",
                "category": "Food",
                "month_label": "March 2026",
                "spent_kd": "90.000",
                "budget_kd": "100.000",
            },
        )
        self.assertIn("Food", html_budget)
        self.assertIn("March 2026", text_budget)

        html_consent, text_consent = render_email_template(
            "consent_expiry",
            {
                "institution_name": "NBK",
                "days_remaining": 7,
                "expires_on": "2026-03-12",
            },
        )
        self.assertIn("NBK", html_consent)
        self.assertIn("2026-03-12", text_consent)

        html_goal, text_goal = render_email_template(
            "goal_milestone",
            {
                "goal_name": "Emergency Fund",
                "milestone_pct": 50,
                "current_kd": "500.000",
                "target_kd": "1000.000",
            },
        )
        self.assertIn("Emergency Fund", html_goal)
        self.assertIn("50", text_goal)


if __name__ == "__main__":
    unittest.main()
