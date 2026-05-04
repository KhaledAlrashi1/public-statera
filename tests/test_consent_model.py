import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from preflight_base import PreflightApiTestBase

from backend import db
from backend.models import BankConsent, DataAccessLog, ProductEvent
from backend.tasks import execute_check_expiring_consents


class ConsentModelTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self.app.config["ENABLE_OPEN_BANKING"] = True
        self.app.config["REQUIRE_2FA_FOR_BANK_CONNECT"] = False
        self.uid = self._create_user("consent-user@example.com", "Password123!")

    def _connect_bank(self, client, **extra):
        payload = {
            "provider": "fakebank",
            "institution_name": "Consent Test Bank",
        }
        payload.update(extra)
        res = self._post(client, "/api/bank/connect", json=payload)
        self.assertEqual(res.status_code, 201, res.get_data(as_text=True))
        return (res.get_json() or {}).get("data", {}).get("connection", {})

    def test_connect_stores_cbk_consent_fields_and_default_expiry(self):
        with self.app.test_client() as client:
            self._login(client, "consent-user@example.com", "Password123!")
            self._connect_bank(
                client,
                scopes=["transactions:read"],
                purpose_of_use="Personal financial analytics",
            )

            ledger = client.get("/api/bank/consents")
            self.assertEqual(ledger.status_code, 200, ledger.get_data(as_text=True))
            consents = ((ledger.get_json() or {}).get("data") or {}).get("consents") or []
            self.assertEqual(len(consents), 1)
            consent = consents[0]
            self.assertEqual(consent.get("purpose_of_use"), "Personal financial analytics")
            self.assertEqual(consent.get("data_recipient_name"), "Personal Statera")
            self.assertEqual(consent.get("scopes"), ["transactions:read"])
            self.assertTrue(consent.get("scope_description"))
            self.assertTrue(consent.get("granted_at"))
            self.assertTrue(consent.get("expires_at"))
            self.assertEqual(consent.get("status"), "active")

            granted = datetime.fromisoformat(consent["granted_at"])
            expires = datetime.fromisoformat(consent["expires_at"])
            delta_days = (expires - granted).days
            self.assertGreaterEqual(delta_days, 89)
            self.assertLessEqual(delta_days, 91)

    def test_connect_rejects_unsupported_scope(self):
        with self.app.test_client() as client:
            self._login(client, "consent-user@example.com", "Password123!")
            bad = self._post(
                client,
                "/api/bank/connect",
                json={
                    "provider": "fakebank",
                    "institution_name": "Consent Test Bank",
                    "scopes": ["balances:read"],
                },
            )
            self.assertEqual(bad.status_code, 400, bad.get_data(as_text=True))
            self.assertEqual((bad.get_json() or {}).get("error_code"), "unsupported_scope")

    def test_sync_preview_and_commit_write_data_access_logs(self):
        with self.app.test_client() as client:
            self._login(client, "consent-user@example.com", "Password123!")
            conn = self._connect_bank(client)
            conn_id = conn.get("id")
            self.assertIsInstance(conn_id, int)

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 3},
            )
            self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")
            self.assertIsInstance(run_id, int)

            commit = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={},
            )
            self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))

            log_res = client.get(f"/api/bank/data-access-log?connection_id={conn_id}")
            self.assertEqual(log_res.status_code, 200, log_res.get_data(as_text=True))
            rows = ((log_res.get_json() or {}).get("data") or {}).get("log") or []
            actions = [row.get("action") for row in rows]
            self.assertIn("sync_preview", actions)
            self.assertIn("sync_commit", actions)

    def test_transactions_search_with_bank_sync_source_writes_data_access_log(self):
        with self.app.test_client() as client:
            self._login(client, "consent-user@example.com", "Password123!")
            conn = self._connect_bank(client)
            conn_id = conn.get("id")
            self.assertIsInstance(conn_id, int)

            preview = self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-preview",
                json={"limit": 2},
            )
            run_id = ((preview.get_json() or {}).get("data") or {}).get("sync_run_id")
            self.assertIsInstance(run_id, int)
            self._post(
                client,
                f"/api/bank/connections/{conn_id}/sync-runs/{run_id}/commit",
                json={},
            )

            search = client.get(
                f"/api/transactions/search?source=bank_sync&connection_id={conn_id}&limit=10&offset=0"
            )
            self.assertEqual(search.status_code, 200, search.get_data(as_text=True))

        with self.app.app_context():
            logs = (
                DataAccessLog.query
                .filter_by(user_id=self.uid, connection_id=conn_id, action="transactions.search")
                .all()
            )
            self.assertGreaterEqual(len(logs), 1)

    def test_expiring_consent_task_detects_window(self):
        with self.app.test_client() as client:
            self._login(client, "consent-user@example.com", "Password123!")
            conn = self._connect_bank(client)
            conn_id = conn.get("id")
            self.assertIsInstance(conn_id, int)

        with self.app.app_context():
            consent = (
                BankConsent.query
                .filter_by(user_id=self.uid, connection_id=conn_id)
                .order_by(BankConsent.id.desc())
                .first()
            )
            self.assertIsNotNone(consent)
            consent.expires_at = datetime.now(timezone.utc) + timedelta(days=5)
            db.session.commit()

            with patch("backend.tasks.send_consent_expiry_email.delay") as mock_delay:
                out = execute_check_expiring_consents(window_days=7)
            self.assertGreaterEqual(out.get("expiring_consents", 0), 1)
            self.assertGreaterEqual(out.get("notifications_created", 0), 1)
            mock_delay.assert_called()

            events = (
                ProductEvent.query
                .filter(ProductEvent.user_id == self.uid)
                .filter(ProductEvent.event_name.like("consent_expiring_%"))
                .all()
            )
            self.assertGreaterEqual(len(events), 1)


if __name__ == "__main__":
    unittest.main()
