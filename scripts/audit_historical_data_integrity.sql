-- Historical migration integrity audits
--
-- Purpose:
--   Preflight and audit the data-sensitive historical revisions that can
--   otherwise hide assumptions:
--   - f7a8b9c0d1e2  CHECK (amount_kd > 0)
--   - d1e2f3a4b5c6  populate is_income from category name
--   - b9c0d1e2f3a4  migrate savings_goals.linked_category -> linked_category_id
--
-- Run each section against a database that is still on the schema version
-- noted in the heading or immediately before applying that revision.

-- ---------------------------------------------------------------------------
-- f7a8b9c0d1e2 preflight:
-- find rows that would fail CHECK (amount_kd > 0)
-- ---------------------------------------------------------------------------
SELECT
    'transactions' AS table_name,
    t.id,
    t.user_id,
    t.date,
    t.name,
    t.amount_kd
FROM transactions t
WHERE t.amount_kd <= 0
UNION ALL
SELECT
    'items' AS table_name,
    i.id,
    t.user_id,
    t.date,
    i.name,
    i.amount_kd
FROM items i
JOIN transactions t ON t.id = i.transaction_id
WHERE i.amount_kd <= 0
ORDER BY table_name, user_id, date, id;

-- ---------------------------------------------------------------------------
-- d1e2f3a4b5c6 post-upgrade audit:
-- review likely income categories that the legacy prefix heuristic leaves
-- behind as is_income = false
-- ---------------------------------------------------------------------------
SELECT
    id,
    user_id,
    name,
    is_income
FROM categories
WHERE COALESCE(is_income, FALSE) = FALSE
  AND (
      lower(name) LIKE '%income%'
      OR lower(name) LIKE '%salary%'
      OR lower(name) LIKE '%payroll%'
      OR lower(name) LIKE '%bonus%'
      OR lower(name) LIKE '%freelance%'
      OR lower(name) LIKE '%commission%'
  )
ORDER BY user_id NULLS FIRST, name, id;

-- ---------------------------------------------------------------------------
-- b9c0d1e2f3a4 preflight:
-- find savings goals whose linked_category string will be lost because no
-- matching scoped category exists
-- ---------------------------------------------------------------------------
SELECT
    sg.id,
    sg.user_id,
    sg.name,
    sg.linked_category
FROM savings_goals sg
WHERE sg.linked_category IS NOT NULL
  AND sg.linked_category <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM categories c
      WHERE lower(c.name) = lower(sg.linked_category)
        AND (c.user_id = sg.user_id OR c.user_id IS NULL)
  )
ORDER BY sg.user_id, sg.id;
