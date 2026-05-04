import unittest
from datetime import date
from decimal import Decimal

from backend.debt_calculator import (
    avalanche_plan,
    minimum_required_payment,
    snowball_plan,
)


class DebtCalculatorTests(unittest.TestCase):
    def _sample_debts(self) -> list[dict]:
        return [
            {
                "id": 1,
                "name": "Card A",
                "balance_kd": "600.000",
                "apr_pct": "24.000",
                "minimum_payment_kd": "60.000",
            },
            {
                "id": 2,
                "name": "Loan B",
                "balance_kd": "900.000",
                "apr_pct": "12.000",
                "minimum_payment_kd": "90.000",
            },
        ]

    def test_minimum_required_payment_sum(self):
        self.assertEqual(minimum_required_payment(self._sample_debts()), Decimal("150.000"))

    def test_single_debt_generates_expected_payoff(self):
        debts = [
            {
                "id": 99,
                "name": "Single Debt",
                "balance_kd": "100.000",
                "apr_pct": "12.000",
                "minimum_payment_kd": "10.000",
            }
        ]
        plan = avalanche_plan(debts, "110.000", start_date=date(2026, 1, 1))
        self.assertEqual(plan["total_months"], 1)
        self.assertEqual(plan["total_interest_paid"], "1.000")
        self.assertEqual(plan["debt_free_date"], "2026-01-01")
        self.assertEqual(plan["payoff_order"][0]["name"], "Single Debt")
        self.assertEqual(plan["payoff_order"][0]["months_to_payoff"], 1)

    def test_snowball_tie_uses_name_when_balance_and_apr_equal(self):
        debts = [
            {"id": 1, "name": "A", "balance_kd": "200.000", "apr_pct": "10.000", "minimum_payment_kd": "20.000"},
            {"id": 2, "name": "B", "balance_kd": "200.000", "apr_pct": "10.000", "minimum_payment_kd": "20.000"},
        ]
        plan = snowball_plan(debts, "100.000", start_date=date(2026, 1, 1))
        first = plan["payoff_order"][0]
        self.assertEqual(first["name"], "A")

    def test_zero_apr_has_zero_interest(self):
        debts = [
            {
                "id": 1,
                "name": "No Interest Debt",
                "balance_kd": "300.000",
                "apr_pct": "0.000",
                "minimum_payment_kd": "30.000",
            }
        ]
        plan = avalanche_plan(debts, "50.000", start_date=date(2026, 1, 1))
        self.assertEqual(plan["total_interest_paid"], "0.000")

    def test_one_month_payoff_with_large_payment(self):
        debts = self._sample_debts()
        plan = snowball_plan(debts, "2000.000", start_date=date(2026, 1, 1))
        self.assertEqual(plan["total_months"], 1)
        self.assertEqual(plan["debt_free_date"], "2026-01-01")

    def test_minimum_only_payment_is_supported(self):
        debts = [
            {"id": 1, "name": "Small A", "balance_kd": "100.000", "apr_pct": "0.000", "minimum_payment_kd": "10.000"},
            {"id": 2, "name": "Small B", "balance_kd": "90.000", "apr_pct": "0.000", "minimum_payment_kd": "9.000"},
        ]
        plan = avalanche_plan(debts, "19.000", start_date=date(2026, 1, 1))
        self.assertGreater(plan["total_months"], 1)

    def test_avalanche_interest_not_more_than_snowball(self):
        debts = self._sample_debts()
        avalanche = avalanche_plan(debts, "250.000", start_date=date(2026, 1, 1))
        snowball = snowball_plan(debts, "250.000", start_date=date(2026, 1, 1))
        self.assertLessEqual(
            Decimal(avalanche["total_interest_paid"]),
            Decimal(snowball["total_interest_paid"]),
        )

    def test_payment_too_low_raises(self):
        debts = self._sample_debts()
        with self.assertRaises(ValueError):
            avalanche_plan(debts, "149.999", start_date=date(2026, 1, 1))


if __name__ == "__main__":
    unittest.main()
