"""Authentication routes: register, login, logout, current user."""

from __future__ import annotations
import base64
import hashlib
import html
import io
import json
import os
import secrets
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint, request, jsonify, current_app, session
from flask_login import login_user, logout_user, login_required, current_user
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import and_
from sqlalchemy.sql import func
from sqlalchemy.exc import IntegrityError

import pyotp
import qrcode

from backend import db, bcrypt
from backend.constants import RATE_LIMIT_AUTH
from backend.email_service import send_email as email_send
from backend.email_service import send_email_background as email_send_background
from backend.money_math import quantize_kd
from backend.models import (
    AccountActionToken,
    BankConnection,
    BankConsent,
    BankSyncRun,
    Budget,
    Category,
    DataAccessLog,
    DashboardSnapshot,
    DebtAccount,
    Merchant,
    MemorizedTransaction,
    ProductEvent,
    RawBankTransaction,
    SavingsGoal,
    SecurityEvent,
    TemplateSuggestionFeedback,
    Transaction,
    User,
    UserProfile,
)
from backend.lib.cache import cache_bust_dashboard_metrics, cache_bust_safe_to_spend
from backend.lib.account_deletion import purge_user_account_rows
from backend.lib.crypto import decrypt, encrypt
from backend.lib.emails import is_valid_email_format, normalize_email
from backend.security_ops import rate_limit
from backend.lib.demo_data import (
    DemoDataConflictError,
    DemoDataNotLoadedError,
    clear_demo_workspace,
    get_demo_workspace_state,
    load_demo_workspace,
)
from backend.passwords import verify_password
from backend.product_events import record_event_once
from backend.security_ops import auth_email_key_func

bp = Blueprint("auth", __name__)


SECURITY_LINK_REQUEST_LIMIT = 5
SECURITY_LINK_REQUEST_WINDOW_SECONDS = 10 * 60
SECURITY_CONFIRM_LIMIT = 20
SECURITY_CONFIRM_WINDOW_SECONDS = 10 * 60
SECURITY_LINK_COOLDOWN_SECONDS = 60
PENDING_2FA_TTL_SECONDS = 5 * 60
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
TOTP_BACKUP_CODE_COUNT = 8
ACCOUNT_DELETE_CONFIRM_SECONDS = 30
REGISTER_EMAIL_ERROR = "Unable to create account with that email address."
DEFAULT_PROFILE_TIMEZONE = "Asia/Kuwait"
RATE_LIMIT_DEMO_DATA_CLEAR = 3
DEMO_DATA_CLEAR_WINDOW_SECONDS = 10 * 60


def _token_hash(raw: str) -> str:
    return hashlib.sha256((raw or "").encode("utf-8")).hexdigest()


def _as_utc(dt: datetime | None) -> datetime | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _mask_email(email: str) -> str:
    email = (email or "").strip()
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        local_masked = local[:1] + "*"
    else:
        local_masked = local[:2] + ("*" * max(len(local) - 2, 1))
    return f"{local_masked}@{domain}"


def _audit_security_event(event_type: str, user_id: int | None = None, details: dict | None = None):
    ua = (request.headers.get("User-Agent") or "").strip()[:255] or None
    ev = SecurityEvent(
        user_id=user_id,
        event_type=event_type,
        ip_address=(request.remote_addr or "unknown"),
        user_agent=ua,
        details_json=json.dumps(details or {}),
    )
    db.session.add(ev)


def _legacy_api_error(
    *,
    error_code: str,
    status: int,
    error: str | None = None,
    errors: list[str] | None = None,
    extra: dict | None = None,
):
    payload: dict[str, object] = {
        "ok": False,
        "error_code": error_code,
        "code": error_code,
    }
    if error is not None:
        payload["error"] = error
    if errors is not None:
        payload["errors"] = errors
    if extra:
        payload.update(extra)
    return jsonify(payload), status


def _default_profile_dict() -> dict:
    return {
        "monthly_income_kd": None,
        "payday_day": None,
        "country": None,
        "email_notifications_enabled": True,
        "has_debt_choice": None,
        "setup_guide_seen": False,
        "setup_guide_dismissed": False,
        "timezone": DEFAULT_PROFILE_TIMEZONE,
    }


def _profile_dict(row: UserProfile | None) -> dict:
    return row.to_dict() if row else _default_profile_dict()


