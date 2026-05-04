import unittest
from unittest.mock import patch

from preflight_base import PreflightApiTestBase

from backend.models import DebtAccount


class DebtApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("alice-debt@example.com", "Password123!")
        self._create_user("bob-debt@example.com", "Password456!")

    def _create_account(self, client, **overrides):
        payload = {
            "name": "Citi Card",
            "debt_type": "credit_card",
            "balance_kd": "450.000",
            "minimum_payment_kd": "25.000",
            "due_day": 15,
            "apr_pct": "24.000",
            "notes": "Primary card",
        }
        payload.update(overrides)
        return self._post(client, "/api/debt-accounts", json=payload)

    def test_requires_auth(self):
        client = self.app.test_client()
        res_get = client.get("/api/debt-accounts")
        self.assertEqual(res_get.status_code, 401)

        res_post = self._post(
            client,
            "/api/debt-accounts",
            json={
                "name": "Card",
                "debt_type": "credit_card",
                "balance_kd": "1",
                "minimum_payment_kd": "0",
            },
        )
        self.assertEqual(res_post.status_code, 401)

    def test_csrf_required_for_mutation_routes(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Csrf Card")
            self.assertEqual(created.status_code, 201)
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            create_no_csrf = client.post(
                "/api/debt-accounts",
                json={
                    "name": "No Csrf",
                    "debt_type": "other",
                    "balance_kd": "1.000",
                    "minimum_payment_kd": "0.000",
                },
            )
            self.assertEqual(create_no_csrf.status_code, 403)

            update_no_csrf = client.post(
                f"/api/debt-accounts/{account_id}/update",
                json={"minimum_payment_kd": "99.000"},
            )
            self.assertEqual(update_no_csrf.status_code, 403)

            delete_no_csrf = client.post(
                f"/api/debt-accounts/{account_id}/delete",
                json={},
            )
            self.assertEqual(delete_no_csrf.status_code, 403)

    def test_create_list_and_summary(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")

            created = self._create_account(client)
            self.assertEqual(created.status_code, 201, created.get_data(as_text=True))
            first = ((created.get_json() or {}).get("data") or {}).get("account") or {}
            self.assertEqual(first.get("name"), "Citi Card")
            self.assertEqual(first.get("balance_kd"), "450.000")
            self.assertEqual(first.get("minimum_payment_kd"), "25.000")

            created2 = self._create_account(
                client,
                name="Car Loan",
                debt_type="car_loan",
                balance_kd="3200.000",
                minimum_payment_kd="120.000",
                due_day=1,
                apr_pct=None,
                notes="",
            )
            self.assertEqual(created2.status_code, 201, created2.get_data(as_text=True))

            listed = client.get("/api/debt-accounts")
            self.assertEqual(listed.status_code, 200)
            accounts = ((listed.get_json() or {}).get("data") or {}).get("accounts") or []
            self.assertEqual(len(accounts), 2)
            self.assertEqual(accounts[0]["name"], "Car Loan")
            self.assertEqual(accounts[1]["name"], "Citi Card")

            summary = client.get("/api/debt-accounts/summary")
            self.assertEqual(summary.status_code, 200)
            payload = (summary.get_json() or {}).get("data") or {}
            self.assertEqual(payload.get("account_count"), 2)
            self.assertEqual(payload.get("total_balance_kd"), "3650.000")
            self.assertEqual(payload.get("total_minimum_kd"), "145.000")

    def test_create_requires_name(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = self._create_account(client, name="")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_invalid_debt_type(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = self._create_account(client, debt_type="mortgage")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_negative_balance(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = self._create_account(client, balance_kd="-1.000")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_due_day_out_of_range(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = self._create_account(client, due_day=32)
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_too_large_apr(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = self._create_account(client, apr_pct="1000.000")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_duplicate_name_conflict_same_user(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res1 = self._create_account(client, name="Visa")
            self.assertEqual(res1.status_code, 201)
            res2 = self._create_account(client, name="Visa")
            self.assertEqual(res2.status_code, 409)
            self.assertEqual((res2.get_json() or {}).get("error_code"), "debt_name_conflict")

    def test_duplicate_name_allowed_for_different_users(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res1 = self._create_account(client, name="Shared Name")
            self.assertEqual(res1.status_code, 201)

        with self.app.test_client() as client:
            self._login(client, "bob-debt@example.com", "Password456!")
            res2 = self._create_account(client, name="Shared Name")
            self.assertEqual(res2.status_code, 201)

    def test_update_partial_fields(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Card A")
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            updated = self._post(
                client,
                f"/api/debt-accounts/{account_id}/update",
                json={"minimum_payment_kd": "30.500", "debt_type": "personal_loan"},
            )
            self.assertEqual(updated.status_code, 200)
            account = ((updated.get_json() or {}).get("data") or {}).get("account") or {}
            self.assertEqual(account.get("minimum_payment_kd"), "30.500")
            self.assertEqual(account.get("debt_type"), "personal_loan")

    def test_update_can_clear_optional_fields(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Card B")
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            updated = self._post(
                client,
                f"/api/debt-accounts/{account_id}/update",
                json={"due_day": None, "apr_pct": None, "notes": ""},
            )
            self.assertEqual(updated.status_code, 200)
            account = ((updated.get_json() or {}).get("data") or {}).get("account") or {}
            self.assertIsNone(account.get("due_day"))
            self.assertIsNone(account.get("apr_pct"))
            self.assertIsNone(account.get("notes"))

    def test_update_rejects_negative_minimum_payment(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Card C")
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            updated = self._post(
                client,
                f"/api/debt-accounts/{account_id}/update",
                json={"minimum_payment_kd": "-0.001"},
            )
            self.assertEqual(updated.status_code, 400)
            self.assertEqual((updated.get_json() or {}).get("error_code"), "validation_error")

    def test_update_name_conflict(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            a = self._create_account(client, name="Card D")
            b = self._create_account(client, name="Card E")
            aid = ((a.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            bid = ((b.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(aid, int)
            self.assertIsInstance(bid, int)

            updated = self._post(
                client,
                f"/api/debt-accounts/{bid}/update",
                json={"name": "Card D"},
            )
            self.assertEqual(updated.status_code, 409)
            self.assertEqual((updated.get_json() or {}).get("error_code"), "debt_name_conflict")

    def test_delete_soft_deactivates_and_excludes_from_summary(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(
                client,
                name="Card F",
                balance_kd="100.000",
                minimum_payment_kd="10.000",
            )
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            deleted = self._post(client, f"/api/debt-accounts/{account_id}/delete", json={})
            self.assertEqual(deleted.status_code, 200)
            account = ((deleted.get_json() or {}).get("data") or {}).get("account") or {}
            self.assertEqual(account.get("is_active"), False)

            summary = client.get("/api/debt-accounts/summary")
            self.assertEqual(summary.status_code, 200)
            data = (summary.get_json() or {}).get("data") or {}
            self.assertEqual(data.get("account_count"), 0)
            self.assertEqual(data.get("total_balance_kd"), "0.000")
            self.assertEqual(data.get("total_minimum_kd"), "0.000")

            with self.app.app_context():
                row = DebtAccount.query.filter_by(id=account_id).first()
                self.assertIsNotNone(row)
                self.assertFalse(row.is_active)

    def test_list_include_inactive_returns_soft_deleted_accounts(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Card G")
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)
            self._post(client, f"/api/debt-accounts/{account_id}/delete", json={})

            active_only = client.get("/api/debt-accounts")
            self.assertEqual(active_only.status_code, 200)
            self.assertEqual(((active_only.get_json() or {}).get("data") or {}).get("accounts"), [])

            with_deleted = client.get("/api/debt-accounts?include_inactive=true")
            self.assertEqual(with_deleted.status_code, 200)
            rows = ((with_deleted.get_json() or {}).get("data") or {}).get("accounts") or []
            self.assertEqual(len(rows), 1)
            self.assertFalse(rows[0]["is_active"])

    def test_tenant_isolation_update_and_delete(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            created = self._create_account(client, name="Card H")
            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

        with self.app.test_client() as client:
            self._login(client, "bob-debt@example.com", "Password456!")
            listed = client.get("/api/debt-accounts")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(((listed.get_json() or {}).get("data") or {}).get("accounts"), [])

            summary = client.get("/api/debt-accounts/summary")
            self.assertEqual(summary.status_code, 200)
            summary_data = ((summary.get_json() or {}).get("data") or {})
            self.assertEqual(summary_data.get("account_count"), 0)
            self.assertEqual(summary_data.get("total_balance_kd"), "0.000")
            self.assertEqual(summary_data.get("total_minimum_kd"), "0.000")

            payoff = client.get("/api/debt-accounts/payoff-plan?monthly_payment=100.000")
            self.assertEqual(payoff.status_code, 200)
            payoff_data = ((payoff.get_json() or {}).get("data") or {})
            self.assertEqual(payoff_data.get("minimum_required"), "0.000")
            self.assertEqual(((payoff_data.get("avalanche") or {}).get("payoff_order") or []), [])
            self.assertEqual(((payoff_data.get("snowball") or {}).get("payoff_order") or []), [])

            updated = self._post(
                client,
                f"/api/debt-accounts/{account_id}/update",
                json={"name": "Should Not Work"},
            )
            self.assertEqual(updated.status_code, 404)

            deleted = self._post(client, f"/api/debt-accounts/{account_id}/delete", json={})
            self.assertEqual(deleted.status_code, 404)

    def test_mutations_bust_safe_to_spend_cache(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")

            with patch("backend.routes.debt.cache_bust_safe_to_spend") as bust_create:
                created = self._create_account(client, name="Card Cache")
                self.assertEqual(created.status_code, 201)
                bust_create.assert_called_once()

            account_id = ((created.get_json() or {}).get("data") or {}).get("account", {}).get("id")
            self.assertIsInstance(account_id, int)

            with patch("backend.routes.debt.cache_bust_safe_to_spend") as bust_update:
                updated = self._post(
                    client,
                    f"/api/debt-accounts/{account_id}/update",
                    json={"minimum_payment_kd": "11.000"},
                )
                self.assertEqual(updated.status_code, 200)
                bust_update.assert_called_once()

            with patch("backend.routes.debt.cache_bust_safe_to_spend") as bust_delete:
                deleted = self._post(client, f"/api/debt-accounts/{account_id}/delete", json={})
                self.assertEqual(deleted.status_code, 200)
                bust_delete.assert_called_once()

    def test_payoff_plan_empty_state(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            res = client.get("/api/debt-accounts/payoff-plan?monthly_payment=100.000")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = ((res.get_json() or {}).get("data") or {})
            self.assertEqual(data.get("minimum_required"), "0.000")
            avalanche = data.get("avalanche") or {}
            snowball = data.get("snowball") or {}
            self.assertEqual(avalanche.get("total_months"), 0)
            self.assertEqual(snowball.get("total_months"), 0)
            self.assertEqual(avalanche.get("payoff_order"), [])
            self.assertEqual(snowball.get("payoff_order"), [])

    def test_payoff_plan_rejects_payment_below_minimums(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            self._create_account(client, name="Card L", minimum_payment_kd="25.000")
            self._create_account(client, name="Card M", minimum_payment_kd="35.000")
            res = client.get("/api/debt-accounts/payoff-plan?monthly_payment=59.999")
            self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
            payload = res.get_json() or {}
            self.assertEqual(payload.get("error_code"), "PAYMENT_TOO_LOW")
            self.assertIn("60.000", payload.get("error") or "")

    def test_payoff_plan_returns_avalanche_and_snowball(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            self._create_account(
                client,
                name="High APR",
                debt_type="credit_card",
                balance_kd="500.000",
                minimum_payment_kd="50.000",
                apr_pct="24.000",
            )
            self._create_account(
                client,
                name="Low APR",
                debt_type="personal_loan",
                balance_kd="800.000",
                minimum_payment_kd="80.000",
                apr_pct="9.000",
            )
            res = client.get("/api/debt-accounts/payoff-plan?monthly_payment=220.000")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = ((res.get_json() or {}).get("data") or {})
            self.assertEqual(data.get("minimum_required"), "130.000")
            avalanche = data.get("avalanche") or {}
            snowball = data.get("snowball") or {}
            self.assertIn("payoff_order", avalanche)
            self.assertIn("payoff_order", snowball)
            self.assertGreaterEqual(len(avalanche.get("payoff_order") or []), 2)
            self.assertGreaterEqual(len(snowball.get("payoff_order") or []), 2)
            self.assertLessEqual(
                float(avalanche.get("total_interest_paid") or 0),
                float(snowball.get("total_interest_paid") or 0),
            )

    def test_payoff_plan_supports_zero_apr_accounts(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            self._create_account(
                client,
                name="Zero APR Card",
                debt_type="credit_card",
                balance_kd="120.000",
                minimum_payment_kd="30.000",
                apr_pct="0.000",
            )
            res = client.get("/api/debt-accounts/payoff-plan?monthly_payment=30.000")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = ((res.get_json() or {}).get("data") or {})
            avalanche = data.get("avalanche") or {}
            snowball = data.get("snowball") or {}

            self.assertEqual(avalanche.get("total_interest_paid"), "0.000")
            self.assertEqual(snowball.get("total_interest_paid"), "0.000")
            self.assertFalse(avalanche.get("debt_free_impossible"))
            self.assertFalse(snowball.get("debt_free_impossible"))
            self.assertEqual(avalanche.get("total_months"), 4)
            self.assertEqual(snowball.get("total_months"), 4)

    def test_payoff_plan_marks_non_converging_payment_levels_as_impossible(self):
        with self.app.test_client() as client:
            self._login(client, "alice-debt@example.com", "Password123!")
            self._create_account(
                client,
                name="Impossible Card",
                debt_type="credit_card",
                balance_kd="100.000",
                minimum_payment_kd="1.000",
                apr_pct="150.000",
            )
            res = client.get("/api/debt-accounts/payoff-plan?monthly_payment=1.000")
            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            data = ((res.get_json() or {}).get("data") or {})
            avalanche = data.get("avalanche") or {}
            snowball = data.get("snowball") or {}
            self.assertTrue(avalanche.get("debt_free_impossible"))
            self.assertTrue(snowball.get("debt_free_impossible"))
            self.assertEqual(avalanche.get("debt_free_date"), "")
            self.assertEqual(snowball.get("debt_free_date"), "")


if __name__ == "__main__":
    unittest.main()
