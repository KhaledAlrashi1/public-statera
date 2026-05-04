import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class WorkerHealthApiTests(PreflightApiTestBase):
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

    def _operator_headers(self) -> dict[str, str]:
        token = "operator-token-0123456789abcdef0123456789"
        self.app.config["OPERATOR_API_TOKEN"] = token
        return {"Authorization": f"Bearer {token}"}

    def test_worker_health_requires_operator_token(self):
        client = self.app.test_client()
        self.app.config["OPERATOR_API_TOKEN"] = "operator-token-0123456789abcdef0123456789"
        res = client.get("/api/admin/worker-health")
        self.assertEqual(res.status_code, 401, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("WWW-Authenticate"), 'Bearer realm="operator"')

    def test_worker_health_returns_503_when_operator_token_not_configured(self):
        client = self.app.test_client()
        self.app.config["OPERATOR_API_TOKEN"] = ""

        res = client.get("/api/admin/worker-health")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "operator_auth_unavailable")

    def test_worker_health_lists_tracked_tasks_before_any_runs(self):
        client = self.app.test_client()

        res = client.get("/api/admin/worker-health", headers=self._operator_headers())
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        tasks = payload.get("tasks") or []
        self.assertGreater(len(tasks), 0)

        cleanup = next((task for task in tasks if task.get("task_key") == "cleanup_rate_limiter"), None)
        self.assertIsNotNone(cleanup)
        self.assertEqual(cleanup.get("last_status"), "never")
        self.assertIsNone(cleanup.get("last_started_at"))
        self.assertIsNone(cleanup.get("last_finished_at"))

    def test_worker_health_reports_last_run_after_task_executes(self):
        client = self.app.test_client()

        from backend.tasks import cleanup_rate_limiter

        with patch("backend.tasks._flask_app", return_value=self.app), patch(
            "backend.security_ops._rate_limiter.cleanup"
        ):
            result = cleanup_rate_limiter.apply()

        self.assertEqual(result.status, "SUCCESS")

        res = client.get("/api/admin/worker-health", headers=self._operator_headers())
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json() or {}
        tasks = payload.get("tasks") or []
        cleanup = next((task for task in tasks if task.get("task_name") == "backend.tasks.cleanup_rate_limiter"), None)
        self.assertIsNotNone(cleanup)
        self.assertEqual(cleanup.get("last_status"), "ok")
        self.assertIsNotNone(cleanup.get("last_started_at"))
        self.assertIsNotNone(cleanup.get("last_finished_at"))
        self.assertIsNotNone(cleanup.get("last_success_at"))
        self.assertIsNone(cleanup.get("last_failure_at"))

    def test_public_worker_health_endpoint_contract(self):
        client = self.app.test_client()
        res = client.get("/api/worker-health")
        self.assertIn(res.status_code, (200, 503), res.get_data(as_text=True))

    def test_trigger_cleanup_memorized_requires_operator_token(self):
        client = self.app.test_client()
        self.app.config["OPERATOR_API_TOKEN"] = "operator-token-0123456789abcdef0123456789"
        res = client.post("/api/admin/tasks/cleanup-memorized")
        self.assertEqual(res.status_code, 401, res.get_data(as_text=True))

    def test_trigger_cleanup_memorized_enqueues_task(self):
        client = self.app.test_client()
        headers = self._operator_headers()

        with patch("backend.tasks._flask_app", return_value=self.app), \
             patch("backend.lib.suggestions.prune_all_stale_memorized_transactions", return_value=0):
            from backend.tasks import cleanup_memorized_transactions
            with patch.object(cleanup_memorized_transactions, "delay") as mock_delay:
                mock_result = type("R", (), {"id": "fake-task-id"})()
                mock_delay.return_value = mock_result
                res = client.post("/api/admin/tasks/cleanup-memorized", headers=headers)

        self.assertEqual(res.status_code, 202, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("enqueued"))
        self.assertIsNotNone(payload.get("enqueued_at"))

    def test_trigger_cleanup_memorized_requires_operator_token_unconfigured(self):
        client = self.app.test_client()
        self.app.config["OPERATOR_API_TOKEN"] = ""
        res = client.post("/api/admin/tasks/cleanup-memorized")
        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))

        payload = res.get_json() or {}
        self.assertFalse(payload.get("ok"))
        self.assertEqual(payload.get("error_code"), "operator_auth_unavailable")
