import json
import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy.exc import OperationalError

from preflight_base import PreflightApiTestBase


class DashboardCacheTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.user_id = self._create_user("dashboard-cache@example.com", "Password123!")

    def _login_client(self):
        client = self.app.test_client()
        self._login(client, "dashboard-cache@example.com", "Password123!")
        return client

    def _create_transaction(self, client, *, amount_kd: str = "5.000", txn_date: str = "2026-02-10"):
        res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": txn_date,
                "category": "Groceries",
                "name": "Cache Txn",
                "amount_kd": amount_kd,
            },
        )
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        item = (res.get_json() or {}).get("item") or {}
        txn_id = item.get("id")
        self.assertIsInstance(txn_id, int)
        return txn_id

    def _current_month(self) -> str:
        today = date.today()
        return f"{today.year}-{today.month:02d}"

    def _set_cache_circuit_breaker_enabled(self, enabled: bool):
        previous = self.app.config.get("ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED")
        self.app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = enabled
        return previous

    def test_dashboard_metrics_cache_hit_returns_cached_payload(self):
        client = self._login_client()
        cached_payload = {
            "months": ["2026-01"],
            "monthly": [{"month": "2026-01", "income_kd": 100.0, "expense_kd": 50.0}],
            "expense_by_category": {"2026-01": {"Groceries": 50.0}},
        }

        with patch("backend.routes.analytics.cache_get", return_value=json.dumps(cached_payload)), patch(
            "backend.routes.analytics.cache_set"
        ) as mock_cache_set, patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get("/api/dashboard-metrics?months=1&until=2026-01")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("X-Cache-Status"), "hit")
        self.assertEqual((res.get_json() or {}).get("data"), cached_payload)
        mock_cache_set.assert_not_called()

    def test_dashboard_metrics_cache_miss_sets_cache(self):
        client = self._login_client()

        with patch("backend.routes.analytics.cache_get", return_value=None), patch(
            "backend.routes.analytics.cache_set",
            return_value=True,
        ) as mock_cache_set, patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get("/api/dashboard-metrics?months=1")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("X-Cache-Status"), "miss")
        mock_cache_set.assert_called_once()
        cache_key, cache_value = mock_cache_set.call_args.args[:2]
        ttl_seconds = mock_cache_set.call_args.kwargs.get("ttl_seconds")
        self.assertTrue(cache_key.startswith(f"dashboard_metrics:{self.user_id}:1:"))
        self.assertIsInstance(cache_value, str)
        self.assertEqual(ttl_seconds, 300)

    def test_dashboard_metrics_ignores_invalid_cached_payload(self):
        client = self._login_client()

        with patch("backend.routes.analytics.cache_get", return_value="{not-json"), patch(
            "backend.routes.analytics.cache_set",
            return_value=True,
        ) as mock_cache_set, patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get("/api/dashboard-metrics?months=1")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("X-Cache-Status"), "miss")
        mock_cache_set.assert_called_once()

    def test_dashboard_metrics_returns_503_when_redis_is_unavailable_and_reports_warning(self):
        client = self._login_client()

        class _Scope:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def set_tag(self, *args, **kwargs):
                return None

            def set_context(self, *args, **kwargs):
                return None

        previous = self._set_cache_circuit_breaker_enabled(True)
        try:
            with patch(
                "backend.lib.cache._rate_limiter._get_redis_client",
                side_effect=TimeoutError("redis timed out"),
            ), patch("backend.routes.analytics._record_dashboard_open_event"), patch(
                "backend.routes.analytics.sentry_sdk"
            ) as mock_sentry:
                mock_sentry.push_scope.return_value = _Scope()
                res = client.get("/api/dashboard-metrics?months=1")
        finally:
            self.app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = previous

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_cache_unavailable")
        self.assertEqual(payload.get("code"), "analytics_cache_unavailable")
        self.assertEqual(res.headers.get("Retry-After"), "10")
        mock_sentry.capture_message.assert_called_once()
        self.assertIn("dashboard_metrics", mock_sentry.capture_message.call_args.args[0])

    def test_dashboard_metrics_short_circuits_while_redis_circuit_is_open(self):
        client = self._login_client()

        previous = self._set_cache_circuit_breaker_enabled(True)
        try:
            with patch(
                "backend.lib.cache._rate_limiter._get_redis_client",
                side_effect=TimeoutError("redis timed out"),
            ), patch("backend.routes.analytics._record_dashboard_open_event"):
                first = client.get("/api/dashboard-metrics?months=1")

            self.assertEqual(first.status_code, 503, first.get_data(as_text=True))

            with patch(
                "backend.lib.cache._rate_limiter._get_redis_client",
                side_effect=AssertionError("redis client should not be called while breaker is open"),
            ), patch("backend.routes.analytics._record_dashboard_open_event"):
                second = client.get("/api/dashboard-metrics?months=1")
        finally:
            self.app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = previous

        self.assertEqual(second.status_code, 503, second.get_data(as_text=True))
        payload = second.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_cache_unavailable")

    def test_dashboard_metrics_reports_cache_bypass_to_sentry(self):
        client = self._login_client()

        class _Scope:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def set_tag(self, *args, **kwargs):
                return None

            def set_context(self, *args, **kwargs):
                return None

        with patch("backend.routes.analytics.cache_get", return_value=None), patch(
            "backend.routes.analytics.cache_backend_warning",
            return_value="Cache timed out. Analytics may load more slowly while Redis recovers.",
        ), patch(
            "backend.routes.analytics.cache_set",
            return_value=True,
        ), patch(
            "backend.routes.analytics._record_dashboard_open_event"
        ), patch(
            "backend.routes.analytics.sentry_sdk"
        ) as mock_sentry:
            mock_sentry.push_scope.return_value = _Scope()
            res = client.get("/api/dashboard-metrics?months=1")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        mock_sentry.capture_message.assert_called_once()
        self.assertIn("dashboard_metrics", mock_sentry.capture_message.call_args.args[0])

    def test_dashboard_metrics_returns_503_when_compute_times_out(self):
        from backend.routes.analytics import AnalyticsComputationTimeoutError

        client = self._login_client()

        with patch("backend.routes.analytics.cache_get", return_value=None), patch(
            "backend.routes.analytics._compute_dashboard_metrics_payload",
            side_effect=AnalyticsComputationTimeoutError("timed out"),
        ), patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get("/api/dashboard-metrics?months=1")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_timeout")

    def test_analytics_timeout_guard_sets_postgres_statement_timeout(self):
        from backend.routes.analytics import _analytics_timeout_guard

        with self.app.app_context(), patch("backend.routes.analytics.db.session.execute") as mock_execute:
            with _analytics_timeout_guard(7):
                pass

        self.assertEqual(mock_execute.call_count, 1)
        statement = str(mock_execute.call_args.args[0])
        self.assertIn("SET LOCAL statement_timeout = 7000", statement)

    def test_dashboard_bundle_returns_503_when_compute_times_out(self):
        from backend.routes.analytics import AnalyticsComputationTimeoutError

        client = self._login_client()

        with patch(
            "backend.routes.analytics._build_dashboard_bundle_payload",
            side_effect=AnalyticsComputationTimeoutError("timed out"),
        ):
            res = client.get(f"/api/dashboard-bundle?month={self._current_month()}")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_timeout")

    def test_dashboard_bundle_returns_503_when_db_statement_timeout_fires(self):
        client = self._login_client()

        class _StatementTimeout(Exception):
            pgcode = "57014"

            def __str__(self):
                return "canceling statement due to statement timeout"

        with patch(
            "backend.routes.analytics._build_dashboard_bundle_payload",
            side_effect=OperationalError("SELECT 1", {}, _StatementTimeout()),
        ):
            res = client.get(f"/api/dashboard-bundle?month={self._current_month()}")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_timeout")

    def test_dashboard_bundle_returns_503_when_redis_is_unavailable(self):
        client = self._login_client()

        previous = self._set_cache_circuit_breaker_enabled(True)
        try:
            with patch(
                "backend.lib.cache._rate_limiter._get_redis_client",
                side_effect=TimeoutError("redis timed out"),
            ):
                res = client.get(f"/api/dashboard-bundle?month={self._current_month()}")
        finally:
            self.app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = previous

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_cache_unavailable")

    def test_safe_to_spend_returns_503_when_compute_times_out(self):
        from backend.routes.analytics import AnalyticsComputationTimeoutError

        client = self._login_client()

        with patch(
            "backend.routes.analytics._get_safe_to_spend_payload_cached",
            side_effect=AnalyticsComputationTimeoutError("timed out"),
        ):
            res = client.get(f"/api/safe-to-spend?month={self._current_month()}")

        self.assertEqual(res.status_code, 503, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "analytics_timeout")

    def test_dashboard_metrics_snapshot_hit_warms_cache_and_returns_payload(self):
        from backend.models import DashboardSnapshot

        client = self._login_client()
        current_month = self._current_month()
        snapshot_payload = {
            "months": [current_month],
            "monthly": [{"month": current_month, "income_kd": 900.0, "expense_kd": 125.0}],
            "expense_by_category": {current_month: {"Groceries": 125.0}},
            "cycle_enabled": False,
            "cycle_start": None,
            "cycle_end": None,
        }

        with self.app.app_context():
            self.db.session.add(
                DashboardSnapshot(
                    user_id=self.user_id,
                    months_count=24,
                    window_end_month=current_month,
                    months_json=json.dumps(snapshot_payload["months"]),
                    monthly_json=json.dumps(snapshot_payload["monthly"]),
                    expense_by_category_json=json.dumps(snapshot_payload["expense_by_category"]),
                )
            )
            self.db.session.commit()

        with patch("backend.routes.analytics.cache_get", return_value=None), patch(
            "backend.routes.analytics.cache_set",
            return_value=True,
        ) as mock_cache_set, patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get(f"/api/dashboard-metrics?months=24&until={current_month}")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("X-Cache-Status"), "snapshot")
        data = (res.get_json() or {}).get("data") or {}
        self.assertEqual(data.get("months"), snapshot_payload["months"])
        self.assertEqual(data.get("monthly"), snapshot_payload["monthly"])
        self.assertEqual(data.get("expense_by_category"), snapshot_payload["expense_by_category"])
        self.assertIsNotNone(data.get("updated_at"))
        mock_cache_set.assert_called_once()

    def test_dashboard_metrics_miss_persists_snapshot_for_default_window(self):
        from backend.models import DashboardSnapshot

        client = self._login_client()
        current_month = self._current_month()
        self._create_transaction(client, amount_kd="7.500", txn_date=f"{current_month}-10")

        with patch("backend.routes.analytics.cache_get", return_value=None), patch(
            "backend.routes.analytics.cache_set",
            return_value=True,
        ) as mock_cache_set, patch("backend.routes.analytics._record_dashboard_open_event"):
            res = client.get(f"/api/dashboard-metrics?months=24&until={current_month}")

        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        self.assertEqual(res.headers.get("X-Cache-Status"), "miss")
        mock_cache_set.assert_called_once()

        with self.app.app_context():
            snapshot = (
                DashboardSnapshot.query
                .filter_by(
                    user_id=self.user_id,
                    months_count=24,
                    window_end_month=current_month,
                )
                .first()
            )
            self.assertIsNotNone(snapshot)
            payload = snapshot.to_payload()
            self.assertAlmostEqual(
                payload["expense_by_category"][current_month]["Groceries"],
                7.5,
                places=3,
            )

    def test_cache_bust_dashboard_metrics_deletes_persisted_snapshots(self):
        from backend.lib.cache import cache_bust_dashboard_metrics
        from backend.models import DashboardSnapshot

        current_month = self._current_month()
        with self.app.app_context():
            self.db.session.add(
                DashboardSnapshot(
                    user_id=self.user_id,
                    months_count=24,
                    window_end_month=current_month,
                    months_json=json.dumps([current_month]),
                    monthly_json=json.dumps([]),
                    expense_by_category_json=json.dumps({}),
                )
            )
            self.db.session.commit()

            deleted = cache_bust_dashboard_metrics(self.user_id)

            self.assertGreaterEqual(deleted, 1)
            self.assertEqual(
                DashboardSnapshot.query.filter_by(user_id=self.user_id).count(),
                0,
            )

    def test_transaction_mutations_bust_dashboard_and_safe_to_spend_caches(self):
        client = self._login_client()

        with patch("backend.routes.transactions.cache_bust_dashboard_metrics", return_value=1) as mock_dashboard_bust, patch(
            "backend.routes.transactions.cache_bust_safe_to_spend",
            return_value=1,
        ) as mock_safe_bust:
            txn_id = self._create_transaction(client, amount_kd="5.000")

            update_res = self._post(
                client,
                f"/api/transactions/{txn_id}/update",
                json={
                    "date": "2026-02-10",
                    "category": "Groceries",
                    "name": "Cache Txn Updated",
                    "amount_kd": "6.000",
                },
            )
            self.assertEqual(update_res.status_code, 200, update_res.get_data(as_text=True))

            bulk_res = self._post(
                client,
                "/api/transactions/bulk-update",
                json={"ids": [txn_id], "changes": {"category": "Household"}},
            )
            self.assertEqual(bulk_res.status_code, 200, bulk_res.get_data(as_text=True))

            delete_res = self._post(client, f"/api/transactions/{txn_id}/delete", json={})
            self.assertEqual(delete_res.status_code, 200, delete_res.get_data(as_text=True))

        self.assertEqual(mock_dashboard_bust.call_count, 4)
        self.assertEqual(mock_safe_bust.call_count, 4)
        for call in mock_dashboard_bust.call_args_list:
            self.assertEqual(call.args[0], self.user_id)
        for call in mock_safe_bust.call_args_list:
            self.assertEqual(call.args[0], self.user_id)


if __name__ == "__main__":
    unittest.main()
