import os
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.lib.messages import messages_db_snapshot


class MessagesSnapshotHelperTests(unittest.TestCase):
    def test_messages_db_snapshot_creates_self_contained_backup_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            source_db = Path(tmp) / "chat.db"
            conn = sqlite3.connect(source_db)
            try:
                cur = conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute(
                    """
                    CREATE TABLE message (
                        ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
                        date INTEGER NOT NULL
                    )
                    """
                )
                cur.execute("INSERT INTO message (date) VALUES (?)", (795000123,))
                conn.commit()

                with messages_db_snapshot(str(source_db)) as snap:
                    snap_path = Path(snap)
                    snap_dir = snap_path.parent
                    self.assertTrue(snap_path.exists())
                    self.assertFalse((snap_dir / "chat.db-wal").exists())
                    self.assertFalse((snap_dir / "chat.db-shm").exists())

                    snap_conn = sqlite3.connect(snap_path)
                    try:
                        count, max_date = snap_conn.execute("SELECT COUNT(*), MAX(date) FROM message").fetchone()
                    finally:
                        snap_conn.close()

                    self.assertEqual(count, 1)
                    self.assertEqual(max_date, 795000123)

                self.assertFalse(snap_dir.exists())
            finally:
                conn.close()

    def test_messages_db_snapshot_falls_back_to_immutable_for_read_only_standalone_wal_snapshot(self):
        with tempfile.TemporaryDirectory() as source_tmp, tempfile.TemporaryDirectory() as readonly_tmp:
            source_db = Path(source_tmp) / "chat.db"
            conn = sqlite3.connect(source_db)
            try:
                cur = conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute(
                    """
                    CREATE TABLE message (
                        ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
                        date INTEGER NOT NULL
                    )
                    """
                )
                cur.execute("INSERT INTO message (date) VALUES (?)", (795000456,))
                conn.commit()
            finally:
                conn.close()

            readonly_db = Path(readonly_tmp) / "chat.db"
            shutil.copy2(source_db, readonly_db)

            os.chmod(readonly_tmp, 0o555)
            try:
                direct_conn = sqlite3.connect(f"file:{readonly_db}?mode=ro", uri=True)
                try:
                    with self.assertRaises(sqlite3.OperationalError):
                        direct_conn.execute("SELECT COUNT(*) FROM message").fetchone()
                finally:
                    direct_conn.close()

                with messages_db_snapshot(str(readonly_db)) as snap:
                    snap_conn = sqlite3.connect(snap)
                    try:
                        count, max_date = snap_conn.execute("SELECT COUNT(*), MAX(date) FROM message").fetchone()
                    finally:
                        snap_conn.close()
            finally:
                os.chmod(readonly_tmp, 0o755)

            self.assertEqual(count, 1)
            self.assertEqual(max_date, 795000456)


if __name__ == "__main__":
    unittest.main()
