# Discovery Report: Memorized Transactions, Categories, Merchants, Archive

> **Scope note:** All citations are from the active monorepo at the repo root (`personal_statera/`). Where the DevLocal codebase at `/Users/khaledalrashidi/DevLocal/personal-finance/` differs, the difference is called out explicitly. All paths below are relative to the monorepo root.

---

## A. Memorized Transactions

### A.1 — Where the feature lives

**Backend routes** (`backend/routes/memorized.py`):
- `GET  /api/memorized-transactions` — list (paginated, filterable by count)
- `POST /api/memorized-transactions` — manual add
- `POST /api/memorized-transactions/<id>/update` — edit
- `POST /api/memorized-transactions/<id>/delete` — delete

**Autosuggest routes** (`backend/routes/analytics/__init__.py`):
- `GET /api/transaction-suggestions` — primary autosuggest, queries `memorized_transactions`
- `GET /api/transaction-template-suggestions` — secondary, queries `transactions` table

**Service/logic** (`backend/lib/suggestions.py`):
- `learn_transaction()` — called whenever a transaction is saved; upserts a memorized row
- `suggest_transactions()` — called by the autosuggest endpoint
- `prune_all_stale_memorized_transactions()` — called by the background worker

**Frontend** (`frontend/src/components/pages/transactions/SettingsDialog.tsx`):
- `ManageMemorized` component starts at line 465 — shown under the "Memorized" tab
- Opened from `TransactionsPage.tsx` via the `SettingsDialog` component (the "Categories & Merchants" gear button)

The three-tab dialog is declared at `SettingsDialog.tsx:926–976`:
```tsx
const [tab, setTab] = useState<"categories" | "merchants" | "memorized">(...)
// ...
<ManageCategories onRefresh={onRefresh} />
<ManageMerchants merchants={merchants} onRefresh={onRefresh} />
<ManageMemorized categories={categoryNames} />
```

---

### A.2 — Stored entity or computed on the fly?

**Stored entity** — its own `memorized_transactions` table.

`backend/models.py:605–634`:
```python
class MemorizedTransaction(db.Model):
    __tablename__ = "memorized_transactions"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    canonical  = db.Column(db.String(255), nullable=False)
    norm       = db.Column(db.String(255), nullable=False, index=True)
    category   = db.Column(db.String(64))
    merchant   = db.Column(db.String(128))
    count      = db.Column(db.Integer, nullable=False, default=1)
    last_seen  = db.Column(db.DateTime(timezone=True), nullable=False, ...)
    is_pinned  = db.Column(db.Boolean, nullable=False, server_default="false", default=False)
    pinned_at  = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "norm", name="uq_memorized_user_norm"),
    )
```

---

### A.3 — Where the "must be entered twice" rule is enforced

The threshold is defined in `backend/constants.py:44`:
```python
MEMORIZED_MIN_VISIBLE_COUNT = 2
```

It is enforced in **two places**, and notably **not** in autosuggest:

**1. GET list** (`backend/routes/memorized.py:42–46`) — hides singletons from the management tab by default:
```python
include_singletons = (request.args.get("include_singletons") or "").strip().lower() in ("1", "true", "yes")
# ...
if not include_singletons:
    query = query.filter(MemorizedTransaction.count >= MEMORIZED_MIN_VISIBLE_COUNT)
```

**2. Manual add** (`backend/routes/memorized.py:127`) — manually added entries start at count=2, making them immediately visible:
```python
count=MEMORIZED_MIN_VISIBLE_COUNT,
```

**How a transaction is learned:** `learn_transaction()` at `backend/lib/suggestions.py:187–215` starts new rows at `count=1` and increments on each subsequent save. So a name first seen goes into the table hidden (count=1); after the second save (count=2) it becomes visible in the management list.

---

### A.4 — Fields on a memorized transaction

| Field | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `user_id` | FK → users.id | non-nullable |
| `canonical` | String(255) | display name |
| `norm` | String(255) | normalized form for dedup/matching |
| `category` | String(64) | nullable; **not a FK** — plain string |
| `merchant` | String(128) | nullable; **not a FK** — plain string |
| `count` | Integer | number of times learned |
| `last_seen` | DateTime | updated on each learn call |
| `is_pinned` | Boolean | monorepo only; pinned rows are exempt from pruning |
| `pinned_at` | DateTime | monorepo only |

`amount` and `memo` are **not stored** on a memorized transaction.

---

### A.5 — How autosuggest works when logging a new transaction

**Endpoint:** `GET /api/transaction-suggestions?q=<text>&limit=12`

