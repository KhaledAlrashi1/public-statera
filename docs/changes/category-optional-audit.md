# Category-Optional Audit

**Date:** 2026-04-28
**Scope:** All places in `backend/` where a transaction's category is written, defaulted, or read.
**Purpose:** Pre-change baseline for making `category_id` nullable and stopping the storage of `'Uncategorized'` as a value.

---

## 1. Category write sites

### 1a. Create endpoint — `backend/routes/transactions.py:870`
Flow: `validate_transaction_input(payload)` in `backend/lib/transactions.py:22`.
- Line 35: `category_name = (data.get("category") or "").strip()`
- Line 36–37: **raises ValidationError if empty** ("Category is required")
- Returns `result["category_name"]`
- Caller passes `category_name` to `create_transaction_with_dup_check()`.

### 1b. `create_transaction_with_dup_check` — `backend/lib/transactions.py:119`
- Line 121: `category_name: str` (required, non-optional)
- Line 132: **returns error if `not category_name`** ("Category and name are required")
- Line 135: `category = get_or_create_category(category_name, user_id)`
- Line 158: `category_id=category.id`
- Line 172: `learn_transaction(name, user_id, category.name, ...)`

### 1c. Update endpoint — `backend/routes/transactions.py:315`
- Line 328: `cat_name = (payload.get("category") or "").strip()`
- Line 335–336: **raises ValueError if not (cat_name and nm)** ("Category and name are required")
- Line 343: `cat = get_or_create_category(cat_name, current_user.id)`
- Line 347: `txn.category_id = cat.id`
- Line 354: `learn_transaction(txn.name, current_user.id, cat.name, ...)`

### 1d. CSV/Excel import — `backend/routes/upload.py:300` and `backend/lib/importer.py`
- `_validate_import_row` (upload.py:300): `category = str(raw_row.get("category") or "").strip() or UNCAT_NAME`
- `_persist_planned_row` (upload.py:964): `category = _get_or_create_category_cached(cache, name=row.category, user_id=user_id)` → `category.id`, `category.name`
- `_get_or_create_category_cached` (upload.py:928): key = name or UNCAT_NAME; calls `get_or_create_user_category`
- `importer.py:253`: `df["category"] = UNCAT_NAME` (user-mapping path, column absent)
- `importer.py:300`: `df["category"] = UNCAT_NAME` (auto-detect path, column absent)
- `importer.py:410–411`: `if not category: category = UNCAT_NAME` (preview path)

### 1e. iMessage ingestion — `backend/routes/messages.py:227`
- `"category": UNCAT_NAME.lower()` — **hardcoded to 'uncategorized'**
- Category string is passed to the front-end preview; it is committed via the standard CSV import commit path.

### 1f. Bank sync commit — `backend/routes/bank.py:1021,1037`
- Line 1021: `default_category = (payload.get("default_category") or UNCAT_NAME).strip()[:64] or UNCAT_NAME`
- Line 1037: `category_name = (row.category_hint or default_category).strip()[:64] or default_category`
- Passes `category_name` to `create_transaction_with_dup_check`.

### 1g. `learn_transaction` — `backend/lib/suggestions.py:196`
- `real_category = category if (category and category != UNCAT_NAME) else None`
- Already converts UNCAT_NAME to None. **No change needed here.**

---

## 2. Sites that default to 'Uncategorized' — all must change

