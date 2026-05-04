"""Transactional email helpers with dev-log and Postmark delivery modes."""

from __future__ import annotations

import atexit
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from typing import Any

from flask import has_app_context, current_app
from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from postmarker.core import PostmarkClient
    _POSTMARK_AVAILABLE = True
except Exception:  # pragma: no cover - Postmark is optional in local/test setups and email rendering should still work.
    PostmarkClient = None  # type: ignore[assignment]
    _POSTMARK_AVAILABLE = False

try:
    import sentry_sdk
except Exception:  # pragma: no cover - Sentry email instrumentation is optional at runtime.
    sentry_sdk = None  # type: ignore[assignment]


def _logger() -> logging.Logger:
    if has_app_context():
        return current_app.logger
    return logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _is_dev_mode() -> bool:
    # TODO(remove-dinartrack-shim): Remove DINARTRACK_DEV_MODE fallback once all deployments
    # have migrated to PERSONAL_STATERA_DEV_MODE.
    if _env_bool("PERSONAL_STATERA_DEV_MODE", default=False) or _env_bool("DINARTRACK_DEV_MODE", default=False):
        return True
    return (os.getenv("FLASK_ENV", "").strip().lower() == "development")


def _email_from_address() -> str:
    return (
        (os.getenv("MAIL_FROM_ADDRESS") or "").strip()
        or (os.getenv("MAIL_FROM") or "").strip()
    )


def _email_worker_count() -> int:
    raw = (os.getenv("MAIL_ASYNC_WORKERS") or "2").strip()
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = 2
    return max(1, min(val, 8))


_EMAIL_EXECUTOR = ThreadPoolExecutor(
    max_workers=_email_worker_count(),
    thread_name_prefix="mail",
)
atexit.register(lambda: _EMAIL_EXECUTOR.shutdown(wait=False, cancel_futures=True))


def _dev_log_path() -> Path:
    configured = (os.getenv("EMAIL_DEV_LOG_PATH") or "").strip()
    if configured:
        return Path(configured)
    return Path("logs") / "email_dev.log"


def _write_dev_log(*, to_email: str, subject: str, html_body: str, text_body: str) -> None:
    log_path = _dev_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "to": to_email,
        "subject": subject,
        "html_body": html_body,
        "text_body": text_body,
    }
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def _template_env() -> Environment:
    root = Path(__file__).resolve().parent / "templates"
    return Environment(
        loader=FileSystemLoader(str(root)),
        autoescape=select_autoescape(enabled_extensions=("html",)),
        auto_reload=False,
    )


def render_email_template(template_name: str, context: dict[str, Any] | None = None) -> tuple[str, str]:
    base = (template_name or "").strip().replace("\\", "/")
    if not base or "/" in base or ".." in base:
        raise ValueError("Invalid template name")

    env = _template_env()
    data = dict(context or {})
    html = env.get_template(f"email/{base}.html").render(**data)
    text = env.get_template(f"email/{base}.txt").render(**data)
    return html, text


def send_email(to: str, subject: str, html_body: str, text_body: str) -> bool:
    recipient = (to or "").strip()
    if not recipient:
        _logger().warning("Skipping email send: missing recipient")
        return False

    mail_subject = (subject or "").strip()[:255]
    if not mail_subject:
        _logger().warning("Skipping email send: missing subject")
        return False

    if _is_dev_mode():
        _write_dev_log(
            to_email=recipient,
            subject=mail_subject,
            html_body=html_body or "",
            text_body=text_body or "",
        )
        return True

    api_key = (os.getenv("POSTMARK_API_KEY") or "").strip()
    from_address = _email_from_address()

    if not api_key:
        _logger().warning("POSTMARK_API_KEY not configured; skipping email to %s", recipient)
        return False
    if not from_address:
        _logger().warning("MAIL_FROM_ADDRESS not configured; skipping email to %s", recipient)
        return False
    if not _POSTMARK_AVAILABLE:
        _logger().error("postmarker dependency is unavailable; cannot send email to %s", recipient)
        return False

    try:
        client = PostmarkClient(server_token=api_key)
        client.emails.send(
            From=from_address,
            To=recipient,
            Subject=mail_subject,
            HtmlBody=html_body or "",
            TextBody=text_body or "",
            MessageStream="outbound",
        )
        return True
    except Exception as exc:  # noqa: BLE001 - email delivery failures are logged without crashing the caller path.
        if sentry_sdk is not None:
            sentry_sdk.capture_exception(exc)
        _logger().exception("Postmark send failed for %s: %s", recipient, exc)
        return False


def send_templated_email(
    *,
    to: str,
    subject: str,
    template_name: str,
    context: dict[str, Any] | None = None,
) -> bool:
    html_body, text_body = render_email_template(template_name, context or {})
    return send_email(to, subject, html_body, text_body)


def send_email_background(
    *,
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    def _worker() -> None:
        send_email(
            to=to,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )

    try:
        _EMAIL_EXECUTOR.submit(_worker)
        return True
    except Exception as exc:  # pragma: no cover - background email dispatch should fail closed and surface via logs.
        _logger().exception("Failed to queue background email to %s: %s", to, exc)
        return send_email(to=to, subject=subject, html_body=html_body, text_body=text_body)


def send_templated_email_background(
    *,
    to: str,
    subject: str,
    template_name: str,
    context: dict[str, Any] | None = None,
) -> bool:
    def _worker() -> None:
        send_templated_email(
            to=to,
            subject=subject,
            template_name=template_name,
            context=context,
        )

    try:
        _EMAIL_EXECUTOR.submit(_worker)
        return True
    except Exception as exc:  # pragma: no cover - dev email logging should not crash callers on filesystem issues.
        _logger().exception("Failed to queue templated email to %s: %s", to, exc)
        return send_templated_email(
            to=to,
            subject=subject,
            template_name=template_name,
            context=context,
        )
