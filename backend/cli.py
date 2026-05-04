"""Flask CLI commands for PostgreSQL-first setup and maintenance."""

from __future__ import annotations

import click

try:
    from flask_migrate import upgrade as migrate_upgrade
except Exception:  # pragma: no cover - optional operator tooling should not block CLI registration in lean installs.
    migrate_upgrade = None

from backend import db
from backend.cli_maintenance import register_maintenance_commands
from backend.lib.suggestions import learn_transaction
from backend.lib.demo_data import DemoDataConflictError, load_demo_workspace
from backend.models import Transaction, User


_DEPRECATED_SQLITE_COMMANDS = {
    "add-search-indexes": "Indexes are managed by Alembic migrations. Run 'flask db upgrade'.",
    "migrate-ingested-guids": "Schema changes are migration-managed. Run 'flask db upgrade'.",
    "add-merchant-column": "Schema changes are migration-managed. Run 'flask db upgrade'.",
    "add-memorized-merchant-column": "Schema changes are migration-managed. Run 'flask db upgrade'.",
    "rename-description-memory-table": "Legacy SQLite table migrations are no longer supported.",
    "migrate-description-to-memorized": "Legacy SQLite table migrations are no longer supported.",
    "add-items-table": "Schema changes are migration-managed. Run 'flask db upgrade'.",
    "migrate-to-items": "Data backfills should run through PostgreSQL-safe scripts only.",
    "globalize-taxonomy": "Use a dedicated PostgreSQL migration script for taxonomy reshaping.",
    "items-stats": "Use PostgreSQL queries or API analytics endpoints for stats.",
    "add-is-income-column": "Schema changes are migration-managed. Run 'flask db upgrade'.",
    "migrate-sqlite-to-postgres": "Removed to enforce PostgreSQL-only operational flows.",
    "backup-db": "Use PostgreSQL-native backups (pg_dump/pg_basebackup).",
}


def _register_deprecated_sqlite_commands(app):
    """Keep legacy command names, but fail fast with PostgreSQL guidance."""

    for command_name, guidance in _DEPRECATED_SQLITE_COMMANDS.items():

        @app.cli.command(command_name)
        def _removed_sqlite_command(_command_name=command_name, _guidance=guidance):
            raise click.ClickException(
                f"'{_command_name}' was removed as part of the PostgreSQL migration. {_guidance}"
            )


def register(app):
    """Register all CLI commands with the Flask app."""

    @app.cli.command("init-db")
    def init_db_cmd():
        if migrate_upgrade is None:
            raise click.ClickException(
                "Flask-Migrate is not installed. Install dependencies with: pip install -r requirements.txt"
            )
        migrate_upgrade()
        print("Database migrated to latest version.")

    @app.cli.command("add-auth")
    @click.option("--email", prompt=True, help="Owner e-mail address")
    @click.option(
        "--password",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
        help="Owner password",
    )
    @click.option("--display-name", default="Owner", show_default=True, help="Display name for the owner account")
    @click.option("--dry-run", is_flag=True, help="Show what would happen without making changes")
    def add_auth(email, password, display_name, dry_run):
        """Create an owner user account in PostgreSQL."""
        from backend import bcrypt

        normalized_email = (email or "").strip().lower()
        if not normalized_email:
            raise click.ClickException("email is required")

        existing = User.query.filter_by(email=normalized_email).first()
        if existing is not None:
            print(f"User already exists: {normalized_email} (id={existing.id})")
            return

        if dry_run:
            print("DRY RUN - no changes made.")
            print(f"Would create user: {normalized_email} ({display_name})")
            return

        try:
            user = User(
                email=normalized_email,
                password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
                display_name=(display_name or "").strip() or None,
            )
            db.session.add(user)
            db.session.commit()
        except Exception as exc:  # noqa: BLE001 - CLI maintenance commands should log per-step failures and keep processing remaining work.
            db.session.rollback()
            raise click.ClickException(f"Failed to create user: {exc}")

        print(f"Created user: {normalized_email} (id={user.id})")

    @app.cli.command("seed")
    @click.option("--email", prompt=True, help="Owner e-mail to seed data under")
    def seed_cmd(email):
        normalized_email = (email or "").strip().lower()
        user = User.query.filter_by(email=normalized_email).first()
        if not user:
            print(f"User '{normalized_email}' not found. Run 'flask add-auth' first.")
            return

        try:
            summary = load_demo_workspace(user.id)
            db.session.commit()
        except DemoDataConflictError as exc:
            db.session.rollback()
            raise click.ClickException(str(exc))
        except Exception as exc:  # noqa: BLE001 - CLI maintenance commands should log per-step failures and keep processing remaining work.
            db.session.rollback()
            raise click.ClickException(f"Failed to load demo data: {exc}")

        print(
            "Demo data inserted: "
            f"{summary['transactions_created']} transactions, "
            f"{summary['budgets_created']} budgets, "
            f"{summary['debt_accounts_created']} debt account, "
            f"{summary['savings_goals_created']} goal."
        )

    @app.cli.command("seed-memorized-transactions")
    @click.option("--email", prompt=True, help="Owner e-mail to backfill for")
    def seed_memorized_transactions(email):
        """Backfill memorized transactions from existing transaction history."""
        normalized_email = (email or "").strip().lower()
        user = User.query.filter_by(email=normalized_email).first()
        if not user:
            print(f"User '{normalized_email}' not found. Run 'flask add-auth' first.")
            return

        learned = 0
        for txn in Transaction.query.filter_by(user_id=user.id).yield_per(1000):
            learn_transaction(txn.name, user.id, category_id=txn.category_id, merchant_id=txn.merchant_id)
            learned += 1
            if learned % 1000 == 0:
                db.session.flush()
        db.session.commit()
        print(f"Learned from {learned} transactions.")

    register_maintenance_commands(app)
    _register_deprecated_sqlite_commands(app)