| File | Line | Code | Action |
|---|---|---|---|
| `lib/categories.py` | 167 | `nm = (name or "").strip() or UNCAT_NAME` | Return None when empty |
| `lib/categories.py` | 185 | `nm = (name or "").strip() or UNCAT_NAME` | Return None when empty |
| `lib/transactions.py` | 36–37 | `if not category_name: errors.append("Category is required")` | Remove; category optional |
| `lib/transactions.py` | 132 | `if not category_name or not name: return error` | Only require name |
| `routes/upload.py` | 300 | `... or UNCAT_NAME` | Allow empty |
| `routes/messages.py` | 227 | `"category": UNCAT_NAME.lower()` | Use `""` |
| `routes/bank.py` | 1021 | `... or UNCAT_NAME` (twice) | Allow empty/None |
| `lib/importer.py` | 253 | `df["category"] = UNCAT_NAME` | Use `""` |
| `lib/importer.py` | 300 | `df["category"] = UNCAT_NAME` | Use `""` |
| `lib/importer.py` | 411 | `category = UNCAT_NAME` | Use `""` |
| `routes/transactions.py` | 335–336 | `if not (cat_name and nm): raise` | Only require nm |
| `routes/transactions.py` | 339 | `cat_name = ... else UNCAT_NAME` (fallback for non-summary updates) | Use `""` |

---

## 3. Schema — `transactions.category_id`

**File:** `backend/models.py:344`
```python
category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False, index=True)
```
**Status: NOT NULLABLE.** A migration is required.

**Initial creation:** `migrations/versions/562edd0d5f2b_initial_schema.py` — created as NOT NULL.

---

## 4. Read sites (analytics, display, filtering)

All of these use UNCAT_NAME as a *display* fallback. None of them crash on NULL. No changes required for correctness, but they are documented for completeness.

| File | Line(s) | Pattern |
|---|---|---|
| `backend/models.py` | 386 | `self.category_rel.name if self.category_rel else UNCAT_NAME` — display in `to_dict()` |
| `backend/models.py` | 452 | Same pattern in `Budget.to_dict()` |
| `backend/routes/transactions.py` | 685, 816 | `cat_name or UNCAT_NAME` — transaction list/by-category display |
| `backend/routes/transactions.py` | 1276 | `tx.category_rel.name if tx.category_rel else UNCAT_NAME` — CSV export |
| `backend/routes/analytics/overview.py` | 145, 153, 154, 165, 386, 394, 444 | `func.coalesce(Category.name, UNCAT_NAME)` — SQL display aggregation |
| `backend/routes/analytics/spending.py` | 27, 34, 35, 85, 93, 217, 236, 256 | `func.coalesce(Category.name, UNCAT_NAME)` — spending breakdown display |
| `backend/routes/analytics/dashboard.py` | 223 | `category = cat_name or UNCAT_NAME` — dashboard display |
| `backend/routes/analytics/digest.py` | 54 | `key = str(category_name or "").strip().lower()` — safe |
| `backend/routes/analytics/shared.py` | 225 | `str(category_name or "").lower()` — safe |
| `backend/lib/suggestions.py` | 297 | `(category_name or UNCAT_NAME).strip()` — template suggestion display |
| `backend/routes/categories.py` | 107, 191 | `get_uncategorized(user_id)` — used to block archiving/remapping of UNCAT |

---

## 5. Potential crash sites if category is NULL

After audit: **no crash sites found.** All string operations on category values use safe patterns (`or ""`, `or UNCAT_NAME`, `if self.category_rel else`). The one site that does require fixing for nullability is:

- `upload.py:946`: `int(txn.category_id or 0) != int(category_id)` — if `category_id` parameter is None, `int(None)` raises `TypeError`. Fix: `int(category_id or 0)`.
- `upload.py:983,989,1002,1015`: `category.id` and `category.name` — if `category` is None after the nullable fix to `_get_or_create_category_cached`, these crash. Fix: guard with `if category`.

---

## 6. Cross-cutting note on `get_uncategorized()`

`get_uncategorized()` in `lib/categories.py:195` calls `get_or_create_category(UNCAT_NAME, user_id)`. After the Section 1 change makes `get_or_create_category` return None for UNCAT_NAME inputs, `get_uncategorized()` must be reimplemented to not use `get_or_create_category` as a delegate. It is used only in `routes/categories.py` (archive/remap guards) — not in any transaction write path.
