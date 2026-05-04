"""Shared API response envelope helpers.

Standard contract:
  { ok, data, error, meta }
"""

from __future__ import annotations

from typing import Any

from flask import jsonify


def _default_error_code(status: int) -> str:
    if status == 400:
        return "bad_request"
    if status == 401:
        return "unauthorized"
    if status == 403:
        return "forbidden"
    if status == 404:
        return "not_found"
    if status == 409:
        return "conflict"
    if status == 429:
        return "rate_limit_exceeded"
    if status == 503:
        return "service_unavailable"
    if status >= 500:
        return "internal_error"
    return "error"


def ok_response(
    data: Any = None,
    *,
    meta: dict[str, Any] | None = None,
    legacy: dict[str, Any] | None = None,
    status: int = 200,
):
    payload: dict[str, Any] = {
        "ok": True,
        "data": data if data is not None else {},
        "error": None,
        "meta": meta or {},
    }
    if legacy:
        payload.update(legacy)
    response = jsonify(payload)
    response.status_code = status
    return response


def error_response(
    error: str,
    *,
    status: int = 400,
    code: str | None = None,
    meta: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
):
    resolved_code = (code or "").strip() or _default_error_code(status)
    payload: dict[str, Any] = {
        "ok": False,
        "data": None,
        "error": error,
        "meta": meta or {},
        "error_code": resolved_code,
        "code": resolved_code,
    }
    if extra:
        for key, value in extra.items():
            if key in {"ok", "data", "error", "meta", "error_code", "code"}:
                continue
            payload[key] = value
    response = jsonify(payload)
    response.status_code = status
    return response
