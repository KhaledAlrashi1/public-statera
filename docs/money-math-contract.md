# Money Math Contract (KWD)

This contract defines how money values are represented and computed in backend logic.
It is the baseline for all new financial endpoints (including `safe-to-spend`).

## 1) Numeric Type

- Use `Decimal` for backend money computation.
- Do not use Python `float` for intermediate financial math.
- DB storage remains `NUMERIC(..., 3)` for KWD precision.

## 2) KWD Precision

- KWD precision is fixed at **3 decimal places**.
- Quantization unit: `Decimal("0.001")`.
- New monetary endpoint outputs should be formatted to 3 decimals (`"123.456"`).
- Legacy analytics endpoints that return numeric values for charts must still be rounded to 3 decimals.

## 3) Income vs Expense Source of Truth

- Source of truth for analytics is **transaction-level category classification**:
  - `Transaction.category_id -> Category.is_income == true` is authoritative.
  - Legacy fallback is category name prefix `income%`.
- Analytics must not require the retired legacy `items` table to exist.
- Split transaction detail may still appear in API-compatible serialized output, but stage-1 analytics follow the transaction summary row.

## 4) Cycle Spend Scope (Phase 1 Baseline)

- Safe-to-spend Phase 1 uses **calendar month** scope first.
- Payday-cycle scoping is added in a later step via a dedicated helper and tests.

## 5) Inclusion Rules (Current Model)

- Include: expense transactions (`Category.is_income=false`).
- Exclude: income transactions (`Category.is_income=true`).
- Transfers/refunds are not separately modeled yet; they are represented by category semantics.

## 6) Guardrails

- New money endpoints must add tests for:
  - 3-decimal output precision.
  - transaction-row attribution correctness.
  - analytics behavior when the legacy `items` table is absent.
  - missing-data safety behavior (for future safe-to-spend warnings).
