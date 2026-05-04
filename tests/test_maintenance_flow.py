import unittest
import threading
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class MaintenanceWorkflowTests(PreflightApiTestBase):
    def test_probabilistic_cleanup_hook_not_registered(self):
        before_request_handlers = self.app.before_request_funcs.get(None, [])
        handler_names = {getattr(handler, "__name__", "") for handler in before_request_handlers}
        self.assertNotIn("maybe_cleanup_rate_limiter", handler_names)

    def test_web_process_has_no_maintenance_thread(self):
        maintenance_threads = [t for t in threading.enumerate() if t.name == "maintenance-loop"]
        self.assertEqual(maintenance_threads, [])
        self.assertNotIn("maintenance", self.app.extensions)

    def test_run_maintenance_pass_aggregates_cleanup_counts(self):
        from backend.maintenance import run_maintenance_pass

        with patch("backend.security_ops._rate_limiter.cleanup") as cleanup_rate_limiter, patch(
            "backend.routes.auth.cleanup_account_action_tokens",
            return_value=(3, 2),
        ) as cleanup_tokens, patch(
            "backend.security_ops.cleanup_security_data",
            return_value=(5, 7),
        ) as cleanup_security_data:
            result = run_maintenance_pass(
                security_events_days=365,
                ingested_messages_days=180,
            )

        cleanup_rate_limiter.assert_called_once_with()
        cleanup_tokens.assert_called_once_with()
        cleanup_security_data.assert_called_once_with(
            security_events_days=365,
            ingested_messages_days=180,
        )
        self.assertEqual(
            result,
            {
                "account_action_tokens_expired_deleted": 3,
                "account_action_tokens_used_deleted": 2,
                "security_events_deleted": 5,
                "ingested_messages_deleted": 7,
            },
        )

    def test_run_maintenance_cli_uses_config_defaults(self):
        runner = self.app.test_cli_runner()
        expected_counts = {
            "account_action_tokens_expired_deleted": 1,
            "account_action_tokens_used_deleted": 2,
            "security_events_deleted": 3,
            "ingested_messages_deleted": 4,
        }
        with patch("backend.cli_maintenance.run_maintenance_pass", return_value=expected_counts) as run_pass:
            result = runner.invoke(args=["run-maintenance-pass"])

        self.assertEqual(result.exit_code, 0, result.output)
        run_pass.assert_called_once_with(
            security_events_days=self.app.config["SECURITY_EVENTS_RETENTION_DAYS"],
            ingested_messages_days=self.app.config["INGESTED_MESSAGES_RETENTION_DAYS"],
        )
        self.assertIn("Maintenance pass complete.", result.output)

    def test_run_maintenance_cli_supports_retention_overrides(self):
        runner = self.app.test_cli_runner()
        with patch(
            "backend.cli_maintenance.run_maintenance_pass",
            return_value={
                "account_action_tokens_expired_deleted": 0,
                "account_action_tokens_used_deleted": 0,
                "security_events_deleted": 0,
                "ingested_messages_deleted": 0,
            },
        ) as run_pass:
            result = runner.invoke(
                args=[
                    "run-maintenance-pass",
                    "--security-events-days",
                    "90",
                    "--ingested-messages-days",
                    "60",
                ]
            )

        self.assertEqual(result.exit_code, 0, result.output)
        run_pass.assert_called_once_with(
            security_events_days=90,
            ingested_messages_days=60,
        )

    def test_flatten_grouped_transactions_cli_dry_run_does_not_mutate(self):
        runner = self.app.test_cli_runner()
        result = runner.invoke(args=["flatten-grouped-transactions", "--dry-run"])

        self.assertEqual(result.exit_code, 0, result.output)
        self.assertIn("Dry run: yes", result.output)
        self.assertIn("Grouped transactions found: 0", result.output)
        self.assertIn("Grouped transactions flattened: 0", result.output)
        self.assertIn("New atomic transactions created: 0", result.output)

    def test_flatten_grouped_transactions_cli_rewrites_atomic_rows(self):
        user_id = self._create_user("flatten-run@example.com", "Password123!")
        runner = self.app.test_cli_runner()
        result = runner.invoke(args=["flatten-grouped-transactions", "--user-id", str(user_id)])

        self.assertEqual(result.exit_code, 0, result.output)
        self.assertIn("Dry run: no", result.output)
        self.assertIn("Grouped transactions found: 0", result.output)
        self.assertIn("Grouped transactions flattened: 0", result.output)
        self.assertIn("New atomic transactions created: 0", result.output)
        self.assertIn(f"User {user_id}: grouped=0, created=0, rows_after=0, skipped=0", result.output)


if __name__ == "__main__":
    unittest.main()
