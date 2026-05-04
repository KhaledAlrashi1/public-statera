"""Category and merchant lookup helpers."""

from __future__ import annotations

from typing import List

from sqlalchemy.sql import func

from backend import db
from backend.constants import UNCAT_NAME


def _norm_name(name: str | None) -> str:
    return " ".join((name or "").split()).lower()


def _require_user_scope(user_id: int | None) -> int:
    if user_id is None:
        raise ValueError("user_id is required for category creation.")
    return int(user_id)


def is_income_category_name(name: str | None) -> bool:
    """Best-effort legacy detection for income categories by name prefix."""
    return _norm_name(name).startswith("income")


def find_category_by_name(name: str | None, user_id: int):
    """Find a user-owned category by exact case-insensitive name."""
    from backend.models import Category

    nm = (name or "").strip()
    if not nm:
        return None
    return (
        Category.query
        .filter(Category.user_id == user_id)
        .filter(func.lower(Category.name) == nm.lower())
        .order_by(Category.id.asc())
        .first()
    )


# Alias kept for call sites that used the old name.
find_user_category_by_name = find_category_by_name


def list_categories_for_user(user_id: int):
    """List all categories owned by the user, sorted alphabetically."""
    from backend.models import Category

    return (
        Category.query
        .filter(Category.user_id == user_id)
        .order_by(func.lower(Category.name).asc(), Category.id.asc())
        .all()
    )


def _find_entity_ids_by_exact_name(model, name: str | None, user_id: int) -> List[int]:
    """Find entity ids by exact case-insensitive name for the given user."""
    nm = (name or "").strip()
    if not nm:
        return []
    rows = (
        model.query
        .with_entities(model.id)
        .filter(model.user_id == user_id)
        .filter(func.lower(model.name) == nm.lower())
        .all()
    )
    return [row[0] for row in rows]


def find_category_ids_by_name(name: str | None, user_id: int) -> List[int]:
    """Find all category ids for an exact name match."""
    from backend.models import Category

    return _find_entity_ids_by_exact_name(Category, name, user_id)


def find_merchant_by_name(name: str | None, user_id: int):
    """Find a user-owned merchant by exact case-insensitive name."""
    from backend.models import Merchant

    nm = (name or "").strip()
    if not nm:
        return None
    return (
        Merchant.query
        .filter(Merchant.user_id == user_id)
        .filter(func.lower(Merchant.name) == nm.lower())
        .order_by(Merchant.id.asc())
        .first()
    )


def list_merchants_for_user(user_id: int):
    """List all merchants owned by the user, sorted alphabetically."""
    from backend.models import Merchant

    return (
        Merchant.query
        .filter(Merchant.user_id == user_id)
        .order_by(func.lower(Merchant.name).asc(), Merchant.id.asc())
        .all()
    )


def find_merchant_ids_by_name(name: str | None, user_id: int) -> List[int]:
    """Find all merchant ids for an exact name match."""
    from backend.models import Merchant

    return _find_entity_ids_by_exact_name(Merchant, name, user_id)


def get_or_create_category(name: str | None, user_id: int):
    """Get or create a user-owned category. Returns None when name is empty or 'Uncategorized'."""
    from backend.models import Category

    scoped_user_id = _require_user_scope(user_id)
    nm = (name or "").strip()
    if not nm or nm.lower() == UNCAT_NAME.lower():
        return None
    cat = find_category_by_name(nm, scoped_user_id)
    if cat:
        return cat
    cat = Category(name=nm, user_id=scoped_user_id, is_income=is_income_category_name(nm))
    db.session.add(cat)
    db.session.flush()
    return cat


# Alias kept for call sites that used the old name.
get_or_create_user_category = get_or_create_category


def get_uncategorized(user_id: int):
    """Get or create the system Uncategorized category for this user."""
    from backend.models import Category

    scoped_user_id = _require_user_scope(user_id)
    cat = find_category_by_name(UNCAT_NAME, scoped_user_id)
    if cat:
        return cat
    cat = Category(name=UNCAT_NAME, user_id=scoped_user_id, is_income=False, is_system=True)
    db.session.add(cat)
    db.session.flush()
    return cat


def get_or_create_merchant(name: str | None, user_id: int):
    """Get or create a merchant by name. Returns None if name is empty."""
    from backend.models import Merchant

    nm = (name or "").strip()
    if not nm:
        return None
    merchant = find_merchant_by_name(nm, user_id)
    if merchant:
        return merchant
    merchant = Merchant(name=nm, user_id=user_id)
    db.session.add(merchant)
    db.session.flush()
    return merchant
