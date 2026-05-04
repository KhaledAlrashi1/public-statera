"""SQLAlchemy database models."""

from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import NotRequired, TypeAlias, TypedDict

from flask_login import UserMixin

from backend import db
from backend.constants import UNCAT_NAME
from backend.lib.crypto import EncryptedString
from backend.money_math import format_kd

IsoDateString: TypeAlias = str
IsoDateTimeString: TypeAlias = str | None
MoneyString: TypeAlias = str
SnapshotNumeric: TypeAlias = int | float
ExpenseByCategorySnapshot: TypeAlias = dict[str, dict[str, SnapshotNumeric]]


class UserDict(TypedDict):
    id: int
    email: str
    display_name: str | None
    first_name: str | None
    last_name: str | None
    totp_enabled: bool
    created_at: IsoDateTimeString


class UserProfileDict(TypedDict):
    monthly_income_kd: MoneyString | None
    payday_day: int | None
    country: str | None
    email_notifications_enabled: bool
    has_debt_choice: bool | None
    setup_guide_seen: bool
    setup_guide_dismissed: bool
    timezone: str


class CategoryDict(TypedDict):
    id: int
    name: str
    is_income: bool
    is_system: bool
    transaction_count: NotRequired[int]


class MerchantDict(TypedDict):
    id: int
    name: str


class TransactionDict(TypedDict):
    id: int
    date: IsoDateString
    merchant: str | None
    category: str
    name: str
    memo: str | None
    amount_kd: MoneyString
    source: str


class BudgetDict(TypedDict):
    id: int
    month: str
    category: str
    amount_kd: MoneyString


class DashboardMonthlyEntryDict(TypedDict):
    month: str
    income_kd: SnapshotNumeric
    expense_kd: SnapshotNumeric


class DashboardSnapshotPayload(TypedDict):
    months: list[str]
    monthly: list[DashboardMonthlyEntryDict]
    expense_by_category: ExpenseByCategorySnapshot
    cycle_enabled: bool
    cycle_start: str | None
    cycle_end: str | None
    updated_at: IsoDateTimeString


class DebtAccountDict(TypedDict):
    id: int
    name: str
    debt_type: str
    balance_kd: MoneyString
    minimum_payment_kd: MoneyString
    apr_pct: MoneyString | None
    due_day: int | None
    is_active: bool
    notes: str | None
    created_at: IsoDateTimeString
    updated_at: IsoDateTimeString


class SavingsGoalDict(TypedDict):
    id: int
    name: str
    goal_type: str
    target_kd: MoneyString
    current_kd: MoneyString
    target_date: IsoDateString | None
    linked_category: str | None
    linked_category_id: int | None
    is_active: bool
    notes: str | None
    created_at: IsoDateTimeString
    updated_at: IsoDateTimeString


class MemorizedCategoryRef(TypedDict):
    id: int
    name: str


class MemorizedMerchantRef(TypedDict):
    id: int
    name: str


class MemorizedTransactionDict(TypedDict):
    name: str
    category: MemorizedCategoryRef | None
    merchant: MemorizedMerchantRef | None
    count: int


class SecurityEventDict(TypedDict):
    id: int
    event_type: str
    ip_address: str | None
    user_agent: str | None
    details_json: str | None
    created_at: IsoDateTimeString


class ProductEventDict(TypedDict):
    id: int
    user_id: int
    event_name: str
    properties_json: str | None
    event_ts: IsoDateTimeString


class WorkerTaskRunDict(TypedDict):
    task_name: str
    last_started_at: IsoDateTimeString
    last_finished_at: IsoDateTimeString
    last_success_at: IsoDateTimeString
    last_failure_at: IsoDateTimeString
    last_status: str
    last_error: str | None
    updated_at: IsoDateTimeString


class BankConnectionDict(TypedDict):
    id: int
    provider: str
    account_number_masked: str | None
    institution_name: str
    status: str
    last_synced_at: IsoDateTimeString
    created_at: IsoDateTimeString
    revoked_at: IsoDateTimeString


class BankConsentDict(TypedDict):
    id: int
    connection_id: int
    user_id: int
    scopes: list[str]
    purpose_of_use: str
    scope_description: str
    consent_reference: str | None
    data_recipient_name: str
    ip_address_granted: str | None
    user_agent_granted: str | None
    granted_at: IsoDateTimeString
    expires_at: IsoDateTimeString
    revoked_at: IsoDateTimeString
    status: str


