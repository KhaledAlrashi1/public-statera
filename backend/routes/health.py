"""Service health and readiness probes."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import text

from backend import csrf, db
from backend.api_response import error_response
from backend.worker_health import list_worker_task_health

bp = Blueprint("health", __name__)

_SERVICE_NAME = "personal-finance"
_CACHE_NO_STORE = "no-store"


def _base_headers() -> dict[str, str]:
    request_id = getattr(g, "_request_id", "") or secrets.token_hex(8)
    return {
        "Cache-Control": _CACHE_NO_STORE,
        "X-Request-ID": request_id,
    }


def _operator_token_response(
    message: str,
    *,
    status: int,
    code: str,
    www_authenticate: str | None = None,
):
    response = error_response(message, status=status, code=code)
    response.headers.update(_base_headers())
    if www_authenticate:
        response.headers["WWW-Authenticate"] = www_authenticate
    return response


def _operator_token_from_request() -> str:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return (request.headers.get("X-Operator-Token") or "").strip()


def _require_operator_token():
    expected = str(current_app.config.get("OPERATOR_API_TOKEN") or "").strip()
    if not expected:
        return _operator_token_response(
            "Operator monitoring token is not configured.",
            status=503,
            code="operator_auth_unavailable",
        )

    presented = _operator_token_from_request()
    if presented and secrets.compare_digest(presented, expected):
        return None

    return _operator_token_response(
        "Operator token required.",
        status=401,
        code="operator_token_required",
        www_authenticate='Bearer realm="operator"',
    )


@bp.route("/healthz", methods=["GET"])
def healthz():
    """Liveness probe: process is up if this returns."""
    payload = {"ok": True, "status": "ok", "service": _SERVICE_NAME}
    return jsonify(payload), 200, _base_headers()


@bp.route("/readyz", methods=["GET"])
def readyz():
    """Readiness probe: database must be reachable."""
    try:
        db.session.execute(text("SELECT 1"))
        payload = {
            "ok": True,
            "status": "ready",
            "service": _SERVICE_NAME,
            "checks": {"db": "ok"},
        }
        return jsonify(payload), 200, _base_headers()
    except Exception as exc:  # pragma: no cover - health checks intentionally swallow DB internals and return a stable probe contract.
        detail = str(exc).strip()[:120] or "unable to connect"
        response = error_response(
            "Readiness probe failed.",
            status=503,
            code="service_unavailable",
            extra={
                "status": "not_ready",
                "service": _SERVICE_NAME,
                "checks": {"db": f"error: {detail}"},
            },
        )
        response.headers.update(_base_headers())
        return response


@bp.route("/api/admin/worker-health", methods=["GET"])
def admin_worker_health():
    auth_error = _require_operator_token()
    if auth_error is not None:
        return auth_error

    payload = {
        "ok": True,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "tasks": list_worker_task_health(),
    }
    return jsonify(payload), 200, _base_headers()


@bp.route("/api/admin/tasks/cleanup-memorized", methods=["POST"])
@csrf.exempt
def admin_trigger_cleanup_memorized():
    """Operator endpoint to immediately enqueue cleanup_memorized_transactions.

    Protected by the same operator token as /api/admin/worker-health.
    Idempotent — the Celery task itself holds a beat lock so duplicate
    firings within the same 6-hour window will short-circuit.
    """
    auth_error = _require_operator_token()
    if auth_error is not None:
        return auth_error

    try:
        from backend.tasks import cleanup_memorized_transactions as _task
        result = _task.delay()
        payload = {
            "ok": True,
            "enqueued": True,
            "task_id": str(result.id) if result else None,
            "enqueued_at": datetime.now(timezone.utc).isoformat(),
        }
        return jsonify(payload), 202, _base_headers()
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("Failed to enqueue cleanup_memorized_transactions: %s", exc)
        resp, _ = error_response("Failed to enqueue cleanup task.", status=500, code="internal_error")
        return resp


@bp.route("/api/admin/memorized/rebuild-from-transactions", methods=["POST"])
@csrf.exempt
def admin_rebuild_memorized_from_transactions():
    """Operator endpoint: replay transaction history into memorized_transactions for a user.

    Body: {"user_id": <int>}
    Used for data recovery after the prune bug deleted memorized entries.
    Protected by the same operator token as /api/admin/worker-health.
    """
    auth_error = _require_operator_token()
    if auth_error is not None:
        return auth_error

    body = request.get_json(silent=True) or {}
    user_id = body.get("user_id")
    if not isinstance(user_id, int) or user_id <= 0:
        return error_response("user_id must be a positive integer.", status=400, code="invalid_user_id")

    from backend.models import User
    user = db.session.get(User, user_id)
    if user is None:
        return error_response("User not found.", status=404, code="user_not_found")

    from backend.lib.suggestions import rebuild_memorized_from_transactions
    result = rebuild_memorized_from_transactions(user_id)
    payload = {"ok": True, "user_id": user_id, **result}
    return jsonify(payload), 200, _base_headers()


@bp.route("/api/worker-health", methods=["GET"])
def worker_health():
    """Health probe for Celery worker connectivity."""
    broker_status = "ok"
    workers_connected = 0
    try:
        from backend.worker import celery_app

        active = celery_app.control.inspect(timeout=2.0).active()
        if active is not None:
            workers_connected = len(active)
    except Exception as exc:  # pragma: no cover - health checks intentionally swallow inspect internals and return a stable probe contract.
        broker_status = "error"
        current_app.logger.warning("Worker health check failed: %s", exc)

    healthy = broker_status == "ok" and workers_connected > 0
    payload = {
        "ok": healthy,
        "workers_connected": workers_connected,
        "broker_ping": broker_status,
    }
    return jsonify(payload), (200 if healthy else 503), _base_headers()