def _normalize_profile_timezone(raw_value) -> str:
    if raw_value in (None, ""):
        return DEFAULT_PROFILE_TIMEZONE

    tz_name = str(raw_value).strip()
    if not tz_name:
        return DEFAULT_PROFILE_TIMEZONE
    if len(tz_name) > 64:
        raise ValueError("Timezone is too long (max 64 characters).")

    try:
        ZoneInfo(tz_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Timezone must be a valid IANA timezone, for example Asia/Kuwait.") from exc

    return tz_name


def _link_request_key() -> str:
    uid = str(getattr(current_user, "id", "anon"))
    ip = request.remote_addr or "unknown"
    endpoint = request.endpoint or "unknown"
    return f"security-link-request:{endpoint}:{uid}:{ip}"


def _forgot_request_key() -> str:
    payload = request.get_json(silent=True) or {}
    raw_email = normalize_email(payload.get("email"))
    email_fingerprint = _token_hash(raw_email)[:12] if raw_email else "none"
    ip = request.remote_addr or "unknown"
    endpoint = request.endpoint or "unknown"
    return f"forgot-password-request:{endpoint}:{ip}:{email_fingerprint}"


def _confirm_key() -> str:
    payload = request.get_json(silent=True) or {}
    raw = payload.get("token") or ""
    token_fingerprint = _token_hash(raw)[:12] if raw else "none"
    ip = request.remote_addr or "unknown"
    endpoint = request.endpoint or "unknown"
    return f"security-link-confirm:{endpoint}:{ip}:{token_fingerprint}"


def _current_user_endpoint_key(prefix: str) -> str:
    endpoint = request.endpoint or "unknown"
    user_id = getattr(current_user, "id", None)
    scoped_user_id = str(int(user_id)) if user_id is not None else "anon"
    return f"{prefix}:{endpoint}:user:{scoped_user_id}"


def _create_action_token(user_id: int, purpose: str, payload: dict | None = None, ttl_minutes: int = 30) -> str:
    raw = secrets.token_urlsafe(32)
    row = AccountActionToken(
        user_id=user_id,
        purpose=purpose,
        token_hash=_token_hash(raw),
        payload_json=json.dumps(payload or {}),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
    )
    db.session.add(row)
    db.session.commit()
    return raw


def cleanup_account_action_tokens(
    expired_grace_hours: int = 24,
    used_grace_days: int = 7,
) -> tuple[int, int]:
    """Delete stale account action tokens and return (expired_deleted, used_deleted)."""
    now = datetime.now(timezone.utc)
    expired_cutoff = now - timedelta(hours=expired_grace_hours)
    used_cutoff = now - timedelta(days=used_grace_days)

    expired_deleted = (
        AccountActionToken.query
        .filter(AccountActionToken.expires_at < expired_cutoff)
        .delete(synchronize_session=False)
    )
    used_deleted = (
        AccountActionToken.query
        .filter(
            and_(
                AccountActionToken.used_at.is_not(None),
                AccountActionToken.used_at < used_cutoff,
            )
        )
        .delete(synchronize_session=False)
    )
    if expired_deleted or used_deleted:
        db.session.commit()
    return expired_deleted, used_deleted


def _link_request_cooldown_seconds_remaining(user_id: int, purpose: str) -> int:
    now = datetime.now(timezone.utc)
    last = (
        AccountActionToken.query
        .filter(AccountActionToken.user_id == user_id)
        .filter(AccountActionToken.purpose == purpose)
        .filter(AccountActionToken.created_at.is_not(None))
        .order_by(AccountActionToken.created_at.desc())
        .first()
    )
    if not last:
        return 0
    created = _as_utc(last.created_at)
    if not created:
        return 0
    elapsed = (now - created).total_seconds()
    if elapsed >= SECURITY_LINK_COOLDOWN_SECONDS:
        return 0
    return int(SECURITY_LINK_COOLDOWN_SECONDS - elapsed)


def _consume_action_token(raw: str, purpose: str) -> AccountActionToken | None:
    if not raw:
        return None
    now = datetime.now(timezone.utc)
    row = (
        AccountActionToken.query
        .filter(AccountActionToken.token_hash == _token_hash(raw))
        .filter(AccountActionToken.purpose == purpose)
        .filter(AccountActionToken.used_at.is_(None))
        .filter(AccountActionToken.expires_at > now)
        .first()
    )
    if not row:
        return None
    row.used_at = now
    return row


def _frontend_url(path: str, query: dict[str, str] | None = None, fragment: str | None = None) -> str:
    base = (os.getenv("FRONTEND_BASE_URL") or "http://127.0.0.1:3001").rstrip("/")
    qs = urlencode(query or {})
    url = f"{base}{path}?{qs}" if qs else f"{base}{path}"
    if fragment:
        return f"{url}#{fragment}"
    return url


def _frontend_token_url(path: str, token: str) -> str:
    # Use URL fragment so token is not sent in HTTP requests or most referrers.
    return _frontend_url(path, fragment=urlencode({"token": token}))


def _send_email(to_email: str, subject: str, body: str) -> bool:
    safe_body = html.escape(body or "").replace("\n", "<br>")
    return email_send(
        to=to_email,
        subject=subject,
        html_body=f"<p>{safe_body}</p>",
        text_body=body or "",
    )


def _send_email_background(to_email: str, subject: str, body: str) -> bool:
    safe_body = html.escape(body or "").replace("\n", "<br>")
    return email_send_background(
        to=to_email,
        subject=subject,
        html_body=f"<p>{safe_body}</p>",
        text_body=body or "",
    )


def _normalize_auth_code(raw: str) -> str:
    return "".join((raw or "").strip().split())


def _generate_backup_codes(count: int = TOTP_BACKUP_CODE_COUNT) -> list[str]:
    codes: list[str] = []
    for _ in range(max(1, int(count))):
        left = secrets.token_hex(2)
        right = secrets.token_hex(2)
        codes.append(f"{left}-{right}")
    return codes


def _hash_backup_codes(codes: list[str]) -> list[str]:
    out: list[str] = []
    for code in codes:
        normalized = _normalize_auth_code(code).lower()
        if not normalized:
            continue
        out.append(bcrypt.generate_password_hash(normalized).decode("utf-8"))
    return out


def _load_backup_code_hashes(user: User) -> list[str]:
    raw = user.totp_backup_codes_json or "[]"
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]


def _save_backup_code_hashes(user: User, hashes: list[str]) -> None:
    user.totp_backup_codes_json = json.dumps(list(hashes))


def _verify_totp_code(secret_b32: str | None, code: str) -> bool:
    secret = (secret_b32 or "").strip()
    normalized = _normalize_auth_code(code)
    if not secret or not normalized:
        return False
    if not normalized.isdigit() or len(normalized) != TOTP_DIGITS:
        return False
    try:
        totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS)
        return bool(totp.verify(normalized, valid_window=1))
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        return False


def _consume_backup_code(user: User, code: str) -> tuple[bool, int]:
    normalized = _normalize_auth_code(code).lower()
    if not normalized:
        return False, len(_load_backup_code_hashes(user))

    hashes = _load_backup_code_hashes(user)
    for idx, stored_hash in enumerate(hashes):
        try:
            if bcrypt.check_password_hash(stored_hash, normalized):
                del hashes[idx]
                _save_backup_code_hashes(user, hashes)
                return True, len(hashes)
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            continue
    return False, len(hashes)


