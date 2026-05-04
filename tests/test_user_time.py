"""Tests for backend/lib/user_time.py — timezone helpers."""

import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from backend.lib.user_time import (
    coerce_timezone,
    local_month_key,
    local_today,
    utc_today,
    DEFAULT_USER_TIMEZONE,
)


class UserTimeTests(unittest.TestCase):
    def _utc(self, year, month, day, hour=0, minute=0) -> datetime:
        return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)

    def test_local_today_kuwait_at_utc_midnight(self):
        """At 00:00 UTC, Kuwait (UTC+3) is already 03:00 — same date."""
        tz = ZoneInfo("Asia/Kuwait")
        now = self._utc(2026, 4, 1, 0, 0)
        result = local_today(tz, now_utc=now)
        self.assertEqual(result.isoformat(), "2026-04-01")

    def test_local_today_kuwait_crosses_day_boundary(self):
        """At 21:30 UTC, Kuwait (UTC+3) is 00:30 the *next* day."""
        tz = ZoneInfo("Asia/Kuwait")
        now = self._utc(2026, 3, 31, 21, 30)
        result = local_today(tz, now_utc=now)
        self.assertEqual(result.isoformat(), "2026-04-01")

    def test_local_month_key_same_month(self):
        tz = ZoneInfo("Asia/Kuwait")
        now = self._utc(2026, 4, 15, 12, 0)
        self.assertEqual(local_month_key(tz, now_utc=now), "2026-04")

    def test_local_month_key_crosses_month_boundary(self):
        """At 21:00 UTC on March 31, Kuwait time is 00:00 April 1 — different month."""
        tz = ZoneInfo("Asia/Kuwait")
        now = self._utc(2026, 3, 31, 21, 0)
        self.assertEqual(local_month_key(tz, now_utc=now), "2026-04")

    def test_utc_today_different_from_local_near_midnight(self):
        """Verify the cache key differs for UTC vs local at a month crossover."""
        tz = ZoneInfo("Asia/Kuwait")
        now = self._utc(2026, 3, 31, 21, 30)
        utc_key = utc_today(now_utc=now).strftime("%Y-%m")
        local_key = local_month_key(tz, now_utc=now)
        self.assertEqual(utc_key, "2026-03")
        self.assertEqual(local_key, "2026-04")
        self.assertNotEqual(utc_key, local_key)

    def test_coerce_timezone_valid(self):
        tz = coerce_timezone("America/New_York")
        self.assertEqual(str(tz), "America/New_York")

    def test_coerce_timezone_none_defaults_to_kuwait(self):
        tz = coerce_timezone(None)
        self.assertEqual(str(tz), DEFAULT_USER_TIMEZONE)

    def test_coerce_timezone_empty_defaults_to_kuwait(self):
        tz = coerce_timezone("")
        self.assertEqual(str(tz), DEFAULT_USER_TIMEZONE)

    def test_coerce_timezone_invalid_defaults_to_kuwait(self):
        tz = coerce_timezone("Not/A/Timezone")
        self.assertEqual(str(tz), DEFAULT_USER_TIMEZONE)


if __name__ == "__main__":
    unittest.main()
