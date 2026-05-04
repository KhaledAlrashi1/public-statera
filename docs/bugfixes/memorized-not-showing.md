# Bug Diagnosis: Memorized Transactions Not Showing in Auto-Suggestion Dropdown

**Reported symptom:** After PRs 2, 5, 6, 7 landed, typing in the transaction name field no
longer produces suggestions from previously-memorized entries.

**Date:** 2026-04-24

---

## Question 1 — DB row count vs. git history

**Cannot be determined by static code analysis — requires a live DB query:**

```sql
SELECT COUNT(*) FROM memorized_transactions WHERE user_id = <your_user_id>;
```

**What to look for:**

- If the count is **0 (or much smaller than before)**: the rows were deleted by the prune
  function — proceed to Q2.
- If the count is **non-zero and roughly unchanged**: the rows exist, the issue is in the
  endpoint or the frontend — jump to Q5.

**What git history tells us:**

The `prune_all_stale_memorized_transactions()` function and the
`cleanup_memorized_transactions` Celery task both pre-date our PRs (they were in the initial
commit `70b406c`). The beat schedule was already running the task every 6 hours before
PR 7 landed. PR 7 added an operator endpoint to trigger it on demand.

**Verdict for Q1:** DB access required. The most plausible scenario given the timing is that
the prune function deleted entries — see Q2 for why.

---

## Question 2 — The cleanup task: full source and spec mismatch

### The "already-existing Celery task" that the operator endpoint enqueues

`backend/tasks.py` lines 861–883:

```python
@celery_app.task(
    name="backend.tasks.cleanup_memorized_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=6 * 60 * 60)
def cleanup_memorized_transactions(self) -> dict:
    """Prune stale memorized transactions."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_memorized_transactions",
                env_name="MAINT_MEMORIZED_CLEANUP_SECONDS",
                default_interval=6 * 60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            deleted = execute_cleanup_memorized_transactions()
        return {"memorized_deleted": deleted}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120 * (2 ** self.request.retries))
```

The task calls `execute_cleanup_memorized_transactions()` which delegates to
`prune_all_stale_memorized_transactions()` (`backend/lib/suggestions.py` lines 128–149):

```python
def prune_all_stale_memorized_transactions(now: datetime | None = None) -> int:
    from backend.models import MemorizedTransaction

    now = now or datetime.now(timezone.utc)
    cutoff_all = now - timedelta(days=MEMORIZED_PRUNE_ALL_DAYS)    # 180 days
    cutoff_single = now - timedelta(days=MEMORIZED_PRUNE_SINGLE_DAYS)  # 90 days

    deleted = (
        MemorizedTransaction.query
        .filter(or_(
            MemorizedTransaction.last_seen < cutoff_all,
            db.and_(
                MemorizedTransaction.count <= 1,
                MemorizedTransaction.last_seen < cutoff_single,
            ),
        ))
        .delete(synchronize_session=False)
    )
    if deleted:
        db.session.commit()
    return deleted
```

### What it actually deletes

| Condition | Effect |
|---|---|
| `last_seen < 180 days ago` | Deletes ALL rows, **regardless of count and regardless of is_pinned** |
| `count <= 1 AND last_seen < 90 days ago` | Deletes first-time entries not repeated within 90 days |

### Spec from the original plan (user's stated spec)

> "unpinned, count ≤ 2, last_seen older than 90 days"

### Mismatch analysis

**This is the bug.** Three divergences between the spec and the implementation:

| Spec requirement | Actual behavior | Impact |
|---|---|---|
| Only prune **unpinned** entries | No `is_pinned` check — pinned entries are deleted | User pinning an entry for long-term reference gets it wiped after 180 days |
| Prune if `count ≤ 2` | Prune if `count ≤ 1` — the `cutoff_single` arm only fires for count=1 | Entries seen exactly twice (count=2) survive the 90-day window even if never used again; not necessarily wrong, but not what the spec says |
| **The critical divergence:** 90-day threshold as the only cutoff | **Second arm:** `last_seen < 180 days` deletes ALL entries regardless of count — a highly-used entry (count=100) that hasn't been touched in 181 days is silently deleted | **This is the most likely cause of the empty suggestion dropdown** |

