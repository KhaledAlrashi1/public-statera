import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

from backend.money_math import format_kd, is_quantized_kd, quantize_kd, to_display_float
from preflight_base import PreflightApiTestBase


class MoneyMathStaticContractTests(unittest.TestCase):
    def test_backend_money_serialization_uses_canonical_helpers(self):
        repo_root = Path(__file__).resolve().parents[1]
        violations: list[str] = []

        for path in (repo_root / "backend").rglob("*.py"):
            relative = path.relative_to(repo_root).as_posix()
            if relative == "backend/money_math.py":
                continue

            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                if ".3f" not in line:
                    continue
                violations.append(f"{relative}:{lineno}:{stripped}")

        self.assertEqual(
            violations,
            [],
            "Use format_kd()/quantize_kd() for money serialization instead of raw .3f formatting.",
        )

    def test_to_display_float_callsites_remain_limited(self):
        repo_root = Path(__file__).resolve().parents[1]
        allowed = {
            "backend/money_math.py",
            "backend/routes/analytics.py",
            "backend/routes/analytics/shared.py",
            "backend/routes/budgets.py",
        }
        callsites: list[str] = []

        for path in (repo_root / "backend").rglob("*.py"):
            relative = path.relative_to(repo_root).as_posix()
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if "to_display_float(" not in line:
                    continue
                callsites.append(f"{relative}:{lineno}")

        unexpected = [entry for entry in callsites if entry.split(":", 1)[0] not in allowed]
        self.assertEqual(
            unexpected,
            [],
            "to_display_float() should stay limited to intentional JSON-boundary call sites.",
        )


class MoneyMathContractTests(PreflightApiTestBase):
    def _create_split_transaction(
        self,
        client,
        *,
        date: str,
        summary_category: str,
        summary_name: str,
        summary_amount_kd: str,
        items_json: list[dict],
    ) -> None:
        create_res = self._post(
            client,
            "/api/transactions/create",
            json={
                "date": date,
                "category": summary_category,
                "name": summary_name,
                "amount_kd": summary_amount_kd,
            },
        )
        self.assertEqual(create_res.status_code, 201, create_res.get_data(as_text=True))
        txn_id = (((create_res.get_json() or {}).get("item") or {}).get("id"))
        self.assertTrue(txn_id)

        if len(items_json) > 1:
            split_res = self._post(
                client,
                f"/api/transactions/{txn_id}/split",
                json={"rows": items_json},
            )
            self.assertEqual(split_res.status_code, 200, split_res.get_data(as_text=True))

    def test_money_math_helpers_quantize_and_format(self):
        self.assertEqual(quantize_kd("1.2344"), Decimal("1.234"))
        self.assertEqual(quantize_kd("1.2345"), Decimal("1.235"))
        self.assertEqual(format_kd("2"), "2.000")
        self.assertTrue(is_quantized_kd("3.333"))
        self.assertFalse(is_quantized_kd("3.3334"))

    def test_to_display_float_quantizes_before_float_conversion(self):
        self.assertEqual(to_display_float("1.2344"), 1.234)
        self.assertEqual(to_display_float("1.2345"), 1.235)

    def test_dashboard_metrics_uses_transaction_level_income_vs_expense(self):
        self._create_user("math-contract-dash@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "math-contract-dash@example.com", "Password123!")

        self._create_split_transaction(
            client,
            date="2026-02-10",
            summary_category="Food",
            summary_name="Split Txn",
            summary_amount_kd="12.500",
            items_json=[
                {"name": "Lunch", "category": "Food", "amount_kd": "2.500"},
                {"name": "Salary Part", "category": "Income: Salary", "amount_kd": "10.000"},
            ],
        )

        res = client.get("/api/dashboard-metrics?months=1&until=2026-02")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        payload = (res.get_json() or {}).get("data") or {}

        monthly = payload.get("monthly") or []
        self.assertEqual(len(monthly), 1)
        row = monthly[0]
        self.assertEqual(row.get("month"), "2026-02")
        self.assertEqual(Decimal(str(row.get("income_kd"))), Decimal("10.000"))
        self.assertEqual(Decimal(str(row.get("expense_kd"))), Decimal("2.500"))

        by_cat = (payload.get("expense_by_category") or {}).get("2026-02") or {}
        self.assertEqual(Decimal(str(by_cat.get("Food"))), Decimal("2.500"))
        self.assertNotIn("Income: Salary", by_cat)

    def test_expense_breakdown_and_dashboard_outputs_are_quantized_3dp(self):
        self._create_user("math-contract-rounding@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "math-contract-rounding@example.com", "Password123!")

        self._create_split_transaction(
            client,
            date="2026-02-12",
            summary_category="Groceries",
            summary_name="Txn 1",
            summary_amount_kd="1.111",
            items_json=[
                {"name": "A", "category": "Groceries", "amount_kd": "1.111"},
            ],
        )
        self._create_split_transaction(
            client,
            date="2026-02-13",
            summary_category="Groceries",
            summary_name="Txn 2",
            summary_amount_kd="2.222",
            items_json=[
                {"name": "B", "category": "Groceries", "amount_kd": "2.222"},
            ],
        )

        dash = client.get("/api/dashboard-metrics?months=1&until=2026-02")
        self.assertEqual(dash.status_code, 200, dash.get_data(as_text=True))
        dash_data = (dash.get_json() or {}).get("data") or {}
        row = (dash_data.get("monthly") or [])[0]
        self.assertTrue(is_quantized_kd(Decimal(str(row.get("expense_kd")))))
        self.assertTrue(is_quantized_kd(Decimal(str(row.get("income_kd")))))

        breakdown = client.get("/api/expense-breakdown?dimension=category&range=month&month=2026-02")
        self.assertEqual(breakdown.status_code, 200, breakdown.get_data(as_text=True))
        b_data = (breakdown.get_json() or {}).get("data") or {}
        self.assertTrue(is_quantized_kd(Decimal(str(b_data.get("total_kd")))))
        for item in b_data.get("items") or []:
            self.assertTrue(is_quantized_kd(Decimal(str(item.get("amount_kd")))))

    def test_sum_precision_1000_small_transactions(self):
        user_id = self._create_user("math-contract-micro@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "math-contract-micro@example.com", "Password123!")

        with self.app.app_context():
            from backend.models import Category, Transaction

            category = Category(user_id=user_id, name="Food", is_income=False)
            self.db.session.add(category)
            self.db.session.flush()

            for index in range(1000):
                self.db.session.add(
                    Transaction(
                        user_id=user_id,
                        date=date.fromisoformat("2026-03-01"),
                        category_id=category.id,
                        name=f"Micro Txn {index}",
                        name_key=f"micro-txn-{index}",
                        amount_kd=Decimal("0.001"),
                    )
                )
            self.db.session.commit()

        res = client.get("/api/spend-by-month")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        items = (((res.get_json() or {}).get("data")) or {}).get("items") or []
        march = next((row for row in items if row.get("month") == "2026-03"), None)
        self.assertIsNotNone(march)
        self.assertEqual(Decimal(str(march.get("total_kd"))), Decimal("1.000"))


if __name__ == "__main__":
    unittest.main()
