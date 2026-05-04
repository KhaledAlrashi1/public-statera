"""Shared validation primitives for backend library and route modules."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Sequence, TypeAlias

CategoryName: TypeAlias = str | None
CategoryNameSequence: TypeAlias = Sequence[CategoryName]


class ValidationError(Exception):
    """Custom exception for validation errors.

    Carries an optional ``error_code`` string for API error responses.
    """

    def __init__(self, message: str, error_code: str | None = None) -> None:
        super().__init__(message)
        self.error_code = error_code or "validation_error"


def parse_date(date_str: str) -> date:
    """Parse a YYYY-MM-DD date string.

    Raises ``ValueError`` with a descriptive message on invalid input.
    """
    from backend.lib.importer import _parse_date  # local import to avoid circular deps
    try:
        return _parse_date(date_str)
    except (ValueError, TypeError) as exc:
        if "date is required" in str(exc).lower():
            raise ValueError("Date is required") from exc
        raise ValueError(f"Invalid date format: {exc}") from exc


def _resolve_is_income(category_name: CategoryName, user_id: int) -> bool:
    """Look up a category by name and return its is_income value.

    Falls back to False (expense) when the category cannot be found — which
    matches the application-wide NULL-is-False convention.
    """
    from backend.lib.categories import find_category_by_name

    cat = find_category_by_name(category_name, user_id)
    if cat is None:
        return False
    return bool(cat.is_income) if cat.is_income is not None else False


def validate_split_direction_consistency(
    parent_category_name: CategoryName,
    item_category_names: CategoryNameSequence,
    user_id: int,
) -> None:
    """Raise ``ValidationError`` when item categories mix income and expense.

    Rule: all items in a split must share the same direction (income or
    expense) as the parent transaction's category.  A transaction cannot be
    simultaneously an income entry and an expense entry.

    Args:
        parent_category_name: The category name on the parent transaction.
        item_category_names:  Category names for each line item.
        user_id:              The owning user — needed to scope the category lookup.

    Raises:
        ValidationError with code ``split_mixed_direction`` on a violation.
    """
    if not item_category_names:
        return

    parent_is_income = _resolve_is_income(parent_category_name, user_id)

    offending: list[str] = []
    for cat_name in item_category_names:
        item_is_income = _resolve_is_income(cat_name, user_id)
        if item_is_income != parent_is_income:
            offending.append(str(cat_name or "Uncategorized"))

    if offending:
        direction_label = "income" if parent_is_income else "expense"
        raise ValidationError(
            f"Split items must all be {direction_label} transactions. "
            f"The following item categories have a different direction: "
            f"{', '.join(offending)}. "
            f"Mixing income and expense items in a single transaction is not allowed.",
            "split_mixed_direction",
        )


def parse_positive_amount(value_str: str | None) -> Decimal:
    """Parse and validate a positive decimal amount string.

    Raises ``ValueError`` when the value can't be parsed or is <= 0.
    Raises ``ValueError`` when the value exceeds the maximum (999999.999).
    """
    from backend.lib.importer import _parse_amount  # local import to avoid circular deps
    try:
        amount = _parse_amount(value_str)
    except ValueError as exc:
        if "more than 3 decimal places" in str(exc).lower():
            raise ValueError(str(exc)) from exc
        raise ValueError(f"Invalid amount: {exc}") from exc
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"Invalid amount: {exc}") from exc
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    if amount > Decimal("999999.999"):
        raise ValueError("Amount too large (max 999999.999)")
    return amount
