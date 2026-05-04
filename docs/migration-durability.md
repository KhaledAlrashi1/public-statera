# Migration Durability

Historical Alembic revisions are treated as a supported part of the product surface.

CI now enforces three baseline guarantees:
- the migration graph resolves to exactly one Alembic head
- an empty PostgreSQL database can complete `upgrade -> downgrade -> upgrade`
- representative historical records survive a round trip across the `d1e2f3a4b5c6` and `b9c0d1e2f3a4` data migrations

Known irreversible behavior:
- `b9c0d1e2f3a4` converts `savings_goals.linked_category` from free text to `linked_category_id`
- unmatched strings are intentionally converted to `NULL`
- once that happens, a later downgrade can only restore matched category names; the original unmatched string is gone

Audit-sensitive revisions:
- `d1e2f3a4b5c6` backfills `categories.is_income` with the legacy `lower(name) LIKE 'income%'` heuristic
- `f7a8b9c0d1e2` adds `CHECK (amount_kd > 0)` constraints and assumes historical rows were already clean

Use `scripts/audit_historical_data_integrity.sql` before migrating a legacy production database and when reviewing historical data assumptions during new migration work.
