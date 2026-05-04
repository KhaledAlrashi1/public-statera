import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class WorkerTaskTests(PreflightApiTestBase):
    @classmethod
    def setUpClass(cls):
        try:
            from backend.worker import celery_app
        except Exception as exc:
            raise unittest.SkipTest(f"Celery is unavailable: {exc}")

        super().setUpClass()

        cls._celery_app = celery_app
        cls._prev_task_always_eager = bool(celery_app.conf.task_always_eager)
        cls._prev_task_eager_propagates = bool(celery_app.conf.task_eager_propagates)
        celery_app.conf.update(
            task_always_eager=True,
            task_eager_propagates=True,
        )

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "_celery_app"):
            cls._celery_app.conf.update(
                task_always_eager=cls._prev_task_always_eager,
                task_eager_propagates=cls._prev_task_eager_propagates,
            )
        super().tearDownClass()

    def test_cleanup_rate_limiter_task_calls_cleanup(self):
        from backend.tasks import cleanup_rate_limiter

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.security_ops._rate_limiter.cleanup"
        ) as mock_cleanup:
            result = cleanup_rate_limiter.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result, {"status": "ok"})
        mock_cleanup.assert_called_once_with()

    def test_cleanup_account_tokens_task_returns_counts(self):
        from backend.tasks import cleanup_account_tokens

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.routes.auth.cleanup_account_action_tokens",
            return_value=(3, 1),
        ) as mock_cleanup:
            result = cleanup_account_tokens.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result, {"expired_deleted": 3, "used_deleted": 1})
        mock_cleanup.assert_called_once_with()

    def test_cleanup_security_data_task_reads_config(self):
        from backend.tasks import cleanup_security_data

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.security_ops.cleanup_security_data",
            return_value=7,
        ) as mock_cleanup:
            previous_security_days = self.app.config.get("SECURITY_EVENTS_RETENTION_DAYS")
            try:
                self.app.config["SECURITY_EVENTS_RETENTION_DAYS"] = 123
                result = cleanup_security_data.apply()
            finally:
                self.app.config["SECURITY_EVENTS_RETENTION_DAYS"] = previous_security_days

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result, {"security_events_deleted": 7})
        mock_cleanup.assert_called_once_with(
            security_events_days=123,
        )

    def test_tasks_are_idempotent_on_zero_deletions(self):
        from backend.tasks import cleanup_memorized_transactions

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.lib.suggestions.prune_all_stale_memorized_transactions",
            return_value=0,
        ) as mock_prune:
            result = cleanup_memorized_transactions.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["memorized_deleted"], 0)
        mock_prune.assert_called_once_with()

    def test_rebuild_dashboard_snapshots_task_returns_summary(self):
        from backend.tasks import rebuild_dashboard_snapshots

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks.execute_rebuild_dashboard_snapshots",
            return_value={"users_processed": 2, "snapshots_rebuilt": 2, "failures": 0, "months_count": 24},
        ) as mock_exec:
            previous_months = self.app.config.get("DASHBOARD_SNAPSHOT_MONTHS")
            try:
                self.app.config["DASHBOARD_SNAPSHOT_MONTHS"] = 24
                result = rebuild_dashboard_snapshots.apply()
            finally:
                self.app.config["DASHBOARD_SNAPSHOT_MONTHS"] = previous_months

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["snapshots_rebuilt"], 2)
        mock_exec.assert_called_once_with(months_count=24)

    def test_rebuild_dashboard_snapshots_task_skips_when_lock_is_held(self):
        from backend.tasks import rebuild_dashboard_snapshots

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks._acquire_interval_task_lock",
            return_value=(False, "slot:987"),
        ) as mock_lock, patch(
            "backend.tasks.execute_rebuild_dashboard_snapshots"
        ) as mock_exec:
            result = rebuild_dashboard_snapshots.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["status"], "skipped")
        self.assertEqual(result.result["reason"], "already_ran")
        self.assertEqual(result.result["period_key"], "slot:987")
        mock_lock.assert_called_once()
        mock_exec.assert_not_called()

    def test_generate_activation_report_artifact_task_reads_config(self):
        from backend.tasks import generate_activation_report_artifact

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks.execute_generate_activation_report_artifact",
            return_value={
                "days": 14,
                "path": "reports/activation-report.latest.json",
                "generated_at": "2026-03-06T12:00:00+00:00",
            },
        ) as mock_exec:
            previous_days = self.app.config.get("ACTIVATION_REPORT_DAYS")
            previous_path = self.app.config.get("ACTIVATION_REPORT_PATH")
            try:
                self.app.config["ACTIVATION_REPORT_DAYS"] = 14
                self.app.config["ACTIVATION_REPORT_PATH"] = "reports/activation-report.latest.json"
                result = generate_activation_report_artifact.apply()
            finally:
                self.app.config["ACTIVATION_REPORT_DAYS"] = previous_days
                self.app.config["ACTIVATION_REPORT_PATH"] = previous_path

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["days"], 14)
        mock_exec.assert_called_once_with(
            days=14,
            path="reports/activation-report.latest.json",
        )

    def test_generate_activation_report_artifact_task_skips_when_lock_is_held(self):
        from backend.tasks import generate_activation_report_artifact

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks._acquire_interval_task_lock",
            return_value=(False, "slot:456"),
        ) as mock_lock, patch(
            "backend.tasks.execute_generate_activation_report_artifact"
        ) as mock_exec:
            result = generate_activation_report_artifact.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["status"], "skipped")
        self.assertEqual(result.result["reason"], "already_ran")
        self.assertEqual(result.result["period_key"], "slot:456")
        mock_lock.assert_called_once()
        mock_exec.assert_not_called()

    def test_check_budget_alerts_task_returns_summary(self):
        from backend.tasks import check_budget_alerts

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks.execute_check_budget_alerts",
            return_value={"month": "2026-02", "alerts_created": 1, "triggered": 1},
        ) as mock_exec:
            result = check_budget_alerts.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["alerts_created"], 1)
        mock_exec.assert_called_once_with()

    def test_check_budget_alerts_task_skips_when_lock_is_held(self):
        from backend.tasks import check_budget_alerts

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks._acquire_daily_task_lock",
            return_value=(False, "2026-02-01"),
        ) as mock_lock, patch(
            "backend.tasks.execute_check_budget_alerts"
        ) as mock_exec:
            result = check_budget_alerts.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["status"], "skipped")
        self.assertEqual(result.result["reason"], "already_ran")
        self.assertEqual(result.result["period_key"], "2026-02-01")
        mock_lock.assert_called_once_with("check_budget_alerts")
        mock_exec.assert_not_called()

    def test_check_expiring_consents_task_returns_summary(self):
        from backend.tasks import check_expiring_consents

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks.execute_check_expiring_consents",
            return_value={"window_days": 7, "expiring_consents": 2, "notifications_created": 1},
        ) as mock_exec:
            result = check_expiring_consents.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["notifications_created"], 1)
        mock_exec.assert_called_once_with(window_days=7)

    def test_check_expiring_consents_task_skips_when_lock_is_held(self):
        from backend.tasks import check_expiring_consents

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks._acquire_daily_task_lock",
            return_value=(False, "2026-03-05"),
        ) as mock_lock, patch(
            "backend.tasks.execute_check_expiring_consents"
        ) as mock_exec:
            result = check_expiring_consents.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["status"], "skipped")
        self.assertEqual(result.result["reason"], "already_ran")
        self.assertEqual(result.result["period_key"], "2026-03-05")
        mock_lock.assert_called_once_with("check_expiring_consents")
        mock_exec.assert_not_called()

    def test_cleanup_account_tokens_task_skips_when_lock_is_held(self):
        from backend.tasks import cleanup_account_tokens

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.tasks._acquire_interval_task_lock",
            return_value=(False, "slot:123"),
        ) as mock_lock, patch(
            "backend.routes.auth.cleanup_account_action_tokens"
        ) as mock_cleanup:
            result = cleanup_account_tokens.apply()

        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.result["status"], "skipped")
        self.assertEqual(result.result["reason"], "already_ran")
        self.assertEqual(result.result["period_key"], "slot:123")
        mock_lock.assert_called_once()
        mock_cleanup.assert_not_called()

    def test_task_retries_on_db_error(self):
        from celery.exceptions import Retry
        from backend.tasks import cleanup_account_tokens

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.routes.auth.cleanup_account_action_tokens",
            side_effect=RuntimeError("db connection failed"),
        ):
            with self.assertRaises((Retry, RuntimeError)):
                cleanup_account_tokens.apply(throw=True)

    def test_task_failure_signal_captures_exception_for_sentry(self):
        from backend import tasks as task_module

        class _Scope:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def __init__(self):
                self.tags = []
                self.contexts = []
                self.extras = []

            def set_tag(self, *args, **kwargs):
                self.tags.append((args, kwargs))
                return None

            def set_context(self, *args, **kwargs):
                self.contexts.append((args, kwargs))
                return None

            def set_extra(self, *args, **kwargs):
                self.extras.append((args, kwargs))
                return None

        scope = _Scope()
        with patch("backend.tasks._flask_app", return_value=self.app) as mock_flask_app, patch(
            "backend.tasks.mark_worker_task_finished"
        ) as mock_mark_finished, patch.object(
            task_module,
            "sentry_sdk",
        ) as mock_sentry:
            mock_sentry.push_scope.return_value = scope
            exc = RuntimeError("boom")
            exc.__traceback__ = None

            task_module._record_worker_task_failure(
                task_id="task-123",
                exception=exc,
                sender="backend.tasks.cleanup_rate_limiter",
                einfo=type("_EInfo", (), {"traceback": "Traceback: boom"})(),
            )

        mock_mark_finished.assert_called_once()
        self.assertIn((("celery_task", "backend.tasks.cleanup_rate_limiter"), {}), scope.tags)
        self.assertIn(
            (("celery_task", {"task_name": "backend.tasks.cleanup_rate_limiter", "task_id": "task-123"}), {}),
            scope.contexts,
        )
        self.assertIn((("celery_traceback", "Traceback: boom"), {}), scope.extras)
        mock_sentry.capture_exception.assert_called_once_with(exc)

    def test_untracked_task_failure_still_reports_to_sentry(self):
        from backend import tasks as task_module

        class _Scope:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def __init__(self):
                self.contexts = []

            def set_tag(self, *args, **kwargs):
                return None

            def set_context(self, *args, **kwargs):
                self.contexts.append((args, kwargs))
                return None

            def set_extra(self, *args, **kwargs):
                return None

        scope = _Scope()
        with patch("backend.tasks._flask_app", return_value=self.app) as mock_flask_app, patch(
            "backend.tasks.mark_worker_task_finished"
        ) as mock_mark_finished, patch.object(
            task_module,
            "sentry_sdk",
        ) as mock_sentry:
            mock_sentry.push_scope.return_value = scope
            exc = RuntimeError("background boom")

            task_module._record_worker_task_failure(
                task_id="task-999",
                exception=exc,
                sender="backend.tasks.future_task",
                einfo=type("_EInfo", (), {"traceback": "Traceback: future boom"})(),
            )

        mock_mark_finished.assert_not_called()
        mock_flask_app.assert_called_once_with()
        self.assertIn(
            (("celery_task", {"task_name": "backend.tasks.future_task", "task_id": "task-999"}), {}),
            scope.contexts,
        )
        mock_sentry.capture_exception.assert_called_once_with(exc)


if __name__ == "__main__":
    unittest.main()