class DataAccessLogDict(TypedDict):
    id: int
    user_id: int
    connection_id: int | None
    consent_id: int | None
    action: str
    records_accessed: int
    date_range_start: IsoDateString | None
    date_range_end: IsoDateString | None
    ip_address: str | None
    created_at: IsoDateTimeString


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(128), nullable=True)
    first_name = db.Column(db.String(64), nullable=True)
    last_name = db.Column(db.String(64), nullable=True)
    totp_secret = db.Column(EncryptedString, nullable=True)  # AES-256-GCM encrypted at rest
    totp_enabled = db.Column(db.Boolean, nullable=False, default=False)
    totp_backup_codes_json = db.Column(db.Text, nullable=True)
    session_version = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self) -> UserDict:
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "totp_enabled": bool(self.totp_enabled),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"


class UserProfile(db.Model):
    __tablename__ = "user_profiles"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    monthly_income_kd = db.Column(db.Numeric(12, 3), nullable=True)
    payday_day = db.Column(db.Integer, nullable=True)
    country = db.Column(db.String(64), nullable=True)
    email_notifications_enabled = db.Column(db.Boolean, nullable=False, default=True)
    has_debt_choice = db.Column(db.Boolean, nullable=True)
    setup_guide_seen = db.Column(db.Boolean, nullable=False, default=False)
    setup_guide_dismissed = db.Column(db.Boolean, nullable=False, default=False)
    # IANA timezone string — used for pay-cycle and analytics localisation.
    # Defaults to the primary target market; no UI or analytics change yet.
    timezone = db.Column(db.String(64), nullable=False, default="Asia/Kuwait", server_default="Asia/Kuwait")
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> UserProfileDict:
        return {
            "monthly_income_kd": format_kd(self.monthly_income_kd) if self.monthly_income_kd is not None else None,
            "payday_day": self.payday_day,
            "country": self.country,
            "email_notifications_enabled": bool(self.email_notifications_enabled),
            "has_debt_choice": self.has_debt_choice if self.has_debt_choice is not None else None,
            "setup_guide_seen": bool(self.setup_guide_seen),
            "setup_guide_dismissed": bool(self.setup_guide_dismissed),
            "timezone": self.timezone or "Asia/Kuwait",
        }


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(64), nullable=False, index=True)
    # NULL is treated as False (not income) for backward compatibility.
    is_income = db.Column(db.Boolean, nullable=True, default=False)
    # System categories (e.g. Uncategorized) cannot be renamed or deleted.
    is_system = db.Column(db.Boolean, nullable=False, default=False, server_default="false")

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_category_user_name"),
    )

    def to_dict(self) -> CategoryDict:
        return {
            "id": self.id,
            "name": self.name,
            "is_income": bool(self.is_income) if self.is_income is not None else False,
            "is_system": bool(self.is_system),
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Category {self.id} {self.name}>"


class Merchant(db.Model):
    __tablename__ = "merchants"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_merchant_user_name"),
    )

    def to_dict(self) -> MerchantDict:
        return {
            "id": self.id,
            "name": self.name,
        }

    def __repr__(self) -> str:
        return f"<Merchant {self.id} {self.name}>"


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    source = db.Column(db.String(32), nullable=False, default="manual", index=True)

    merchant_id = db.Column(db.Integer, db.ForeignKey("merchants.id"), nullable=True, index=True)
    merchant_rel = db.relationship("Merchant")

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True, index=True)
    category_rel = db.relationship("Category")

    name = db.Column(db.String(255), nullable=False)
    memo = db.Column(db.String(255), nullable=True)
    name_key = db.Column(db.String(255), nullable=False, index=True)

    amount_kd = db.Column(db.Numeric(10, 3), nullable=False)

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    # Import provenance for file-based imports. Manual and message-only
    # transactions leave these fields NULL.
    import_batch_id = db.Column(db.String(36), nullable=True, index=True)
    import_row_hash = db.Column(db.String(64), nullable=True)

    __table_args__ = (
        db.Index(
            "ix_transactions_import_row_hash",
            "import_row_hash",
            unique=True,
            postgresql_where=db.text("import_row_hash IS NOT NULL"),
        ),
        db.Index("ix_transactions_user_date_id", "user_id", "date", "id"),
        db.Index("ix_transactions_user_category_date", "user_id", "category_id", "date"),
        db.Index("ix_transactions_user_source_date", "user_id", "source", "date"),
    )

    def to_dict(self) -> TransactionDict:
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "merchant": (self.merchant_rel.name if self.merchant_rel else None),
            "category": (self.category_rel.name if self.category_rel else UNCAT_NAME),
            "name": self.name,
            "memo": getattr(self, 'memo', None),
            "amount_kd": format_kd(self.amount_kd),
            "source": (self.source or "manual"),
        }

    @property
    def display_name(self) -> str:
        """Get display name for transaction-centric records."""
        return self.name or getattr(self, 'memo', None) or ""

    def __repr__(self) -> str:
        return f"<Txn {self.id} {self.date} {self.category_id} {self.amount_kd} KD>"


