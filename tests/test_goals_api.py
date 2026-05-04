import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from unittest.mock import patch

from preflight_base import PreflightApiTestBase

from backend.models import SavingsGoal
from backend.routes.goals import _apply_goal_deposit


class GoalsApiTests(PreflightApiTestBase):
    def setUp(self):
        super().setUp()
        self._create_user("alice-goals@example.com", "Password123!")
        self._create_user("bob-goals@example.com", "Password456!")

    def _create_goal(self, client, **overrides):
        payload = {
            "name": "Emergency Fund",
            "goal_type": "emergency_fund",
            "target_kd": "1500.000",
            "current_kd": "200.000",
            "target_date": "2026-12-31",
            "linked_category": "Savings",
            "notes": "Cash reserve",
        }
        payload.update(overrides)
        return self._post(client, "/api/savings-goals", json=payload)

    def test_requires_auth(self):
        client = self.app.test_client()
        self.assertEqual(client.get("/api/savings-goals").status_code, 401)
        self.assertEqual(self._post(client, "/api/savings-goals", json={}).status_code, 401)

    def test_csrf_required_for_mutation_routes(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Csrf Goal")
            self.assertEqual(created.status_code, 201)
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            create_no_csrf = client.post(
                "/api/savings-goals",
                json={
                    "name": "No Csrf Goal",
                    "goal_type": "custom",
                    "target_kd": "100.000",
                    "current_kd": "0.000",
                },
            )
            self.assertEqual(create_no_csrf.status_code, 403)

            update_no_csrf = client.post(
                f"/api/savings-goals/{goal_id}/update",
                json={"name": "No Csrf Update"},
            )
            self.assertEqual(update_no_csrf.status_code, 403)

            deposit_no_csrf = client.post(
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "1.000"},
            )
            self.assertEqual(deposit_no_csrf.status_code, 403)

            delete_no_csrf = client.post(
                f"/api/savings-goals/{goal_id}/delete",
                json={},
            )
            self.assertEqual(delete_no_csrf.status_code, 403)

    def test_create_and_list_goals(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")

            first = self._create_goal(client)
            self.assertEqual(first.status_code, 201, first.get_data(as_text=True))
            first_goal = ((first.get_json() or {}).get("data") or {}).get("goal") or {}
            self.assertEqual(first_goal.get("name"), "Emergency Fund")
            self.assertEqual(first_goal.get("target_kd"), "1500.000")

            second = self._create_goal(
                client,
                name="Starter Buffer",
                goal_type="starter_buffer",
                target_kd="300.000",
                current_kd="0",
                target_date=None,
                linked_category="",
                notes="",
            )
            self.assertEqual(second.status_code, 201, second.get_data(as_text=True))

            listed = client.get("/api/savings-goals")
            self.assertEqual(listed.status_code, 200)
            goals = ((listed.get_json() or {}).get("data") or {}).get("goals") or []
            self.assertEqual(len(goals), 2)
            self.assertEqual(goals[0]["name"], "Starter Buffer")
            self.assertEqual(goals[1]["name"], "Emergency Fund")
            self.assertIn("projection", goals[0])
            self.assertIn("projection", goals[1])

    def test_projection_endpoint_returns_expected_shape(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(
                client,
                name="Projection Goal",
                target_kd="1000.000",
                current_kd="200.000",
                target_date="2026-12-31",
            )
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            projection_res = client.get(f"/api/savings-goals/{goal_id}/projection")
            self.assertEqual(projection_res.status_code, 200, projection_res.get_data(as_text=True))
            projection = ((projection_res.get_json() or {}).get("data") or {}).get("projection") or {}

            self.assertIn("projected_date", projection)
            self.assertIn("months_remaining", projection)
            self.assertIn("required_monthly", projection)
            self.assertIn("current_pace_monthly", projection)
            self.assertIn("on_track", projection)
            self.assertIn("shortfall_per_month", projection)

            self.assertEqual(projection.get("current_pace_monthly"), "0.000")
            self.assertIsInstance(projection.get("on_track"), bool)

    def test_create_requires_name(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            res = self._create_goal(client, name="")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_requires_positive_target(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")

            zero = self._create_goal(client, target_kd="0")
            self.assertEqual(zero.status_code, 400)

            negative = self._create_goal(client, target_kd="-1.000")
            self.assertEqual(negative.status_code, 400)

    def test_create_rejects_negative_current(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            res = self._create_goal(client, current_kd="-0.001")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_current_amount_above_target(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            res = self._create_goal(client, target_kd="100.000", current_kd="150.000")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_invalid_goal_type(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            res = self._create_goal(client, goal_type="vacation")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_invalid_target_date(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            res = self._create_goal(client, target_date="31-12-2026")
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_create_rejects_past_target_date(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            past_date = (date.today() - timedelta(days=1)).isoformat()
            res = self._create_goal(client, target_date=past_date)
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_update_goal_fields(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Buffer")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            updated = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={
                    "name": "Updated Buffer",
                    "goal_type": "custom",
                    "target_kd": "500.000",
                    "current_kd": "120.500",
                    "target_date": None,
                    "linked_category": "",
                    "notes": "Adjusted",
                },
            )
            self.assertEqual(updated.status_code, 200)
            goal = ((updated.get_json() or {}).get("data") or {}).get("goal") or {}
            self.assertEqual(goal.get("name"), "Updated Buffer")
            self.assertEqual(goal.get("goal_type"), "custom")
            self.assertEqual(goal.get("target_kd"), "500.000")
            self.assertEqual(goal.get("current_kd"), "120.500")
            self.assertIsNone(goal.get("target_date"))
            self.assertIsNone(goal.get("linked_category"))
            self.assertEqual(goal.get("notes"), "Adjusted")

    def test_update_rejects_invalid_target(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Invalid Update")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            res = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={"target_kd": "0"},
            )
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_update_rejects_past_target_date(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Past Date Update")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            past_date = (date.today() - timedelta(days=1)).isoformat()
            res = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={"target_date": past_date},
            )
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_update_allows_unchanged_past_target_date(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            past_date = date.today() - timedelta(days=7)

            with self.app.app_context():
                user = self.User.query.filter_by(email="alice-goals@example.com").first()
                self.assertIsNotNone(user)
                goal = SavingsGoal(
                    user_id=user.id,
                    name="Expired Goal",
                    goal_type="custom",
                    target_kd="500.000",
                    current_kd="100.000",
                    target_date=past_date,
                    linked_category_id=None,
                    notes="Original",
                )
                self.db.session.add(goal)
                self.db.session.commit()
                goal_id = goal.id

            updated = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={
                    "name": "Expired Goal Renamed",
                    "target_date": past_date.isoformat(),
                },
            )
            self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))
            goal = ((updated.get_json() or {}).get("data") or {}).get("goal") or {}
            self.assertEqual(goal.get("name"), "Expired Goal Renamed")
            self.assertEqual(goal.get("target_date"), past_date.isoformat())

    def test_update_rejects_changed_past_target_date_for_expired_goal(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            original_past_date = date.today() - timedelta(days=7)
            different_past_date = date.today() - timedelta(days=14)

            with self.app.app_context():
                user = self.User.query.filter_by(email="alice-goals@example.com").first()
                self.assertIsNotNone(user)
                goal = SavingsGoal(
                    user_id=user.id,
                    name="Expired Goal",
                    goal_type="custom",
                    target_kd="500.000",
                    current_kd="100.000",
                    target_date=original_past_date,
                    linked_category_id=None,
                    notes="Original",
                )
                self.db.session.add(goal)
                self.db.session.commit()
                goal_id = goal.id

            updated = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={"target_date": different_past_date.isoformat()},
            )
            self.assertEqual(updated.status_code, 400, updated.get_data(as_text=True))
            self.assertEqual((updated.get_json() or {}).get("error_code"), "validation_error")

    def test_update_rejects_current_amount_above_target(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Update Amount Check")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            res = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={"current_kd": "2000.000"},
            )
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_deposit_increments_current_amount(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, current_kd="50.000")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            res = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "25.750"},
            )
            self.assertEqual(res.status_code, 200)
            goal = ((res.get_json() or {}).get("data") or {}).get("goal") or {}
            self.assertEqual(goal.get("current_kd"), "75.750")

    def test_deposit_enqueues_goal_milestone_email_when_threshold_crossed(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Milestone Goal", target_kd="100.000", current_kd="20.000")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            with patch("backend.tasks.send_goal_milestone_email.delay") as mock_delay:
                res = self._post(
                    client,
                    f"/api/savings-goals/{goal_id}/deposit",
                    json={"amount_kd": "10.000"},
                )

            self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
            mock_delay.assert_called_once()
            kwargs = mock_delay.call_args.kwargs
            self.assertEqual(kwargs.get("goal_name"), "Milestone Goal")
            self.assertEqual(kwargs.get("milestone_pct"), 25)

    def test_projection_uses_recent_deposit_pace(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(
                client,
                name="Pace Goal",
                target_kd="500.000",
                current_kd="0.000",
                target_date="2026-12-31",
            )
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            deposit = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "90.000"},
            )
            self.assertEqual(deposit.status_code, 200, deposit.get_data(as_text=True))

            projection_res = client.get(f"/api/savings-goals/{goal_id}/projection")
            self.assertEqual(projection_res.status_code, 200, projection_res.get_data(as_text=True))
            projection = ((projection_res.get_json() or {}).get("data") or {}).get("projection") or {}
            self.assertEqual(projection.get("current_pace_monthly"), "30.000")

    def test_deposit_rejects_non_positive_amount(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client)
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            zero = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "0"},
            )
            self.assertEqual(zero.status_code, 400)

            negative = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "-1"},
            )
            self.assertEqual(negative.status_code, 400)

    def test_deposit_rejects_amount_above_remaining_balance(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, target_kd="100.000", current_kd="90.000")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            res = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "15.000"},
            )
            self.assertEqual(res.status_code, 400)
            self.assertEqual((res.get_json() or {}).get("error_code"), "validation_error")

    def test_concurrent_deposits_allow_only_one_success(self):
        with self.app.app_context():
            user = self.User.query.filter_by(email="alice-goals@example.com").first()
            self.assertIsNotNone(user)
            goal = SavingsGoal(
                user_id=user.id,
                name="Concurrent Goal",
                goal_type="custom",
                target_kd="100.000",
                current_kd="90.000",
                target_date=date(2026, 12, 31),
                linked_category_id=None,
                notes="",
            )
            self.db.session.add(goal)
            self.db.session.commit()
            goal_id = goal.id
            user_id = user.id

        barrier = Barrier(2)

        def submit_deposit():
            with self.app.app_context():
                barrier.wait(timeout=5)
                updated = _apply_goal_deposit(
                    goal_id=goal_id,
                    user_id=user_id,
                    amount=Decimal("10.000"),
                )
                if updated is not None:
                    self.db.session.commit()
                    return 200, updated
                self.db.session.rollback()
                return 409, None

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(submit_deposit) for _ in range(2)]
            results = [future.result(timeout=10) for future in futures]

        statuses = sorted(status for status, _payload in results)
        self.assertEqual(statuses, [200, 409], results)

        with self.app.app_context():
            goal = SavingsGoal.query.filter_by(id=goal_id).first()
            self.assertIsNotNone(goal)
            self.assertEqual(format(goal.current_kd, ".3f"), "100.000")

    def test_delete_soft_deactivates(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Archive Me")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            deleted = self._post(client, f"/api/savings-goals/{goal_id}/delete", json={})
            self.assertEqual(deleted.status_code, 200)
            goal = ((deleted.get_json() or {}).get("data") or {}).get("goal") or {}
            self.assertFalse(goal.get("is_active"))

            listed = client.get("/api/savings-goals")
            self.assertEqual(listed.status_code, 200)
            goals = ((listed.get_json() or {}).get("data") or {}).get("goals") or []
            self.assertEqual(goals, [])

            listed_all = client.get("/api/savings-goals?include_inactive=true")
            self.assertEqual(listed_all.status_code, 200)
            all_goals = ((listed_all.get_json() or {}).get("data") or {}).get("goals") or []
            self.assertEqual(len(all_goals), 1)
            self.assertFalse(all_goals[0]["is_active"])

            with self.app.app_context():
                row = SavingsGoal.query.filter_by(id=goal_id).first()
                self.assertIsNotNone(row)
                self.assertFalse(row.is_active)

    def test_mutations_bust_dashboard_and_safe_to_spend_caches(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")

            with patch("backend.routes.goals.cache_bust_dashboard_metrics") as bust_dashboard_create, patch(
                "backend.routes.goals.cache_bust_safe_to_spend"
            ) as bust_safe_create:
                created = self._create_goal(client, name="Cache Goal")
                self.assertEqual(created.status_code, 201)
                bust_dashboard_create.assert_called_once()
                bust_safe_create.assert_called_once()

            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

            with patch("backend.routes.goals.cache_bust_dashboard_metrics") as bust_dashboard_update, patch(
                "backend.routes.goals.cache_bust_safe_to_spend"
            ) as bust_safe_update:
                updated = self._post(
                    client,
                    f"/api/savings-goals/{goal_id}/update",
                    json={"name": "Cache Goal Updated"},
                )
                self.assertEqual(updated.status_code, 200)
                bust_dashboard_update.assert_called_once()
                bust_safe_update.assert_called_once()

            with patch("backend.routes.goals.cache_bust_dashboard_metrics") as bust_dashboard_deposit, patch(
                "backend.routes.goals.cache_bust_safe_to_spend"
            ) as bust_safe_deposit:
                deposited = self._post(
                    client,
                    f"/api/savings-goals/{goal_id}/deposit",
                    json={"amount_kd": "10.000"},
                )
                self.assertEqual(deposited.status_code, 200)
                bust_dashboard_deposit.assert_called_once()
                bust_safe_deposit.assert_called_once()

            with patch("backend.routes.goals.cache_bust_dashboard_metrics") as bust_dashboard_delete, patch(
                "backend.routes.goals.cache_bust_safe_to_spend"
            ) as bust_safe_delete:
                deleted = self._post(client, f"/api/savings-goals/{goal_id}/delete", json={})
                self.assertEqual(deleted.status_code, 200)
                bust_dashboard_delete.assert_called_once()
                bust_safe_delete.assert_called_once()

    def test_tenant_isolation(self):
        with self.app.test_client() as client:
            self._login(client, "alice-goals@example.com", "Password123!")
            created = self._create_goal(client, name="Alice Goal")
            goal_id = ((created.get_json() or {}).get("data") or {}).get("goal", {}).get("id")
            self.assertIsInstance(goal_id, int)

        with self.app.test_client() as client:
            self._login(client, "bob-goals@example.com", "Password456!")
            listed = client.get("/api/savings-goals")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(((listed.get_json() or {}).get("data") or {}).get("goals"), [])

            projection = client.get(f"/api/savings-goals/{goal_id}/projection")
            self.assertEqual(projection.status_code, 404)

            update = self._post(
                client,
                f"/api/savings-goals/{goal_id}/update",
                json={"name": "Nope"},
            )
            self.assertEqual(update.status_code, 404)

            deposit = self._post(
                client,
                f"/api/savings-goals/{goal_id}/deposit",
                json={"amount_kd": "10.000"},
            )
            self.assertEqual(deposit.status_code, 404)

            delete = self._post(client, f"/api/savings-goals/{goal_id}/delete", json={})
            self.assertEqual(delete.status_code, 404)


if __name__ == "__main__":
    unittest.main()
