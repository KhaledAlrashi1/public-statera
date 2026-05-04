import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone

from preflight_base import PreflightApiTestBase


class ActivationReportingTests(PreflightApiTestBase):
    def _add_user(self, email: str, created_at: datetime) -> int:
        with self.app.app_context():
            user = self.User(
                email=email,
                password_hash="test-hash",
                created_at=created_at,
            )
            self.db.session.add(user)
            self.db.session.flush()
            user_id = user.id
            self.db.session.commit()
            return int(user_id)

    def _add_event(self, user_id: int, event_name: str, event_ts: datetime) -> None:
        from backend.models import ProductEvent

        with self.app.app_context():
            self.db.session.add(
                ProductEvent(
                    user_id=user_id,
                    event_name=event_name,
                    event_ts=event_ts,
                )
            )
            self.db.session.commit()

    def test_build_activation_report_summarizes_funnel(self):
        fixed_now = datetime(2026, 3, 6, 12, 0, tzinfo=timezone.utc)
        user_1 = self._add_user("activation-1@example.com", datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc))
        user_2 = self._add_user("activation-2@example.com", datetime(2026, 3, 2, 8, 0, tzinfo=timezone.utc))
        user_3 = self._add_user("activation-3@example.com", datetime(2026, 3, 3, 8, 0, tzinfo=timezone.utc))
        old_user = self._add_user("activation-old@example.com", datetime(2026, 2, 20, 8, 0, tzinfo=timezone.utc))

        self._add_event(user_1, "signup_completed", datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc))
        self._add_event(user_1, "app_opened", datetime(2026, 3, 1, 9, 5, tzinfo=timezone.utc))
        self._add_event(user_1, "demo_data_loaded", datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc))
        self._add_event(user_1, "first_budget_set", datetime(2026, 3, 2, 8, 0, tzinfo=timezone.utc))
        self._add_event(user_1, "import_completed", datetime(2026, 3, 3, 12, 0, tzinfo=timezone.utc))
        self._add_event(user_1, "demo_data_replaced_with_import", datetime(2026, 3, 3, 12, 1, tzinfo=timezone.utc))

        self._add_event(user_2, "signup_completed", datetime(2026, 3, 2, 10, 0, tzinfo=timezone.utc))
        self._add_event(user_2, "app_opened", datetime(2026, 3, 2, 10, 10, tzinfo=timezone.utc))
        self._add_event(user_2, "first_budget_set", datetime(2026, 3, 2, 11, 0, tzinfo=timezone.utc))

        self._add_event(user_3, "signup_completed", datetime(2026, 3, 3, 9, 0, tzinfo=timezone.utc))
        self._add_event(user_3, "bank.connected", datetime(2026, 3, 4, 9, 0, tzinfo=timezone.utc))

        self._add_event(old_user, "signup_completed", datetime(2026, 2, 20, 9, 0, tzinfo=timezone.utc))
        self._add_event(old_user, "demo_data_loaded", datetime(2026, 2, 20, 10, 0, tzinfo=timezone.utc))

        with self.app.app_context():
            from backend.activation_reporting import build_activation_report

            report = build_activation_report(days=7, now=fixed_now)

        summary = report["summary"]
        self.assertEqual(summary["users_created"], 3)
        self.assertEqual(summary["signup_completed"], 3)
        self.assertEqual(summary["app_opened"], 2)
        self.assertEqual(summary["first_budget_set"], 2)
        self.assertEqual(summary["activated_any"], 2)
        self.assertEqual(summary["activation_rate_from_signup_pct"], 66.7)
        self.assertEqual(summary["budget_rate_from_signup_pct"], 66.7)
        self.assertEqual(summary["median_hours_signup_to_activation"], 12.5)
        self.assertEqual(summary["demo_to_import_users"], 1)

        self.assertEqual(report["activation_paths"]["demo_data_loaded"], 1)
        self.assertEqual(report["activation_paths"]["import_completed"], 1)
        self.assertEqual(report["activation_paths"]["bank_connected"], 1)
        self.assertEqual(report["activation_paths"]["demo_replaced_with_import"], 1)

        daily = {row["date"]: row for row in report["daily"]}
        self.assertEqual(daily["2026-03-01"]["users_created"], 1)
        self.assertEqual(daily["2026-03-01"]["activated_any"], 1)
        self.assertEqual(daily["2026-03-02"]["first_budget_set"], 2)
        self.assertEqual(daily["2026-03-03"]["import_completed"], 1)
        self.assertEqual(daily["2026-03-03"]["demo_replaced_with_import"], 1)
        self.assertEqual(daily["2026-03-04"]["bank_connected"], 1)

    def test_activation_report_cli_supports_json_output(self):
        now = datetime.now(timezone.utc)
        user_id = self._add_user("activation-cli@example.com", now)
        self._add_event(user_id, "signup_completed", now)
        self._add_event(user_id, "demo_data_loaded", now)

        runner = self.app.test_cli_runner()
        result = runner.invoke(args=["activation-report", "--days", "30", "--json-output"])

        self.assertEqual(result.exit_code, 0, result.output)
        payload = json.loads(result.output)
        self.assertEqual(payload["summary"]["signup_completed"], 1)
        self.assertEqual(payload["summary"]["activated_any"], 1)
        self.assertEqual(payload["activation_paths"]["demo_data_loaded"], 1)

    def test_activation_report_cli_can_write_json_artifact(self):
        now = datetime.now(timezone.utc)
        user_id = self._add_user("activation-file@example.com", now)
        self._add_event(user_id, "signup_completed", now)
        self._add_event(user_id, "demo_data_loaded", now)
        self._add_event(user_id, "import_completed", now)
        self._add_event(user_id, "demo_data_replaced_with_import", now)

        runner = self.app.test_cli_runner()
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "reports" / "activation.json"
            result = runner.invoke(args=["activation-report", "--days", "30", "--output", str(output_path)])

            self.assertEqual(result.exit_code, 0, result.output)
            self.assertIn("Wrote activation report JSON", result.output)
            self.assertTrue(output_path.exists())
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["summary"]["signup_completed"], 1)
        self.assertEqual(payload["summary"]["demo_to_import_users"], 1)
        self.assertEqual(payload["activation_paths"]["demo_replaced_with_import"], 1)


if __name__ == "__main__":
    unittest.main()
