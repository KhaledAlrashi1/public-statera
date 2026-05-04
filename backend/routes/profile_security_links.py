"""Profile security-link routes (email/password link request and confirmation)."""

from __future__ import annotations

import json
import os

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy.sql import func

from backend import bcrypt, db
from backend.constants import RATE_LIMIT_AUTH
from backend.lib.emails import is_valid_email_format, normalize_email
from backend.security_ops import rate_limit
from backend.models import User
from backend.passwords import verify_password
from backend.routes.auth import (
    SECURITY_CONFIRM_LIMIT,
    SECURITY_CONFIRM_WINDOW_SECONDS,
    SECURITY_LINK_REQUEST_LIMIT,
    SECURITY_LINK_REQUEST_WINDOW_SECONDS,
    _legacy_api_error,
    _audit_security_event,
    _confirm_key,
    _consume_action_token,
    _create_action_token,
    _frontend_token_url,
    _link_request_cooldown_seconds_remaining,
    _link_request_key,
    _mask_email,
    _send_email_background,
    bump_session_version,
)

bp = Blueprint("profile_security_links", __name__)


@bp.route("/api/auth/profile/request-email-change-link", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_LINK_REQUEST_LIMIT, window_seconds=SECURITY_LINK_REQUEST_WINDOW_SECONDS, key_func=_link_request_key)
@login_required
def request_email_change_link():
    payload = request.get_json(silent=True) or {}
    new_email = normalize_email(payload.get("new_email"))
    current_password = payload.get("current_password") or ""

    errors = []
    if not is_valid_email_format(new_email):
        errors.append("Valid new email is required.")
    if new_email == normalize_email(current_user.email):
        errors.append("New email must be different from current email.")
    if User.query.filter(func.lower(User.email) == new_email, User.id != current_user.id).first():
        errors.append("Email already registered.")
    if not current_password:
        errors.append("Current password is required.")
    elif not verify_password(current_user.password_hash, current_password)[0]:
        errors.append("Current password is incorrect.")
    if errors:
        return _legacy_api_error(
            error_code="validation_error",
            status=400,
            errors=errors,
        )

    cooldown_left = _link_request_cooldown_seconds_remaining(current_user.id, "email_change")
    if cooldown_left > 0:
        return _legacy_api_error(
            error_code="security_link_cooldown",
            status=429,
            error="Please wait before requesting another email change link.",
            extra={"retry_after": cooldown_left},
        )

    token = _create_action_token(
        current_user.id,
        "email_change",
        payload={"new_email": new_email},
        ttl_minutes=30,
    )
    link = _frontend_token_url("/security/email-change", token)

    _send_email_background(
        new_email,
        "Confirm your email change",
        (
            "You requested to change your account email.\n\n"
            f"Open this link to confirm:\n{link}\n\n"
            "This link expires in 30 minutes."
        ),
    )
    _send_email_background(
        current_user.email,
        "Security notice: email change requested",
        (
            "A request was made to change your account email.\n"
            f"Requested new email: {new_email}\n\n"
            "If this was not you, reset your password immediately."
        ),
    )
    _audit_security_event(
        "profile.email_change.link_requested",
        user_id=current_user.id,
        details={"new_email": _mask_email(new_email)},
    )

    response = {"ok": True, "message": "Verification link sent to new email."}
    if ((os.getenv("PERSONAL_STATERA_DEV_MODE", "").lower() in ("1", "true", "yes")
            or os.getenv("DINARTRACK_DEV_MODE", "").lower() in ("1", "true", "yes"))
            and os.getenv("FLASK_ENV", "").lower() == "development"):
        response["preview_url"] = link
    return jsonify(response)


