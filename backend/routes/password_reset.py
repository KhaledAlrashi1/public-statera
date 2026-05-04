"""Public forgot-password routes kept separate from core auth handlers."""

from __future__ import annotations

import os

from flask import Blueprint, jsonify, request
from sqlalchemy.sql import func

from backend import bcrypt, db
from backend.constants import RATE_LIMIT_AUTH
from backend.lib.emails import is_valid_email_format, normalize_email
from backend.security_ops import rate_limit
from backend.models import User
from backend.routes.auth import (
    SECURITY_CONFIRM_LIMIT,
    SECURITY_CONFIRM_WINDOW_SECONDS,
    SECURITY_LINK_REQUEST_LIMIT,
    SECURITY_LINK_REQUEST_WINDOW_SECONDS,
    _legacy_api_error,
    _audit_security_event,
    _confirm_key,
    _consume_action_token,
    _forgot_request_key,
    _frontend_token_url,
    _link_request_cooldown_seconds_remaining,
    _mask_email,
    _create_action_token,
    _send_email_background,
    bump_session_version,
)

bp = Blueprint("password_reset", __name__)


@bp.route("/api/auth/forgot-password/request", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_LINK_REQUEST_LIMIT, window_seconds=SECURITY_LINK_REQUEST_WINDOW_SECONDS, key_func=_forgot_request_key)
def forgot_password_request():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(payload.get("email"))
    if not is_valid_email_format(email):
        return _legacy_api_error(
            error_code="email_invalid",
            status=400,
            error="Valid email is required.",
        )

    generic_response = {
        "ok": True,
        "message": "If an account exists for that email, a reset link has been sent.",
    }

    user = User.query.filter(func.lower(User.email) == email).first()
    if not user:
        _audit_security_event(
            "password_reset.requested",
            details={"email": _mask_email(email), "user_found": False},
        )
        db.session.commit()
        return jsonify(generic_response)

    cooldown_left = _link_request_cooldown_seconds_remaining(user.id, "password_reset")
    if cooldown_left > 0:
        _audit_security_event(
            "password_reset.requested",
            user_id=user.id,
            details={"cooldown_active": True, "retry_after": cooldown_left},
        )
        db.session.commit()
        return jsonify(generic_response)

    token = _create_action_token(user.id, "password_reset", payload={}, ttl_minutes=30)
    link = _frontend_token_url("/reset-password", token)
    _send_email_background(
        user.email,
        "Reset your password",
        (
            "You requested a password reset.\n\n"
            f"Open this link to continue:\n{link}\n\n"
            "This link expires in 30 minutes."
        ),
    )
    _audit_security_event("password_reset.link_requested", user_id=user.id)
    if (os.getenv("PERSONAL_STATERA_DEV_MODE", "").lower() in ("1", "true", "yes")
            or os.getenv("DINARTRACK_DEV_MODE", "").lower() in ("1", "true", "yes")):
        generic_response["preview_url"] = link
    return jsonify(generic_response)


@bp.route("/api/auth/forgot-password/confirm", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_CONFIRM_LIMIT, window_seconds=SECURITY_CONFIRM_WINDOW_SECONDS, key_func=_confirm_key)
def forgot_password_confirm():
    payload = request.get_json(silent=True) or {}
    token = payload.get("token") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    if not token:
        return _legacy_api_error(
            error_code="auth_action_token_required",
            status=400,
            error="Token is required.",
        )
    if not new_password or len(new_password) < 8 or len(new_password) > 128:
        return _legacy_api_error(
            error_code="password_invalid_length",
            status=400,
            error="New password must be 8-128 characters.",
        )
    if new_password != confirm_password:
        return _legacy_api_error(
            error_code="password_confirmation_mismatch",
            status=400,
            error="Password confirmation does not match.",
        )

    row = _consume_action_token(token, "password_reset")
    if not row:
        _audit_security_event("password_reset.confirm_failed", details={"reason": "invalid_or_expired_token"})
        db.session.commit()
        return _legacy_api_error(
            error_code="invalid_action_token",
            status=400,
            error="Invalid or expired token.",
        )

    user = db.session.get(User, row.user_id)
    if not user:
        _audit_security_event("password_reset.confirm_failed", details={"reason": "user_not_found"})
        db.session.rollback()
        return _legacy_api_error(
            error_code="user_not_found",
            status=404,
            error="Account not found.",
        )

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    bump_session_version(user)
    _audit_security_event("password_reset.confirmed", user_id=user.id)
    db.session.commit()
    _send_email_background(
        user.email,
        "Password reset completed",
        "Your account password was reset successfully. If this was not you, secure your account immediately.",
    )
    return jsonify({"ok": True})
