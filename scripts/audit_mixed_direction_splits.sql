-- ============================================================
-- Audit: Mixed-direction split transactions
-- ============================================================
-- Run this BEFORE enforcing split direction consistency in
-- production. Identify any existing violations so they can be
-- reviewed and corrected by users before the rule is enforced.
--
-- A "mixed-direction split" is a transaction whose line items
-- contain a mix of income and expense categories. The app rule
-- is: all items in a split must share the same direction.
--
-- Direction convention:
--   COALESCE(categories.is_income, false)
--   NULL is treated as false (expense) — consistent with the
--   application-wide NULL-is-False convention.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/audit_mixed_direction_splits.sql
-- ============================================================

-- ----------------------------------------------------------
-- Query 1: Transactions where items have mixed direction
-- (some items income, some items expense).
-- This is the primary violation type to fix before rollout.
-- ----------------------------------------------------------
SELECT
    t.id            AS transaction_id,
    t.user_id,
    t.date,
    t.name          AS transaction_name,
    t.amount_kd,
    tc.name         AS parent_category,
    COALESCE(tc.is_income, FALSE) AS parent_is_income,
    COUNT(i.id)     AS item_count,
    SUM(CASE WHEN COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END)      AS income_item_count,
    SUM(CASE WHEN NOT COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END)  AS expense_item_count
FROM transactions t
JOIN categories tc ON tc.id = t.category_id
JOIN items i       ON i.transaction_id = t.id
JOIN categories ic ON ic.id = i.category_id
GROUP BY t.id, t.user_id, t.date, t.name, t.amount_kd, tc.name, tc.is_income
HAVING
    COUNT(i.id) > 1
    AND SUM(CASE WHEN COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
    AND SUM(CASE WHEN NOT COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
ORDER BY t.user_id, t.date, t.id;


-- ----------------------------------------------------------
-- Query 2: Per-item detail for violations —
-- shows exactly which items conflict with the parent category.
-- ----------------------------------------------------------
WITH split_violations AS (
    SELECT t.id AS txn_id
    FROM transactions t
    JOIN items i       ON i.transaction_id = t.id
    JOIN categories ic ON ic.id = i.category_id
    GROUP BY t.id
    HAVING
        COUNT(i.id) > 1
        AND SUM(CASE WHEN COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN NOT COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
)
SELECT
    t.id            AS transaction_id,
    t.user_id,
    t.date,
    t.name          AS transaction_name,
    tc.name         AS parent_category,
    COALESCE(tc.is_income, FALSE) AS parent_is_income,
    i.sort_order    AS item_order,
    i.name          AS item_name,
    i.amount_kd     AS item_amount,
    ic.name         AS item_category,
    COALESCE(ic.is_income, FALSE) AS item_is_income
FROM split_violations sv
JOIN transactions t ON t.id = sv.txn_id
JOIN categories tc  ON tc.id = t.category_id
JOIN items i        ON i.transaction_id = t.id
JOIN categories ic  ON ic.id = i.category_id
ORDER BY t.user_id, t.date, t.id, i.sort_order;


-- ----------------------------------------------------------
-- Summary: count of affected transactions per user
-- ----------------------------------------------------------
WITH violations AS (
    SELECT DISTINCT t.id AS txn_id, t.user_id
    FROM transactions t
    JOIN items i       ON i.transaction_id = t.id
    JOIN categories ic ON ic.id = i.category_id
    GROUP BY t.id, t.user_id
    HAVING
        COUNT(i.id) > 1
        AND SUM(CASE WHEN COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN NOT COALESCE(ic.is_income, FALSE) THEN 1 ELSE 0 END) > 0
)
SELECT
    user_id,
    COUNT(*) AS affected_transactions
FROM violations
GROUP BY user_id
ORDER BY user_id;