@bp.route("/api/auth/profile/confirm-email-change", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_CONFIRM_LIMIT, window_seconds=SECURITY_CONFIRM_WINDOW_SECONDS, key_func=_confirm_key)
def confirm_email_change():
    payload = request.get_json(silent=True) or {}
    token = payload.get("token") or ""
    row = _consume_action_token(token, "email_change")
    if not row:
        _audit_security_event("profile.email_change.confirm_failed", details={"reason": "invalid_or_expired_token"})
        db.session.commit()
        return _legacy_api_error(
            error_code="invalid_action_token",
            status=400,
            error="Invalid or expired token.",
        )

    data = json.loads(row.payload_json or "{}")
    new_email = normalize_email(data.get("new_email"))
    if not is_valid_email_format(new_email):
        _audit_security_event("profile.email_change.confirm_failed", details={"reason": "invalid_payload"})
        db.session.rollback()
        return _legacy_api_error(
            error_code="invalid_action_token_payload",
            status=400,
            error="Invalid token payload.",
        )

    user = db.session.get(User, row.user_id)
    if not user:
        _audit_security_event("profile.email_change.confirm_failed", details={"reason": "user_not_found"})
        db.session.rollback()
        return _legacy_api_error(
            error_code="user_not_found",
            status=404,
            error="Account not found.",
        )

    if User.query.filter(func.lower(User.email) == new_email, User.id != user.id).first():
        _audit_security_event(
            "profile.email_change.confirm_failed",
            user_id=user.id,
            details={"reason": "email_already_registered", "new_email": _mask_email(new_email)},
        )
        db.session.rollback()
        return _legacy_api_error(
            error_code="email_already_registered",
            status=409,
            error="Email already registered.",
        )

    old_email = user.email
    user.email = new_email
    bump_session_version(user)
    _audit_security_event(
        "profile.email_change.confirmed",
        user_id=user.id,
        details={"from": _mask_email(old_email), "to": _mask_email(new_email)},
    )
    db.session.commit()
    _send_email_background(
        old_email,
        "Security notice: email changed",
        f"Your account email was changed from {old_email} to {new_email}.",
    )
    _send_email_background(
        new_email,
        "Email change completed",
        f"Your account email is now {new_email}.",
    )
    return jsonify({"ok": True})


@bp.route("/api/auth/profile/request-password-change-link", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_LINK_REQUEST_LIMIT, window_seconds=SECURITY_LINK_REQUEST_WINDOW_SECONDS, key_func=_link_request_key)
@login_required
def request_password_change_link():
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password") or ""
    if not current_password:
        return _legacy_api_error(
            error_code="current_password_required",
            status=400,
            errors=["Current password is required."],
        )
    if not verify_password(current_user.password_hash, current_password)[0]:
        return _legacy_api_error(
            error_code="current_password_incorrect",
            status=400,
            errors=["Current password is incorrect."],
        )

    cooldown_left = _link_request_cooldown_seconds_remaining(current_user.id, "password_change")
    if cooldown_left > 0:
        return _legacy_api_error(
            error_code="security_link_cooldown",
            status=429,
            error="Please wait before requesting another password change link.",
            extra={"retry_after": cooldown_left},
        )

    token = _create_action_token(current_user.id, "password_change", payload={}, ttl_minutes=30)
    link = _frontend_token_url("/security/password-change", token)
    _send_email_background(
        current_user.email,
        "Confirm your password change",
        (
            "You requested to change your password.\n\n"
            f"Open this link to continue:\n{link}\n\n"
            "This link expires in 30 minutes."
        ),
    )
    _audit_security_event("profile.password_change.link_requested", user_id=current_user.id)
    response = {"ok": True, "message": "Password change link sent to your email."}
    if ((os.getenv("PERSONAL_STATERA_DEV_MODE", "").lower() in ("1", "true", "yes")
            or os.getenv("DINARTRACK_DEV_MODE", "").lower() in ("1", "true", "yes"))
            and os.getenv("FLASK_ENV", "").lower() == "development"):
        response["preview_url"] = link
    return jsonify(response)


@bp.route("/api/auth/profile/confirm-password-change", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@rate_limit(SECURITY_CONFIRM_LIMIT, window_seconds=SECURITY_CONFIRM_WINDOW_SECONDS, key_func=_confirm_key)
def confirm_password_change():
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

    row = _consume_action_token(token, "password_change")
    if not row:
        _audit_security_event("profile.password_change.confirm_failed", details={"reason": "invalid_or_expired_token"})
        db.session.commit()
        return _legacy_api_error(
            error_code="invalid_action_token",
            status=400,
            error="Invalid or expired token.",
        )

    user = db.session.get(User, row.user_id)
    if not user:
        _audit_security_event("profile.password_change.confirm_failed", details={"reason": "user_not_found"})
        db.session.rollback()
        return _legacy_api_error(
            error_code="user_not_found",
            status=404,
            error="Account not found.",
        )

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    bump_session_version(user)
    _audit_security_event("profile.password_change.confirmed", user_id=user.id)
    db.session.commit()
    _send_email_background(
        user.email,
        "Password changed",
        "Your account password was changed successfully. If this was not you, secure your account immediately.",
    )
    return jsonify({"ok": True})
