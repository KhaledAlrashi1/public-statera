"""Maintenance-oriented Flask CLI commands."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from backend.activation_reporting import (
    activation_report_json,
    build_activation_report,
    write_activation_report_artifact,
)
from backend import db
from backend.grouped_transactions_migration import flatten_grouped_transactions
from backend.maintenance import run_maintenance_pass
from backend.models import AccountActionToken, MemorizedTransaction, ProductEvent, SecurityEvent
from backend.routes.auth import cleanup_account_action_tokens
from backend.security_ops import cleanup_security_data, cleanup_product_events


def _activation_report_text(report: dict) -> str:
    window = report["window"]
    summary = report["summary"]
    paths = report["activation_paths"]
    activation_rate = summary["activation_rate_from_signup_pct"]
    budget_rate = summary["budget_rate_from_signup_pct"]
    median_hours = summary["median_hours_signup_to_activation"]
    return "\n".join([
        f"Activation funnel ({window['days']} days, UTC)",
        f"Window start: {window['start']}",
        f"As of: {window['as_of']}",
        f"Users created: {summary['users_created']}",
        f"Signup completed: {summary['signup_completed']}",
        f"App opened: {summary['app_opened']}",
        f"Activated (demo/import/bank): {summary['activated_any']}",
        f"First budget set: {summary['first_budget_set']}",
        (
            "Activation paths: "
            f"demo={paths['demo_data_loaded']}, "
            f"import={paths['import_completed']}, "
            f"demo->import={paths.get('demo_replaced_with_import', 0)}, "
            f"bank={paths['bank_connected']}"
        ),
        f"Demo to import users: {summary['demo_to_import_users']}",
        (
            "Signup conversion: "
            f"activation={activation_rate if activation_rate is not None else 'n/a'}%, "
            f"budget={budget_rate if budget_rate is not None else 'n/a'}%"
        ),
        (
            "Median signup to activation (hours): "
            f"{median_hours if median_hours is not None else 'n/a'}"
        ),
    ])


def _flatten_grouped_transactions_text(result: dict) -> str:
    lines = [
        "Grouped transaction flatten pass",
        f"Dry run: {'yes' if result['dry_run'] else 'no'}",
        f"Grouped transactions found: {result['grouped_transactions_found']}",
        f"Grouped transactions flattened: {result['grouped_transactions_flattened']}",
        f"New atomic transactions created: {result['new_transactions_created']}",
        f"Skipped mismatches: {result['skipped_mismatch']}",
    ]
    for user in result.get("users") or []:
        lines.append(
            "User "
            f"{user['user_id']}: grouped={user['grouped_transactions']}, "
            f"created={user['new_transactions_created']}, "
            f"rows_after={user['rows_after_flatten']}, "
            f"skipped={user['skipped_mismatch']}"
        )
    return "\n".join(lines)


def register_maintenance_commands(app):
    @app.cli.command("activation-report")
    @click.option("--days", default=30, show_default=True, type=click.IntRange(1, 365), help="Trailing UTC days to report.")
    @click.option("--json-output", "json_output", is_flag=True, help="Emit machine-readable JSON instead of a text summary.")
    @click.option(
        "--output",
        "output_path",
        type=click.Path(dir_okay=False, path_type=Path),
        default=None,
        help="Write the JSON report artifact to this file path.",
    )
    def activation_report(days, json_output, output_path):
        """Show signup-to-activation conversion from ProductEvent data."""
        report = build_activation_report(days=days)

        if output_path is not None:
            write_activation_report_artifact(output_path, report)

        if json_output:
            click.echo(activation_report_json(report))
            return

        if output_path is not None:
            click.echo(f"Wrote activation report JSON to {output_path}")
            return

        click.echo(_activation_report_text(report))

    @app.cli.command("flatten-grouped-transactions")
    @click.option("--dry-run", is_flag=True, help="Show what would change without writing to the database.")
    @click.option("--user-id", type=int, default=None, help="Only flatten grouped transactions for one user.")
    @click.option("--json-output", "json_output", is_flag=True, help="Emit machine-readable JSON.")
    def flatten_grouped_transactions_cmd(dry_run, user_id, json_output):
        """Flatten legacy grouped transactions into atomic transaction rows."""
        result = flatten_grouped_transactions(dry_run=dry_run, user_id=user_id)
        if json_output:
            click.echo(json.dumps(result, indent=2, sort_keys=True))
            return
        click.echo(_flatten_grouped_transactions_text(result))

    @app.cli.command("prune-memorized-transactions")
    @click.option("--min-count", default=2, help="Minimum usage count to keep")
    @click.option("--max-age-days", default=30, help="Maximum age in days for single-use entries")
    @click.option("--dry-run", is_flag=True, help="Show what would be deleted without deleting")
    def prune_memorized_transactions(min_count, max_age_days, dry_run):
        """Clean up old/unused memorized transaction entries."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        old_cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days * 2)

        to_delete = (
            MemorizedTransaction.query
            .filter(
                db.or_(
                    db.and_(
                        MemorizedTransaction.count == 1,
                        MemorizedTransaction.last_seen < cutoff_date
                    ),
                    db.and_(
                        MemorizedTransaction.count < min_count,
                        MemorizedTransaction.last_seen < old_cutoff
                    )
                )
            )
        )

        count = to_delete.count()

        if count == 0:
            print("No entries to delete.")
            return

        if dry_run:
            print(f"DRY RUN: Would delete {count} memorized transaction entries:")
            print(f"   - Single-use entries older than {max_age_days} days")
            print(f"   - Entries with < {min_count} uses older than {max_age_days * 2} days")
            print("\nRun without --dry-run to actually delete.")

            examples = to_delete.limit(10).all()
            if examples:
                print("\nExamples of entries that would be deleted:")
                for entry in examples:
                    age_days = (datetime.now(timezone.utc) - entry.last_seen).days
                    print(f"   - '{entry.canonical}' (used {entry.count}x, {age_days} days old)")
        else:
            to_delete.delete(synchronize_session=False)
            db.session.commit()
            print(f"Deleted {count} old/unused memorized transaction entries.")
            print(f"   Criteria: count={min_count}, max_age={max_age_days} days")

    @app.cli.command("memorized-transaction-stats")
    def memorized_transaction_stats():
        """Show statistics about memorized transactions usage."""
        total = MemorizedTransaction.query.count()

        if total == 0:
            print("No memorized transaction entries.")
            return

        single_use = MemorizedTransaction.query.filter(MemorizedTransaction.count == 1).count()
        low_use = MemorizedTransaction.query.filter(MemorizedTransaction.count < 5).count()
        high_use = MemorizedTransaction.query.filter(MemorizedTransaction.count >= 10).count()

        old_date = datetime.now(timezone.utc) - timedelta(days=365)
        old_entries = MemorizedTransaction.query.filter(MemorizedTransaction.last_seen < old_date).count()

        print("Memorized Transaction Statistics:")
        print(f"   Total entries: {total}")
        print(f"   Single-use: {single_use} ({single_use/total*100:.1f}%)")
        print(f"   Low-use (< 5): {low_use} ({low_use/total*100:.1f}%)")
        print(f"   High-use (>= 10): {high_use} ({high_use/total*100:.1f}%)")
        print(f"   Older than 1 year: {old_entries} ({old_entries/total*100:.1f}%)")

    @app.cli.command("prune-account-action-tokens")
    @click.option("--expired-grace-hours", default=24, show_default=True, help="Keep expired tokens for this many hours.")
    @click.option("--used-grace-days", default=7, show_default=True, help="Keep used tokens for this many days.")
    @click.option("--dry-run", is_flag=True, help="Show counts only without deleting.")
    def prune_account_action_tokens(expired_grace_hours, used_grace_days, dry_run):
        """Remove stale account action tokens (email/password change links)."""
        now = datetime.now(timezone.utc)
        expired_cutoff = now - timedelta(hours=expired_grace_hours)
        used_cutoff = now - timedelta(days=used_grace_days)

        expired_q = AccountActionToken.query.filter(AccountActionToken.expires_at < expired_cutoff)
        used_q = AccountActionToken.query.filter(
            AccountActionToken.used_at.is_not(None),
            AccountActionToken.used_at < used_cutoff,
        )
        expired_count = expired_q.count()
        used_count = used_q.count()
        total = expired_count + used_count

        if dry_run:
            print(f"DRY RUN: {total} tokens would be deleted")
            print(f"   expired older than {expired_grace_hours}h: {expired_count}")
            print(f"   used older than {used_grace_days}d: {used_count}")
            return

        deleted_expired, deleted_used = cleanup_account_action_tokens(
            expired_grace_hours=expired_grace_hours,
            used_grace_days=used_grace_days,
        )
        print("Account action token cleanup complete.")
        print(f"   deleted expired tokens: {deleted_expired}")
        print(f"   deleted used tokens: {deleted_used}")

    @app.cli.command("prune-security-data")
    @click.option("--security-events-days", default=365, show_default=True, help="Retention window for security_events.")
    @click.option("--product-events-days", default=90, show_default=True, help="Retention window for product_events.")
    @click.option("--dry-run", is_flag=True, help="Show counts only without deleting.")
    def prune_security_data_cmd(security_events_days, product_events_days, dry_run):
        """Remove old security_events and product_events rows."""
        security_events_days = max(1, int(security_events_days))
        product_events_days = max(1, int(product_events_days))

        now = datetime.now(timezone.utc)
        security_cutoff = now - timedelta(days=security_events_days)
        product_cutoff = now - timedelta(days=product_events_days)

        events_q = SecurityEvent.query.filter(SecurityEvent.created_at < security_cutoff)
        product_q = ProductEvent.query.filter(ProductEvent.event_ts < product_cutoff)
        events_count = events_q.count()
        product_count = product_q.count()
        total = events_count + product_count

        if dry_run:
            print(f"DRY RUN: {total} rows would be deleted")
            print(f"   security_events older than {security_events_days}d: {events_count}")
            print(f"   product_events older than {product_events_days}d: {product_count}")
            return

        deleted_events = cleanup_security_data(security_events_days=security_events_days)
        deleted_product = cleanup_product_events(product_events_days=product_events_days)
        print("Security data cleanup complete.")
        print(f"   deleted security_events: {deleted_events}")
        print(f"   deleted product_events: {deleted_product}")

    @app.cli.command("run-maintenance-pass")
    @click.option(
        "--security-events-days",
        default=None,
        type=int,
        help="Retention window for security_events. Defaults to app config.",
    )
    @click.option(
        "--ingested-messages-days",
        default=None,
        type=int,
        help="Retention window for ingested_messages. Defaults to app config.",
    )
    @click.option(
        "--product-events-days",
        default=None,
        type=int,
        help="Retention window for product_events. Defaults to app config. (reserved)",
    )
    def run_maintenance_pass_cmd(security_events_days, ingested_messages_days, product_events_days):
        """Run one deterministic cleanup pass across maintenance domains."""
        resolved_security_days = max(
            1,
            int(
                security_events_days
                if security_events_days is not None
                else app.config.get("SECURITY_EVENTS_RETENTION_DAYS", 365)
            ),
        )
        resolved_ingested_days = max(
            1,
            int(
                ingested_messages_days
                if ingested_messages_days is not None
                else app.config.get("INGESTED_MESSAGES_RETENTION_DAYS", 180)
            ),
        )
        counts = run_maintenance_pass(
            security_events_days=resolved_security_days,
            ingested_messages_days=resolved_ingested_days,
        )
        print("Maintenance pass complete.")
        print(f"   deleted expired account tokens: {counts['account_action_tokens_expired_deleted']}")
        print(f"   deleted used account tokens: {counts['account_action_tokens_used_deleted']}")
        print(f"   deleted security_events: {counts['security_events_deleted']}")
        print(f"   deleted ingested_messages: {counts['ingested_messages_deleted']}")