class Budget(db.Model):
    __tablename__ = "budgets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    month = db.Column(db.String(7), nullable=False, index=True)

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False, index=True)
    category_rel = db.relationship("Category")

    amount_kd = db.Column(db.Numeric(10, 3), nullable=False)

    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "month", "category_id", name="uq_budget_user_month_category"),
        # Explicit index to speed up GET /api/budgets?month=YYYY-MM (user_id + month filter).
        db.Index("ix_budgets_user_month", "user_id", "month"),
    )

    def to_dict(self) -> BudgetDict:
        return {
            "id": self.id,
            "month": self.month,
            "category": (self.category_rel.name if self.category_rel else UNCAT_NAME.lower()),
            "amount_kd": format_kd(self.amount_kd),
        }


class DashboardSnapshot(db.Model):
    __tablename__ = "dashboard_snapshots"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    months_count = db.Column(db.Integer, nullable=False, default=24)
    window_end_month = db.Column(db.String(7), nullable=False, index=True)
    months_json = db.Column(db.Text, nullable=False, default="[]")
    monthly_json = db.Column(db.Text, nullable=False, default="[]")
    expense_by_category_json = db.Column(db.Text, nullable=False, default="{}")
    computed_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "months_count",
            "window_end_month",
            name="uq_dashboard_snapshot_user_window",
        ),
        db.Index("ix_dashboard_snapshots_user_computed", "user_id", "computed_at"),
    )

    def to_payload(self) -> DashboardSnapshotPayload:
        months = json.loads(self.months_json or "[]")
        monthly = json.loads(self.monthly_json or "[]")
        expense_by_category = json.loads(self.expense_by_category_json or "{}")

        if not isinstance(months, list):
            months = []
        if not isinstance(monthly, list):
            monthly = []
        if not isinstance(expense_by_category, dict):
            expense_by_category = {}

        return {
            "months": months,
            "monthly": monthly,
            "expense_by_category": expense_by_category,
            "cycle_enabled": False,
            "cycle_start": None,
            "cycle_end": None,
            "updated_at": self.computed_at.isoformat() if self.computed_at else None,
        }