The `last_seen < 180 days (ALL_DAYS)` clause was present before our PRs and was running on
the beat schedule every 6 hours. If the user's memorized entries are older than ~6 months,
every single one of them was already being deleted before these PRs landed — but the
operator endpoint in PR 7 created the first obvious trigger a developer might have hit,
making the symptom appear correlated with the PR landing.

Additionally: the prune function has **never respected `is_pinned`**, meaning the new pin
feature added in PRs 5/6 gives a false guarantee. A user who pins an entry that has
`last_seen` 181 days ago will have it deleted on the next task run.

---

## Question 3 — worker_task_runs for cleanup tasks

**Cannot be determined by static code analysis — requires a live DB query:**

```sql
SELECT task_name, last_started_at, last_finished_at, last_status, last_success_at
FROM worker_task_runs
WHERE task_name LIKE '%cleanup%'
   OR task_name LIKE '%memorized%'
ORDER BY last_started_at DESC NULLS LAST;
```

**What the code tells us:**

`cleanup_memorized_transactions` is in `TRACKED_CELERY_TASKS`
(`backend/worker_health.py:18`), so every run updates the `worker_task_runs` table.
The beat schedule (`backend/worker.py:56–57`) fires it every 6 hours by default.

If you have Celery running, `GET /api/admin/worker-health` (with the operator token) will
return `last_started_at`, `last_status`, and `last_success_at` for all tracked tasks
without needing DB access.

---

## Question 4 — learn_transaction() trace for Uncategorized / null category

Current implementation (`backend/lib/suggestions.py:152–180`, post-PR-2):

```python
def learn_transaction(name: str, user_id: int, category: str | None = None, merchant: str | None = None) -> None:
    normalized = _txn_norm(name)
    if not normalized:
        return
    row = MemorizedTransaction.query.filter_by(norm=normalized, user_id=user_id).first()
    now = datetime.now(timezone.utc)
    real_category = category if (category and category != UNCAT_NAME) else None
    if row:
        row.count = int(row.count or 0) + 1
        row.last_seen = now
        if real_category and (not row.category or row.category == UNCAT_NAME):
            row.category = real_category
        if merchant and not row.merchant:
            row.merchant = merchant
    else:
        db.session.add(
            MemorizedTransaction(
                canonical=(name or "").strip()[:255],
                norm=normalized,
                category=real_category,
                merchant=(merchant or None),
                count=1,
                last_seen=now,
                user_id=user_id,
            )
        )
```

**Trace — first save of "KFC" with category="Uncategorized":**

1. `_txn_norm("KFC")` → `"kfc"`. Non-empty, continue.
2. DB lookup: no existing row (first save).
3. `real_category = None` — because `"Uncategorized" == UNCAT_NAME`.
4. **`db.session.add(MemorizedTransaction(canonical="KFC", norm="kfc", category=None, count=1, last_seen=now, ...))`**

**A row IS created.** `count=1`, `category=None`, `last_seen=now`.

**Is this intentional from PR 2?** Yes. PR 2 fixed the category-lock bug by refusing to
store "Uncategorized" as a real category. The row creation itself is unchanged — it now
stores `category=NULL` instead of `category="Uncategorized"`.

The row is **not** immediately visible in the management list because
`MEMORIZED_MIN_VISIBLE_COUNT = 2` (`backend/constants.py:44`) — but this filter only
applies to the management list endpoint, not to the suggestions endpoint.

---

## Question 5 — GET /api/memorized-transactions?limit=10

**Cannot be hit in this analysis session — requires a valid browser session.**

However, from code inspection of the list endpoint (`backend/routes/memorized.py:42–46`):

```python
query = MemorizedTransaction.query.filter(MemorizedTransaction.user_id == current_user.id)
if not include_singletons:
    query = query.filter(MemorizedTransaction.count >= MEMORIZED_MIN_VISIBLE_COUNT)  # count >= 2
```

**Expected result if rows exist:**

- Without `?include_singletons=true`: only entries with `count >= 2` are returned.
  Any first-time transaction (count=1) is hidden.
