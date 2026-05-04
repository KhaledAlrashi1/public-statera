import io
import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from backend.lib.importer import compute_file_hash, compute_import_row_hash
from preflight_base import PreflightApiTestBase


class ImportHashingUnitTests(unittest.TestCase):
    def test_compute_import_row_hash_is_deterministic(self):
        first = compute_import_row_hash(
            user_id=1,
            date_str="2026-03-12",
            name_key="coffee",
            amount_kd="1.250",
            file_hash="abc123",
            row_index=0,
        )
        second = compute_import_row_hash(
            user_id=1,
            date_str="2026-03-12",
            name_key="coffee",
            amount_kd="1.250",
            file_hash="abc123",
            row_index=0,
        )

        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)

    def test_compute_import_row_hash_differs_by_row_index(self):
        first = compute_import_row_hash(1, "2026-03-12", "coffee", "1.250", "abc123", 0)
        second = compute_import_row_hash(1, "2026-03-12", "coffee", "1.250", "abc123", 1)

        self.assertNotEqual(first, second)

    def test_compute_import_row_hash_differs_by_file_hash(self):
        first = compute_import_row_hash(1, "2026-03-12", "coffee", "1.250", "abc123", 0)
        second = compute_import_row_hash(1, "2026-03-12", "coffee", "1.250", "def456", 0)

        self.assertNotEqual(first, second)

    def test_compute_file_hash_is_deterministic(self):
        first = compute_file_hash(b"hello")
        second = compute_file_hash(b"hello")

        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)


class ImportHashingApiTests(PreflightApiTestBase):
    def test_preview_response_includes_file_hash(self):
        self._create_user("import-file-hash@example.com", "Password123!")
        client = self.app.test_client()
        self._login(client, "import-file-hash@example.com", "Password123!")

        preview = client.post(
            "/api/transactions/upload-preview",
            data={"file": (io.BytesIO(b"Date,Category,Name,Amount (KWD)\n2026-03-12,Food,Coffee,1.250\n"), "hash.csv")},
            content_type="multipart/form-data",
            headers=self._csrf_headers(client),
        )
        self.assertEqual(preview.status_code, 200, preview.get_data(as_text=True))

        payload = preview.get_json() or {}
        self.assertRegex(str(payload.get("file_hash") or ""), r"^[0-9a-f]{64}$")
        rows = payload.get("preview_rows") or []
        self.assertEqual((rows[0] or {}).get("row_index"), 0)


class ImportHashingModelTests(PreflightApiTestBase):
    def _seed_user_and_category(self):
        user_id = self._create_user("import-hash-model@example.com", "Password123!")
        with self.app.app_context():
            category = self.Category(user_id=user_id, name="Food", is_income=False)
            self.db.session.add(category)
            self.db.session.commit()
            return user_id, category.id

    def test_transaction_import_row_hash_unique_constraint_enforced(self):
        user_id, category_id = self._seed_user_and_category()

        with self.app.app_context():
            first = self.Transaction(
                user_id=user_id,
                date=date(2026, 3, 12),
                category_id=category_id,
                name="Coffee A",
                memo=None,
                name_key="coffee a",
                amount_kd=Decimal("1.250"),
                source="csv_import",
                import_row_hash="abc123" * 10 + "abcd",
            )
            second = self.Transaction(
                user_id=user_id,
                date=date(2026, 3, 12),
                category_id=category_id,
                name="Coffee B",
                memo=None,
                name_key="coffee b",
                amount_kd=Decimal("1.250"),
                source="csv_import",
                import_row_hash="abc123" * 10 + "abcd",
            )
            self.db.session.add(first)
            self.db.session.commit()
            self.db.session.add(second)

            with self.assertRaises(IntegrityError):
                self.db.session.commit()
            self.db.session.rollback()

    def test_transaction_import_row_hash_null_not_constrained(self):
        user_id, category_id = self._seed_user_and_category()

        with self.app.app_context():
            self.db.session.add_all([
                self.Transaction(
                    user_id=user_id,
                    date=date(2026, 3, 12),
                    category_id=category_id,
                    name="Coffee A",
                    memo=None,
                    name_key="coffee a",
                    amount_kd=Decimal("1.250"),
                    source="manual",
                    import_row_hash=None,
                ),
                self.Transaction(
                    user_id=user_id,
                    date=date(2026, 3, 13),
                    category_id=category_id,
                    name="Coffee B",
                    memo=None,
                    name_key="coffee b",
                    amount_kd=Decimal("1.250"),
                    source="manual",
                    import_row_hash=None,
                ),
            ])
            self.db.session.commit()

            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id).count(), 2)

    def test_two_manual_transactions_same_triplet_both_saved(self):
        user_id, category_id = self._seed_user_and_category()

        with self.app.app_context():
            self.db.session.add_all([
                self.Transaction(
                    user_id=user_id,
                    date=date(2026, 3, 12),
                    category_id=category_id,
                    name="Coffee",
                    memo=None,
                    name_key="coffee",
                    amount_kd=Decimal("1.250"),
                    source="manual",
                    import_row_hash=None,
                ),
                self.Transaction(
                    user_id=user_id,
                    date=date(2026, 3, 12),
                    category_id=category_id,
                    name="Coffee",
                    memo=None,
                    name_key="coffee",
                    amount_kd=Decimal("1.250"),
                    source="manual",
                    import_row_hash=None,
                ),
            ])
            self.db.session.commit()

            self.assertEqual(self.Transaction.query.filter_by(user_id=user_id, name="Coffee").count(), 2)


if __name__ == "__main__":
    unittest.main()