class DebtAccount(db.Model):
    __tablename__ = "debt_accounts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    debt_type = db.Column(db.String(32), nullable=False, default="other")
    balance_kd = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    apr_pct = db.Column(db.Numeric(6, 3), nullable=True)
    minimum_payment_kd = db.Column(db.Numeric(10, 3), nullable=False, default=0)
    due_day = db.Column(db.Integer, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_debt_accounts_user_name"),
        db.Index("ix_debt_accounts_user_active", "user_id", "is_active"),
    )

    def to_dict(self) -> DebtAccountDict:
        return {
            "id": self.id,
            "name": self.name,
            "debt_type": self.debt_type,
            "balance_kd": format_kd(self.balance_kd),
            "minimum_payment_kd": format_kd(self.minimum_payment_kd),
            "apr_pct": format_kd(self.apr_pct) if self.apr_pct is not None else None,
            "due_day": self.due_day,
            "is_active": bool(self.is_active),
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SavingsGoal(db.Model):
    __tablename__ = "savings_goals"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    goal_type = db.Column(db.String(32), nullable=False, default="custom")
    target_kd = db.Column(db.Numeric(12, 3), nullable=False)
    current_kd = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    target_date = db.Column(db.Date, nullable=True)
    linked_category_id = db.Column(
        db.Integer,
        db.ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    linked_category_rel = db.relationship("Category", foreign_keys=[linked_category_id])
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.String(255), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.Index("ix_savings_goals_user_active", "user_id", "is_active"),
    )

    def to_dict(self) -> SavingsGoalDict:
        return {
            "id": self.id,
            "name": self.name,
            "goal_type": self.goal_type,
            "target_kd": format_kd(self.target_kd),
            "current_kd": format_kd(self.current_kd),
            "target_date": self.target_date.isoformat() if self.target_date else None,
            "linked_category": self.linked_category_rel.name if self.linked_category_rel else None,
            "linked_category_id": self.linked_category_id,
            "is_active": bool(self.is_active),
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MemorizedTransaction(db.Model):
    __tablename__ = "memorized_transactions"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    canonical  = db.Column(db.String(255), nullable=False)
    norm       = db.Column(db.String(255), nullable=False, index=True)
    category_id = db.Column(
        db.Integer,
        db.ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category_rel = db.relationship("Category", foreign_keys=[category_id])
    merchant_id = db.Column(
        db.Integer,
        db.ForeignKey("merchants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    merchant_rel = db.relationship("Merchant", foreign_keys=[merchant_id])
    count      = db.Column(db.Integer, nullable=False, default=1)
    last_seen = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )
    is_pinned  = db.Column(db.Boolean, nullable=False, server_default="false", default=False)
    pinned_at  = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "norm", name="uq_memorized_user_norm"),
    )

    def to_dict(self) -> MemorizedTransactionDict:
        cat = self.category_rel
        merch = self.merchant_rel
        return {
            "name": self.canonical,
            "category": {"id": cat.id, "name": cat.name} if cat else None,
            "merchant": {"id": merch.id, "name": merch.name} if merch else None,
            "count": self.count,
        }


class TemplateSuggestionFeedback(db.Model):
    __tablename__ = "template_suggestion_feedback"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    signature_key = db.Column(db.String(64), nullable=False)
    accepted_count = db.Column(db.Integer, nullable=False, default=0)
    rejected_count = db.Column(db.Integer, nullable=False, default=0)
    last_accepted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_rejected_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint("user_id", "signature_key", name="uq_template_feedback_user_signature"),
        db.Index("ix_template_feedback_user_updated", "user_id", "updated_at"),
    )


class AccountActionToken(db.Model):
    __tablename__ = "account_action_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    purpose = db.Column(db.String(32), nullable=False, index=True)  # email_change | password_change
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    payload_json = db.Column(db.Text, nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def is_active(self) -> bool:
        now = datetime.now(timezone.utc)
        return self.used_at is None and self.expires_at > now


class SecurityEvent(db.Model):
    __tablename__ = "security_events"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    event_type = db.Column(db.String(64), nullable=False, index=True)
    ip_address = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    details_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    def to_dict(self) -> SecurityEventDict:
        return {
            "id": self.id,
            "event_type": self.event_type,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "details_json": self.details_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ProductEvent(db.Model):
    __tablename__ = "product_events"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    event_name = db.Column(db.String(64), nullable=False, index=True)
    properties_json = db.Column(db.Text, nullable=True)
    event_ts = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        db.Index("ix_product_events_user_event", "user_id", "event_name"),
        db.Index("ix_product_events_event_ts_name", "event_name", "event_ts"),
    )

    def to_dict(self) -> ProductEventDict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "event_name": self.event_name,
            "properties_json": self.properties_json,
            "event_ts": self.event_ts.isoformat() if self.event_ts else None,
        }


class WorkerTaskRun(db.Model):
    __tablename__ = "worker_task_runs"

    id = db.Column(db.Integer, primary_key=True)
    task_name = db.Column(db.String(128), nullable=False, unique=True, index=True)
    last_started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_finished_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    last_success_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_failure_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_status = db.Column(db.String(32), nullable=False, default="never")
    last_error = db.Column(db.String(255), nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> WorkerTaskRunDict:
        return {
            "task_name": self.task_name,
            "last_started_at": self.last_started_at.isoformat() if self.last_started_at else None,
            "last_finished_at": self.last_finished_at.isoformat() if self.last_finished_at else None,
            "last_success_at": self.last_success_at.isoformat() if self.last_success_at else None,
            "last_failure_at": self.last_failure_at.isoformat() if self.last_failure_at else None,
            "last_status": self.last_status,
            "last_error": self.last_error,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Open Banking skeleton
class BankConnection(db.Model):
    __tablename__ = "bank_connections"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    provider = db.Column(db.String(64), nullable=False)
    external_institution_id = db.Column(db.String(255), nullable=True)
    account_number_masked = db.Column(db.String(20), nullable=True)
    institution_name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(32), nullable=False, default="active")
    # OAuth credentials — encrypted at rest with AES-256-GCM.
    # Populated when a real Open Banking provider is wired (ENABLE_OPEN_BANKING=true).
    access_token = db.Column(EncryptedString, nullable=True)
    refresh_token = db.Column(EncryptedString, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_synced_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "provider",
            "institution_name",
            name="uq_bank_connections_user_provider_institution",
        ),
        db.Index("ix_bank_connections_user_status", "user_id", "status"),
    )

    def to_dict(self) -> BankConnectionDict:
        return {
            "id": self.id,
            "provider": self.provider,
            "account_number_masked": self.account_number_masked,
            "institution_name": self.institution_name,
            "status": self.status,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }


class BankConsent(db.Model):
    __tablename__ = "bank_consents"

    id = db.Column(db.Integer, primary_key=True)
    connection_id = db.Column(
        db.Integer,
        db.ForeignKey("bank_connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    scopes = db.Column(db.Text, nullable=False, default='["transactions:read"]')
    purpose_of_use = db.Column(db.String(512), nullable=False, default="Personal financial analytics")
    consent_reference = db.Column(db.String(128), nullable=True)
    data_recipient_name = db.Column(db.String(255), nullable=False, default="Personal Statera")
    scope_description = db.Column(
        db.Text,
        nullable=False,
        default="Read-only access to transaction history for analytics",
    )
    ip_address_granted = db.Column(db.String(64), nullable=True)
    user_agent_granted = db.Column(db.String(255), nullable=True)
    granted_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="active")

    def to_dict(self) -> BankConsentDict:
        scopes: list[str] = []
        try:
            parsed = json.loads(self.scopes or "[]")
            if isinstance(parsed, list):
                scopes = [str(item) for item in parsed if item]
        except Exception:  # noqa: BLE001 - legacy JSON payloads should degrade to an empty serialized shape instead of crashing.
            scopes = []

        return {
            "id": self.id,
            "connection_id": self.connection_id,
            "user_id": self.user_id,
            "scopes": scopes,
            "purpose_of_use": self.purpose_of_use,
            "scope_description": self.scope_description,
            "consent_reference": self.consent_reference,
            "data_recipient_name": self.data_recipient_name,
            "ip_address_granted": self.ip_address_granted,
            "user_agent_granted": self.user_agent_granted,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "status": self.status,
        }


class BankSyncRun(db.Model):
    __tablename__ = "bank_sync_runs"

    id = db.Column(db.Integer, primary_key=True)
    connection_id = db.Column(
        db.Integer,
        db.ForeignKey("bank_connections.id"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String(32), nullable=False, default="staged")
    provider_cursor = db.Column(db.String(255), nullable=True)
    staged_count = db.Column(db.Integer, nullable=False, default=0)
    committed_count = db.Column(db.Integer, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    committed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    abandoned_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.Index("ix_bank_sync_runs_user_status", "user_id", "status"),
        db.Index("ix_bank_sync_runs_created_at", "created_at"),
    )


class RawBankTransaction(db.Model):
    __tablename__ = "raw_bank_transactions"

    id = db.Column(db.Integer, primary_key=True)
    connection_id = db.Column(
        db.Integer,
        db.ForeignKey("bank_connections.id"),
        nullable=False,
        index=True,
    )
    sync_run_id = db.Column(
        db.Integer,
        db.ForeignKey("bank_sync_runs.id"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    provider_tx_id = db.Column(db.String(255), nullable=False)
    date = db.Column(db.Date, nullable=False)
    description = db.Column(db.String(128), nullable=False)
    amount_kd = db.Column(db.Numeric(10, 3), nullable=False)
    raw_payload_hash = db.Column(db.String(64), nullable=True)
    category_hint = db.Column(db.String(64), nullable=True)
    merchant_hint = db.Column(db.String(64), nullable=True)
    status = db.Column(db.String(32), nullable=False, default="staged")
    transaction_id = db.Column(db.Integer, db.ForeignKey("transactions.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        db.UniqueConstraint(
            "connection_id",
            "provider_tx_id",
            name="uq_raw_bank_txn_connection_provider_id",
        ),
        db.Index("ix_raw_bank_txns_created_at", "created_at"),
    )


class DataAccessLog(db.Model):
    __tablename__ = "data_access_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    connection_id = db.Column(db.Integer, db.ForeignKey("bank_connections.id"), nullable=True, index=True)
    consent_id = db.Column(db.Integer, db.ForeignKey("bank_consents.id"), nullable=True, index=True)
    action = db.Column(db.String(64), nullable=False, index=True)
    records_accessed = db.Column(db.Integer, nullable=False, default=0)
    date_range_start = db.Column(db.Date, nullable=True)
    date_range_end = db.Column(db.Date, nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        db.Index("ix_data_access_logs_user_connection_created", "user_id", "connection_id", "created_at"),
    )

    def to_dict(self) -> DataAccessLogDict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "connection_id": self.connection_id,
            "consent_id": self.consent_id,
            "action": self.action,
            "records_accessed": int(self.records_accessed or 0),
            "date_range_start": self.date_range_start.isoformat() if self.date_range_start else None,
            "date_range_end": self.date_range_end.isoformat() if self.date_range_end else None,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
