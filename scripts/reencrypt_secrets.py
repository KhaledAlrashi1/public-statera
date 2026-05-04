"""One-shot script: encrypt all legacy plaintext TOTP secrets in the users table.

Run AFTER applying the ee51f6a7b8c9 migration and BEFORE removing
ENCRYPTION_KEY_PREVIOUS (if rotating keys).

Usage::

    ENCRYPTION_KEY=<hex32> DATABASE_URL=postgresql://... python scripts/reencrypt_secrets.py

The script is idempotent — rows that are already encrypted (start with ``enc1:``)
are skipped.  Dry-run mode prints what would change without writing.

    python scripts/reencrypt_secrets.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

# Ensure project root is on sys.path when run directly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-encrypt plaintext TOTP secrets.")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing.")
    args = parser.parse_args()

    from backend import create_app, db
    from backend.lib.crypto import encrypt, _ENC_PREFIX

    app = create_app()
    with app.app_context():
        from sqlalchemy import text

        rows = db.session.execute(
            text("SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL")
        ).fetchall()

        updated = 0
        skipped = 0
        for row in rows:
            user_id, secret = row
            if not secret:
                skipped += 1
                continue
            if str(secret).startswith(_ENC_PREFIX):
                skipped += 1
                continue
            encrypted = encrypt(str(secret))
            if args.dry_run:
                print(f"[DRY RUN] Would encrypt totp_secret for user_id={user_id}")
            else:
                db.session.execute(
                    text("UPDATE users SET totp_secret = :enc WHERE id = :uid"),
                    {"enc": encrypted, "uid": user_id},
                )
                updated += 1

        if not args.dry_run:
            db.session.commit()

        print(
            f"Done. updated={updated} skipped={skipped} dry_run={args.dry_run}"
        )


if __name__ == "__main__":
    main()
