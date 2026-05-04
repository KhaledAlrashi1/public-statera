import os
import unittest
from urllib.parse import parse_qs, urlparse

from sqlalchemy import text


def _extract_db_name(db_url: str) -> str:
    parsed = urlparse(db_url)
    path = (parsed.path or "").strip("/")
    return path.split("/", 1)[0].strip().lower()


def _looks_like_test_database(db_name: str) -> bool:
    return (
        db_name.startswith("test_")
        or db_name.startswith("testing_")
        or db_name.endswith("_test")
        or "_test_" in db_name
    )


def resolve_test_database_url() -> str:
    """Return a PostgreSQL test DATABASE_URL or skip the suite safely."""
    explicit_test_db_url = (os.environ.get("TEST_DATABASE_URL") or "").strip()
    db_url = explicit_test_db_url or (os.environ.get("DATABASE_URL") or "").strip()
    lowered = db_url.lower()
    if not lowered.startswith("postgresql://") or "paste_new" in lowered:
        raise unittest.SkipTest(
            "Tests require a PostgreSQL TEST_DATABASE_URL (or safe DATABASE_URL) in the environment."
        )

    db_name = _extract_db_name(db_url)
    if not db_name:
        raise unittest.SkipTest("Unable to parse database name from test database URL.")

    if not _looks_like_test_database(db_name):
        if explicit_test_db_url:
            raise unittest.SkipTest(
                "TEST_DATABASE_URL must point to a dedicated test DB (name must include test_/_test)."
            )
        raise unittest.SkipTest(
            "Refusing to run tests against non-test DATABASE_URL. "
            "Set TEST_DATABASE_URL to an isolated test database."
        )
    try:
        import psycopg2  # noqa: F401
    except Exception as exc:
        raise unittest.SkipTest(f"psycopg2 is required for PostgreSQL tests: {exc}")
    return db_url


class PreflightApiTestBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._env_keys = [
            "DATABASE_URL",
            "PERSONAL_STATERA_DEV_MODE",
            "SECRET_KEY",
            "ENABLE_TEMPLATE_SUGGESTIONS",
            "RATE_LIMIT_BACKEND",
        ]
        cls._prev_env = {k: os.environ.get(k) for k in cls._env_keys}
        cls._tmpdir = None
        db_url = resolve_test_database_url()
        os.environ["DATABASE_URL"] = db_url
        os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
        os.environ["SECRET_KEY"] = "test-secret-key-for-preflight-checks"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        from backend import create_app, db, bcrypt
        from backend.lib.suggestions import _txn_norm
        from backend.models import (
            User,
            MemorizedTransaction,
            Category,
            Merchant,
            Transaction,
            SecurityEvent,
        )

        # Re-apply env values after imports for deterministic config in tests.
        os.environ["DATABASE_URL"] = db_url
        os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
        os.environ["SECRET_KEY"] = "test-secret-key-for-preflight-checks"
        os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
        os.environ["RATE_LIMIT_BACKEND"] = "memory"

        cls._create_app = create_app
        cls.db = db
        cls.bcrypt = bcrypt
        cls.User = User
        cls.MemorizedTransaction = MemorizedTransaction
        cls.Category = Category
        cls.Merchant = Merchant
        cls.Transaction = Transaction
        cls.SecurityEvent = SecurityEvent
        cls._txn_norm_fn = _txn_norm

        cls.app = create_app()
        cls.app.config["TESTING"] = True

    @classmethod
    def tearDownClass(cls):
        for key, value in cls._prev_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def setUp(self):
        from backend.lib.cache import cache_delete_pattern, reset_analytics_cache_circuit_breaker
        from backend.security_ops import _rate_limiter
        with self.app.app_context():
            _rate_limiter.reset()
            reset_analytics_cache_circuit_breaker()
            # Keep Redis-backed analytics caches isolated between tests.
            cache_delete_pattern("safe_to_spend:*")
            cache_delete_pattern("dashboard_metrics:*")
            cache_delete_pattern("task_lock:*")
            self.db.session.remove()
            self.db.session.execute(text("DROP TABLE IF EXISTS items CASCADE"))
            self.db.session.commit()
            self.db.drop_all()
            self.db.create_all()

    def _csrf_headers(self, client):
        res = client.get("/api/csrf-token")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        token = (res.get_json() or {}).get("csrf_token")
        self.assertTrue(token)
        return {
            "X-CSRFToken": token,
            "X-Requested-With": "fetch",
        }

    def _post(self, client, url, json=None):
        return client.post(url, json=json, headers=self._csrf_headers(client))

    def _get_request_id(self, response) -> str:
        return response.headers.get("X-Request-ID", "")

    def _token_from_preview_url(self, preview_url: str) -> str:
        parsed = urlparse(preview_url)
        token = parse_qs(parsed.fragment).get("token", [""])[0]
        if token:
            return token
        return parse_qs(parsed.query).get("token", [""])[0]

    def _create_user(self, email: str, password: str):
        with self.app.app_context():
            user = self.User(
                email=email,
                password_hash=self.bcrypt.generate_password_hash(password).decode("utf-8"),
            )
            self.db.session.add(user)
            self.db.session.commit()
            return user.id

    def _login(self, client, email: str, password: str):
        res = self._post(client, "/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