The frontend calls this from `frontend/src/components/pages/transactions/helpers.ts` (triggers when `q.length >= 2`) and from `frontend/src/components/pages/ExpensesPage.tsx`.

**Source data:** The `memorized_transactions` table directly. `suggest_transactions()` at `backend/lib/suggestions.py:218–236`:
```python
rows = (
    MemorizedTransaction.query
    .filter(or_(
        MemorizedTransaction.norm.like(like_norm),
        MemorizedTransaction.canonical.ilike(like_can)
    ))
    .filter(MemorizedTransaction.user_id == user_id)
    .order_by(MemorizedTransaction.count.desc(), MemorizedTransaction.last_seen.desc())
    .limit(limit)
    .all()
)
```

**Two-occurrence rule applied to autosuggest?** No. `suggest_transactions()` has no `count >= MEMORIZED_MIN_VISIBLE_COUNT` filter. A name seen only once will appear in autosuggest.

There is a second, separate autosuggest path: `GET /api/transaction-template-suggestions` pulls from the `transactions` table itself (scored via `TemplateSuggestionFeedback`), not from `memorized_transactions`.

---

### A.6 — Can users delete or edit a memorized transaction from the UI?

Yes — both are fully implemented.

**Edit:** `POST /api/memorized-transactions/<id>/update` (backend) → `memorizedApi.update(editingId, {...})` at `SettingsDialog.tsx` around line 574. The "Edit" button appears at line 571 of `SettingsDialog.tsx`.

**Delete:** `POST /api/memorized-transactions/<id>/delete` (backend) → `memorizedApi.delete(confirmDelId)` at `SettingsDialog.tsx` around line 597. A confirmation dialog is shown before deletion.

---

## B. Categories

### B.1 — Category model (full definition)

`backend/models.py:273–306`:
```python
class Category(db.Model):
    __tablename__ = "categories"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    name        = db.Column(db.String(64), nullable=False, index=True)
    # NULL is treated as False (not income) for backward compatibility
    is_income   = db.Column(db.Boolean, nullable=True, default=False)
    # Soft-archive: archived categories are hidden from pickers but preserved on
    # historical transactions. Only user-owned categories may be archived;
    # global categories (user_id IS NULL) are never archived.
    is_archived = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_category_user_name"),
        db.Index("ix_categories_user_id_is_archived", "user_id", "is_archived"),
    )

    def to_dict(self) -> CategoryDict:
        is_global = self.user_id is None
        return {
            "id": self.id,
            "name": self.name,
            "scope": "global" if is_global else "user",
            "is_global": is_global,
            "is_income": bool(self.is_income) if self.is_income is not None else False,
            "is_archived": bool(self.is_archived),
        }
```

---

### B.2 — user_id column: nullable? What does NULL mean?

`user_id` is **nullable** (`nullable=True`). `NULL` means the category is **global** — shared across all users. The model derives `is_global = self.user_id is None` in `to_dict()`. The inline comment at `backend/models.py:283–285` states: "global categories (user_id IS NULL) are never archived."

---

### B.3 — How are global/seed categories created?

**There is no startup seed or migration that bulk-inserts a predefined global category list.**

- The initial schema migration creates the `categories` table only — no INSERT statements.
- One migration's **downgrade path only** (`migrations/versions/bbdbd2eca33b`) inserts a single global `Uncategorized` row when rolling back. This never runs forward.
- A deprecated CLI command `globalize-taxonomy` (`backend/cli.py`) suggests an older batch-globalization process; the command still exists in source but is no longer part of any normal flow.
- `get_or_create_category()` in `backend/lib/categories.py` requires a non-None `user_id`. The `POST /api/categories` route always sets `user_id=current_user.id`. Tests confirm a user cannot create a global category via API.
- The demo workspace (`backend/lib/demo_data.py`) creates **user-scoped** categories — they appear global only in terms of naming convention (see E.1 for the list).

In practice, **zero global categories** are pre-seeded in the normal operation path.

---

### B.4 — Where does the frontend fetch categories for pickers?

Two distinct fetches:

| Use | Method | Endpoint | Filter |
|---|---|---|---|
| All pickers (TransactionsPage, ExpensesPage, QuickAdd, budget forms) | `categoriesApi.list()` | `GET /api/categories` | Active (non-archived) globals + user-owned |
| Management tab in SettingsDialog | `categoriesApi.listAll()` | `GET /api/categories?include_archived=true` | All including archived |

Callers of `categoriesApi.list`:
- `frontend/src/contexts/QuickAddContext.tsx:28`
- `frontend/src/components/pages/ExpensesPage.tsx:606`
- `frontend/src/components/pages/TransactionsPage.tsx:72`
- `frontend/src/components/pages/budget/hooks.ts:112`

