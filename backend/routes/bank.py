"""Open Banking skeleton routes."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request, session
from flask_login import current_user, login_required
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from backend import db
from backend.api_response import error_response, ok_response
from backend.constants import RATE_LIMIT_BANK_SYNC, RATE_LIMIT_IMPORT, UNCAT_NAME
from backend.lib.cache import cache_bust_dashboard_metrics, cache_bust_safe_to_spend
from backend.money_math import format_kd
from backend.lib.transactions import build_name_key, create_transaction_with_dup_check
from backend.security_ops import rate_limit
from backend.models import (
    BankConnection,
    BankConsent,
    BankSyncRun,
    DataAccessLog,
    RawBankTransaction,
    SecurityEvent,
    Transaction,
)
from backend.bank_ops import purge_revoked_consent_raw_data
from backend.email_service import send_templated_email_background
from backend.product_events import record_event
from backend.providers import (
    get_bank_provider,
    list_bank_provider_entries,
    list_bank_provider_names,
)

bp = Blueprint("bank", __name__)
log = logging.getLogger(__name__)

_ALLOWED_SCOPES = {"transactions:read"}
_DEFAULT_SCOPES = ["transactions:read"]
_DEFAULT_SCOPE_DESCRIPTION = (
    "Read-only access to transaction history for analytics "
    "(وصول للقراءة فقط إلى سجل المعاملات لأغراض التحليلات)"
)
_OAUTH_FLOW_SESSION_KEY = "bank_oauth_pending"
_OAUTH_FLOW_TTL_SECONDS = 15 * 60
_OAUTH_FLOW_MAX_PENDING = 4
_BANK_RETURN_PATH = "/bank"


def _guard_feature():
    if not current_app.config.get("ENABLE_OPEN_BANKING"):
        return error_response(
            "Open Banking is not enabled.",
            status=404,
            code="feature_disabled",
        )
    return None


def _guard_2fa():
    """Return a 403 error response if the user has not enrolled in 2FA.

    Bank connections hold access to financial accounts — 2FA enrollment is
    required before any bank operation is permitted.  Controlled by the
    ``REQUIRE_2FA_FOR_BANK_CONNECT`` config flag (default ``True``).
    """
    require_2fa = current_app.config.get("REQUIRE_2FA_FOR_BANK_CONNECT", True)
    if not require_2fa:
        return None
    if not getattr(current_user, "totp_enabled", False):
        return error_response(
            "Two-factor authentication must be enabled before connecting a bank account.",
            status=403,
            code="2fa_required",
            meta={"setup_url": "/settings/2fa"},
        )
    return None


def _get_connection_or_404(connection_id: int):
    conn = BankConnection.query.filter_by(id=connection_id, user_id=current_user.id).first()
    if not conn:
        return None, error_response("Connection not found.", status=404, code="not_found")
    return conn, None


def _audit_security(event_type: str, details: dict | None = None) -> None:
    ua = (request.headers.get("User-Agent") or "").strip()[:255] or None
    event = SecurityEvent(
        user_id=current_user.id,
        event_type=event_type,
        ip_address=(request.remote_addr or "unknown"),
        user_agent=ua,
        details_json=json.dumps(details or {}),
    )
    db.session.add(event)


def _get_active_consent(connection_id: int) -> BankConsent | None:
    now = datetime.now(timezone.utc)
    return (
        BankConsent.query
        .filter(BankConsent.connection_id == connection_id)
        .filter(BankConsent.user_id == current_user.id)
        .filter(BankConsent.status == "active")
        .filter(BankConsent.revoked_at.is_(None))
        .filter(or_(BankConsent.expires_at.is_(None), BankConsent.expires_at > now))
        .order_by(BankConsent.granted_at.desc(), BankConsent.id.desc())
        .first()
    )


def _parse_scopes(raw_scopes) -> tuple[list[str], object | None]:
    if raw_scopes is None:
        return list(_DEFAULT_SCOPES), None
    if not isinstance(raw_scopes, list):
        return [], error_response("scopes must be an array.", status=400, code="invalid_scopes")

    normalized: list[str] = []
    for raw in raw_scopes:
        scope = str(raw or "").strip()
        if not scope:
            continue
        if scope not in _ALLOWED_SCOPES:
            return [], error_response(
                f"Unsupported scope '{scope}'.",
                status=400,
                code="unsupported_scope",
                meta={"allowed_scopes": sorted(_ALLOWED_SCOPES)},
            )
        if scope not in normalized:
            normalized.append(scope)

    if not normalized:
        normalized = list(_DEFAULT_SCOPES)
    return normalized, None


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64).rstrip("=")
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _make_oauth_state(user_id: int, secret_key: str) -> str:
    nonce = secrets.token_hex(16)
    ts = str(int(time.time()))
    payload = f"{int(user_id)}:{nonce}:{ts}"
    sig = hmac.new(secret_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def _verify_oauth_state(
    state: str,
    user_id: int,
    secret_key: str,
    *,
    max_age: int = _OAUTH_FLOW_TTL_SECONDS,
) -> bool:
    try:
        uid_str, nonce, ts_str, sig = str(state or "").split(":")
        if not nonce:
            return False
        payload = f"{uid_str}:{nonce}:{ts_str}"
        expected = hmac.new(
            secret_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        if int(uid_str) != int(user_id):
            return False
        now_ts = int(time.time())
        issued_at = int(ts_str)
        if issued_at <= 0 or now_ts - issued_at > max_age:
            return False
        return True
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        return False


def _load_pending_oauth_flows() -> dict[str, dict]:
    now_ts = int(time.time())
    raw_flows = session.get(_OAUTH_FLOW_SESSION_KEY) or {}
    flows = raw_flows if isinstance(raw_flows, dict) else {}
    cleaned: dict[str, dict] = {}

    for state, payload in flows.items():
        if not isinstance(payload, dict):
            continue
        created_at = payload.get("created_at")
        try:
            created_at_ts = int(created_at or 0)
        except (TypeError, ValueError):
            continue
        if created_at_ts <= 0 or now_ts - created_at_ts > _OAUTH_FLOW_TTL_SECONDS:
            continue
        cleaned[str(state)] = payload

    if len(cleaned) > _OAUTH_FLOW_MAX_PENDING:
        ordered = sorted(
            cleaned.items(),
            key=lambda item: int(item[1].get("created_at") or 0),
            reverse=True,
        )[:_OAUTH_FLOW_MAX_PENDING]
        cleaned = dict(ordered)

    if cleaned != flows:
        session[_OAUTH_FLOW_SESSION_KEY] = cleaned
        session.modified = True
    return cleaned


def _store_pending_oauth_flow(state: str, payload: dict) -> None:
    flows = _load_pending_oauth_flows()
    flows[str(state)] = payload
    if len(flows) > _OAUTH_FLOW_MAX_PENDING:
        ordered = sorted(
            flows.items(),
            key=lambda item: int(item[1].get("created_at") or 0),
            reverse=True,
        )[:_OAUTH_FLOW_MAX_PENDING]
        flows = dict(ordered)
    session[_OAUTH_FLOW_SESSION_KEY] = flows
    session.modified = True


def _pop_pending_oauth_flow(state: str | None) -> dict | None:
    if not state:
        return None
    flows = _load_pending_oauth_flows()
    payload = flows.pop(str(state), None)
    session[_OAUTH_FLOW_SESSION_KEY] = flows
    session.modified = True
    return payload


def _get_pending_oauth_flow(state: str | None) -> dict | None:
    if not state:
        return None
    flows = _load_pending_oauth_flows()
    payload = flows.get(str(state))
    return payload if isinstance(payload, dict) else None


def _oauth_redirect(code: str, provider: str, message: str | None = None):
    params = {
        "bank_oauth_status": "error",
        "bank_oauth_code": code,
        "provider": provider,
    }
    if message:
        params["bank_oauth_message"] = message[:255]
    return redirect(f"{_BANK_RETURN_PATH}?{urlencode(params)}")


def _log_data_access(
    *,
    connection_id: int | None,
    consent_id: int | None,
    action: str,
    records_accessed: int,
    date_range_start=None,
    date_range_end=None,
) -> None:
    db.session.add(
        DataAccessLog(
            user_id=current_user.id,
            connection_id=connection_id,
            consent_id=consent_id,
            action=(action or "").strip()[:64] or "unknown",
            records_accessed=max(0, int(records_accessed or 0)),
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            ip_address=(request.remote_addr or "unknown"),
        )
    )


def _consent_response_payload(consent: BankConsent, institution_name: str | None) -> dict:
    payload = consent.to_dict()
    payload["institution_name"] = institution_name
    return payload


def _connection_revoked_error(action: str):
    return error_response(
        f"Connection has been revoked. {action} is not allowed.",
        status=409,
        code="connection_revoked",
    )


def _consent_inactive_error(action: str):
    return error_response(
        f"Consent is not active. {action} is not allowed.",
        status=409,
        code="consent_inactive",
    )


def _consent_expired_error(action: str):
    return error_response(
        f"Consent has expired. {action} is not allowed.",
        status=409,
        code="consent_expired",
    )


def _resolve_provider(provider_name: str):
    provider_module = get_bank_provider(provider_name)
    if provider_module is None:
        return None, error_response(
            f"Unknown provider '{provider_name}'. Supported: {list_bank_provider_names()}",
            status=400,
            code="unsupported_provider",
            meta={"supported_providers": list_bank_provider_names()},
        )
    return provider_module, None


def _provider_not_configured_error(provider_module):
    provider_info = provider_module.catalog_entry()
    return error_response(
        f"Provider '{provider_info.display_name}' is not fully configured.",
        status=409,
        code="provider_not_configured",
        meta={"provider": provider_info.to_dict(), "missing_config": provider_info.missing_config},
    )


def _provider_requires_authorization_error(provider_module):
    provider_info = provider_module.catalog_entry()
    return error_response(
        f"Provider '{provider_info.display_name}' requires a redirect-based authorization flow.",
        status=409,
        code="provider_requires_authorization",
        meta={"provider": provider_info.to_dict()},
    )


def _provider_direct_connect_only_error(provider_module):
    provider_info = provider_module.catalog_entry()
    return error_response(
        f"Provider '{provider_info.display_name}' uses direct connect and does not need OAuth authorization.",
        status=409,
        code="provider_direct_connect_only",
        meta={"provider": provider_info.to_dict()},
    )


def _provider_sync_not_supported_error(provider_module):
    provider_info = provider_module.catalog_entry()
    return error_response(
        f"Provider '{provider_info.display_name}' does not support sync preview yet.",
        status=501,
        code="provider_sync_not_supported",
        meta={"provider": provider_info.to_dict()},
    )


def _parse_preview_args(default_limit: int) -> tuple[str | None, int, object | None]:
    payload = request.get_json(silent=True) or {}
    cursor = payload.get("cursor")
    if cursor is not None:
        cursor = str(cursor).strip() or None

    limit_raw = payload.get("limit", default_limit)
    try:
        limit = int(limit_raw)
    except (TypeError, ValueError):
        return None, 0, error_response("limit must be an integer.", status=400, code="invalid_limit")
    if limit < 1:
        return None, 0, error_response("limit must be >= 1.", status=400, code="invalid_limit")
    return cursor, min(limit, 50), None


@bp.route("/providers", methods=["GET"])
@login_required
def api_bank_providers():
    guard = _guard_feature()
    if guard is not None:
        return guard

    return ok_response(
        data={"providers": [entry.to_dict() for entry in list_bank_provider_entries()]}
    )


@bp.route("/connect/oauth-begin", methods=["POST"])
@login_required
@rate_limit(RATE_LIMIT_IMPORT, window_seconds=60)
def api_bank_connect_oauth_begin():
    guard = _guard_feature()
    if guard is not None:
        return guard
    guard = _guard_2fa()
    if guard is not None:
        return guard

    payload = request.get_json(silent=True) or {}
    provider = (payload.get("provider") or "").strip().lower()
    institution_name = (payload.get("institution_name") or "").strip()[:255]
    external_institution_id = (payload.get("external_institution_id") or "").strip()[:255] or None
    purpose_of_use = (
        (payload.get("purpose_of_use") or "Personal financial analytics").strip()[:512]
        or "Personal financial analytics"
    )
    scopes, scopes_err = _parse_scopes(payload.get("scopes"))
    if scopes_err is not None:
        return scopes_err

    provider_module, provider_err = _resolve_provider(provider)
    if provider_err is not None:
        return provider_err
    provider_info = provider_module.catalog_entry()
    if not provider_info.ready:
        return _provider_not_configured_error(provider_module)
    if provider_info.connect_mode != "oauth_redirect":
        return _provider_direct_connect_only_error(provider_module)

    state = _make_oauth_state(current_user.id, current_app.config["SECRET_KEY"])
    verifier, challenge = _pkce_pair()
    if not getattr(provider_module, "uses_pkce", lambda: True)():
        verifier = ""
        challenge = ""

    try:
        authorization_url = provider_module.build_authorization_url(
            state=state,
            scopes=scopes,
            code_challenge=challenge or None,
        )
    except RuntimeError:
        return _provider_not_configured_error(provider_module)
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        log.exception("bank.oauth_begin failed provider=%s user_id=%s", provider, current_user.id)
        return error_response(
            "Failed to start provider authorization.",
            status=502,
            code="provider_authorization_init_failed",
        )

    _store_pending_oauth_flow(
        state,
        {
            "provider": provider,
            "institution_name": institution_name or provider_info.display_name,
            "external_institution_id": external_institution_id,
            "purpose_of_use": purpose_of_use,
            "scopes": scopes,
            "created_at": int(time.time()),
            "code_verifier": verifier,
        },
    )

    _audit_security(
        "bank.oauth_begin",
        {
            "provider": provider,
            "scopes": scopes,
            "purpose_of_use": purpose_of_use,
        },
    )
    db.session.commit()

    return ok_response(
        data={
            "provider": provider,
            "display_name": provider_info.display_name,
            "authorization_url": authorization_url,
            "state": state,
            "redirect_uri": getattr(provider_module, "redirect_uri", lambda: "")() or None,
            "expires_in_seconds": _OAUTH_FLOW_TTL_SECONDS,
        }
    )


@bp.route("/connect", methods=["POST"])
@login_required
@rate_limit(RATE_LIMIT_IMPORT, window_seconds=60)
def api_bank_connect():
    guard = _guard_feature()
    if guard is not None:
        return guard
    guard = _guard_2fa()
    if guard is not None:
        return guard

    payload = request.get_json(silent=True) or {}
    provider = (payload.get("provider") or "").strip().lower()
    institution_name = (payload.get("institution_name") or "").strip()[:255]
    external_institution_id = (payload.get("external_institution_id") or "").strip()[:255] or None
    purpose_of_use = (
        (payload.get("purpose_of_use") or "Personal financial analytics").strip()[:512]
        or "Personal financial analytics"
    )
    scopes, scopes_err = _parse_scopes(payload.get("scopes"))
    if scopes_err is not None:
        return scopes_err

    provider_module, provider_err = _resolve_provider(provider)
    if provider_err is not None:
        return provider_err
    provider_info = provider_module.catalog_entry()
    if not provider_info.ready:
        return _provider_not_configured_error(provider_module)
    if provider_info.connect_mode != "direct":
        return _provider_requires_authorization_error(provider_module)
    if not institution_name:
        institution_name = provider_info.display_name

    now = datetime.now(timezone.utc)
    try:
        conn = BankConnection(
            user_id=current_user.id,
            provider=provider,
            external_institution_id=external_institution_id,
            institution_name=institution_name,
            status="active",
            created_at=now,
        )
        db.session.add(conn)
        db.session.flush()

        consent = BankConsent(
            connection_id=conn.id,
            user_id=current_user.id,
            scopes=json.dumps(scopes),
            purpose_of_use=purpose_of_use,
            data_recipient_name="Personal Statera",
            scope_description=_DEFAULT_SCOPE_DESCRIPTION,
            ip_address_granted=(request.remote_addr or "unknown"),
            user_agent_granted=(request.headers.get("User-Agent") or "")[:255] or None,
            granted_at=now,
            expires_at=now + timedelta(days=90),
            status="active",
        )
        db.session.add(consent)

        _audit_security(
            "bank.connect",
            {
                "provider": provider,
                "connection_id": conn.id,
                "scopes": scopes,
                "purpose_of_use": purpose_of_use,
            },
        )
        record_event("bank.connected", current_user.id, {"provider": provider}, commit=False)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = (
            BankConnection.query
            .filter_by(
                user_id=current_user.id,
                provider=provider,
                institution_name=institution_name,
            )
            .first()
        )
        return error_response(
            "Connection already exists for this institution.",
            status=409,
            code="connection_exists",
            meta={"connection_id": existing.id if existing else None},
        )

    log.info(
        "bank.connect user_id=%s provider=%s connection_id=%s",
        current_user.id,
        provider,
        conn.id,
    )

    # Send consent receipt email (non-blocking).
    try:
        send_templated_email_background(
            to=current_user.email,
            subject=f"Bank connection authorised — {institution_name}",
            template_name="consent_receipt_grant",
            context={
                "institution_name": institution_name,
                "scopes": ", ".join(scopes),
                "purpose_of_use": purpose_of_use,
                "granted_at": now.strftime("%Y-%m-%d %H:%M UTC"),
                "expires_at": (now + timedelta(days=90)).strftime("%Y-%m-%d"),
            },
        )
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        log.exception("bank.connect consent_receipt_email_failed user_id=%s", current_user.id)

    return ok_response(data={"connection": conn.to_dict()}, status=201)


@bp.route("/connect/oauth-callback/<provider>", methods=["GET"])
@rate_limit(RATE_LIMIT_IMPORT, window_seconds=60)
def api_bank_connect_oauth_callback(provider: str):
    provider = (provider or "").strip().lower()

    if not current_user.is_authenticated:
        return _oauth_redirect(
            "login_required",
            provider,
            "Sign in again to continue the bank authorization flow.",
        )

    state = (request.args.get("state") or "").strip()
    if not state or not _verify_oauth_state(
        state,
        current_user.id,
        current_app.config["SECRET_KEY"],
    ):
        return error_response(
            "Invalid OAuth state",
            status=400,
            code="invalid_oauth_state",
        )

    pending = _get_pending_oauth_flow(state)
    if not pending:
        return error_response(
            "Invalid OAuth state",
            status=400,
            code="invalid_oauth_state",
        )

    expected_provider = str(pending.get("provider") or "").strip().lower()
    if expected_provider and expected_provider != provider:
        return error_response(
            "Invalid OAuth state",
            status=400,
            code="invalid_oauth_state",
        )

    if not current_app.config.get("ENABLE_OPEN_BANKING"):
        _pop_pending_oauth_flow(state)
        return _oauth_redirect("feature_disabled", provider, "Open Banking is not enabled.")

    provider_module, provider_err = _resolve_provider(provider)
    if provider_err is not None:
        _pop_pending_oauth_flow(state)
        return _oauth_redirect("unsupported_provider", provider, "Unsupported bank provider callback.")

    pending = _pop_pending_oauth_flow(state)
    if not pending:
        return error_response(
            "Invalid OAuth state",
            status=400,
            code="invalid_oauth_state",
        )

    provider_error = (request.args.get("error") or "").strip()
    if provider_error:
        description = (request.args.get("error_description") or "").strip() or None
        message = description or f"Provider returned '{provider_error}'."
        return _oauth_redirect("provider_error", provider, message)

    code = (request.args.get("code") or "").strip()
    if not code:
        return _oauth_redirect(
            "missing_code",
            provider,
            "Provider callback did not include an authorization code.",
        )

    exchange_handler = getattr(provider_module, "exchange_authorization_code", None)
    if not callable(exchange_handler):
        return _oauth_redirect(
            "provider_callback_not_ready",
            provider,
            "Authorization returned successfully, but token exchange is not wired yet for this provider.",
        )

    try:
        exchange_handler(
            code=code,
            state=state,
            code_verifier=str(pending.get("code_verifier") or "") or None,
            redirect_uri=getattr(provider_module, "redirect_uri", lambda: "")() or None,
            pending=pending,
        )
    except NotImplementedError:
        return _oauth_redirect(
            "provider_callback_not_ready",
            provider,
            "Authorization returned successfully, but token exchange is not wired yet for this provider.",
        )
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        log.exception("bank.oauth_callback failed provider=%s user_id=%s", provider, current_user.id)
        return _oauth_redirect(
            "provider_callback_failed",
            provider,
            "Provider callback handling failed. Check the backend logs before retrying.",
        )

    return redirect(f"{_BANK_RETURN_PATH}?{urlencode({'bank_oauth_status': 'success', 'provider': provider})}")


@bp.route("/connections", methods=["GET"])
@login_required
def api_bank_list_connections():
    guard = _guard_feature()
    if guard is not None:
        return guard

    connections = (
        BankConnection.query
        .filter_by(user_id=current_user.id)
        .order_by(BankConnection.created_at.desc())
        .all()
    )
    return ok_response(data={"connections": [row.to_dict() for row in connections]})


@bp.route("/consents", methods=["GET"])
@login_required
def api_bank_consents():
    guard = _guard_feature()
    if guard is not None:
        return guard

    rows = (
        db.session.query(BankConsent, BankConnection.institution_name)
        .outerjoin(BankConnection, BankConnection.id == BankConsent.connection_id)
        .filter(BankConsent.user_id == current_user.id)
        .order_by(BankConsent.granted_at.desc(), BankConsent.id.desc())
        .all()
    )
    return ok_response(
        data={
            "consents": [
                _consent_response_payload(consent, institution_name)
                for consent, institution_name in rows
            ]
        }
    )


@bp.route("/consents/<int:consent_id>", methods=["GET"])
@login_required
def api_bank_consent_detail(consent_id: int):
    guard = _guard_feature()
    if guard is not None:
        return guard

    row = (
        db.session.query(BankConsent, BankConnection.institution_name)
        .outerjoin(BankConnection, BankConnection.id == BankConsent.connection_id)
        .filter(BankConsent.id == consent_id, BankConsent.user_id == current_user.id)
        .first()
    )
    if not row:
        return error_response("Consent not found.", status=404, code="not_found")
    consent, institution_name = row
    return ok_response(data={"consent": _consent_response_payload(consent, institution_name)})


@bp.route("/data-access-log", methods=["GET"])
@login_required
def api_bank_data_access_log():
    guard = _guard_feature()
    if guard is not None:
        return guard

    connection_id = request.args.get("connection_id", type=int)
    limit_raw = request.args.get("limit", "100")
    try:
        limit = max(1, min(int(limit_raw), 500))
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        return error_response("limit must be an integer.", status=400, code="invalid_limit")

    query = DataAccessLog.query.filter(DataAccessLog.user_id == current_user.id)
    if connection_id is not None:
        conn, err = _get_connection_or_404(connection_id)
        if err:
            return err
        query = query.filter(DataAccessLog.connection_id == conn.id)

    rows = (
        query.order_by(DataAccessLog.created_at.desc(), DataAccessLog.id.desc())
        .limit(limit)
        .all()
    )
    return ok_response(data={"log": [row.to_dict() for row in rows]})


@bp.route("/connections/<int:cid>/sync-preview", methods=["POST"])
@login_required
@rate_limit(RATE_LIMIT_BANK_SYNC, window_seconds=60)
def api_bank_sync_preview(cid: int):
    guard = _guard_feature()
    if guard is not None:
        return guard
    guard = _guard_2fa()
    if guard is not None:
        return guard

    conn, err = _get_connection_or_404(cid)
    if err:
        return err
    if conn.status != "active":
        return _connection_revoked_error("Sync")
    consent = _get_active_consent(conn.id)
    if not consent:
        return _consent_inactive_error("Sync")

    provider_module, provider_err = _resolve_provider(conn.provider)
    if provider_err is not None:
        return provider_err
    provider_info = provider_module.catalog_entry()
    if not provider_info.ready:
        return _provider_not_configured_error(provider_module)
    if not provider_info.supports_sync_preview:
        return _provider_sync_not_supported_error(provider_module)

    cursor, limit, parse_err = _parse_preview_args(provider_info.default_limit)
    if parse_err is not None:
        return parse_err

    try:
        provider_rows, next_cursor = provider_module.fetch_transactions(conn.id, cursor, limit)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="invalid_cursor")
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        log.exception("bank.sync_preview provider error connection_id=%s", conn.id)
        return error_response(
            "Failed to fetch provider transactions.",
            status=502,
            code="provider_error",
        )

    run = BankSyncRun(
        connection_id=conn.id,
        user_id=current_user.id,
        status="staged",
        provider_cursor=next_cursor,
        staged_count=0,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(run)
    db.session.flush()

    existing_provider_ids = {
        row[0]
        for row in (
            db.session.query(RawBankTransaction.provider_tx_id)
            .filter(RawBankTransaction.connection_id == conn.id)
            .all()
        )
    }

    provider_dup_count = 0
    candidate_rows = []
    seen_provider_ids = set(existing_provider_ids)
    for prow in provider_rows:
        if prow.provider_tx_id in seen_provider_ids:
            provider_dup_count += 1
            continue
        seen_provider_ids.add(prow.provider_tx_id)
        candidate_rows.append(prow)

    existing_triplets: set[tuple[object, str, Decimal]] = set()
    if candidate_rows:
        min_date = min(row.date for row in candidate_rows)
        max_date = max(row.date for row in candidate_rows)
        tx_triplets = (
            db.session.query(Transaction.date, Transaction.name_key, Transaction.amount_kd)
            .filter(Transaction.user_id == current_user.id)
            .filter(Transaction.date >= min_date, Transaction.date <= max_date)
            .all()
        )
        existing_triplets = {(tx_date, name_key, amount_kd) for tx_date, name_key, amount_kd in tx_triplets}

    staged_raw: list[tuple[RawBankTransaction, bool]] = []
    for prow in candidate_rows:
        description = (prow.description or "Bank transaction").strip()[:128] or "Bank transaction"
        name_key = build_name_key(description)
        likely_dup = (prow.date, name_key, prow.amount_kd) in existing_triplets
        row = RawBankTransaction(
            connection_id=conn.id,
            sync_run_id=run.id,
            user_id=current_user.id,
            provider_tx_id=prow.provider_tx_id,
            date=prow.date,
            description=description,
            amount_kd=prow.amount_kd,
            raw_payload_hash=prow.payload_hash,
            category_hint=(prow.category_hint or "").strip()[:64] or None,
            merchant_hint=(prow.merchant_hint or "").strip()[:64] or None,
            status="staged",
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(row)
        staged_raw.append((row, likely_dup))

    run.staged_count = len(staged_raw)
    date_range_start = min((row.date for row, _likely_dup in staged_raw), default=None)
    date_range_end = max((row.date for row, _likely_dup in staged_raw), default=None)

    try:
        db.session.flush()
        staged_rows = [
            {
                "raw_tx_id": row.id,
                "provider_tx_id": row.provider_tx_id,
                "date": row.date.isoformat(),
                "description": row.description,
                "amount_kd": format_kd(row.amount_kd),
                "likely_dup": likely_dup,
            }
            for row, likely_dup in staged_raw
        ]
        _log_data_access(
            connection_id=conn.id,
            consent_id=consent.id if consent else None,
            action="sync_preview",
            records_accessed=len(staged_rows),
            date_range_start=date_range_start,
            date_range_end=date_range_end,
        )
        _audit_security(
            "data.accessed",
            {
                "action": "sync_preview",
                "connection_id": conn.id,
                "records_accessed": len(staged_rows),
            },
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "Concurrent sync conflict. Please retry preview.",
            status=409,
            code="sync_conflict",
        )

    return ok_response(
        data={
            "sync_run_id": run.id,
            "connection_id": conn.id,
            "next_cursor": next_cursor,
            "staged_count": len(staged_rows),
            "provider_dup_count": provider_dup_count,
            "rows": staged_rows,
        }
    )


@bp.route("/connections/<int:cid>/sync-runs/<int:rid>/commit", methods=["POST"])
@login_required
@rate_limit(RATE_LIMIT_BANK_SYNC, window_seconds=60)
def api_bank_commit(cid: int, rid: int):
    guard = _guard_feature()
    if guard is not None:
        return guard

    conn, err = _get_connection_or_404(cid)
    if err:
        return err
    if conn.status != "active":
        return _connection_revoked_error("Commit")

    run = (
        BankSyncRun.query
        .filter_by(id=rid, connection_id=conn.id, user_id=current_user.id)
        .first()
    )
    if not run:
        return error_response("Sync run not found.", status=404, code="not_found")
    if run.status != "staged":
        return error_response(
            f"Sync run is already '{run.status}' and cannot be committed again.",
            status=409,
            code="sync_run_not_staged",
        )

    now = datetime.now(timezone.utc)
    consent = (
        BankConsent.query
        .filter(BankConsent.connection_id == conn.id)
        .filter(BankConsent.user_id == current_user.id)
        .filter(BankConsent.status == "active")
        .filter(BankConsent.revoked_at.is_(None))
        .order_by(BankConsent.granted_at.desc(), BankConsent.id.desc())
        .first()
    )
    if not consent:
        run.status = "abandoned"
        run.abandoned_at = now
        db.session.commit()
        return _consent_inactive_error("Commit")

    expires_at = consent.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            run.status = "abandoned"
            run.abandoned_at = now
            db.session.commit()
            return _consent_expired_error("Commit")

    payload = request.get_json(silent=True) or {}
    default_category = (payload.get("default_category") or "").strip()[:64]

    staged_rows = (
        RawBankTransaction.query
        .filter_by(sync_run_id=run.id, status="staged")
        .order_by(RawBankTransaction.id.asc())
        .all()
    )
    date_range_start = min((row.date for row in staged_rows), default=None)
    date_range_end = max((row.date for row in staged_rows), default=None)

    committed_count = 0
    skipped_dup_count = 0
    transaction_ids: list[int] = []

    for row in staged_rows:
        category_name = (row.category_hint or default_category).strip()[:64] or None
        merchant_name = (row.merchant_hint or "").strip()[:128] or None
        txn, is_dup, err_msg = create_transaction_with_dup_check(
            txn_date=row.date,
            category_name=category_name,
            name=row.description,
            amount=row.amount_kd,
            user_id=current_user.id,
            force=False,
            merchant_name=merchant_name,
            source="bank_import",
        )
        if is_dup or err_msg or not txn:
            row.status = "skipped_dup"
            skipped_dup_count += 1
            continue

        db.session.flush()
        row.status = "committed"
        row.transaction_id = txn.id
        committed_count += 1
        transaction_ids.append(int(txn.id))

    now = datetime.now(timezone.utc)
    run.status = "committed"
    run.committed_count = committed_count
    run.committed_at = now
    conn.last_synced_at = now

    record_event(
        "bank.committed",
        current_user.id,
        {
            "connection_id": conn.id,
            "committed": committed_count,
            "skipped_dup": skipped_dup_count,
        },
        commit=False,
    )
    _log_data_access(
        connection_id=conn.id,
        consent_id=consent.id if consent else None,
        action="sync_commit",
        records_accessed=len(staged_rows),
        date_range_start=date_range_start,
        date_range_end=date_range_end,
    )
    _audit_security(
        "data.accessed",
        {
            "action": "sync_commit",
            "connection_id": conn.id,
            "records_accessed": len(staged_rows),
        },
    )
    db.session.commit()
    if committed_count > 0:
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)

    return ok_response(
        data={
            "sync_run_id": run.id,
            "committed_count": committed_count,
            "skipped_dup_count": skipped_dup_count,
            "transaction_ids": transaction_ids,
        }
    )


@bp.route("/connections/<int:cid>/revoke", methods=["POST"])
@login_required
def api_bank_revoke(cid: int):
    guard = _guard_feature()
    if guard is not None:
        return guard

    conn, err = _get_connection_or_404(cid)
    if err:
        return err
    if conn.status == "revoked":
        return error_response(
            "Connection is already revoked.",
            status=409,
            code="already_revoked",
        )

    now = datetime.now(timezone.utc)
    conn.status = "revoked"
    conn.revoked_at = now

    consents = (
        BankConsent.query
        .filter(BankConsent.connection_id == conn.id)
        .filter(BankConsent.user_id == current_user.id)
        .filter(BankConsent.revoked_at.is_(None))
        .all()
    )
    for consent in consents:
        consent.status = "revoked"
        consent.revoked_at = now

    _audit_security(
        "bank.revoke",
        {"provider": conn.provider, "connection_id": conn.id},
    )
    db.session.commit()

    # Immediately purge raw bank payloads — no retention value after revocation.
    # Normalized transactions enter the 30-day grace period managed by the daily task.
    for consent in consents:
        try:
            purge_revoked_consent_raw_data(consent.id)
        except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
            log.exception(
                "bank.revoke raw_purge_failed consent_id=%s connection_id=%s",
                consent.id,
                conn.id,
            )

    log.info("bank.revoke user_id=%s connection_id=%s", current_user.id, conn.id)

    # Send consent revoke receipt email (non-blocking).
    try:
        send_templated_email_background(
            to=current_user.email,
            subject=f"Bank connection revoked — {conn.institution_name}",
            template_name="consent_receipt_revoke",
            context={
                "institution_name": conn.institution_name,
                "revoked_at": now.strftime("%Y-%m-%d %H:%M UTC"),
            },
        )
    except Exception:  # noqa: BLE001 - bank routes should rollback or degrade gracefully around secondary sync failures.
        log.exception("bank.revoke consent_receipt_email_failed user_id=%s", current_user.id)

    return ok_response(data={"connection_id": conn.id, "status": "revoked"})
