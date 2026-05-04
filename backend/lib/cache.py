"""Redis-backed cache helpers with graceful fallback."""

from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import contextmanager

from flask import current_app, g, has_app_context

from backend.security_ops import _rate_limiter

_CACHE_WARNING_KEY = "_cache_backend_warning"
_ANALYTICS_CACHE_GUARD_KEY = "_analytics_cache_guard"
_ANALYTICS_CACHE_BREAKER_LOCK = threading.Lock()
_ANALYTICS_CACHE_BREAKER_OPEN_UNTIL = 0.0
_CACHE_CIRCUIT_LOCK = threading.Lock()
_CACHE_CIRCUIT_FAILURES = 0
_CACHE_CIRCUIT_OPEN_UNTIL = 0.0
_CACHE_CIRCUIT_THRESHOLD = 3
_CACHE_CIRCUIT_RESET_SECONDS = 30


class CacheBackendUnavailableError(TimeoutError):
    """Raised when a route requires Redis-backed analytics cache availability."""


def _mark_cache_backend_warning(message: str) -> None:
    if not has_app_context():
        return
    try:
        existing = getattr(g, _CACHE_WARNING_KEY, None)
        if not existing:
            setattr(g, _CACHE_WARNING_KEY, message)
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        pass


def cache_backend_warning() -> str | None:
    if not has_app_context():
        return None
    try:
        value = getattr(g, _CACHE_WARNING_KEY, None)
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        return None
    return str(value).strip() or None


def _analytics_cache_breaker_timeout_seconds() -> int:
    raw = None
    if has_app_context():
        try:
            raw = current_app.config.get("ANALYTICS_CACHE_CIRCUIT_BREAKER_TIMEOUT_SECONDS")
        except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
            raw = None
    if raw is None:
        raw = os.getenv("ANALYTICS_CACHE_CIRCUIT_BREAKER_TIMEOUT_SECONDS")

    try:
        timeout_seconds = int(raw)
    except (TypeError, ValueError):
        timeout_seconds = 10
    return max(1, min(timeout_seconds, 60))


def _analytics_cache_breaker_enabled() -> bool:
    if has_app_context():
        try:
            configured = current_app.config.get("ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED")
        except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
            configured = None
        if configured is not None:
            return bool(configured)

    raw = os.getenv("ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED")
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _analytics_cache_guard():
    if not has_app_context():
        return None
    try:
        return getattr(g, _ANALYTICS_CACHE_GUARD_KEY, None)
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        return None


@contextmanager
def analytics_cache_circuit_breaker(*, route_name: str, timeout_seconds: int | None = None):
    if not has_app_context():
        yield
        return
    if not _analytics_cache_breaker_enabled():
        yield
        return

    previous = _analytics_cache_guard()
    setattr(
        g,
        _ANALYTICS_CACHE_GUARD_KEY,
        {
            "route_name": str(route_name or "").strip(),
            "timeout_seconds": int(timeout_seconds or _analytics_cache_breaker_timeout_seconds()),
        },
    )
    try:
        yield
    finally:
        if previous is None:
            try:
                delattr(g, _ANALYTICS_CACHE_GUARD_KEY)
            except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
                pass
        else:
            setattr(g, _ANALYTICS_CACHE_GUARD_KEY, previous)


def reset_analytics_cache_circuit_breaker() -> None:
    global _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL
    with _ANALYTICS_CACHE_BREAKER_LOCK:
        _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL = 0.0
    global _CACHE_CIRCUIT_FAILURES, _CACHE_CIRCUIT_OPEN_UNTIL
    with _CACHE_CIRCUIT_LOCK:
        _CACHE_CIRCUIT_FAILURES = 0
        _CACHE_CIRCUIT_OPEN_UNTIL = 0.0


def _analytics_cache_breaker_is_open() -> bool:
    with _ANALYTICS_CACHE_BREAKER_LOCK:
        return time.monotonic() < _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL


def _cache_circuit_open() -> bool:
    global _CACHE_CIRCUIT_FAILURES, _CACHE_CIRCUIT_OPEN_UNTIL
    with _CACHE_CIRCUIT_LOCK:
        if _CACHE_CIRCUIT_FAILURES < _CACHE_CIRCUIT_THRESHOLD:
            return False
        if time.monotonic() >= _CACHE_CIRCUIT_OPEN_UNTIL:
            _CACHE_CIRCUIT_FAILURES = 0
            _CACHE_CIRCUIT_OPEN_UNTIL = 0.0
            return False
        return True


def _cache_circuit_fail() -> int:
    global _CACHE_CIRCUIT_FAILURES, _CACHE_CIRCUIT_OPEN_UNTIL
    with _CACHE_CIRCUIT_LOCK:
        _CACHE_CIRCUIT_FAILURES += 1
        if _CACHE_CIRCUIT_FAILURES >= _CACHE_CIRCUIT_THRESHOLD:
            _CACHE_CIRCUIT_OPEN_UNTIL = time.monotonic() + float(_CACHE_CIRCUIT_RESET_SECONDS)
        return _CACHE_CIRCUIT_FAILURES


def _cache_circuit_succeed() -> None:
    global _CACHE_CIRCUIT_FAILURES, _CACHE_CIRCUIT_OPEN_UNTIL
    with _CACHE_CIRCUIT_LOCK:
        _CACHE_CIRCUIT_FAILURES = 0
        _CACHE_CIRCUIT_OPEN_UNTIL = 0.0


