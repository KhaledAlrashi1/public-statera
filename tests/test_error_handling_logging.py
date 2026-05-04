import unittest
from unittest.mock import Mock, patch

from preflight_base import PreflightApiTestBase

try:
    import pandas as pd
except Exception:  # pragma: no cover - pandas is expected in test envs that cover imports
    pd = None


class WorkerHealthLoggingTests(PreflightApiTestBase):
    def test_mark_worker_task_started_logs_persistence_failures(self):
        from backend.worker_health import mark_worker_task_started

        with self.app.app_context(), patch(
            "backend.worker_health._get_or_create_task_run",
            side_effect=RuntimeError("write failed"),
        ), patch("backend.worker_health.db.session.rollback") as mock_rollback, patch(
            "backend.worker_health._get_logger",
            return_value=Mock(),
        ) as mock_get_logger:
            mark_worker_task_started("backend.tasks.cleanup_product_events")

        mock_rollback.assert_called_once()
        mock_get_logger.return_value.exception.assert_called_once()

    def test_mark_worker_task_finished_logs_persistence_failures(self):
        from backend.worker_health import mark_worker_task_finished

        with self.app.app_context(), patch(
            "backend.worker_health._get_or_create_task_run",
            side_effect=RuntimeError("write failed"),
        ), patch("backend.worker_health.db.session.rollback") as mock_rollback, patch(
            "backend.worker_health._get_logger",
            return_value=Mock(),
        ) as mock_get_logger:
            mark_worker_task_finished("backend.tasks.cleanup_product_events", status="failed", error="boom")

        mock_rollback.assert_called_once()
        mock_get_logger.return_value.exception.assert_called_once()


class ProductEventLoggingTests(PreflightApiTestBase):
    def test_product_event_payload_serialization_failures_are_logged(self):
        from backend.product_events import _to_json

        with self.app.app_context(), patch(
            "backend.product_events.json.dumps",
            side_effect=TypeError("not serializable"),
        ), patch("backend.product_events._get_logger", return_value=Mock()) as mock_get_logger:
            payload = _to_json({"bad": object()})

        self.assertIsNone(payload)
        mock_get_logger.return_value.exception.assert_called_once()


class ImportPreviewLoggingTests(unittest.TestCase):
    def test_unexpected_preview_row_failures_are_logged_and_return_row_reason(self):
        if pd is None:
            self.skipTest("pandas is required for import preview tests")

        from backend.lib.importer import _df_to_preview_rows

        df = pd.DataFrame(
            [
                {
                    "date": "2026-03-10",
                    "name": "Coffee",
                    "amount_kd": "5.250",
                    "category": "Dining",
                }
            ]
        )

        with patch(
            "backend.lib.importer._parse_amount",
            side_effect=RuntimeError("boom"),
        ), patch("backend.lib.importer._get_logger", return_value=Mock()) as mock_get_logger:
            rows, skipped, flagged_rows, skipped_rows = _df_to_preview_rows(df)

        self.assertEqual(rows, [])
        self.assertEqual(skipped, 1)
        self.assertEqual(flagged_rows, [])
        self.assertEqual(len(skipped_rows), 1)
        self.assertEqual(
            skipped_rows[0].get("reason"),
            "Failed to parse row. Check the date, amount, and transaction ID fields.",
        )
        mock_get_logger.return_value.exception.assert_called_once()


if __name__ == "__main__":
    unittest.main()
