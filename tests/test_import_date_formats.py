import io
import unittest
from datetime import date

from backend.lib.importer import _parse_date
from preflight_base import PreflightApiTestBase


class ParseDateUnitTests(unittest.TestCase):
    def test_iso(self):
        self.assertEqual(_parse_date("2026-03-10"), date(2026, 3, 10))

    def test_dd_mm_yyyy_slash(self):
        self.assertEqual(_parse_date("10/03/2026"), date(2026, 3, 10))

    def test_dd_mm_yyyy_dash(self):
        self.assertEqual(_parse_date("10-03-2026"), date(2026, 3, 10))

    def test_month_name(self):
        self.assertEqual(_parse_date("10-Mar-2026"), date(2026, 3, 10))
        self.assertEqual(_parse_date("10 Mar 2026"), date(2026, 3, 10))

    def test_excel_serial_dates_are_not_supported(self):
        with self.assertRaises(ValueError):
            _parse_date("45361")

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            _parse_date("")

    def test_invalid_month_raises(self):
        with self.assertRaises(ValueError):
            _parse_date("2026-13-01")

    def test_invalid_day_raises(self):
        with self.assertRaises(ValueError):
            _parse_date("2026-03-32")

    def test_nonsense_raises(self):
        with self.assertRaises(ValueError):
            _parse_date("not-a-date")


class ImportDateIntegrationTests(PreflightApiTestBase):
    def _upload_csv(self, client, csv_data: str):
        return client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(csv_data.encode("utf-8")), "dates.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )

    def test_import_dd_mm_yyyy_succeeds(self):
        self._create_user("import-dates@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-dates@example.com", "Password123!")

        preview = self._upload_csv(
            client,
            "date,name,amount\n10/03/2026,Carrefour,25.500\n",
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        rows = (preview.get_json() or {}).get("preview_rows") or []
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("date"), "2026-03-10")

        commit = self._post(client, "/api/transactions/import-commit", json={"rows": rows})
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        self.assertEqual((commit.get_json() or {}).get("imported"), 1)

        with self.app.app_context():
            txn = self.Transaction.query.filter_by(name="Carrefour").first()
            self.assertIsNotNone(txn)
            self.assertEqual(str(txn.date), "2026-03-10")

    def test_import_invalid_date_skips_row_not_all(self):
        self._create_user("import-dates-invalid@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-dates-invalid@example.com", "Password123!")

        preview = self._upload_csv(
            client,
            "date,name,amount\nnot-a-date,Bad Row,25.500\n2026-03-10,Good Row,10.000\n",
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))
        payload = preview.get_json() or {}
        rows = payload.get("preview_rows") or []
        self.assertEqual(payload.get("skipped"), 1)
        skipped_rows = payload.get("skipped_rows") or []
        self.assertEqual(len(skipped_rows), 1)
        self.assertIn("Cannot parse date", (skipped_rows[0] or {}).get("reason") or "")
        self.assertEqual((skipped_rows[0] or {}).get("row_number"), 1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("name"), "Good Row")

        commit = self._post(client, "/api/transactions/import-commit", json={"rows": rows})
        self.assertEqual(commit.status_code, 200, commit.get_data(as_text=True))
        self.assertEqual((commit.get_json() or {}).get("imported"), 1)