def _analytics_cache_failure_warning(*, timed_out: bool) -> str:
    guard = _analytics_cache_guard()
    if guard:
        if timed_out:
            return "Redis is unavailable. Dashboard analytics are temporarily unavailable while the cache recovers."
        return "Redis is unavailable. Dashboard analytics are temporarily unavailable while the cache recovers."
    if timed_out:
        return "Cache timed out. Analytics may load more slowly while Redis recovers."
    return "Cache is temporarily unavailable. Analytics may load more slowly while Redis recovers."


def _trip_analytics_cache_circuit_breaker(message: str) -> None:
    guard = _analytics_cache_guard()
    _mark_cache_backend_warning(message)
    if not guard:
        return

    timeout_seconds = max(1, int(guard.get("timeout_seconds") or _analytics_cache_breaker_timeout_seconds()))
    global _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL
    with _ANALYTICS_CACHE_BREAKER_LOCK:
        _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL = max(
            _ANALYTICS_CACHE_BREAKER_OPEN_UNTIL,
            time.monotonic() + float(timeout_seconds),
        )
    raise CacheBackendUnavailableError(message)


def _raise_if_analytics_cache_circuit_open() -> None:
    if not _analytics_cache_guard():
        return
    if not _analytics_cache_breaker_is_open():
        return
    message = _analytics_cache_failure_warning(timed_out=False)
    _mark_cache_backend_warning(message)
    raise CacheBackendUnavailableError(message)


def _redis_cache_url() -> str:
    if has_app_context():
        try:
            return str(current_app.config.get("REDIS_URL", "") or "").strip()
        except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
            return ""
    return str(os.getenv("REDIS_URL") or "").strip()


def _get_redis():
    _raise_if_analytics_cache_circuit_open()
    if _cache_circuit_open():
        warning = _analytics_cache_failure_warning(timed_out=False)
        _mark_cache_backend_warning(warning)
        return None
    url = _redis_cache_url()
    if not url:
        return None
    return _rate_limiter._get_redis_client()


def cache_get(key: str) -> str | None:
    try:
        client = _get_redis()
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=False)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache unavailable; continuing without cache (%s failures).",
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
        return None
    if client is None:
        return None
    try:
        value = client.get(key)
        _cache_circuit_succeed()
        return str(value) if value is not None else None
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=True)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache GET failed for key=%s (%s failures)",
            key,
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
        return None


def cache_set(key: str, value: str, ttl_seconds: int) -> bool:
    try:
        client = _get_redis()
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=False)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache unavailable; continuing without cache (%s failures).",
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
        return False
    if client is None:
        return False
    try:
        ttl_seconds = max(1, int(ttl_seconds))
        result = bool(client.set(key, value, ex=ttl_seconds))
        _cache_circuit_succeed()
        return result
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=True)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache SET failed for key=%s (%s failures)",
            key,
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
        return False


def cache_delete_pattern(pattern: str, *, count: int = 500) -> int:
    try:
        client = _get_redis()
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=False)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache pattern delete unavailable for pattern=%s (%s failures)",
            pattern,
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
        return 0
    if client is None:
        return 0
    deleted = 0
    cursor = 0
    try:
        while True:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=max(1, int(count)))
            if keys:
                deleted += int(client.delete(*keys) or 0)
            if str(cursor) == "0":
                break
        _cache_circuit_succeed()
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        failures = _cache_circuit_fail()
        warning = _analytics_cache_failure_warning(timed_out=True)
        _mark_cache_backend_warning(warning)
        logging.getLogger(__name__).warning(
            "Redis cache pattern delete failed for pattern=%s (%s failures)",
            pattern,
            failures,
            exc_info=True,
        )
        if _analytics_cache_guard():
            _trip_analytics_cache_circuit_breaker(warning)
    return deleted


def dashboard_metrics_cache_key(user_id: int, months: int, until: str | None = None) -> str:
    suffix = (until or "").strip()
    return f"dashboard_metrics:{int(user_id)}:{int(months)}:{suffix}"


def _delete_dashboard_snapshots(user_id: int) -> int:
    if not has_app_context():
        return 0

    try:
        from backend import db
        from backend.models import DashboardSnapshot

        deleted = (
            DashboardSnapshot.query
            .filter(DashboardSnapshot.user_id == int(user_id))
            .delete(synchronize_session=False)
        )
        db.session.commit()
        return int(deleted or 0)
    except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
        logging.getLogger(__name__).warning(
            "Dashboard snapshot delete failed for user_id=%s",
            user_id,
            exc_info=True,
        )
        try:
            from backend import db

            db.session.rollback()
        except Exception:  # noqa: BLE001 - cache failures are intentionally non-fatal and should degrade request handling gracefully.
            pass
        return 0


def cache_bust_dashboard_metrics(user_id: int, *, include_snapshots: bool = True) -> int:
    deleted = cache_delete_pattern(f"dashboard_metrics:{int(user_id)}:*")
    if include_snapshots:
        deleted += _delete_dashboard_snapshots(user_id)
    return deleted


def cache_bust_safe_to_spend(user_id: int) -> int:
    return cache_delete_pattern(f"safe_to_spend:{int(user_id)}:*")
