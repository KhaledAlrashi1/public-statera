import csv
import io
import unittest
from datetime import date
from decimal import Decimal

from backend.constants import EXPORT_CSV_MAX_ROWS
from preflight_base import PreflightApiTestBase


class ExportLimitTests(PreflightApiTestBase):
    def _seed_transactions(self, *, user_id: int, count: int) -> None:
        with self.app.app_context():
            category = self.Category.query.filter_by(user_id=user_id, name="Export Test").first()
            if category is None:
                category = self.Category(user_id=user_id, name="Export Test", is_income=False)
                self.db.session.add(category)
                self.db.session.flush()

            batch_size = 1000
            for start in range(0, count, batch_size):
                txns = []
                for idx in range(start, min(start + batch_size, count)):
                    txns.append(
                        self.Transaction(
                            user_id=user_id,
                            date=date(2026, 2, 1),
                            category_id=category.id,
                            name=f"Export Txn {idx}",
                            name_key=f"export-txn-{idx}",
                            amount_kd=Decimal("1.000"),
                        )
                    )
                self.db.session.add_all(txns)
                self.db.session.flush()
            self.db.session.commit()

    def _csv_row_count(self, response) -> int:
        content = response.get_data(as_text=True)
        if content.startswith("\ufeff"):
            content = content[1:]
        rows = list(csv.reader(io.StringIO(content)))
        return len(rows)

    def test_export_csv_is_capped_and_reports_truncation_headers(self):
        user_id = self._create_user("export-cap@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "export-cap@example.com", "Password123!")
        self._seed_transactions(user_id=user_id, count=15_000)

        res = client.get("/api/transactions/export-csv")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        row_count = self._csv_row_count(res)
        self.assertLessEqual(row_count, EXPORT_CSV_MAX_ROWS + 1)
        self.assertEqual(res.headers.get("X-Export-Truncated"), "true")
        self.assertEqual(res.headers.get("X-Export-Row-Limit"), str(EXPORT_CSV_MAX_ROWS))
        self.assertEqual(res.headers.get("X-Export-Error-Code"), "export_limit_exceeded")

    def test_export_csv_under_limit_is_not_marked_truncated(self):
        user_id = self._create_user("export-noncap@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "export-noncap@example.com", "Password123!")
        self._seed_transactions(user_id=user_id, count=25)

        res = client.get("/api/transactions/export-csv")
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))

        row_count = self._csv_row_count(res)
        self.assertEqual(row_count, 26)  # header + 25 transactions
        self.assertEqual(res.headers.get("X-Export-Truncated"), "false")
        self.assertEqual(res.headers.get("X-Export-Row-Limit"), str(EXPORT_CSV_MAX_ROWS))
        self.assertIsNone(res.headers.get("X-Export-Error-Code"))


if __name__ == "__main__":
    unittest.main()
