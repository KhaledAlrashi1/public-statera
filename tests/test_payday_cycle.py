import unittest
from datetime import date

from backend.lib.payday import current_pay_period


class PaydayCycleTests(unittest.TestCase):
    def test_example_case_in_month_after_payday(self):
        start, end = current_pay_period(27, date(2026, 3, 5))
        self.assertEqual(start, date(2026, 2, 27))
        self.assertEqual(end, date(2026, 3, 26))

    def test_example_case_in_month_before_payday(self):
        start, end = current_pay_period(27, date(2026, 2, 20))
        self.assertEqual(start, date(2026, 1, 27))
        self.assertEqual(end, date(2026, 2, 26))

    def test_none_payday_falls_back_to_calendar_month(self):
        start, end = current_pay_period(None, date(2026, 3, 5))
        self.assertEqual(start, date(2026, 3, 1))
        self.assertEqual(end, date(2026, 3, 31))

    def test_ref_on_payday_starts_new_cycle(self):
        start, end = current_pay_period(15, date(2026, 5, 15))
        self.assertEqual(start, date(2026, 5, 15))
        self.assertEqual(end, date(2026, 6, 14))

    def test_day_31_clamps_for_non_31_month_before_payday(self):
        start, end = current_pay_period(31, date(2026, 2, 20))
        self.assertEqual(start, date(2026, 1, 31))
        self.assertEqual(end, date(2026, 2, 27))

    def test_day_31_clamps_for_non_31_month_after_payday(self):
        start, end = current_pay_period(31, date(2026, 3, 31))
        self.assertEqual(start, date(2026, 3, 31))
        self.assertEqual(end, date(2026, 4, 29))

    def test_day_30_with_february_non_leap(self):
        start, end = current_pay_period(30, date(2026, 2, 15))
        self.assertEqual(start, date(2026, 1, 30))
        self.assertEqual(end, date(2026, 2, 27))

    def test_day_29_with_leap_year(self):
        start, end = current_pay_period(29, date(2024, 3, 2))
        self.assertEqual(start, date(2024, 2, 29))
        self.assertEqual(end, date(2024, 3, 28))

    def test_day_29_non_leap_clamps_to_28(self):
        start, end = current_pay_period(29, date(2025, 2, 28))
        self.assertEqual(start, date(2025, 2, 28))
        self.assertEqual(end, date(2025, 3, 28))

    def test_january_boundary(self):
        start, end = current_pay_period(27, date(2026, 1, 10))
        self.assertEqual(start, date(2025, 12, 27))
        self.assertEqual(end, date(2026, 1, 26))

    def test_december_boundary(self):
        start, end = current_pay_period(27, date(2026, 12, 31))
        self.assertEqual(start, date(2026, 12, 27))
        self.assertEqual(end, date(2027, 1, 26))

    def test_day_one_spans_whole_calendar_month(self):
        start, end = current_pay_period(1, date(2026, 7, 10))
        self.assertEqual(start, date(2026, 7, 1))
        self.assertEqual(end, date(2026, 7, 31))

    def test_invalid_payday_day_low_raises(self):
        with self.assertRaises(ValueError):
            current_pay_period(0, date(2026, 7, 10))

    def test_invalid_payday_day_high_raises(self):
        with self.assertRaises(ValueError):
            current_pay_period(32, date(2026, 7, 10))

    def test_returns_ordered_bounds(self):
        start, end = current_pay_period(20, date(2026, 8, 1))
        self.assertLessEqual(start, end)


if __name__ == "__main__":
    unittest.main()
