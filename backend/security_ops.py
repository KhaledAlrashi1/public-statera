"""Security and reliability helpers: rate limiting and data retention."""

from __future__ import annotations

import os
import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import wraps
from time import time
from typing import Dict, List, Tuple

from flask import current_app, has_app_context, request

from backend import db
from backend.api_response import error_response
from backend.lib.emails import normalize_email


class RateLimiter:
    """Rate limiter with Redis backend and in-memory fallback."""

    _VALID_BACKENDS = {"auto", "memory", "redis"}

    def __init__(self, backend_mode: str | None = None):
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()
        raw_backend = backend_mode if backend_mode is not None else os.getenv("RATE_LIMIT_BACKEND")
        self._backend_mode = self._normalize_backend_mode(raw_backend)
        self._last_logged_backend_signature: str | None = None
        self._last_invalid_backend_warning_value: str | None = None

        self._fallback_error_events_total = 0
        self._fallback_memory_requests_total = 0
        self._last_fallback_event_log_ts = 0.0

        self._redis_lib = None
        try:
            import redis as redis_lib  # type: ignore
            self._redis_lib = redis_lib
        except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
            self._redis_lib = None
        self._redis_client = None

        self._fallback_log_interval_seconds = self._env_int("RATE_LIMIT_FALLBACK_LOG_INTERVAL_SECONDS", default=30)

    @staticmethod
    def _env_int(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or raw.strip() == "":
            return default
        try:
            return int(raw.strip())
        except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
            return default

    def _normalize_backend_mode(self, raw: str | None) -> str:
        value = (raw or "auto").strip().lower()
        if value in self._VALID_BACKENDS:
            return value
        return "auto"

    def _configured_backend_mode(self) -> str:
        if has_app_context():
            raw_cfg = current_app.config.get("RATE_LIMIT_BACKEND")
            if raw_cfg is not None and str(raw_cfg).strip():
                raw_value = str(raw_cfg).strip().lower()
                if raw_value in self._VALID_BACKENDS:
                    return raw_value
                if raw_value != self._last_invalid_backend_warning_value:
                    current_app.logger.warning(
                        "Invalid RATE_LIMIT_BACKEND=%r; falling back to 'auto'.",
                        raw_value,
                    )
                    self._last_invalid_backend_warning_value = raw_value
                return "auto"
        return self._backend_mode

    def _fallback_log_interval(self) -> int:
        if has_app_context():
            raw_cfg = current_app.config.get("RATE_LIMIT_FALLBACK_LOG_INTERVAL_SECONDS")
            try:
                return max(1, int(raw_cfg))
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                return max(1, int(self._fallback_log_interval_seconds))
        return max(1, int(self._fallback_log_interval_seconds))

    def _redis_url_hint(self) -> str:
        if has_app_context():
            try:
                return str(
                    current_app.config.get("REDIS_URL", os.getenv("REDIS_URL", ""))
                    or ""
                ).strip()
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                return ""
        return str(os.getenv("REDIS_URL") or "").strip()

    def _redis_timeout_seconds(self) -> float:
        raw = None
        if has_app_context():
            try:
                raw = current_app.config.get("REDIS_OPERATION_TIMEOUT_SECONDS")
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                raw = None
        if raw is None:
            raw = os.getenv("REDIS_OPERATION_TIMEOUT_SECONDS")

        try:
            timeout = float(raw)
        except (TypeError, ValueError):
            timeout = 0.25
        return max(0.05, min(timeout, 5.0))

    def _is_testing_context(self) -> bool:
        if has_app_context():
            try:
                return bool(current_app.config.get("TESTING"))
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                return False
        return False

    def _resolve_backend(self) -> str:
        mode = self._configured_backend_mode()
        if mode in {"memory", "redis"}:
            active_backend = mode
        else:
            if self._is_testing_context():
                active_backend = "memory"
            else:
                active_backend = "redis" if (self._redis_url_hint() and self._redis_lib is not None) else "memory"

        if has_app_context():
            redis_url_set = bool(self._redis_url_hint())
            signature = (
                f"mode={mode}|active={active_backend}|testing={int(self._is_testing_context())}|"
                f"redis_url_set={int(redis_url_set)}"
            )
            if signature != self._last_logged_backend_signature:
                current_app.logger.info(
                    "Rate limiter backend resolved: mode=%s active=%s testing=%s redis_url_set=%s",
                    mode,
                    active_backend,
                    self._is_testing_context(),
                    redis_url_set,
                )
                self._last_logged_backend_signature = signature

        return active_backend

    def active_backend(self) -> str:
        """Return the currently resolved backend after applying environment strategy."""
        return self._resolve_backend()

    def stats_snapshot(self) -> Dict[str, object]:
        return {
            "backend_mode": self._configured_backend_mode(),
            "active_backend": self._resolve_backend(),
            "fallback_error_events_total": self._fallback_error_events_total,
            "fallback_memory_requests_total": self._fallback_memory_requests_total,
        }

    def _is_allowed_memory(self, key: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        now = time()
        window_start = now - window_seconds

        with self._lock:
            self._requests[key] = [t for t in self._requests[key] if t > window_start]
            current_count = len(self._requests[key])

            if current_count >= limit:
                return False, 0

            self._requests[key].append(now)
            return True, limit - current_count - 1

    def _get_redis_client(self):
        """Return a cached Redis client for cross-process rate-limiting."""
        if self._redis_client is not None:
            return self._redis_client

        if self._redis_lib is None:
            raise RuntimeError("redis package is not installed")

        url = self._redis_url_hint() or "redis://127.0.0.1:6379/1"
        timeout_seconds = self._redis_timeout_seconds()
        self._redis_client = self._redis_lib.from_url(
            url,
            decode_responses=True,
            socket_timeout=timeout_seconds,
            socket_connect_timeout=timeout_seconds,
            retry_on_timeout=False,
        )
        return self._redis_client

    def _is_allowed_redis(self, key: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """Fixed-window limiter backed by Redis INCR+EXPIRE."""
        redis_client = self._get_redis_client()
        window_seconds = max(1, int(window_seconds))
        window_bucket = int(time()) // window_seconds
        redis_key = f"rl:{key[:200]}:{window_seconds}:{window_bucket}"

        pipe = redis_client.pipeline()
        pipe.incr(redis_key)
        # Keep one previous window available for Retry-After style behavior.
        pipe.expire(redis_key, window_seconds * 2)
        count = int(pipe.execute()[0] or 0)

        if count > limit:
            return False, 0
        return True, max(0, limit - count)

    def _fallback_to_memory(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        self._fallback_memory_requests_total += 1
        return self._is_allowed_memory(key, limit, window_seconds)

    def is_allowed(self, key: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        backend = self._resolve_backend()
        if backend == "redis":
            try:
                return self._is_allowed_redis(key, limit, window_seconds)
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                self._fallback_error_events_total += 1
                now_ts = time()
                if (now_ts - self._last_fallback_event_log_ts) >= self._fallback_log_interval():
                    if has_app_context():
                        current_app.logger.exception(
                            "Redis rate-limit backend failed; using in-memory fallback "
                            "(error_events=%s memory_requests=%s).",
                            self._fallback_error_events_total,
                            self._fallback_memory_requests_total,
                        )
                    self._last_fallback_event_log_ts = now_ts
                return self._fallback_to_memory(key, limit, window_seconds)
        return self._is_allowed_memory(key, limit, window_seconds)

    def cleanup(self, max_age_seconds: int = 300):
        active_backend = self._resolve_backend()
        if active_backend == "redis":
            return

        cutoff = time() - max_age_seconds
        with self._lock:
            stale_keys = [k for k, v in self._requests.items()
                          if not v or max(v) < cutoff]
            for k in stale_keys:
                del self._requests[k]

    def reset(self):
        with self._lock:
            self._requests.clear()
        self._fallback_error_events_total = 0
        self._fallback_memory_requests_total = 0
        self._last_fallback_event_log_ts = 0.0
        if self._resolve_backend() == "redis":
            try:
                redis_client = self._get_redis_client()
                cursor = 0
                while True:
                    cursor, keys = redis_client.scan(cursor=cursor, match="rl:*", count=500)
                    if keys:
                        redis_client.delete(*keys)
                    if str(cursor) == "0":
                        break
            except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
                pass
        self._redis_client = None


_rate_limiter = RateLimiter()


def auth_email_key_func() -> str:
    """Rate-limit key based on the submitted email for auth endpoints.

    Applying this as a second rate_limit decorator on login/register (in
    addition to the default IP-based one) prevents credential-stuffing: an
    attacker cycling through many IPs to hammer a single account is still
    capped per-email address.
    """
    endpoint = request.endpoint or "unknown"
    try:
        body = request.get_json(silent=True) or {}
        email = normalize_email(body.get("email"))[:64]
    except Exception:  # noqa: BLE001 - security logging and cleanup are best-effort and should not block user-facing flows.
        email = ""
    if email:
        return f"email:{email}:{endpoint}"
    # Fallback to IP when no email is present (avoids a wide-open bucket).
    return f"{request.remote_addr or 'unknown'}:{endpoint}"


def cleanup_security_data(
    security_events_days: int = 365,
) -> int:
    """Prune old security_events rows."""
    from backend.models import SecurityEvent

    now = datetime.now(timezone.utc)
    security_cutoff = now - timedelta(days=max(1, int(security_events_days)))

    deleted_events = (
        SecurityEvent.query
        .filter(SecurityEvent.created_at < security_cutoff)
        .delete(synchronize_session=False)
    )
    if deleted_events:
        db.session.commit()
    return deleted_events


def cleanup_product_events(product_events_days: int = 90) -> int:
    """Prune old product_events rows to prevent unbounded table growth."""
    from backend.models import ProductEvent

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=max(1, int(product_events_days)))
    deleted = (
        ProductEvent.query
        .filter(ProductEvent.event_ts < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.session.commit()
    return deleted


def rate_limit(limit: int, window_seconds: int = 60, key_func=None):
    """Decorator to apply rate limiting to a route."""
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            if key_func:
                key = key_func()
            else:
                ip = request.remote_addr or "unknown"
                endpoint = request.endpoint or "unknown"
                key = f"{ip}:{endpoint}"

            allowed, remaining = _rate_limiter.is_allowed(key, limit, window_seconds)

            if not allowed:
                response = error_response(
                    "Rate limit exceeded. Please slow down.",
                    status=429,
                    code="rate_limit_exceeded",
                    extra={"retry_after": window_seconds},
                )
                response.status_code = 429
                response.headers["Retry-After"] = str(window_seconds)
                response.headers["X-RateLimit-Limit"] = str(limit)
                response.headers["X-RateLimit-Remaining"] = "0"
                return response

            result = f(*args, **kwargs)

            if hasattr(result, "headers"):
                result.headers["X-RateLimit-Limit"] = str(limit)
                result.headers["X-RateLimit-Remaining"] = str(remaining)

            return result
        return wrapped
    return decorator