- With `?include_singletons=true`: all entries visible regardless of count.

**This `count >= 2` filter pre-dates all of our PRs** (it was in the initial commit). PR 5
did NOT change the filter — it only changed the ORDER BY (added `is_pinned.desc()`).

**If the endpoint returns empty (no entries at all):** the rows were deleted by the prune
function — confirmed bug from Q2.

**If the endpoint returns rows but the management page shows nothing:** the PRs 5/6 UI
might have a display bug, but the backend is fine.

---

## Question 6 — GET /api/transaction-suggestions?q=<partial>

**Cannot be hit in this analysis session — requires a valid browser session.**

The suggestions endpoint (`backend/routes/analytics/__init__.py:662–669`) calls
`suggest_transactions()` (`backend/lib/suggestions.py:183–201`):

```python
rows = (
    MemorizedTransaction.query
    .filter(or_(MemorizedTransaction.norm.like(like_norm), MemorizedTransaction.canonical.ilike(like_can)))
    .filter(MemorizedTransaction.user_id == user_id)
    .order_by(MemorizedTransaction.count.desc(), MemorizedTransaction.last_seen.desc())
    .limit(limit)
    .all()
)
```

**There is no `count` filter and no `is_pinned` predicate in `suggest_transactions()`.**
PR 5 did NOT add one. This function returns all memorized entries for the user that match
the query string, regardless of count.

**Conclusion for Q6:**

- If Q5 (management list) returns empty even with `include_singletons=true`: rows don't
  exist in the DB — the prune function is the root cause (Q2).
- If Q5 returns rows but Q6 (suggestions) returns empty: there is a separate filtering bug
  in the suggestions path. Based on code inspection, no such filter exists — the only
  remaining explanation would be a normalization mismatch between how the name was stored
  (`norm` column via `_txn_norm()`) and how the query token is constructed, or a very
  short query (< 2 chars, dropped by the frontend).

---

## Summary and root cause

Based purely on code inspection, **the root cause is the prune function**
(`prune_all_stale_memorized_transactions`), specifically the
`last_seen < 180 days` (ALL_DAYS) clause that deletes every memorized entry not touched
in the past 6 months, regardless of count and regardless of whether the entry is pinned.

This clause was present before our PRs and has been running on the beat schedule every
6 hours. It is likely that many or all of the user's memorized entries have
`last_seen` dates older than 180 days, and have been silently deleted over multiple
task runs.

The secondary mismatch is that the spec calls for pinned entries to be exempt from
pruning — the current code does not respect `is_pinned` at all.

---

## Proposed minimal fix (awaiting approval before implementation)

**Do not touch `MEMORIZED_PRUNE_ALL_DAYS` or the 90-day window** — those are
policy decisions outside this diagnosis. The minimal surgical fix that restores the
pin guarantee and stops silently deleting high-count entries:

**Option A (match spec exactly):** Change both prune functions so that:
1. Only entries where `is_pinned = false` (or `is_pinned IS NULL`) are eligible.
2. The "all days" clause is removed; the only cutoff is `count <= N AND last_seen < 90 days`.
   This means no entry is ever deleted purely by age regardless of how many times it
   has been used.

**Option B (minimal, lowest blast radius):** Keep the `ALL_DAYS` clause but add
`is_pinned = false` as a required condition on both arms:

```python
.filter(
    MemorizedTransaction.is_pinned.is_(False),   # never prune pinned entries
    or_(
        MemorizedTransaction.last_seen < cutoff_all,
        db.and_(
            MemorizedTransaction.count <= 1,
            MemorizedTransaction.last_seen < cutoff_single,
        ),
    )
)
```

This keeps the 180-day all-rows sweep but protects pinned entries.

**Neither option will restore already-deleted rows.** If the DB is empty (Q1 = 0),
the immediate remedy is to replay the user's transaction history through
`learn_transaction()` (re-import or re-save transactions). Fixing the prune only
prevents future data loss.

**Awaiting confirmation of DB state (Q1) and endpoint responses (Q5/Q6) before
implementing any fix.**
