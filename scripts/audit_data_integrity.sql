-- ============================================================
-- Audit: Data integrity checks for production databases
-- ============================================================
-- Run before major releases or after migrations to verify no
-- data anomalies exist that application-layer validation should
-- have prevented.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/audit_data_integrity.sql
--
-- A clean database returns zero rows from every query below.
-- Any rows returned indicate data that needs operator review.
-- ============================================================


-- ----------------------------------------------------------
-- Section 1: Transactions
-- ----------------------------------------------------------

-- 1a. Transactions with amount_kd <= 0
-- Should be zero — enforced by ck_transactions_amount_kd_positive.
-- If rows appear, the DB constraint was missing at insert time.
SELECT
    'transactions.amount_kd_lte_zero' AS check_name,
    id,
    user_id,
    date,
    name,
    amount_kd
FROM transactions
WHERE amount_kd <= 0
ORDER BY user_id, date, id;

-- 1b. Transactions referencing a non-existent category
SELECT
    'transactions.orphaned_category_id' AS check_name,
    t.id,
    t.user_id,
    t.date,
    t.name,
    t.category_id
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
WHERE t.category_id IS NOT NULL AND c.id IS NULL
ORDER BY t.user_id, t.date, t.id;

-- 1c. Transactions referencing a non-existent merchant
SELECT
    'transactions.orphaned_merchant_id' AS check_name,
    t.id,
    t.user_id,
    t.date,
    t.name,
    t.merchant_id
FROM transactions t
LEFT JOIN merchants m ON m.id = t.merchant_id
WHERE t.merchant_id IS NOT NULL AND m.id IS NULL
ORDER BY t.user_id, t.date, t.id;

-- 1d. Transactions whose category belongs to a different user
-- (global categories have user_id IS NULL and are valid for all users)
SELECT
    'transactions.cross_user_category' AS check_name,
    t.id,
    t.user_id,
    t.category_id,
    c.user_id AS category_user_id
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE c.user_id IS NOT NULL AND c.user_id <> t.user_id
ORDER BY t.user_id, t.id;

-- 1e. Transactions whose merchant belongs to a different user
-- (global merchants have user_id IS NULL and are valid for all users)
SELECT
    'transactions.cross_user_merchant' AS check_name,
    t.id,
    t.user_id,
    t.merchant_id,
    m.user_id AS merchant_user_id
FROM transactions t
JOIN merchants m ON m.id = t.merchant_id
WHERE m.user_id IS NOT NULL AND m.user_id <> t.user_id
ORDER BY t.user_id, t.id;


-- ----------------------------------------------------------
-- Section 2: Budgets
-- ----------------------------------------------------------

-- 2a. Budget rows referencing a non-existent category
SELECT
    'budgets.orphaned_category_id' AS check_name,
    b.id,
    b.user_id,
    b.month,
    b.category_id,
    b.amount_kd
FROM budgets b
LEFT JOIN categories c ON c.id = b.category_id
WHERE b.category_id IS NOT NULL AND c.id IS NULL
ORDER BY b.user_id, b.month, b.id;

-- 2b. Budget rows whose category belongs to a different user
SELECT
    'budgets.cross_user_category' AS check_name,
    b.id,
    b.user_id,
    b.category_id,
    c.user_id AS category_user_id
FROM budgets b
JOIN categories c ON c.id = b.category_id
WHERE c.user_id IS NOT NULL AND c.user_id <> b.user_id
ORDER BY b.user_id, b.id;


-- ----------------------------------------------------------
-- Section 3: Savings goals
-- ----------------------------------------------------------

-- 3a. Savings goals with a linked_category_id pointing to a non-existent category
SELECT
    'savings_goals.orphaned_linked_category_id' AS check_name,
    sg.id,
    sg.user_id,
    sg.name,
    sg.linked_category_id
FROM savings_goals sg
LEFT JOIN categories c ON c.id = sg.linked_category_id
WHERE sg.linked_category_id IS NOT NULL AND c.id IS NULL
ORDER BY sg.user_id, sg.id;

-- 3b. Savings goals whose linked category belongs to a different user
SELECT
    'savings_goals.cross_user_linked_category' AS check_name,
    sg.id,
    sg.user_id,
    sg.linked_category_id,
    c.user_id AS category_user_id
FROM savings_goals sg
JOIN categories c ON c.id = sg.linked_category_id
WHERE c.user_id IS NOT NULL AND c.user_id <> sg.user_id
ORDER BY sg.user_id, sg.id;

-- 3c. Savings goals where current_kd > target_kd
-- Not necessarily a bug (over-saved), but worth surfacing for review.
SELECT
    'savings_goals.current_exceeds_target' AS check_name,
    id,
    user_id,
    name,
    target_kd,
    current_kd
FROM savings_goals
WHERE is_active = TRUE AND current_kd > target_kd
ORDER BY user_id, id;


-- ----------------------------------------------------------
-- Section 4: Raw bank transactions
-- ----------------------------------------------------------

-- 4a. Raw bank transactions referencing a non-existent bank connection
SELECT
    'raw_bank_transactions.orphaned_connection_id' AS check_name,
    r.id,
    r.user_id,
    r.connection_id,
    r.status
