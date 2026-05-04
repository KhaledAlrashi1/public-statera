import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase


class RateLimiterStrategyTests(PreflightApiTestBase):
    def test_auto_backend_uses_memory_when_testing(self):
        from backend.security_ops import RateLimiter

        limiter = RateLimiter(backend_mode="auto")
        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            previous_testing = self.app.config.get("TESTING")
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "auto"
                self.app.config["TESTING"] = True
                self.assertEqual(limiter.active_backend(), "memory")
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend
                self.app.config["TESTING"] = previous_testing

    def test_auto_backend_prefers_redis_outside_tests(self):
        from backend.security_ops import RateLimiter

        limiter = RateLimiter(backend_mode="auto")
        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            previous_testing = self.app.config.get("TESTING")
            previous_redis_url = self.app.config.get("REDIS_URL")
            previous_redis_lib = limiter._redis_lib
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "auto"
                self.app.config["TESTING"] = False
                self.app.config["REDIS_URL"] = "redis://localhost:6379/0"
                limiter._redis_lib = object()
                self.assertEqual(limiter.active_backend(), "redis")
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend
                self.app.config["TESTING"] = previous_testing
                self.app.config["REDIS_URL"] = previous_redis_url
                limiter._redis_lib = previous_redis_lib

    def test_redis_failure_falls_back_to_memory_and_updates_counters(self):
        from backend.security_ops import RateLimiter

        limiter = RateLimiter(backend_mode="redis")
        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "redis"
                with patch.object(limiter, "_is_allowed_redis", side_effect=RuntimeError("redis unavailable")):
                    first_allowed, _first_remaining = limiter.is_allowed("locked:key:1", limit=5, window_seconds=60)
                    second_allowed, _second_remaining = limiter.is_allowed("locked:key:2", limit=5, window_seconds=60)

                self.assertTrue(first_allowed)
                self.assertTrue(second_allowed)

                snapshot = limiter.stats_snapshot()
                self.assertEqual(snapshot.get("active_backend"), "redis")
                self.assertEqual(snapshot.get("fallback_error_events_total"), 2)
                self.assertGreaterEqual(int(snapshot.get("fallback_memory_requests_total") or 0), 2)
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend

    def test_redis_backend_is_resolvable(self):
        from backend.security_ops import RateLimiter

        limiter = RateLimiter(backend_mode="redis")
        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "redis"
                self.assertEqual(limiter.active_backend(), "redis")
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend

    def test_redis_backend_allows_and_counts(self):
        try:
            import fakeredis
        except Exception:
            self.skipTest("fakeredis is not installed")

        from backend.security_ops import RateLimiter

        limiter = RateLimiter(backend_mode="redis")
        limiter._redis_client = fakeredis.FakeRedis(decode_responses=True)

        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "redis"
                for _ in range(5):
                    allowed, _remaining = limiter.is_allowed("test:key", limit=5, window_seconds=3600)
                    self.assertTrue(allowed)
                blocked, _remaining = limiter.is_allowed("test:key", limit=5, window_seconds=3600)
                self.assertFalse(blocked)
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend

    def test_redis_backend_is_cross_process_consistent(self):
        try:
            import fakeredis
        except Exception:
            self.skipTest("fakeredis is not installed")

        from backend.security_ops import RateLimiter

        server = fakeredis.FakeServer()
        limiter_a = RateLimiter(backend_mode="redis")
        limiter_b = RateLimiter(backend_mode="redis")
        limiter_a._redis_client = fakeredis.FakeRedis(server=server, decode_responses=True)
        limiter_b._redis_client = fakeredis.FakeRedis(server=server, decode_responses=True)

        with self.app.app_context():
            previous_backend = self.app.config.get("RATE_LIMIT_BACKEND")
            try:
                self.app.config["RATE_LIMIT_BACKEND"] = "redis"
                limiter_a.is_allowed("shared:key", limit=3, window_seconds=3600)
                limiter_a.is_allowed("shared:key", limit=3, window_seconds=3600)
                limiter_b.is_allowed("shared:key", limit=3, window_seconds=3600)
                blocked, _remaining = limiter_b.is_allowed("shared:key", limit=3, window_seconds=3600)
                self.assertFalse(blocked)
            finally:
                self.app.config["RATE_LIMIT_BACKEND"] = previous_backend


if __name__ == "__main__":
    unittest.main()
