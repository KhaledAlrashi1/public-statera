import unittest

from preflight_base import PreflightApiTestBase


class ProfileSecurityPreflightTests(PreflightApiTestBase):
    def test_profile_update_display_name(self):
        self._create_user("profile1@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profile1@example.com", "Password123!")
        res = self._post(client, "/api/auth/profile/update", json={"display_name": "Khaled"})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload["user"]["display_name"], "Khaled")
        self.assertIn("profile", payload)

    def test_profile_get_returns_profile_defaults(self):
        self._create_user("profiledefaults@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profiledefaults@example.com", "Password123!")
        res = client.get("/api/auth/profile")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload["profile"]["monthly_income_kd"], None)
        self.assertEqual(payload["profile"]["payday_day"], None)
        self.assertEqual(payload["profile"]["country"], None)
        self.assertTrue(payload["profile"]["email_notifications_enabled"])
        self.assertEqual(payload["profile"]["has_debt_choice"], None)
        self.assertFalse(payload["profile"]["setup_guide_seen"])
        self.assertFalse(payload["profile"]["setup_guide_dismissed"])
        self.assertEqual(payload["profile"]["timezone"], "Asia/Kuwait")

    def test_profile_update_financial_fields(self):
        self._create_user("profilefinancial@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profilefinancial@example.com", "Password123!")
        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"monthly_income_kd": "1500.500", "payday_day": 25, "country": "Kuwait"},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload["profile"]["monthly_income_kd"], "1500.500")
        self.assertEqual(payload["profile"]["payday_day"], 25)
        self.assertEqual(payload["profile"]["country"], "Kuwait")

    def test_profile_update_email_notifications_preference(self):
        self._create_user("profilenotify@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profilenotify@example.com", "Password123!")

        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"email_notifications_enabled": False},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertFalse(payload["profile"]["email_notifications_enabled"])

    def test_profile_update_timezone(self):
        self._create_user("profiletimezone@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profiletimezone@example.com", "Password123!")

        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"timezone": "America/New_York"},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload["profile"]["timezone"], "America/New_York")

    def test_profile_update_rejects_invalid_timezone(self):
        self._create_user("profilebadtimezone@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profilebadtimezone@example.com", "Password123!")

        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"timezone": "Mars/Olympus_Mons"},
        )
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertEqual(payload["error_code"], "validation_error")
        self.assertIn("Timezone must be a valid IANA timezone", payload["errors"][0])

    def test_profile_update_debt_onboarding_preference(self):
        self._create_user("profiledebtchoice@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profiledebtchoice@example.com", "Password123!")

        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"has_debt_choice": False},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertFalse(payload["profile"]["has_debt_choice"])

    def test_profile_update_setup_guide_preferences(self):
        self._create_user("profilesetupguide@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profilesetupguide@example.com", "Password123!")

        res = self._post(
            client,
            "/api/auth/profile/update",
            json={"setup_guide_seen": True, "setup_guide_dismissed": True},
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload["profile"]["setup_guide_seen"])
        self.assertTrue(payload["profile"]["setup_guide_dismissed"])

    def test_profile_security_events_requires_auth(self):
        client = self.app.test_client()
        res = client.get("/api/auth/profile/security-events")
        self.assertEqual(res.status_code, 401)

    def test_profile_security_events_are_user_scoped(self):
        user1_id = self._create_user("events1@example.com", "Password123!")
        user2_id = self._create_user("events2@example.com", "Password123!")
        with self.app.app_context():
            self.db.session.add(
                self.SecurityEvent(
                    user_id=user1_id,
                    event_type="profile.password.changed",
                    details_json='{"source":"test"}',
                )
            )
            self.db.session.add(
                self.SecurityEvent(
                    user_id=user2_id,
                    event_type="profile.email_change.link_requested",
                    details_json='{"source":"test"}',
                )
            )
            self.db.session.commit()

        client = self.app.test_client()
        self._login(client, "events1@example.com", "Password123!")
        res = client.get("/api/auth/profile/security-events?limit=20")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertTrue(payload.get("ok"))
        items = payload.get("items", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["event_type"], "profile.password.changed")

    def test_profile_security_events_pagination(self):
        user_id = self._create_user("events3@example.com", "Password123!")
        with self.app.app_context():
            for i in range(3):
                self.db.session.add(
                    self.SecurityEvent(
                        user_id=user_id,
                        event_type=f"profile.test_event_{i}",
                        details_json='{"source":"test"}',
                    )
                )
            self.db.session.commit()

        client = self.app.test_client()
        self._login(client, "events3@example.com", "Password123!")

        page1 = client.get("/api/auth/profile/security-events?limit=2&offset=0")
        self.assertEqual(page1.status_code, 200, page1.get_data(as_text=True))
        payload1 = page1.get_json()
        self.assertTrue(payload1.get("has_more"))
        self.assertEqual(len(payload1.get("items", [])), 2)

        page2 = client.get("/api/auth/profile/security-events?limit=2&offset=2")
        self.assertEqual(page2.status_code, 200, page2.get_data(as_text=True))
        payload2 = page2.get_json()
        self.assertFalse(payload2.get("has_more"))
        self.assertEqual(len(payload2.get("items", [])), 1)

    def test_profile_update_ignores_direct_email_change(self):
        self._create_user("profile2@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profile2@example.com", "Password123!")
        res = self._post(client, "/api/auth/profile/update", json={"email": "newprofile2@example.com"})
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = res.get_json()
        self.assertEqual(payload["user"]["email"], "profile2@example.com")

    def test_profile_change_password_requires_current(self):
        self._create_user("profile3@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profile3@example.com", "Password123!")
        res = self._post(
            client,
            "/api/auth/profile/change-password",
            json={
                "current_password": "wrong",
                "new_password": "NewPassword123!",
                "confirm_password": "NewPassword123!",
            },
        )
        self.assertEqual(res.status_code, 400, res.get_data(as_text=True))

    def test_profile_change_password_success(self):
        self._create_user("profile4@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "profile4@example.com", "Password123!")
        res = self._post(
            client,
            "/api/auth/profile/change-password",
            json={
                "current_password": "Password123!",
                "new_password": "NewPassword123!",
                "confirm_password": "NewPassword123!",
            },
        )
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

    def test_profile_security_events_written(self):
        user_id = self._create_user("auditflow@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "auditflow@example.com", "Password123!")

        update = self._post(client, "/api/auth/profile/update", json={"display_name": "Audit Name"})
        self.assertEqual(update.status_code, 200, update.get_data(as_text=True))
        pw = self._post(
            client,
            "/api/auth/profile/change-password",
            json={
                "current_password": "Password123!",
                "new_password": "Password456!",
                "confirm_password": "Password456!",
            },
        )
        self.assertEqual(pw.status_code, 200, pw.get_data(as_text=True))

        with self.app.app_context():
            event_types = {
                row.event_type
                for row in self.SecurityEvent.query.filter_by(user_id=user_id).all()
            }
            self.assertIn("profile.display_name.updated", event_types)
            self.assertIn("profile.password.changed", event_types)


if __name__ == "__main__":
    unittest.main()
