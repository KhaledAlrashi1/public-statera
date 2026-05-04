import unittest
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError

from preflight_base import PreflightApiTestBase


class MerchantErrorHandlingApiTests(PreflightApiTestBase):
    def test_create_merchant_integrity_conflict_returns_structured_validation_error(self):
        self._create_user("merchant-create-conflict@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "merchant-create-conflict@example.com", "Password123!")

        with patch(
            "backend.routes.merchants.db.session.commit",
            side_effect=IntegrityError("insert merchants", {}, Exception("duplicate")),
        ):
            res = self._post(client, "/api/merchants", json={"name": "Cafe One"})

        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "validation_error")
        self.assertIn("already exists", payload.get("error", "").lower())

    def test_update_merchant_integrity_conflict_returns_structured_validation_error(self):
        self._create_user("merchant-update-conflict@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "merchant-update-conflict@example.com", "Password123!")

        create_merchant = self._post(client, "/api/merchants", json={"name": "Cafe One"})
        self.assertEqual(create_merchant.status_code, 201, create_merchant.get_data(as_text=True))
        merchant_id = ((create_merchant.get_json() or {}).get("item") or {}).get("id")
        self.assertIsInstance(merchant_id, int)

        with patch(
            "backend.routes.merchants.db.session.commit",
            side_effect=IntegrityError("update merchants", {}, Exception("duplicate")),
        ):
            res = self._post(client, f"/api/merchants/{merchant_id}/update", json={"name": "Cafe Prime"})

        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json() or {}
        self.assertEqual(payload.get("error_code"), "validation_error")
        self.assertIn("already exists", payload.get("error", "").lower())


if __name__ == "__main__":
    unittest.main()