Backend logic: `backend/lib/categories.py:70–93` (`list_categories_for_user`) returns rows where `user_id == current_user OR user_id IS NULL`, deduped by normalized name with user-owned rows shadowing globals of the same name.

---

### B.5 — Category foreign keys in other tables

| Table / Model | Column | Type | Behavior |
|---|---|---|---|
| `transactions` | `category_id` | FK → categories.id, **nullable** | NULL = uncategorized |
| `budgets` | `category_id` | FK → categories.id, **non-nullable** | Required |
| `savings_goals` | `linked_category_id` | FK → categories.id, `ondelete="SET NULL"`, nullable | Clears on category delete |
| `memorized_transactions` | `category` | String(64), **no FK** | Denormalized string — stale if category renamed/deleted |

No FK from `merchants` to `categories`.

---

## C. Archive

### C.1 — Archive columns on Category

`backend/models.py:286–287`:
```python
is_archived = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
archived_at = db.Column(db.DateTime(timezone=True), nullable=True)
```

---

### C.2 — Behavioral effect of archiving

**Hidden from pickers:** `list_categories_for_user()` at `backend/lib/categories.py:82–83` applies `Category.is_archived.is_(False)` by default. All normal pickers call `categoriesApi.list()` which hits this filter.

**Preserved on historical transactions:** The category row is never deleted. `transactions.category_id` is not cascaded or nulled. Route docstring at `backend/routes/categories.py:93–97` confirms: "Historical transactions retain their category reference so analytics remain accurate."

**Can be unarchived:** Yes. `POST /api/categories/<id>/restore` at `backend/routes/categories.py:135–162` sets `is_archived=False, archived_at=None`. The frontend "Restore" button is in `SettingsDialog.tsx` in the `ManageCategories` section.

---

### C.3 — Where archive logic is enforced

- **Service layer:** `backend/lib/categories.py:82–83` — default filter in `list_categories_for_user()`
- **Route — GET list:** `backend/routes/categories.py:62–63` — reads `include_archived` query param to toggle
- **Route — remap:** `backend/routes/categories.py:198–200` — rejects archiving to an already-archived target
- **Frontend — management view:** `SettingsDialog.tsx:79` — uses `categoriesApi.listAll()` (includes archived) so users can restore them
- **Frontend — remap target dropdown:** `SettingsDialog.tsx` filters `!category.is_archived` when building the target list for the "Merge into..." dialog

---

### C.4 — Other archivable entities

Only **Category** has `is_archived` / `archived_at` columns. `Merchant`, `Transaction`, `Budget`, and (in the DevLocal version) `MemorizedTransaction` have no archive columns. The monorepo's `MemorizedTransaction` has `is_pinned` / `pinned_at` (a different concept — prevents pruning, not a user-visible hide).

---

## D. Merchants

### D.1 — First-class entity or string field?

**First-class entity** with its own `merchants` table.

---

### D.2 — Model

`backend/models.py:309–330`:
```python
class Merchant(db.Model):
    __tablename__ = "merchants"

    id      = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    name    = db.Column(db.String(128), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_merchant_user_name"),
    )
```

`Transaction.merchant_id` is a nullable FK to `merchants.id` (`backend/models.py:341`). Like categories, `user_id IS NULL` means global.

---

### D.3 — Merchant autosuggest

There is **no per-keystroke merchant lookup endpoint**. The frontend fetches the full merchant list at page load via `GET /api/merchants` and passes the names as a string array to form components as a datalist.

`frontend/src/components/pages/TransactionsPage.tsx:82`:
```tsx
queryFn: merchantsApi.list,
```

The resulting `merchantNames` string array is passed down to transaction dialogs, which render a standard `<datalist>` or combobox from it.

---

### D.4 — Rename and delete

**Delete (UI + backend):** `POST /api/merchants/<id>/delete` in `backend/routes/merchants.py`. Deleting NULLs `merchant_id` on all transactions that reference it. Global merchants (`user_id IS NULL`) cannot be deleted (returns 403). Frontend "Delete" button is at `SettingsDialog.tsx` around line 434 in `ManageMerchants`.

**Rename (backend only):** `POST /api/merchants/<id>/update` route exists in `backend/routes/merchants.py`, and `merchantsApi.update(id, name)` exists in `frontend/src/lib/api.ts:432–436`. **However, there is no rename UI** in `ManageMerchants` — the component only renders Add and Delete. The `merchantsApi.update` function is dead code from the frontend's perspective.

