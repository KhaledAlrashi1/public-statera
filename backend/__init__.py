"""Backend package — Flask app factory and extensions."""

from __future__ import annotations
import json
import logging
import os
import secrets
import time
import warnings
from datetime import datetime, timezone, timedelta
from pathlib import Path

from flask import Flask, current_app, g, jsonify, request, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect, CSRFError, generate_csrf
from flask_login import LoginManager, current_user, logout_user
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from dotenv import load_dotenv

from backend.api_response import error_response

try:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration as _SentryFlaskIntegration
    try:
        from sentry_sdk.integrations.celery import CeleryIntegration as _SentryCeleryIntegration
    except ImportError:
        _SentryCeleryIntegration = None
    _SENTRY_AVAILABLE = True
except ImportError:
    _SENTRY_AVAILABLE = False
    _SentryCeleryIntegration = None

try:
    from pythonjsonlogger import jsonlogger as _pythonjsonlogger
    _PYTHON_JSON_LOGGER_AVAILABLE = True
except ImportError:
    _PYTHON_JSON_LOGGER_AVAILABLE = False

try:
    from flask_talisman import Talisman
    _TALISMAN_AVAILABLE = True
except ImportError:
    _TALISMAN_AVAILABLE = False

try:
    from flask_migrate import Migrate
except Exception:  # pragma: no cover - migration helpers are optional at runtime and should not block app startup.
    class Migrate:  # type: ignore
        def init_app(self, app, _db, **_kwargs):
            app.logger.warning(
                "Flask-Migrate is not installed. Runtime is available, but migration commands are disabled."
            )

from backend.constants import APP_DISPLAY_NAME, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_UPLOAD_SIZE_MB
from backend.lib.log_scrubber import sentry_before_send, apply_log_scrubbing

# Extensions (initialized before models import them)
db = SQLAlchemy()
csrf = CSRFProtect()
login_manager = LoginManager()
bcrypt = Bcrypt()
migrate = Migrate()

# Load .env from project root
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=False)


def _read_dev_mode() -> bool:
    """Read PERSONAL_STATERA_DEV_MODE with a deprecation shim for the old name.

    TODO(remove-dinartrack-shim): Remove DINARTRACK_DEV_MODE fallback once all
    deployments and scripts have migrated to PERSONAL_STATERA_DEV_MODE.
    """
    new_val = os.environ.get("PERSONAL_STATERA_DEV_MODE")
    if new_val is not None:
        return new_val.strip().lower() in ("1", "true", "yes")
    legacy_val = os.environ.get("DINARTRACK_DEV_MODE")
    if legacy_val is not None:
        warnings.warn(
            "DINARTRACK_DEV_MODE is deprecated; use PERSONAL_STATERA_DEV_MODE instead. "
            "The legacy name will be removed in a future release.",
            DeprecationWarning,
            stacklevel=2,
        )
        return legacy_val.strip().lower() in ("1", "true", "yes")
    return False


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except Exception:  # noqa: BLE001 - app startup and request cleanup should stay resilient around optional integrations.
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw.strip())
    except Exception:  # noqa: BLE001 - app startup and request cleanup should stay resilient around optional integrations.
        return default


def _resolve_database_url(raw_url: str | None) -> str:
    """Return a normalized SQLAlchemy URL and enforce PostgreSQL usage."""
    url = (raw_url or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is required "
            "(expected PostgreSQL URL like postgresql://user:pass@host:5432/dbname)."
        )
    if url.startswith("postgres://"):
        # Normalize legacy scheme alias to SQLAlchemy's canonical prefix.
        url = "postgresql://" + url[len("postgres://"):]
    if not url.startswith("postgresql://"):
        raise RuntimeError(
            "Only PostgreSQL DATABASE_URL values are supported "
            "(expected postgresql://user:pass@host:5432/dbname)."
        )
    return url


