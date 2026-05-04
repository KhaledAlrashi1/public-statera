import os
import unittest
from unittest.mock import patch

import backend
from flask import Flask

from backend import _validate_production_config


_PROD_SECRET  = "prod-secret-key-0123456789abcdef01234567"
_PROD_ENC_KEY = "ab" * 32  # 64 hex chars — must differ from SECRET_KEY
_PROD_OPERATOR_TOKEN = "operator-token-0123456789abcdef0123456789"
_PROD_SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/1"


class ProductionConfigValidationTests(unittest.TestCase):
    def _prod_app(
        self,
        *,
        enc_key: str = _PROD_ENC_KEY,
        sentry_dsn: str = _PROD_SENTRY_DSN,
        operator_api_token: str = _PROD_OPERATOR_TOKEN,
    ) -> Flask:
        app = Flask(__name__)
        app.config["SECRET_KEY"] = _PROD_SECRET
        app.config["ENCRYPTION_KEY"] = enc_key
        app.config["SQLALCHEMY_DATABASE_URI"] = "postgresql://finance:secret@postgres:5432/financedb"
        app.config["CORS_ORIGINS"] = ["https://app.example.com"]
        app.config["PROXY_FIX_NUM_PROXIES"] = 0
        app.config["RATE_LIMIT_BACKEND"] = "redis"
        app.config["SENTRY_DSN"] = sentry_dsn
        app.config["OPERATOR_API_TOKEN"] = operator_api_token
        return app

    def _good_env(self) -> dict:
        return {
            "POSTMARK_API_KEY": "pm-test",
            "MAIL_FROM_ADDRESS": "no-reply@example.com",
            "MAIL_FROM": "",
            "ENCRYPTION_KEY": _PROD_ENC_KEY,
        }

    def _validate(self, app: Flask, *, sentry_available: bool = True) -> None:
        with patch.object(backend, "_SENTRY_AVAILABLE", sentry_available):
            _validate_production_config(app, is_dev=False)

    # ------------------------------------------------------------------
    # Email config checks
    # ------------------------------------------------------------------

    def test_production_requires_postmark_api_key(self):
        app = self._prod_app()
        env = {**self._good_env(), "POSTMARK_API_KEY": ""}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                _validate_production_config(app, is_dev=False)
        self.assertIn("POSTMARK_API_KEY is required in production", str(ctx.exception))

    def test_production_requires_mail_from_address(self):
        app = self._prod_app()
        env = {**self._good_env(), "MAIL_FROM_ADDRESS": "", "MAIL_FROM": ""}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                _validate_production_config(app, is_dev=False)
        self.assertIn("MAIL_FROM_ADDRESS is required in production", str(ctx.exception))

    def test_production_accepts_postmark_and_from_address(self):
        app = self._prod_app()
        with patch.dict(os.environ, self._good_env(), clear=False):
            self._validate(app)

    def test_production_accepts_mail_from_fallback(self):
        app = self._prod_app()
        env = {**self._good_env(), "MAIL_FROM_ADDRESS": "", "MAIL_FROM": "legacy@example.com"}
        with patch.dict(os.environ, env, clear=False):
            self._validate(app)

    def test_dev_mode_does_not_require_mail_config(self):
        app = self._prod_app()
        with patch.dict(
            os.environ,
            {"POSTMARK_API_KEY": "", "MAIL_FROM_ADDRESS": "", "MAIL_FROM": ""},
            clear=False,
        ):
            _validate_production_config(app, is_dev=True)

    # ------------------------------------------------------------------
    # ENCRYPTION_KEY checks
    # ------------------------------------------------------------------

    def test_production_requires_encryption_key(self):
        app = self._prod_app(enc_key="")
        env = {**self._good_env(), "ENCRYPTION_KEY": ""}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                _validate_production_config(app, is_dev=False)
        self.assertIn("ENCRYPTION_KEY is required", str(ctx.exception))

    def test_production_rejects_encryption_key_equal_to_secret_key(self):
        """ENCRYPTION_KEY must not equal SECRET_KEY."""
        app = self._prod_app(enc_key=_PROD_SECRET)
        env = {**self._good_env(), "ENCRYPTION_KEY": _PROD_SECRET}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                _validate_production_config(app, is_dev=False)
        self.assertIn("must not equal SECRET_KEY", str(ctx.exception))

    def test_production_accepts_distinct_encryption_key(self):
        """Distinct ENCRYPTION_KEY passes validation."""
        app = self._prod_app(enc_key=_PROD_ENC_KEY)
        with patch.dict(os.environ, self._good_env(), clear=False):
            self._validate(app)

    # ------------------------------------------------------------------
    # Observability + operator access checks
    # ------------------------------------------------------------------

    def test_production_requires_sentry_dsn(self):
        app = self._prod_app(sentry_dsn="")
        with patch.dict(os.environ, self._good_env(), clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                self._validate(app)
        self.assertIn("SENTRY_DSN is required in production", str(ctx.exception))

    def test_production_requires_sentry_sdk(self):
        app = self._prod_app()
        with patch.dict(os.environ, self._good_env(), clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                self._validate(app, sentry_available=False)
        self.assertIn("sentry-sdk[flask] must be installed", str(ctx.exception))

    def test_production_requires_operator_api_token(self):
        app = self._prod_app(operator_api_token="")
        with patch.dict(os.environ, self._good_env(), clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                self._validate(app)
        self.assertIn("OPERATOR_API_TOKEN is required in production", str(ctx.exception))

    def test_production_rejects_short_operator_api_token(self):
        app = self._prod_app(operator_api_token="short-token")
        with patch.dict(os.environ, self._good_env(), clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                self._validate(app)
        self.assertIn("OPERATOR_API_TOKEN must be at least 32 characters", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