def _clear_pending_2fa_session() -> None:
    for key in ("pending_2fa_user_id", "pending_2fa_at", "pending_2fa_remember"):
        session.pop(key, None)


def _pending_2fa_user() -> tuple[User | None, int | None]:
    user_id = session.get("pending_2fa_user_id")
    pending_at = session.get("pending_2fa_at")
    if not user_id or not pending_at:
        return None, None

    try:
        pending_at_ts = int(pending_at)
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        _clear_pending_2fa_session()
        return None, None

    now_ts = int(time.time())
    if now_ts - pending_at_ts > PENDING_2FA_TTL_SECONDS:
        _clear_pending_2fa_session()
        return None, None

    user = db.session.get(User, int(user_id))
    if not user:
        _clear_pending_2fa_session()
        return None, None
    return user, pending_at_ts


def _start_pending_2fa(*, user: User, remember: bool) -> None:
    logout_user()
    _clear_pending_2fa_session()
    session["pending_2fa_user_id"] = int(user.id)
    session["pending_2fa_at"] = int(time.time())
    session["pending_2fa_remember"] = bool(remember)
    session.modified = True


def _finalize_login_session(user: User, *, remember: bool) -> None:
    _clear_pending_2fa_session()
    login_user(user, remember=remember)
    session.permanent = True
    session["sv"] = int(user.session_version or 1)
    session.modified = True


def bump_session_version(user: User, *, update_current_session: bool = False) -> int:
    current = int(user.session_version or 1)
    user.session_version = current + 1
    if update_current_session:
        session["sv"] = int(user.session_version)
        session.modified = True
    return int(user.session_version)


def _totp_qr_data_uri(secret_b32: str, email: str) -> str:
    issuer = "Personal Statera"
    totp = pyotp.TOTP(secret_b32, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS)
    uri = totp.provisioning_uri(name=email, issuer_name=issuer)

    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _account_delete_token_key() -> str:
    return "account_delete_token_hash"


def _account_delete_expiry_key() -> str:
    return "account_delete_token_expires_at"


def _clear_account_delete_confirmation() -> None:
    session.pop(_account_delete_token_key(), None)
    session.pop(_account_delete_expiry_key(), None)
    session.modified = True


def _issue_account_delete_confirmation_token() -> str:
    token = secrets.token_urlsafe(24)
    session[_account_delete_token_key()] = _token_hash(token)
    session[_account_delete_expiry_key()] = int(time.time()) + ACCOUNT_DELETE_CONFIRM_SECONDS
    session.modified = True
    return token


def _validate_account_delete_confirmation_token(token: str) -> tuple[bool, str | None]:
    expected_hash = str(session.get(_account_delete_token_key()) or "")
    expires_at = session.get(_account_delete_expiry_key())
    if not expected_hash or not expires_at:
        return False, "MISSING_CONFIRMATION_TOKEN"
    try:
        expiry_ts = int(expires_at)
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        _clear_account_delete_confirmation()
        return False, "MISSING_CONFIRMATION_TOKEN"
    if int(time.time()) > expiry_ts:
        _clear_account_delete_confirmation()
        return False, "CONFIRMATION_TOKEN_EXPIRED"
    if _token_hash(token or "") != expected_hash:
        return False, "INVALID_CONFIRMATION_TOKEN"
    return True, None


