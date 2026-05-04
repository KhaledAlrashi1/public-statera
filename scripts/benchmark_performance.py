#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import os
import statistics
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import event

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _extract_db_name(db_url: str) -> str:
    parsed = urlparse(db_url)
    path = (parsed.path or "").strip("/")
    return path.split("/", 1)[0].strip().lower()


def _looks_like_test_database(db_name: str) -> bool:
    return (
        db_name.startswith("test_")
        or db_name.startswith("testing_")
        or db_name.endswith("_test")
        or "_test_" in db_name
    )


def _resolve_benchmark_database_url() -> str:
    db_url = (os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL") or "").strip()
    if not db_url.lower().startswith("postgresql://"):
        raise SystemExit("Set TEST_DATABASE_URL (or DATABASE_URL) to a PostgreSQL test database first.")

    db_name = _extract_db_name(db_url)
    if not db_name or not _looks_like_test_database(db_name):
        raise SystemExit("Benchmark refuses to run against a non-test database.")
    return db_url


def _configure_env(db_url: str) -> None:
    os.environ["DATABASE_URL"] = db_url
    os.environ["PERSONAL_STATERA_DEV_MODE"] = "true"
    os.environ["SECRET_KEY"] = "benchmark-secret-key-for-performance-checks"
    os.environ["ENABLE_TEMPLATE_SUGGESTIONS"] = "false"
    os.environ["RATE_LIMIT_BACKEND"] = "memory"
    os.environ["SLOW_QUERY_THRESHOLD_MS"] = "0"
    os.environ["ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED"] = "false"
    os.environ["REDIS_URL"] = ""
    os.environ["CELERY_BROKER_URL"] = ""
    os.environ["CELERY_RESULT_BACKEND"] = ""


@dataclass
class BenchmarkResult:
    name: str
    budget_ms: float
    cold_ms: float
    cold_selects: int
    warm_p50_ms: float
    warm_max_ms: float

    @property
    def passed(self) -> bool:
        return self.cold_ms <= self.budget_ms


@contextmanager
def _capture_selects(engine):
    counter = {"count": 0}

    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        if statement.lstrip().lower().startswith("select"):
            counter["count"] += 1

    event.listen(engine, "before_cursor_execute", _before_cursor_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _before_cursor_execute)


def _measure_call(engine, fn) -> tuple[float, int, object]:
    with _capture_selects(engine) as counter:
        started = time.perf_counter()
        response = fn()
        elapsed_ms = (time.perf_counter() - started) * 1000
    return elapsed_ms, int(counter["count"]), response


def _measure_route(engine, fn, *, budget_ms: float, warm_runs: int = 3) -> tuple[BenchmarkResult, object]:
    cold_ms, cold_selects, cold_response = _measure_call(engine, fn)
    warm_times: list[float] = []
    for _ in range(warm_runs):
        elapsed_ms, _query_count, _response = _measure_call(engine, fn)
        warm_times.append(elapsed_ms)

    result = BenchmarkResult(
        name="",
        budget_ms=budget_ms,
        cold_ms=round(cold_ms, 1),
        cold_selects=cold_selects,
        warm_p50_ms=round(statistics.median(warm_times), 1),
        warm_max_ms=round(max(warm_times), 1),
    )
    return result, cold_response


def _csrf_token(client) -> str:
    res = client.get("/api/csrf-token")
    if res.status_code != 200:
        raise RuntimeError(f"Failed to fetch CSRF token: {res.status_code} {res.get_data(as_text=True)}")
    token = (res.get_json() or {}).get("csrf_token")
    if not token:
        raise RuntimeError("CSRF token response was empty.")
    return str(token)


def _csrf_headers(client) -> dict[str, str]:
    token = _csrf_token(client)
    return {
        "X-CSRFToken": token,
        "X-Requested-With": "fetch",
    }


def _post_json(client, path: str, payload: dict) -> object:
    return client.post(path, json=payload, headers=_csrf_headers(client))


def _login(client, email: str, password: str) -> None:
    res = _post_json(client, "/api/auth/login", {"email": email, "password": password})
    if res.status_code != 200:
        raise RuntimeError(f"Login failed: {res.status_code} {res.get_data(as_text=True)}")


def _build_preview_fixture(rows: int) -> bytes:
    lines = ["date,merchant,category,name,amount_kd,memo"]
    today = datetime.now(timezone.utc).date()
    for idx in range(rows):
        tx_date = today - timedelta(days=idx % 60)
        lines.append(
            f"{tx_date.isoformat()},Benchmark Merchant {idx % 10},Groceries,Preview Row {idx},{10 + (idx % 25)}.000,Row {idx}"
        )
    return ("\n".join(lines) + "\n").encode("utf-8")


def _seed_dataset(tx_count: int):
    from backend import bcrypt, create_app, db
    from backend.models import (
        BankConnection,
        BankSyncRun,
        Budget,
        Category,
        DebtAccount,
        Merchant,
        RawBankTransaction,
        SavingsGoal,
        Transaction,
        User,
        UserProfile,
    )

    app = create_app()
    app.config["TESTING"] = True

    with app.app_context():
        db.session.remove()
        db.drop_all()
        db.create_all()

        user = User(
            email="benchmark@example.com",
            password_hash=bcrypt.generate_password_hash("Password123!").decode("utf-8"),
        )
        db.session.add(user)
        db.session.flush()

        profile = UserProfile(
            user_id=user.id,
            monthly_income_kd=Decimal("2500.000"),
            payday_day=1,
            country="KW",
            timezone="Asia/Kuwait",
        )
        db.session.add(profile)

        income_category = Category(user_id=user.id, name="Income Salary", is_income=True)
        expense_categories = [
            Category(user_id=user.id, name="Groceries", is_income=False),
            Category(user_id=user.id, name="Transport", is_income=False),
            Category(user_id=user.id, name="Utilities", is_income=False),
            Category(user_id=user.id, name="Dining", is_income=False),
            Category(user_id=user.id, name="Entertainment", is_income=False),
        ]
        db.session.add(income_category)
        db.session.add_all(expense_categories)

        merchants = [
            Merchant(user_id=user.id, name="Benchmark Market"),
            Merchant(user_id=user.id, name="Benchmark Taxi"),
            Merchant(user_id=user.id, name="Benchmark Utility"),
            Merchant(user_id=user.id, name="Benchmark Cafe"),
        ]
        db.session.add_all(merchants)
        db.session.flush()

        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        budget_amounts = {
            "Groceries": Decimal("220.000"),
            "Transport": Decimal("90.000"),
            "Utilities": Decimal("150.000"),
            "Dining": Decimal("120.000"),
            "Entertainment": Decimal("100.000"),
        }
        categories_by_name = {income_category.name: income_category}
        categories_by_name.update({category.name: category for category in expense_categories})
        for category_name, amount in budget_amounts.items():
            db.session.add(
                Budget(
                    user_id=user.id,
                    month=current_month,
                    category_id=categories_by_name[category_name].id,
                    amount_kd=amount,
                )
            )

        db.session.add(
            DebtAccount(
                user_id=user.id,
                name="Benchmark Card",
                debt_type="credit_card",
                balance_kd=Decimal("1800.000"),
                minimum_payment_kd=Decimal("75.000"),
                due_day=15,
                is_active=True,
            )
        )

        target_date = datetime.now(timezone.utc).date() + timedelta(days=180)
        for idx, category_name in enumerate(("Groceries", "Transport", "Utilities"), start=1):
            db.session.add(
                SavingsGoal(
                    user_id=user.id,
                    name=f"Benchmark Goal {idx}",
                    goal_type="custom",
                    target_kd=Decimal("900.000"),
                    current_kd=Decimal("150.000"),
                    target_date=target_date,
                    linked_category_id=categories_by_name[category_name].id,
                    is_active=True,
                )
            )

        today = datetime.now(timezone.utc).date()
        transactions: list[Transaction] = []
        bank_import_transactions: list[Transaction] = []
        for idx in range(tx_count):
            tx_date = today - timedelta(days=idx % 365)
            if idx % 14 == 0:
                transaction = Transaction(
                    user_id=user.id,
                    date=tx_date,
                    source="manual",
                    category_id=income_category.id,
                    name=f"Salary Payment {idx}",
                    name_key=f"salary-payment-{idx}",
                    amount_kd=Decimal("2500.000"),
                )
            else:
                category = expense_categories[idx % len(expense_categories)]
                merchant = merchants[idx % len(merchants)]
                source = "bank_import" if idx % 3 == 0 else "manual"
                transaction = Transaction(
                    user_id=user.id,
                    date=tx_date,
                    source=source,
                    merchant_id=merchant.id,
                    category_id=category.id,
                    name=f"{merchant.name} expense {idx}",
                    name_key=f"benchmark-expense-{idx}",
                    memo=f"Benchmark memo {idx}",
                    amount_kd=Decimal(f"{8 + (idx % 19)}.000"),
                )
                if source == "bank_import":
                    bank_import_transactions.append(transaction)
            transactions.append(transaction)

        db.session.add_all(transactions)
        db.session.flush()

        connection = BankConnection(
            user_id=user.id,
            provider="fakebank",
            institution_name="Benchmark Bank",
            status="active",
            last_synced_at=datetime.now(timezone.utc),
        )
        db.session.add(connection)
        db.session.flush()

        sync_run = BankSyncRun(
            connection_id=connection.id,
            user_id=user.id,
            status="committed",
            staged_count=min(len(bank_import_transactions), 250),
            committed_count=min(len(bank_import_transactions), 250),
            committed_at=datetime.now(timezone.utc),
        )
        db.session.add(sync_run)
        db.session.flush()

        for idx, transaction in enumerate(bank_import_transactions[:250]):
            db.session.add(
                RawBankTransaction(
                    connection_id=connection.id,
                    sync_run_id=sync_run.id,
                    user_id=user.id,
                    provider_tx_id=f"benchmark-provider-{idx}",
                    date=transaction.date,
                    description=transaction.name[:128],
                    amount_kd=transaction.amount_kd,
                    category_hint=transaction.category_rel.name if transaction.category_rel else None,
                    merchant_hint=transaction.merchant_rel.name if transaction.merchant_rel else None,
                    status="committed",
                    transaction_id=transaction.id,
                )
            )

        db.session.commit()

    return app, db


def main() -> int:
    parser = argparse.ArgumentParser(description="Run local performance checks against a dev/test database.")
    parser.add_argument("--transactions", type=int, default=1200, help="Number of transactions to seed.")
    parser.add_argument("--preview-rows", type=int, default=500, help="Rows to include in upload-preview benchmark.")
    args = parser.parse_args()

    db_url = _resolve_benchmark_database_url()
    _configure_env(db_url)
    app, db = _seed_dataset(args.transactions)

    with app.app_context():
        engine = db.engine

    client = app.test_client()
    _login(client, "benchmark@example.com", "Password123!")
    month = datetime.now(timezone.utc).strftime("%Y-%m")

    results: list[BenchmarkResult] = []

    dashboard_bundle, response = _measure_route(
        engine,
        lambda: client.get(f"/api/dashboard-bundle?month={month}"),
        budget_ms=2000,
    )
    dashboard_bundle.name = "dashboard_bundle"
    if response.status_code != 200:
        raise RuntimeError(response.get_data(as_text=True))
    results.append(dashboard_bundle)

    account_overview, response = _measure_route(
        engine,
        lambda: client.get(f"/api/analytics/account-overview?month={month}"),
        budget_ms=1000,
    )
    account_overview.name = "account_overview"
    if response.status_code != 200:
        raise RuntimeError(response.get_data(as_text=True))
    results.append(account_overview)

    expense_breakdown, response = _measure_route(
        engine,
        lambda: client.get(f"/api/expense-breakdown?month={month}&range=month&dimension=category"),
        budget_ms=1000,
    )
    expense_breakdown.name = "expense_breakdown"
    if response.status_code != 200:
        raise RuntimeError(response.get_data(as_text=True))
    results.append(expense_breakdown)

    safe_to_spend, response = _measure_route(
        engine,
        lambda: client.get(f"/api/safe-to-spend?month={month}"),
        budget_ms=1000,
    )
    safe_to_spend.name = "safe_to_spend"
    if response.status_code != 200:
        raise RuntimeError(response.get_data(as_text=True))
    results.append(safe_to_spend)

    preview_payload = _build_preview_fixture(args.preview_rows)

    def _upload_preview():
        headers = _csrf_headers(client)
        token = headers["X-CSRFToken"]
        return client.post(
            "/api/transactions/upload-preview",
            data={
                "file": (io.BytesIO(preview_payload), "benchmark-preview.csv"),
                "csrf_token": token,
            },
            headers=headers,
            content_type="multipart/form-data",
        )

    upload_preview, response = _measure_route(
        engine,
        _upload_preview,
        budget_ms=3000,
    )
    upload_preview.name = "upload_preview"
    if response.status_code != 200:
        raise RuntimeError(response.get_data(as_text=True))
    results.append(upload_preview)

    print(
        f"Performance benchmark on {datetime.now(timezone.utc).date().isoformat()} "
        f"(dataset={args.transactions} transactions, preview_rows={args.preview_rows})"
    )
    print("name               cold_ms  budget_ms  warm_p50_ms  warm_max_ms  cold_selects  status")
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(
            f"{result.name:<18} {result.cold_ms:>7.1f} {result.budget_ms:>10.0f} "
            f"{result.warm_p50_ms:>12.1f} {result.warm_max_ms:>12.1f} {result.cold_selects:>13}  {status}"
        )

    failed = [result.name for result in results if not result.passed]
    if failed:
        print(f"\nFailed budgets: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