class _JsonFormatter(logging.Formatter):
    """Emit one structured JSON log object per line in production."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname,
            "logger": record.name,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        message = record.getMessage()
        if isinstance(record.msg, dict):
            payload.update(record.msg)
        else:
            try:
                parsed = json.loads(message)
                if isinstance(parsed, dict):
                    payload.update(parsed)
                else:
                    payload["message"] = message
            except Exception:  # noqa: BLE001 - app startup and request cleanup should stay resilient around optional integrations.
                payload["message"] = message
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def _configure_app_logging(app: Flask, is_dev: bool) -> None:
    """Use JSON logs in non-dev mode."""
    if is_dev:
        return
    if _PYTHON_JSON_LOGGER_AVAILABLE:
        formatter: logging.Formatter = _pythonjsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        )
    else:
        formatter = _JsonFormatter()
    if not app.logger.handlers:
        app.logger.addHandler(logging.StreamHandler())
    for handler in app.logger.handlers:
        handler.setFormatter(formatter)


def _validate_production_config(app: Flask, is_dev: bool) -> None:
    """Fail fast for unsafe runtime configuration."""
    secret_key = str(app.config.get("SECRET_KEY") or "").strip()
    db_url = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "").strip()
    cors_origins = app.config.get("CORS_ORIGINS", [])
    num_proxies = int(app.config.get("PROXY_FIX_NUM_PROXIES", 0))
    budget_alert_threshold = float(app.config.get("BUDGET_ALERT_THRESHOLD_RATIO", 0.9))
    sentry_dsn = str(app.config.get("SENTRY_DSN") or "").strip()
    operator_api_token = str(app.config.get("OPERATOR_API_TOKEN") or "").strip()
    is_prod = not is_dev

    if num_proxies < 0:
        raise RuntimeError("PROXY_FIX_NUM_PROXIES must be >= 0.")
    if MAX_PAGE_SIZE < DEFAULT_PAGE_SIZE:
        raise RuntimeError("MAX_PAGE_SIZE must be greater than or equal to DEFAULT_PAGE_SIZE.")
    if budget_alert_threshold <= 0:
        raise RuntimeError("BUDGET_ALERT_THRESHOLD_RATIO must be greater than 0.")

    if not is_prod:
        return

    if not secret_key:
        raise RuntimeError("SECRET_KEY environment variable is required in production.")
    lowered_key = secret_key.lower()
    if "dev" in lowered_key or "insecure" in lowered_key:
        raise RuntimeError("SECRET_KEY appears to be a development key; use a secure production key.")
    if len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be at least 32 characters in production.")

    encryption_key = str(app.config.get("ENCRYPTION_KEY") or os.getenv("ENCRYPTION_KEY") or "").strip()
    if not encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY is required in production for field-level encryption of sensitive data. "
            "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if encryption_key == secret_key:
        raise RuntimeError(
            "ENCRYPTION_KEY must not equal SECRET_KEY. "
            "Use separate independently-generated keys for session security and field encryption."
        )

    if not db_url.startswith("postgresql://"):
        raise RuntimeError("DATABASE_URL must use PostgreSQL in production.")

    if any("localhost" in str(origin).lower() for origin in cors_origins):
        raise RuntimeError("CORS_ORIGINS cannot include localhost in production.")

    postmark_api_key = (os.getenv("POSTMARK_API_KEY") or "").strip()
    mail_from_address = (
        (os.getenv("MAIL_FROM_ADDRESS") or "").strip()
        or (os.getenv("MAIL_FROM") or "").strip()
    )
    if not postmark_api_key:
        raise RuntimeError("POSTMARK_API_KEY is required in production (transactional email delivery).")
    if not mail_from_address:
        raise RuntimeError("MAIL_FROM_ADDRESS is required in production (sender identity for transactional email).")

    if not sentry_dsn:
        raise RuntimeError("SENTRY_DSN is required in production so errors reach an operator.")
    if not _SENTRY_AVAILABLE:
        raise RuntimeError("sentry-sdk[flask] must be installed in production.")
    if not operator_api_token:
        raise RuntimeError("OPERATOR_API_TOKEN is required in production for operator monitoring endpoints.")
    if len(operator_api_token) < 32:
        raise RuntimeError("OPERATOR_API_TOKEN must be at least 32 characters in production.")
    if not str(app.config.get("CELERY_BROKER_URL") or "").strip():
        app.logger.warning(
            "CELERY_BROKER_URL not configured; periodic maintenance tasks will not run. "
            "Start a Celery worker and beat scheduler."
        )
    rate_limit_backend = str(app.config.get("RATE_LIMIT_BACKEND") or "").strip().lower()
    if rate_limit_backend == "memory":
        app.logger.warning(
            "RATE_LIMIT_BACKEND=%s. For production shared throttling, use 'redis'.",
            rate_limit_backend or "<unset>",
        )

    bank_raw_days = int(app.config.get("BANK_RAW_RETENTION_DAYS") or 7)
    if bank_raw_days > 14:
        app.logger.warning(
            "BANK_RAW_RETENTION_DAYS=%d exceeds recommended maximum of 14 days. "
            "Raw bank payloads have no analytics value after normalization. "
            "Consider reducing to 7 days.",
            bank_raw_days,
        )

    if not app.config.get("REQUIRE_2FA_FOR_BANK_CONNECT", True):
        app.logger.warning(
            "REQUIRE_2FA_FOR_BANK_CONNECT=false — bank connections do not require 2FA. "
            "This is strongly discouraged in production."
        )


def create_app() -> Flask:
    app = Flask(__name__, template_folder=str(Path(__file__).resolve().parent.parent / "templates"))
    app.config["APP_DISPLAY_NAME"] = APP_DISPLAY_NAME

    # Database configuration
    app.config["SQLALCHEMY_DATABASE_URI"] = _resolve_database_url(os.getenv("DATABASE_URL"))
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Security configuration
    secret_key = os.getenv("SECRET_KEY")
    flask_env = os.getenv("FLASK_ENV", "").lower()
    is_dev = _read_dev_mode()
    _configure_app_logging(app, is_dev)

    if not secret_key:
        if is_dev:
            app.logger.warning(
                "DEVELOPMENT MODE: Using insecure SECRET_KEY. "
                "Set SECRET_KEY environment variable for any other use."
            )
            secret_key = "dev-only-insecure-key-do-not-use-in-production"
        elif flask_env == "development":
            app.logger.warning(
                "WARNING: FLASK_ENV=development detected without SECRET_KEY. "
                "Using insecure fallback. Set PERSONAL_STATERA_DEV_MODE=true to acknowledge, "
                "or set SECRET_KEY for better security."
            )
            secret_key = "dev-only-insecure-key-do-not-use-in-production"
        else:
            raise RuntimeError(
                "SECRET_KEY environment variable is required.\n"
                "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'\n"
                "For local development, set PERSONAL_STATERA_DEV_MODE=true to use an insecure default."
            )

    if secret_key and not is_dev and flask_env != "development":
        if len(secret_key) < 32:
            app.logger.warning(
                "SECRET_KEY is shorter than recommended (32+ characters). "
                "Consider using a stronger key."
            )
        if secret_key.startswith("dev") or "insecure" in secret_key.lower():
            raise RuntimeError(
                "SECRET_KEY appears to be a development key but PERSONAL_STATERA_DEV_MODE is not set. "
                "Please use a secure key for production."
            )

    app.config["SECRET_KEY"] = secret_key

    # Encryption key — separate from SECRET_KEY; used for field-level encryption.
    encryption_key = (os.getenv("ENCRYPTION_KEY") or "").strip()
    if not encryption_key and is_dev:
        app.logger.warning(
            "DEVELOPMENT MODE: ENCRYPTION_KEY not set; field-level encryption will use "
            "an insecure default key. Set ENCRYPTION_KEY for any non-local use."
        )
    app.config["ENCRYPTION_KEY"] = encryption_key
    app.config["OPERATOR_API_TOKEN"] = (os.getenv("OPERATOR_API_TOKEN") or "").strip()

    # Eagerly initialize the encryption module so misconfiguration fails at
    # startup rather than silently at first write.
    try:
        from backend.lib.crypto import _load_keys
        _load_keys()
    except RuntimeError as _enc_err:
        raise RuntimeError(str(_enc_err)) from _enc_err

    # Sentry error tracking is required in production and optional in local development.
    sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
    sentry_environment = (
        os.getenv("SENTRY_ENVIRONMENT", "development" if is_dev else "production").strip()
        or ("development" if is_dev else "production")
    )
    sentry_release = os.getenv("SENTRY_RELEASE", "").strip() or None
    app.config["SENTRY_DSN"] = sentry_dsn
    app.config["SENTRY_ENVIRONMENT"] = sentry_environment
    app.config["SENTRY_RELEASE"] = sentry_release
    app.config["SENTRY_ENABLED"] = bool(sentry_dsn and _SENTRY_AVAILABLE)
    if sentry_dsn and _SENTRY_AVAILABLE:
        integrations = [_SentryFlaskIntegration()]
        if _SentryCeleryIntegration is not None:
            integrations.append(_SentryCeleryIntegration())
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=integrations,
            send_default_pii=False,
            environment=sentry_environment,
            release=sentry_release,
            before_send=sentry_before_send,
        )

    # CSRF configuration
    app.config["WTF_CSRF_HEADERS"] = ["X-CSRFToken", "X-CSRF-Token"]
    app.config["WTF_CSRF_TIME_LIMIT"] = 3600  # 1 hour; tokens are refreshed on every response via after_request
    app.config["WTF_CSRF_SSL_STRICT"] = not is_dev

    # Session cookie configuration
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = not is_dev
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(
        days=_env_int("SESSION_LIFETIME_DAYS", 30)
    )
    app.config["REMEMBER_COOKIE_DURATION"] = 30 * 24 * 3600  # 30 days
    app.config["REMEMBER_COOKIE_HTTPONLY"] = True
    app.config["REMEMBER_COOKIE_SAMESITE"] = "Lax"
    app.config["REMEMBER_COOKIE_SECURE"] = not is_dev

    # File upload limits
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    app.config["ENABLE_TEMPLATE_SUGGESTIONS"] = _env_bool("ENABLE_TEMPLATE_SUGGESTIONS", default=False)
    app.config["ENABLE_OPEN_BANKING"] = _env_bool("ENABLE_OPEN_BANKING", default=False)
    app.config["ENABLE_RECURRING_PATTERNS"] = _env_bool("ENABLE_RECURRING_PATTERNS", default=True)
    # Require TOTP 2FA before allowing bank connections (strong default).
    app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = _env_bool("REQUIRE_2FA_FOR_BANK_CONNECT", default=True)
    app.config["OPEN_BANKING_OAUTH_SANDBOX_LABEL"] = os.getenv(
        "OPEN_BANKING_OAUTH_SANDBOX_LABEL",
        "OAuth Sandbox Provider",
    )
    app.config["OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL"] = os.getenv("OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL", "")
    app.config["OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL"] = os.getenv("OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL", "")
    app.config["OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID"] = os.getenv("OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID", "")
    app.config["OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET"] = os.getenv("OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET", "")
    app.config["OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI"] = os.getenv("OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI", "")
    app.config["OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE"] = _env_bool(
        "OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE",
        default=True,
    )
    app.config["OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL"] = os.getenv(
        "OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL",
        "",
    )
    app.config["OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL"] = os.getenv(
        "OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL",
        "",
    )
    app.config["RATE_LIMIT_BACKEND"] = (os.getenv("RATE_LIMIT_BACKEND") or "auto").strip().lower()
    app.config["REDIS_URL"] = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")
    app.config["REDIS_URL_CONFIGURED"] = bool((os.getenv("REDIS_URL") or "").strip())
    app.config["CELERY_BROKER_URL"] = os.getenv("CELERY_BROKER_URL", app.config["REDIS_URL"])
    app.config["CELERY_RESULT_BACKEND"] = os.getenv("CELERY_RESULT_BACKEND", app.config["REDIS_URL"])
    app.config["RATE_LIMIT_FALLBACK_LOG_INTERVAL_SECONDS"] = _env_int(
        "RATE_LIMIT_FALLBACK_LOG_INTERVAL_SECONDS",
        30,
    )
    app.config["SECURITY_EVENTS_RETENTION_DAYS"] = _env_int("SECURITY_EVENTS_RETENTION_DAYS", 365)
    app.config["PRODUCT_EVENTS_RETENTION_DAYS"] = _env_int("PRODUCT_EVENTS_RETENTION_DAYS", 90)
    # Raw bank payloads: purge after 7 days (not 90). Normalized transactions survive.
    app.config["BANK_RAW_RETENTION_DAYS"] = _env_int("BANK_RAW_RETENTION_DAYS", 7)
    # Normalized transactions are retained 30 days after consent revoke before purge.
    app.config["BANK_REVOKED_NORMALIZED_RETENTION_DAYS"] = _env_int(
        "BANK_REVOKED_NORMALIZED_RETENTION_DAYS", 30
    )
    app.config["BUDGET_ALERT_THRESHOLD_RATIO"] = _env_float("BUDGET_ALERT_THRESHOLD_RATIO", 0.9)
    app.config["DASHBOARD_SNAPSHOT_MONTHS"] = max(1, min(_env_int("DASHBOARD_SNAPSHOT_MONTHS", 24), 60))
    app.config["ANALYTICS_COMPUTE_TIMEOUT_SECONDS"] = max(
        1,
        min(_env_int("ANALYTICS_COMPUTE_TIMEOUT_SECONDS", 10), 60),
    )
    app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_TIMEOUT_SECONDS"] = max(
        1,
        min(_env_int("ANALYTICS_CACHE_CIRCUIT_BREAKER_TIMEOUT_SECONDS", 10), 60),
    )
    app.config["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = _env_bool(
        "ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED",
        bool(app.config["REDIS_URL_CONFIGURED"]),
    )
    app.config["ACTIVATION_REPORT_DAYS"] = max(1, min(_env_int("ACTIVATION_REPORT_DAYS", 30), 365))
    app.config["ACTIVATION_REPORT_PATH"] = (
        (os.getenv("ACTIVATION_REPORT_PATH") or "reports/activation-report.latest.json").strip()
        or "reports/activation-report.latest.json"
    )
    app.config["PROXY_FIX_NUM_PROXIES"] = _env_int("PROXY_FIX_NUM_PROXIES", 0)

    # Initialize extensions
    db.init_app(app)
    from backend.lib.db_profiler import register_slow_query_logger
    register_slow_query_logger(float(os.getenv("SLOW_QUERY_THRESHOLD_MS", "200")))
    csrf.init_app(app)
    login_manager.init_app(app)
    login_manager.session_protection = "basic"
    bcrypt.init_app(app)
    migrate.init_app(app, db, render_as_batch=True, compare_type=True)

    # CORS — lock to frontend origin(s)
    cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://127.0.0.1:3001").split(",") if o.strip()]
    app.config["CORS_ORIGINS"] = cors_origins
    CORS(app,
         origins=cors_origins,
         supports_credentials=True,
         allow_headers=["Content-Type", "X-CSRFToken", "X-CSRF-Token", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

    is_production_env = (flask_env == "production") and (not is_dev)
    talisman_enabled = False
    if is_production_env:
        csp = {
            "default-src": "'self'",
            "script-src": "'self'",
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:"],
            "connect-src": "'self'",
            "font-src": "'self'",
            "object-src": "'none'",
            "base-uri": "'self'",
            "form-action": "'self'",
            "frame-ancestors": "'none'",
        }
        if _TALISMAN_AVAILABLE:
            Talisman(
                app,
                content_security_policy=csp,
                force_https=True,
                strict_transport_security=True,
                strict_transport_security_max_age=31536000,
                strict_transport_security_include_subdomains=True,
            )
            talisman_enabled = True
        else:
            app.logger.warning(
                "flask-talisman is not installed; using fallback security headers in production."
            )
    app.config["TALISMAN_ENABLED"] = talisman_enabled

    # Flask-Login: user loader
    @login_manager.user_loader
    def load_user(user_id):
        from backend.models import User
        return db.session.get(User, int(user_id))

    # Flask-Login: return JSON 401 instead of redirect
    @login_manager.unauthorized_handler
    def unauthorized():
        return error_response("Authentication required.", status=401, code="auth_required")

    # Import models so SQLAlchemy metadata is registered for migrations.
    from backend import models  # noqa: F401

    # Register blueprints
    from backend.routes import (
        auth, password_reset, profile_security_links, pages, transactions, categories, merchants,
        budgets, analytics, memorized, upload, health, bank, notifications, debt, goals,
    )
    for mod in [auth, password_reset, profile_security_links, pages, transactions, categories, merchants,
                budgets, analytics, memorized, upload, health, notifications, debt, goals]:
        app.register_blueprint(mod.bp)
    app.register_blueprint(bank.bp, url_prefix="/api/bank")

    @app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    @app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
    def api_not_found(path: str):
        return error_response("API endpoint not found.", status=404, code="not_found")

    # Register CLI commands
    from backend import cli
    cli.register(app)

    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        return error_response(
            e.description or "CSRF token missing or invalid.",
            status=403,
            code="csrf_invalid",
        )

    # CSRF cookie for JavaScript
    @app.after_request
    def set_csrf_cookie(response):
        if request.path in ("/healthz", "/readyz"):
            return response
        should_refresh = request.method in {"GET", "HEAD", "OPTIONS"} or "csrf_token" not in request.cookies
        if not should_refresh:
            return response
        response.set_cookie(
            "csrf_token",
            generate_csrf(),
            samesite="Lax",
            httponly=False,
            secure=not is_dev
        )
        return response

    @app.after_request
    def add_security_headers(response):
        if app.config.get("TALISMAN_ENABLED"):
            return response
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none';"
        )
        if not is_dev:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.before_request
    def _before_request_logging():
        g._request_id = request.headers.get("X-Request-ID") or secrets.token_hex(8)
        g._request_start = time.monotonic()

    @app.before_request
    def _enforce_session_version():
        if not getattr(current_user, "is_authenticated", False):
            return None

        expected_sv = int(getattr(current_user, "session_version", 1) or 1)
        raw_session_sv = session.get("sv")
        try:
            session_sv = int(raw_session_sv)
        except Exception:  # noqa: BLE001 - app startup and request cleanup should stay resilient around optional integrations.
            session_sv = None

        if session_sv == expected_sv:
            return None

        logout_user()
        session.pop("sv", None)
        # For session-recovery endpoints, clear stale auth state and continue so
        # the client can recover (e.g., fetch CSRF token and log in again).
        if (
            request.path == "/api/csrf-token"
            or request.path in ("/api/auth/login", "/api/auth/register", "/api/auth/me")
            or request.path.startswith("/api/auth/forgot-password/")
            or request.path.startswith("/api/auth/profile/confirm-")
            or request.path == "/api/auth/2fa/verify"
        ):
            return None

        return error_response(
            "Session expired. Please sign in again.",
            status=401,
            code="SESSION_REVOKED",
        )

    @app.after_request
    def _after_request_logging(response):
        request_id = getattr(g, "_request_id", None) or request.headers.get("X-Request-ID") or secrets.token_hex(8)
        g._request_id = request_id

        started_at = getattr(g, "_request_start", None)
        duration_ms = 0
        if started_at is not None:
            duration_ms = round((time.monotonic() - started_at) * 1000)

        uid = getattr(current_user, "id", None) if getattr(current_user, "is_authenticated", False) else None
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "method": request.method,
            "path": request.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "user_id": uid,
            "remote_addr": request.remote_addr,
        }

        if response.status_code >= 500:
            level = logging.ERROR
        elif response.status_code >= 400:
            level = logging.WARNING
        else:
            level = logging.INFO

        if is_dev or request.path not in ("/healthz", "/readyz"):
            if _PYTHON_JSON_LOGGER_AVAILABLE and not is_dev:
                current_app.logger.log(level, "request.completed", extra=record)
            else:
                current_app.logger.log(level, json.dumps(record))
        response.headers["X-Request-ID"] = request_id
        return response

    # Serve React SPA from frontend/dist if it exists (production mode).
    # The SPA handles its own routing (login, dashboard, etc.).
    # API endpoints registered above take priority over the catch-all.
    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist.is_dir():
        def _serve_index_html():
            response = send_from_directory(str(dist), "index.html")
            # Prevent stale HTML documents referencing deleted chunk hashes after deploy.
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            return response

        def _serve_dist_file(path: str):
            response = send_from_directory(str(dist), path)
            # Vite assets are content-hashed and safe to cache aggressively.
            if path.startswith("assets/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif path.endswith(".html"):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
            return response

        @app.route("/")
        def serve_spa_root():
            return _serve_index_html()

        @app.route("/<path:path>")
        def serve_spa(path):
            # Do not serve index.html for unknown API routes.
            if path == "api" or path.startswith("api/"):
                return error_response("API endpoint not found.", status=404, code="not_found")
            file = dist / path
            if file.is_file():
                return _serve_dist_file(path)
            return _serve_index_html()

    # Wire log scrubbing into app logger handlers.
    apply_log_scrubbing(app)

    # Validate prod safety checks before finalizing runtime behavior.
    _validate_production_config(app, is_dev)

    # ProxyFix: trust X-Forwarded-* headers from upstream proxies when configured.
    # Set PROXY_FIX_NUM_PROXIES=1 (or more) when running behind nginx/Caddy/etc.
    # Do not enable in direct-to-internet deployments — header spoofing risk.
    num_proxies = app.config.get("PROXY_FIX_NUM_PROXIES", 0)
    if num_proxies > 0:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(  # type: ignore[assignment]
            app.wsgi_app,
            x_for=num_proxies,
            x_proto=num_proxies,
            x_host=num_proxies,
        )

    return app
