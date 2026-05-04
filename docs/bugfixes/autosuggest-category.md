# Bug Diagnosis: Auto-suggestion does not populate category

**Reported symptom:** When the user picks an auto-suggestion in the transaction form,
the merchant field fills but the category field stays as "Uncategorized."

---

## 1 — Frontend suggestion API and type

**API call** (`frontend/src/lib/api.ts:587`):
```ts
transactionsApi.suggestions: (q: string, limit = 12) =>
  apiFetch<{ items: TransactionSuggestion[] }>(
    `/api/transaction-suggestions?q=...&limit=...`
  )
```

**Type** (`frontend/src/types/api.ts:266`):
```ts
export interface TransactionSuggestion {
  name: string
  category: string    // typed as string, but the backend can return null
  merchant: string
}
```

The type claims `category` is always a non-null string. At runtime the backend can return
`null` — this is a latent type-safety hole that hides the bug from the TypeScript compiler.

---

## 2 — Backend endpoint and response shape

**Route** (`backend/routes/analytics/__init__.py:662`):
```python
@bp.route("/api/transaction-suggestions")
@login_required
def api_transaction_suggestions():
    items = suggest_transactions(query, current_user.id, limit=limit)
    return ok_response(data={"items": items}, ...)
```

**Core function** (`backend/lib/suggestions.py:182`):
```python
def suggest_transactions(q, user_id, limit=10) -> List[Dict]:
    rows = MemorizedTransaction.query.filter(...).all()
    return [row.to_dict() for row in rows]
```

**`MemorizedTransaction.to_dict()`** (`backend/models.py:626`):
```python
def to_dict(self) -> MemorizedTransactionDict:
    return {
        "name": self.canonical,
        "category": self.category,   # ← nullable DB column, can be null or "Uncategorized"
        "merchant": self.merchant,
        "count": self.count
    }
```

The `category` column (`backend/models.py:612`) is `db.Column(db.String(64))` — nullable.
The backend sends `null` when the memorized row has no stored category.

---

## 3 — The pick handlers (the exact bug sites)

There are **three forms** with a suggestion dropdown, each with the same conditional guard:

### Form 1 — `AddTransactionDialog` (QuickAdd FAB → `transactions/dialogs.tsx:648`)
```tsx
onClick={() => {
  setExpenseName(suggestion.name)
  setCategory(suggestion.category || category)   // ← BUG: || guard
  setMerchant(suggestion.merchant || merchant)
  setSuggestOpen(false)
}}
```

### Form 2 — `EditTransactionDialog` (`transactions/dialogs.tsx:1205`)
```tsx
onClick={() => {
  setName(suggestion.name)
  setCategory(suggestion.category || category)   // ← BUG: || guard
  setMerchant(suggestion.merchant || merchant)
  setSuggestOpen(false)
}}
```

### Form 3 — `AddExpenseDialog` (`expenses/dialogs.tsx:175`)
```tsx
onClick={() => {
  setAddForm({
    ...addForm,
    name: sug.name,
    category: sug.category || addForm.category,  // ← BUG: || guard
    merchant: sug.merchant || addForm.merchant,
  })
  setSuggestOpen(false)
}}
```

**Not a bug (intentional):**
`ImportDialogs.tsx:1876` uses `row.category.trim() ? row.category : (suggestion.category ?? row.category)` — it only applies suggestions to *empty* import rows. This is correct behaviour for the import preview.

---

## 4 — Root cause analysis

### Root cause A — Frontend (candidate C confirmed)

The `||` operator silently falls back to the existing form value whenever
`suggestion.category` is falsy (`null`, `undefined`, or `""`). This means:
- If the memorized entry has `category = null` → `suggestion.category || form.category`
  keeps the form's current value ("Uncategorized" default) — **category never changes**.
- If the memorized entry has `category = "Uncategorized"` → truthy, so the `||` passes,
  but the form ends up showing "Uncategorized" — **wrong value applied**.

The plan requires "category always overwrites any existing value on the form." The `||`
guard is exactly what the plan prohibits.

### Root cause B — Backend (candidate B, partial)

`learn_transaction()` (`suggestions.py:152`) updates the memorized entry on subsequent
calls only if the field is empty:

```python
if category and not row.category:
    row.category = category
```

This means: if a transaction is **first saved with category "Uncategorized"**, the
memorized row stores `category = "Uncategorized"`. When the user later assigns a real
category (e.g., "Groceries") to the same transaction name, `not row.category` is `False`
because `"Uncategorized"` is truthy → **the category is never corrected in the memorized
entry**. All subsequent suggestions for that transaction name return `"Uncategorized"`.

Combined effect:
1. Transaction "KFC" first saved → `learn_transaction("KFC", ..., "Uncategorized", ...)` → stored as `"Uncategorized"`
2. User later recategorizes KFC as "Dining" → `learn_transaction("KFC", ..., "Dining", ...)` → `not row.category` = False (it's "Uncategorized") → **not updated**
3. Suggestion returns `{name: "KFC", category: "Uncategorized", merchant: ...}`
4. Frontend: `suggestion.category || current` → `"Uncategorized"` (truthy) sets category to "Uncategorized"

---

## 5 — Where the bug appears vs. where it doesn't

| Surface | Suggestion dropdown? | Bug? | Notes |
|---|---|---|---|
| AddTransactionDialog (QuickAdd FAB) | ✓ | ✓ | `|| category` guard at `dialogs.tsx:650` |
| EditTransactionDialog | ✓ | ✓ | `|| category` guard at `dialogs.tsx:1207` |
| AddExpenseDialog (ExpensesPage) | ✓ | ✓ | `|| addForm.category` guard at `expenses/dialogs.tsx:179` |
| Import preview (ImportDialogs) | ✓ (name column, datalist) | intentional | Different: only fills blank cells; pick is by blur, not explicit click |

The pick handlers for Forms 1–3 are structurally identical. The fix must touch all three.

---

## 6 — Fix plan (implemented in the next PR)

**Backend:** In `learn_transaction()`, do not store or lock on "Uncategorized".
Pass `None` instead of `UNCAT_NAME` when calling `learn_transaction` from update paths,
and update the stored category when the new value is a real (non-Uncategorized) category
even if the memorized row already has a value.

**Frontend:** Replace `||` (truthy fallback) with direct assignment for the category field
in all three pick handlers. A shared `applyTransactionSuggestion` helper in
`transactions/helpers.ts` will centralise the logic so it can't diverge again.