---

## E. Cross-cutting

### E.1 — Roughly how many global categories in the default seed?

**Zero** — no global categories are pre-seeded in the normal operation path (see B.3).

The demo workspace (`backend/lib/demo_data.py`) seeds approximately **13 user-scoped** category names per demo user:
`Income: Salary`, `Housing`, `Groceries`, `Utilities`, `Dining`, `Transport`, `Entertainment`, `Health`, `Shopping`, `Household`, `Gifts`, `Income: Freelance`, `Income: Cashback`.

These are user-owned rows (not globals), so each demo user gets their own copy.

---

### E.2 — How many users in dev/prod?

Not determinable from code alone.

---

### E.3 — Background jobs touching categories, memorized transactions, or merchants

**Memorized transactions — YES:**
- `backend/worker.py:59–60` schedules `backend.tasks.cleanup_memorized_transactions` every 6 hours (configurable via `MAINT_MEMORIZED_CLEANUP_SECONDS`).
- The task calls `prune_all_stale_memorized_transactions()` at `backend/lib/suggestions.py:128–156`.
- Current prune rule (monorepo): deletes rows where `is_pinned=FALSE AND count <= 2 AND last_seen < (now - 90 days)`.
- Pinned rows (`is_pinned=True`) are **never pruned**.

**Categories — No** background job touches categories.

**Merchants — No** background job touches merchants.

---

### E.4 — Merge / reassign features

**Categories — YES, full remap implemented:**
- Backend: `POST /api/categories/<source_id>/remap` at `backend/routes/categories.py:165`. Reassigns all `transactions.category_id` from source → target, updates `savings_goals.linked_category_id`, and optionally archives the source.
- Frontend: "Merge into…" button in `ManageCategories` at `SettingsDialog.tsx`. Opens a dialog labeled "Merge Category" with a target picker restricted to active categories.

**Merchants — No merge.** Deleting a merchant NULLs the FK on transactions; there is no endpoint to reassign all of merchant A's transactions to merchant B.

**Transactions — No merge.** A split (`POST /api/transactions/<id>/split`) exists, but no merge.

---

## Open Questions for the Human

1. **Two-occurrence visibility threshold:** `MEMORIZED_MIN_VISIBLE_COUNT = 2` means a transaction name first saved is hidden from the management list until logged a second time — but it *does* appear in autosuggest immediately. Is this intended UX ("autosuggest learns fast, management list stays clean"), or is it an accidental inconsistency? The answer affects whether the threshold should be unified, raised, or exposed to users.

2. **Stale strings in memorized transactions:** `memorized_transactions.category` and `.merchant` are plain strings (not FKs). Renaming, archiving, or deleting a category or merchant does not update these stored strings. Should memorized entries be kept in sync (cascade renames), or is the stale-name behavior acceptable on the grounds that the memorized entry just pre-fills a field the user can correct?

3. **Budgets and archived categories:** `budgets.category_id` is the only non-nullable FK to categories. Archiving a category today does not cascade to its linked budget — the budget silently references a hidden category. Should archiving a category that has an active budget be blocked, warned, or automatically handled?

4. **Merchant delete NULLs transactions, but there's no "merge" path:** If a user has 200 transactions tagged to merchant "Starbucks" and wants to merge them into "Starbucks Kuwait", they must: delete "Starbucks" (which clears all 200 merchant_id values), then manually re-tag. Should merchant merge/reassign be added alongside the existing category remap before any cleanup UI work begins?

5. **The "global" concept for categories and merchants:** In practice, zero global categories and zero global merchants are pre-seeded in production. The `user_id IS NULL` design exists but is unused in the forward path (only in a migration downgrade and a deprecated CLI). Is this a vestigial abstraction to remove, or is it intentionally reserved for a future "system default" feature?

---

## Incidental Findings

- **`merchantsApi.update` is dead frontend code:** `frontend/src/lib/api.ts:432–436` defines `merchantsApi.update(id, name)` which calls `POST /api/merchants/<id>/update`, but nothing in `SettingsDialog.tsx` or elsewhere calls it. The rename capability exists end-to-end except for the UI trigger.

- **Prune logic divergence between the two codebases:** The monorepo's `prune_all_stale_memorized_transactions()` (`backend/lib/suggestions.py:128`) was rewritten and now only prunes rows where `count <= 2 AND last_seen < 90 days AND is_pinned=False`. The DevLocal version may retain the older two-clause logic (also deleting all rows seen > 180 days ago regardless of count). If the DevLocal codebase is ever merged or deployed separately, high-count memorized entries could be silently deleted.