def _email_hash(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


def _account_delete_status_serializer() -> URLSafeSerializer:
    return URLSafeSerializer(
        current_app.config["SECRET_KEY"],
        salt="account-delete-status",
    )


def _issue_account_delete_status_token(task_id: str) -> str:
    safe_task_id = str(task_id or "").strip()
    return encrypt(
        json.dumps(
            {
                "type": "account_delete_status",
                "task_id": safe_task_id,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
    )


def _resolve_account_delete_status_token(raw_token: str) -> tuple[str | None, str | None]:
    safe_token = str(raw_token or "").strip()
    if not safe_token:
        return None, "task_id_required"

    # Backward-compatible legacy fallback for synchronous responses issued
    # before the opaque-token poll token was introduced.
    if safe_token == "sync":
        return "sync", None

    payload = None
    if safe_token.startswith("enc1:"):
        try:
            decoded = decrypt(safe_token)
            payload = json.loads(decoded)
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            return None, "invalid_task_id"
    else:
        try:
            payload = _account_delete_status_serializer().loads(safe_token)
        except BadSignature:
            return None, "invalid_task_id"

    if not isinstance(payload, dict) or payload.get("type") != "account_delete_status":
        return None, "invalid_task_id"

    task_id = str(payload.get("task_id") or "").strip()
    if not task_id:
        return None, "invalid_task_id"
    return task_id, None


def _delete_account_data(user: User) -> None:
    ua = (request.headers.get("User-Agent") or "").strip()[:255] or None
    purge_user_account_rows(
        user_id=int(user.id),
        email_hash=_email_hash(user.email),
        audit_ip_address=(request.remote_addr or "unknown"),
        audit_user_agent=ua,
    )


@bp.route("/api/auth/register", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
def register():
    """Create a new user account."""
    payload = request.get_json(silent=True) or {}

    email = normalize_email(payload.get("email"))
    password = payload.get("password") or ""
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()

    # Backward compat: split legacy display_name if first_name not provided
    if not first_name:
        legacy_dn = (payload.get("display_name") or "").strip()
        if legacy_dn:
            parts = legacy_dn.split(" ", 1)
            first_name = parts[0]
            if not last_name and len(parts) > 1:
                last_name = parts[1]

    errors = []
    if not email:
        errors.append("Email is required.")
    elif not is_valid_email_format(email):
        errors.append(REGISTER_EMAIL_ERROR)

    if not password:
        errors.append("Password is required.")
    elif len(password) < 8:
        errors.append("Password must be at least 8 characters.")
    elif len(password) > 128:
        errors.append("Password too long (max 128 characters).")

    if first_name and len(first_name) > 64:
        errors.append("First name too long (max 64 characters).")
    if last_name and len(last_name) > 64:
        errors.append("Last name too long (max 64 characters).")

    if errors:
        return _legacy_api_error(
            error_code="validation_error",
            status=400,
            errors=errors,
        )

    if User.query.filter(func.lower(User.email) == email).first():
        return _legacy_api_error(
            error_code="auth_register_email_unavailable",
            status=400,
            errors=[REGISTER_EMAIL_ERROR],
        )

    computed_display_name = " ".join(filter(None, [first_name, last_name])) or None

    try:
        user = User(
            email=email,
            password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
            first_name=first_name or None,
            last_name=last_name or None,
            display_name=computed_display_name,
        )
        db.session.add(user)
        db.session.flush()
        from backend.lib.categories import get_uncategorized
        get_uncategorized(user.id)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _legacy_api_error(
            error_code="auth_register_email_unavailable",
            status=400,
            errors=[REGISTER_EMAIL_ERROR],
        )

    try:
        record_event_once(
            "signup_completed",
            user.id,
            properties={"source": "register_api"},
            commit=True,
        )
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        db.session.rollback()
        current_app.logger.exception("Failed to record signup_completed event for user_id=%s", user.id)

    # Flask-Login currently emits a datetime.utcnow() deprecation warning when
    # setting remember cookies. Keep production behavior, but avoid noisy test
    # warnings by disabling remember cookies under TESTING.
    _finalize_login_session(user, remember=not bool(current_app.config.get("TESTING")))
    return jsonify({"ok": True, "user": user.to_dict()}), 201


@bp.route("/api/auth/login", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)                                      # per-IP guard
@rate_limit(RATE_LIMIT_AUTH, key_func=auth_email_key_func)        # per-email guard (credential stuffing)
def login():
    """Authenticate with email + password."""
    payload = request.get_json(silent=True) or {}

    email = normalize_email(payload.get("email"))
    password = payload.get("password") or ""

    if not email or not password:
        return _legacy_api_error(
            error_code="auth_credentials_required",
            status=400,
            error="Email and password are required.",
        )

    user = User.query.filter(func.lower(User.email) == email).first()

    if not user:
        # Do not reveal whether the email exists — same response as wrong password.
        _audit_security_event("login.failed", details={"reason": "user_not_found"})
        try:
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
        return _legacy_api_error(
            error_code="auth_invalid_credentials",
            status=401,
            error="Invalid email or password.",
        )

    password_ok, needs_rehash = verify_password(user.password_hash, password)
    if not password_ok:
        _audit_security_event("login.failed", user_id=user.id, details={"reason": "wrong_password"})
        try:
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
        return _legacy_api_error(
            error_code="auth_invalid_credentials",
            status=401,
            error="Invalid email or password.",
        )

    if not user.is_active:
        _audit_security_event("login.failed", user_id=user.id, details={"reason": "account_disabled"})
        try:
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
        return _legacy_api_error(
            error_code="auth_account_disabled",
            status=403,
            error="Account is disabled.",
        )

    # Upgrade legacy password hash in its own commit so a failure here does not
    # prevent the login from succeeding.
    if needs_rehash:
        try:
            user.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
            current_app.logger.exception(
                "Failed to upgrade legacy password hash for user_id=%s",
                user.id,
            )

    if "remember_me" in payload:
        remember_me = bool(payload.get("remember_me"))
    else:
        # Preserve existing runtime behavior for real clients while avoiding
        # third-party deprecation noise in tests.
        remember_me = not bool(current_app.config.get("TESTING"))
    if bool(user.totp_enabled):
        _start_pending_2fa(user=user, remember=remember_me)
        _audit_security_event("login.pending_2fa", user_id=user.id)
        try:
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
            current_app.logger.exception("Failed to record login.pending_2fa event for user_id=%s", user.id)
        return jsonify({"ok": True, "requires_2fa": True})

    _finalize_login_session(user, remember=remember_me)
    _audit_security_event("login.success", user_id=user.id)
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        db.session.rollback()
        current_app.logger.exception("Failed to record login.success event for user_id=%s", user.id)
    return jsonify({"ok": True, "user": user.to_dict()})


@bp.route("/api/auth/2fa/setup", methods=["POST"])
@rate_limit(5, window_seconds=60)
@login_required
def setup_2fa():
    if bool(current_user.totp_enabled):
        return _legacy_api_error(
            error_code="TOTP_ALREADY_ENABLED",
            status=400,
            error="Two-factor authentication is already enabled.",
        )

    secret_b32 = pyotp.random_base32()
    backup_codes = _generate_backup_codes(TOTP_BACKUP_CODE_COUNT)
    current_user.totp_secret = secret_b32
    current_user.totp_enabled = False
    _save_backup_code_hashes(current_user, _hash_backup_codes(backup_codes))
    _audit_security_event("auth.2fa.setup.started", user_id=current_user.id)
    db.session.commit()

    return jsonify({
        "ok": True,
        "qr_data_uri": _totp_qr_data_uri(secret_b32, current_user.email),
        "secret_b32": secret_b32,
        "backup_codes": backup_codes,
    })


@bp.route("/api/auth/2fa/confirm", methods=["POST"])
@rate_limit(5, window_seconds=60)
@login_required
def confirm_2fa():
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code") or "")
    if not _verify_totp_code(current_user.totp_secret, code):
        _audit_security_event("auth.2fa.confirm_failed", user_id=current_user.id)
        db.session.commit()
        return _legacy_api_error(
            error_code="INVALID_TOTP_CODE",
            status=401,
            error="Invalid authentication code.",
        )

    current_user.totp_enabled = True
    _audit_security_event("auth.2fa.enabled", user_id=current_user.id)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/auth/2fa/verify", methods=["POST"])
@rate_limit(5, window_seconds=60)
def verify_2fa():
    payload = request.get_json(silent=True) or {}
    user, _pending_at = _pending_2fa_user()
    if not user or not bool(user.totp_enabled):
        _clear_pending_2fa_session()
        return _legacy_api_error(
            error_code="PENDING_2FA_EXPIRED",
            status=410,
            error="2FA verification session expired.",
        )

    code = str(payload.get("code") or "")
    verification_type = str(payload.get("type") or "totp").strip().lower()
    remember_me = bool(session.get("pending_2fa_remember"))

    if verification_type == "backup":
        consumed, remaining = _consume_backup_code(user, code)
        if not consumed:
            _audit_security_event("login.2fa.failed", user_id=user.id, details={"type": "backup"})
            db.session.commit()
            return _legacy_api_error(
                error_code="INVALID_TOTP_CODE",
                status=401,
                error="Invalid authentication code.",
            )

        _audit_security_event("login.success", user_id=user.id, details={"via": "backup"})
        try:
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
            return _legacy_api_error(
                error_code="auth_login_finalize_failed",
                status=500,
                error="Unable to complete login right now.",
            )

        _finalize_login_session(user, remember=remember_me)
        response: dict[str, object] = {"ok": True}
        if remaining <= 2:
            response["warning"] = "BACKUP_CODES_LOW"
            response["backup_codes_remaining"] = remaining
        return jsonify(response)

    if not _verify_totp_code(user.totp_secret, code):
        _audit_security_event("login.2fa.failed", user_id=user.id, details={"type": "totp"})
        db.session.commit()
        return _legacy_api_error(
            error_code="INVALID_TOTP_CODE",
            status=401,
            error="Invalid authentication code.",
        )

    _audit_security_event("login.success", user_id=user.id, details={"via": "totp"})
    try:
        db.session.commit()
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        db.session.rollback()
        return _legacy_api_error(
            error_code="auth_login_finalize_failed",
            status=500,
            error="Unable to complete login right now.",
        )

    _finalize_login_session(user, remember=remember_me)
    return jsonify({"ok": True})


@bp.route("/api/auth/2fa/disable", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def disable_2fa():
    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    code = str(payload.get("code") or "")

    if not bool(current_user.totp_enabled):
        return _legacy_api_error(
            error_code="TOTP_NOT_ENABLED",
            status=400,
            error="Two-factor authentication is not enabled.",
        )

    if not password or not verify_password(current_user.password_hash, password)[0]:
        return _legacy_api_error(
            error_code="current_password_incorrect",
            status=401,
            error="Current password is incorrect.",
        )

    if not _verify_totp_code(current_user.totp_secret, code):
        return _legacy_api_error(
            error_code="INVALID_TOTP_CODE",
            status=401,
            error="Invalid authentication code.",
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_backup_codes_json = None
    _audit_security_event("auth.2fa.disabled", user_id=current_user.id)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    """Log out the current user."""
    logout_user()
    return jsonify({"ok": True})


@bp.route("/api/auth/sessions/revoke-all", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def revoke_all_sessions():
    version = bump_session_version(current_user, update_current_session=True)
    _audit_security_event(
        "sessions.revoke_all",
        user_id=current_user.id,
        details={"session_version": version},
    )
    db.session.commit()
    return jsonify({"ok": True, "session_version": version})


@bp.route("/api/account", methods=["DELETE"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def delete_account():
    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    confirmation_token = str(payload.get("confirmation_token") or "").strip()
    totp_code = str(payload.get("totp_code") or "")

    if not verify_password(current_user.password_hash, password)[0]:
        return _legacy_api_error(
            error_code="current_password_incorrect",
            status=401,
            error="Current password is incorrect.",
        )

    if bool(current_user.totp_enabled):
        if not _verify_totp_code(current_user.totp_secret, totp_code):
            return _legacy_api_error(
                error_code="INVALID_TOTP_CODE",
                status=401,
                error="Invalid authentication code.",
            )

    if not confirmation_token:
        token = _issue_account_delete_confirmation_token()
        return (
            jsonify(
                {
                    "ok": True,
                    "data": {
                        "confirmation_token": token,
                        "expires_in": ACCOUNT_DELETE_CONFIRM_SECONDS,
                    },
                }
            ),
            202,
        )

    token_ok, token_error = _validate_account_delete_confirmation_token(confirmation_token)
    if not token_ok:
        if token_error == "CONFIRMATION_TOKEN_EXPIRED":
            return _legacy_api_error(
                error_code="CONFIRMATION_TOKEN_EXPIRED",
                status=410,
                error="Confirmation token expired.",
            )
        return _legacy_api_error(
            error_code=token_error or "INVALID_CONFIRMATION_TOKEN",
            status=400,
            error="Invalid confirmation token.",
        )

    user = db.session.get(User, int(current_user.id))
    if not user:
        return _legacy_api_error(
            error_code="user_not_found",
            status=404,
            error="Account not found.",
        )

    uid = int(user.id)
    email_hash = _email_hash(user.email)

    # Dispatch async deletion so large datasets don't timeout the HTTP request.
    # The user is logged out immediately; the data deletion happens in the background.
    try:
        from backend.tasks import delete_account_data as _delete_task
        result = _delete_task.apply_async(
            kwargs={"user_id": uid, "email_hash": email_hash},
        )
        task_id = str(result.id)
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        current_app.logger.exception(
            "Failed to enqueue account deletion for user_id=%s; falling back to sync.", uid
        )
        # Synchronous fallback if Celery is not available (e.g. dev without a worker).
        try:
            _delete_account_data(user)
            db.session.commit()
        except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
            db.session.rollback()
            current_app.logger.exception("Sync account deletion failed for user_id=%s", uid)
            return _legacy_api_error(
                error_code="account_delete_failed",
                status=500,
                error="Failed to delete account.",
            )
        task_id = "sync"
    task_status_token = _issue_account_delete_status_token(task_id)

    _clear_account_delete_confirmation()
    logout_user()
    session.clear()
    return jsonify({"ok": True, "data": {"deleted": True, "task_id": task_status_token}})


@bp.route("/api/account/deletion-status/<task_id>", methods=["GET"])
@rate_limit(RATE_LIMIT_AUTH)
def account_deletion_status(task_id: str):
    """Poll the status of an async account deletion task.

    The public path token is an opaque signed token returned by DELETE
    ``/api/account``. Raw Celery task ids are not accepted.
    """
    resolved_task_id, token_error = _resolve_account_delete_status_token(task_id)
    if token_error:
        return _legacy_api_error(
            error_code=token_error,
            status=400,
            error="Invalid account deletion task token." if token_error == "invalid_task_id" else "task_id is required.",
        )

    if resolved_task_id == "sync":
        return jsonify({"ok": True, "data": {"status": "complete", "task_id": str(task_id or '').strip()}})

    try:
        from celery.result import AsyncResult
        from backend.worker import celery_app as _celery
        result = AsyncResult(resolved_task_id, app=_celery)
        state = (result.state or "PENDING").upper()
        if state == "SUCCESS":
            status = "complete"
        elif state in ("FAILURE", "REVOKED"):
            status = "failed"
        else:
            status = "pending"
        return jsonify({"ok": True, "data": {"status": status, "task_id": str(task_id or '').strip()}})
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        current_app.logger.exception("Failed to query deletion task_id=%s", resolved_task_id)
        return jsonify({"ok": True, "data": {"status": "pending", "task_id": str(task_id or '').strip()}})


@bp.route("/api/auth/me")
@login_required
def me():
    """Get current authenticated user and feature flags."""
    from flask import current_app
    flags = {
        "open_banking": bool(current_app.config.get("ENABLE_OPEN_BANKING", False)),
        "template_suggestions": bool(current_app.config.get("ENABLE_TEMPLATE_SUGGESTIONS", False)),
        "recurring_patterns": bool(current_app.config.get("ENABLE_RECURRING_PATTERNS", True)),
    }
    return jsonify({"ok": True, "user": current_user.to_dict(), "flags": flags})


@bp.route("/api/auth/profile")
@login_required
def profile_get():
    """Get current user profile data."""
    profile = UserProfile.query.filter_by(user_id=current_user.id).first()
    return jsonify({
        "ok": True,
        "user": current_user.to_dict(),
        "profile": _profile_dict(profile),
        "demo_workspace": get_demo_workspace_state(int(current_user.id)),
    })


@bp.route("/api/auth/demo-data", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def profile_load_demo_data():
    """Load a demo workspace for a brand-new account."""
    try:
        summary = load_demo_workspace(int(current_user.id))
        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)
        return jsonify({"ok": True, "data": summary})
    except DemoDataConflictError:
        db.session.rollback()
        return _legacy_api_error(
            error_code="demo_data_not_empty",
            status=409,
            error="Demo data can only be loaded into an empty account.",
        )
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        db.session.rollback()
        current_app.logger.exception("Failed to load demo data for user_id=%s", current_user.id)
        return _legacy_api_error(
            error_code="demo_data_load_failed",
            status=500,
            error="Failed to load demo data.",
        )


@bp.route("/api/auth/demo-data/clear", methods=["POST"])
@rate_limit(
    RATE_LIMIT_DEMO_DATA_CLEAR,
    window_seconds=DEMO_DATA_CLEAR_WINDOW_SECONDS,
    key_func=lambda: _current_user_endpoint_key("demo-data-clear"),
)
@login_required
def profile_clear_demo_data():
    """Remove the demo workspace artifacts without deleting the account."""
    try:
        summary = clear_demo_workspace(int(current_user.id))
        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)
        return jsonify({"ok": True, "data": summary})
    except DemoDataNotLoadedError:
        db.session.rollback()
        return _legacy_api_error(
            error_code="demo_data_not_loaded",
            status=409,
            error="No active demo workspace was found.",
        )
    except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
        db.session.rollback()
        current_app.logger.exception("Failed to clear demo data for user_id=%s", current_user.id)
        return _legacy_api_error(
            error_code="demo_data_clear_failed",
            status=500,
            error="Failed to clear demo data.",
        )


@bp.route("/api/auth/profile/security-events")
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def profile_security_events():
    raw_limit = request.args.get("limit", "20")
    raw_offset = request.args.get("offset", "0")
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 50))
    try:
        offset = int(raw_offset)
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)

    rows = (
        SecurityEvent.query
        .filter(SecurityEvent.user_id == current_user.id)
        .filter(SecurityEvent.event_type.like("profile.%"))
        .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc())
        .offset(offset)
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = []
    for row in rows:
        details = {}
        if row.details_json:
            try:
                decoded = json.loads(row.details_json)
                if isinstance(decoded, dict):
                    details = decoded
            except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
                details = {}
        items.append({
            "id": row.id,
            "event_type": row.event_type,
            "ip_address": row.ip_address,
            "user_agent": row.user_agent,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "details": details,
        })

    return jsonify({"ok": True, "items": items, "has_more": has_more, "offset": offset, "limit": limit})


@bp.route("/api/auth/profile/update", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def profile_update():
    """Update non-sensitive profile fields."""
    payload = request.get_json(silent=True) or {}
    profile = UserProfile.query.filter_by(user_id=current_user.id).first()
    errors = []
    changed_fields = []

    first_name_supplied = "first_name" in payload
    first_name = current_user.first_name
    if first_name_supplied:
        first_name = (payload.get("first_name") or "").strip() or None
        if first_name and len(first_name) > 64:
            errors.append("First name too long (max 64 characters).")

    last_name_supplied = "last_name" in payload
    last_name = current_user.last_name
    if last_name_supplied:
        last_name = (payload.get("last_name") or "").strip() or None
        if last_name and len(last_name) > 64:
            errors.append("Last name too long (max 64 characters).")

    display_name_supplied = "display_name" in payload
    display_name = current_user.display_name
    if display_name_supplied:
        display_name = (payload.get("display_name") or "").strip() or None
        if display_name and len(display_name) > 128:
            errors.append("Display name too long (max 128 characters).")

    monthly_income_supplied = "monthly_income_kd" in payload
    monthly_income_kd = profile.monthly_income_kd if profile else None
    if monthly_income_supplied:
        raw_income = payload.get("monthly_income_kd")
        if raw_income in (None, ""):
            monthly_income_kd = None
        else:
            try:
                monthly_income_kd = quantize_kd(raw_income)
                if monthly_income_kd < 0:
                    errors.append("Monthly income cannot be negative.")
                elif monthly_income_kd > Decimal("1000000000"):
                    errors.append("Monthly income is too large.")
            except (InvalidOperation, ValueError):
                errors.append("Monthly income must be a valid number.")

    payday_day_supplied = "payday_day" in payload
    payday_day = profile.payday_day if profile else None
    if payday_day_supplied:
        raw_payday_day = payload.get("payday_day")
        if raw_payday_day in (None, ""):
            payday_day = None
        else:
            try:
                payday_day = int(raw_payday_day)
                if payday_day < 1 or payday_day > 31:
                    errors.append("Payday day must be between 1 and 31.")
            except (TypeError, ValueError):
                errors.append("Payday day must be a whole number.")

    country_supplied = "country" in payload
    country = profile.country if profile else None
    if country_supplied:
        country = (payload.get("country") or "").strip() or None
        if country and len(country) > 64:
            errors.append("Country is too long (max 64 characters).")

    timezone_supplied = "timezone" in payload
    profile_timezone = (profile.timezone if profile and profile.timezone else DEFAULT_PROFILE_TIMEZONE)
    if timezone_supplied:
        try:
            profile_timezone = _normalize_profile_timezone(payload.get("timezone"))
        except ValueError as exc:
            errors.append(str(exc))

    email_notifications_supplied = "email_notifications_enabled" in payload
    email_notifications_enabled = (
        bool(profile.email_notifications_enabled) if profile else True
    )
    if email_notifications_supplied:
        raw_notifications = payload.get("email_notifications_enabled")
        if isinstance(raw_notifications, bool):
            email_notifications_enabled = raw_notifications
        elif raw_notifications in (0, 1, "0", "1", "true", "false", "yes", "no", "on", "off"):
            email_notifications_enabled = str(raw_notifications).strip().lower() in {"1", "true", "yes", "on"}
        else:
            errors.append("email_notifications_enabled must be a boolean.")

    has_debt_choice_supplied = "has_debt_choice" in payload
    has_debt_choice = profile.has_debt_choice if profile else None
    if has_debt_choice_supplied:
        raw_has_debt_choice = payload.get("has_debt_choice")
        if raw_has_debt_choice in (None, ""):
            has_debt_choice = None
        elif isinstance(raw_has_debt_choice, bool):
            has_debt_choice = raw_has_debt_choice
        elif raw_has_debt_choice in (0, 1, "0", "1", "true", "false", "yes", "no", "on", "off"):
            has_debt_choice = str(raw_has_debt_choice).strip().lower() in {"1", "true", "yes", "on"}
        else:
            errors.append("has_debt_choice must be a boolean.")

    setup_guide_seen_supplied = "setup_guide_seen" in payload
    setup_guide_seen = bool(profile.setup_guide_seen) if profile else False
    if setup_guide_seen_supplied:
        raw_setup_guide_seen = payload.get("setup_guide_seen")
        if isinstance(raw_setup_guide_seen, bool):
            setup_guide_seen = raw_setup_guide_seen
        elif raw_setup_guide_seen in (0, 1, "0", "1", "true", "false", "yes", "no", "on", "off"):
            setup_guide_seen = str(raw_setup_guide_seen).strip().lower() in {"1", "true", "yes", "on"}
        else:
            errors.append("setup_guide_seen must be a boolean.")

    setup_guide_dismissed_supplied = "setup_guide_dismissed" in payload
    setup_guide_dismissed = bool(profile.setup_guide_dismissed) if profile else False
    if setup_guide_dismissed_supplied:
        raw_setup_guide_dismissed = payload.get("setup_guide_dismissed")
        if isinstance(raw_setup_guide_dismissed, bool):
            setup_guide_dismissed = raw_setup_guide_dismissed
        elif raw_setup_guide_dismissed in (0, 1, "0", "1", "true", "false", "yes", "no", "on", "off"):
            setup_guide_dismissed = str(raw_setup_guide_dismissed).strip().lower() in {"1", "true", "yes", "on"}
        else:
            errors.append("setup_guide_dismissed must be a boolean.")

    if errors:
        return _legacy_api_error(
            error_code="validation_error",
            status=400,
            errors=errors,
        )

    if first_name_supplied and current_user.first_name != first_name:
        current_user.first_name = first_name
        changed_fields.append("first_name")

    if last_name_supplied and current_user.last_name != last_name:
        current_user.last_name = last_name
        changed_fields.append("last_name")

    # Keep display_name in sync with first_name + last_name
    if first_name_supplied or last_name_supplied:
        fn = current_user.first_name or ""
        ln = current_user.last_name or ""
        computed_dn = " ".join(filter(None, [fn, ln])) or None
        if current_user.display_name != computed_dn:
            old_display_name = current_user.display_name
            current_user.display_name = computed_dn
            changed_fields.append("display_name")
            _audit_security_event(
                "profile.display_name.updated",
                user_id=current_user.id,
                details={"from": old_display_name, "to": current_user.display_name},
            )
    elif display_name_supplied and current_user.display_name != display_name:
        old_display_name = current_user.display_name
        current_user.display_name = display_name
        changed_fields.append("display_name")
        _audit_security_event(
            "profile.display_name.updated",
            user_id=current_user.id,
            details={"from": old_display_name, "to": current_user.display_name},
        )

    profile_fields_supplied = (
        monthly_income_supplied
        or payday_day_supplied
        or country_supplied
        or timezone_supplied
        or email_notifications_supplied
        or has_debt_choice_supplied
        or setup_guide_seen_supplied
        or setup_guide_dismissed_supplied
    )
    if profile_fields_supplied:
        if profile is None and (
            any(v is not None for v in (monthly_income_kd, payday_day, country, has_debt_choice))
            or (timezone_supplied and profile_timezone != DEFAULT_PROFILE_TIMEZONE)
            or setup_guide_seen
            or setup_guide_dismissed
            or (email_notifications_supplied and (email_notifications_enabled is not True))
        ):
            profile = UserProfile(user_id=current_user.id)
            db.session.add(profile)
        if profile is not None:
            if monthly_income_supplied and profile.monthly_income_kd != monthly_income_kd:
                profile.monthly_income_kd = monthly_income_kd
                changed_fields.append("monthly_income_kd")
            if payday_day_supplied and profile.payday_day != payday_day:
                profile.payday_day = payday_day
                changed_fields.append("payday_day")
            if country_supplied and profile.country != country:
                profile.country = country
                changed_fields.append("country")
            if timezone_supplied and (profile.timezone or DEFAULT_PROFILE_TIMEZONE) != profile_timezone:
                profile.timezone = profile_timezone
                changed_fields.append("timezone")
            if (
                email_notifications_supplied
                and bool(profile.email_notifications_enabled) != bool(email_notifications_enabled)
            ):
                profile.email_notifications_enabled = bool(email_notifications_enabled)
                changed_fields.append("email_notifications_enabled")
            if has_debt_choice_supplied and profile.has_debt_choice != has_debt_choice:
                profile.has_debt_choice = has_debt_choice
                changed_fields.append("has_debt_choice")
            if setup_guide_seen_supplied and bool(profile.setup_guide_seen) != bool(setup_guide_seen):
                profile.setup_guide_seen = bool(setup_guide_seen)
                changed_fields.append("setup_guide_seen")
            if (
                setup_guide_dismissed_supplied
                and bool(profile.setup_guide_dismissed) != bool(setup_guide_dismissed)
            ):
                profile.setup_guide_dismissed = bool(setup_guide_dismissed)
                changed_fields.append("setup_guide_dismissed")

    if changed_fields:
        _audit_security_event(
            "profile.updated",
            user_id=current_user.id,
            details={"fields": changed_fields},
        )
        db.session.commit()

    return jsonify({"ok": True, "user": current_user.to_dict(), "profile": _profile_dict(profile)})


@bp.route("/api/auth/profile/change-password", methods=["POST"])
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def profile_change_password():
    """Change password using current password verification."""
    payload = request.get_json(silent=True) or {}

    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    errors = []
    if not current_password:
        errors.append("Current password is required.")
    elif not verify_password(current_user.password_hash, current_password)[0]:
        errors.append("Current password is incorrect.")

    if not new_password:
        errors.append("New password is required.")
    elif len(new_password) < 8:
        errors.append("New password must be at least 8 characters.")
    elif len(new_password) > 128:
        errors.append("New password too long (max 128 characters).")

    if new_password and current_password and new_password == current_password:
        errors.append("New password must be different from current password.")

    if new_password != confirm_password:
        errors.append("Password confirmation does not match.")

    if errors:
        return _legacy_api_error(
            error_code="validation_error",
            status=400,
            errors=errors,
        )

    current_user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    bump_session_version(current_user, update_current_session=True)
    _audit_security_event("profile.password.changed", user_id=current_user.id)
    db.session.commit()
    current_app.logger.info("SECURITY EVENT: password changed for user_id=%s", current_user.id)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Internal audit log — all security events for the current user
# ---------------------------------------------------------------------------

@bp.route("/internal/audit-log")
@rate_limit(RATE_LIMIT_AUTH)
@login_required
def internal_audit_log():
    """Return paginated security events for the authenticated user.

    Query params:
      limit       int  1–100 (default 25)
      offset      int  (default 0)
      event_type  str  filter prefix (e.g. "bank." returns all bank.* events)
      since       str  ISO date YYYY-MM-DD — only events on/after this date
    """
    try:
        limit = max(1, min(int(request.args.get("limit", 25)), 100))
    except (TypeError, ValueError):
        limit = 25
    try:
        offset = max(0, int(request.args.get("offset", 0)))
    except (TypeError, ValueError):
        offset = 0

    event_type_prefix = (request.args.get("event_type") or "").strip()
    since_raw = (request.args.get("since") or "").strip()

    query = SecurityEvent.query.filter(SecurityEvent.user_id == current_user.id)

    if event_type_prefix:
        query = query.filter(SecurityEvent.event_type.like(f"{event_type_prefix}%"))

    if since_raw:
        try:
            since_date = datetime.strptime(since_raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(SecurityEvent.created_at >= since_date)
        except ValueError:
            return _legacy_api_error(
                error_code="invalid_since_date",
                status=400,
                error="since must be YYYY-MM-DD",
            )

    total = query.count()
    rows = (
        query
        .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for row in rows:
        details: dict = {}
        if row.details_json:
            try:
                parsed = json.loads(row.details_json)
                if isinstance(parsed, dict):
                    details = parsed
            except Exception:  # noqa: BLE001 - auth routes treat secondary side effects as best-effort and return generic failures for safety.
                pass
        items.append({
            "id": row.id,
            "event_type": row.event_type,
            "ip_address": row.ip_address,
            "user_agent": row.user_agent,
            "details": details,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        })

    return jsonify({
        "ok": True,
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(items) < total,
    })