FROM raw_bank_transactions r
LEFT JOIN bank_connections bc ON bc.id = r.connection_id
WHERE bc.id IS NULL
ORDER BY r.user_id, r.id;

-- 4b. Raw bank transactions referencing a non-existent sync run
SELECT
    'raw_bank_transactions.orphaned_sync_run_id' AS check_name,
    r.id,
    r.user_id,
    r.sync_run_id,
    r.status
FROM raw_bank_transactions r
LEFT JOIN bank_sync_runs bsr ON bsr.id = r.sync_run_id
WHERE bsr.id IS NULL
ORDER BY r.user_id, r.id;

-- 4c. Committed raw transactions referencing a non-existent normalized transaction
SELECT
    'raw_bank_transactions.orphaned_transaction_id' AS check_name,
    r.id,
    r.user_id,
    r.transaction_id,
    r.status
FROM raw_bank_transactions r
LEFT JOIN transactions t ON t.id = r.transaction_id
WHERE r.status = 'committed' AND r.transaction_id IS NOT NULL AND t.id IS NULL
ORDER BY r.user_id, r.id;


-- ----------------------------------------------------------
-- Section 5: Data access logs
-- ----------------------------------------------------------

-- 5a. Data access log entries referencing a non-existent bank connection
SELECT
    'data_access_logs.orphaned_connection_id' AS check_name,
    dal.id,
    dal.user_id,
    dal.connection_id
FROM data_access_logs dal
LEFT JOIN bank_connections bc ON bc.id = dal.connection_id
WHERE dal.connection_id IS NOT NULL AND bc.id IS NULL
ORDER BY dal.user_id, dal.id;

-- 5b. Data access log entries referencing a non-existent consent
SELECT
    'data_access_logs.orphaned_consent_id' AS check_name,
    dal.id,
    dal.user_id,
    dal.consent_id
FROM data_access_logs dal
LEFT JOIN bank_consents bc ON bc.id = dal.consent_id
WHERE dal.consent_id IS NOT NULL AND bc.id IS NULL
ORDER BY dal.user_id, dal.id;


-- ----------------------------------------------------------
-- Section 6: Cross-user isolation spot-check
-- ----------------------------------------------------------

-- 6a. Categories owned by a user_id that no longer has an active account
-- (soft-deleted users have is_active = false; their data should be purged)
SELECT
    'categories.user_is_inactive' AS check_name,
    c.id,
    c.user_id,
    c.name,
    u.is_active
FROM categories c
JOIN users u ON u.id = c.user_id
WHERE u.is_active = FALSE
ORDER BY c.user_id, c.id;

-- 6b. Transactions owned by a user_id that no longer has an active account
SELECT
    'transactions.user_is_inactive' AS check_name,
    t.id,
    t.user_id,
    t.date,
    t.name,
    u.is_active
FROM transactions t
JOIN users u ON u.id = t.user_id
WHERE u.is_active = FALSE
ORDER BY t.user_id, t.date, t.id;


-- ----------------------------------------------------------
-- Summary: count of issues by check name
-- (run this to get a quick overview without reading all rows)
-- ----------------------------------------------------------
-- Uncomment the block below to use as a summary view instead.
--
-- WITH issues AS (
--
--   SELECT 'transactions.amount_kd_lte_zero' AS check_name, COUNT(*) AS cnt
--   FROM transactions WHERE amount_kd <= 0
--
--   UNION ALL
--   SELECT 'transactions.orphaned_category_id', COUNT(*)
--   FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
--   WHERE t.category_id IS NOT NULL AND c.id IS NULL
--
--   UNION ALL
--   SELECT 'transactions.orphaned_merchant_id', COUNT(*)
--   FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
--   WHERE t.merchant_id IS NOT NULL AND m.id IS NULL
--
--   UNION ALL
--   SELECT 'transactions.cross_user_category', COUNT(*)
--   FROM transactions t JOIN categories c ON c.id = t.category_id
--   WHERE c.user_id IS NOT NULL AND c.user_id <> t.user_id
--
--   UNION ALL
--   SELECT 'transactions.cross_user_merchant', COUNT(*)
--   FROM transactions t JOIN merchants m ON m.id = t.merchant_id
--   WHERE m.user_id IS NOT NULL AND m.user_id <> t.user_id
--
--   UNION ALL
--   SELECT 'budgets.orphaned_category_id', COUNT(*)
--   FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
--   WHERE b.category_id IS NOT NULL AND c.id IS NULL
--
--   UNION ALL
--   SELECT 'savings_goals.orphaned_linked_category_id', COUNT(*)
--   FROM savings_goals sg LEFT JOIN categories c ON c.id = sg.linked_category_id
--   WHERE sg.linked_category_id IS NOT NULL AND c.id IS NULL
--
--   UNION ALL
--   SELECT 'raw_bank_transactions.orphaned_connection_id', COUNT(*)
--   FROM raw_bank_transactions r LEFT JOIN bank_connections bc ON bc.id = r.connection_id
--   WHERE bc.id IS NULL
--
--   UNION ALL
--   SELECT 'transactions.user_is_inactive', COUNT(*)
--   FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.is_active = FALSE
--
-- )
-- SELECT check_name, cnt FROM issues WHERE cnt > 0 ORDER BY cnt DESC, check_name;
