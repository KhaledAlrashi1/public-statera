# Timezone Audit

This document categorises every place in the backend that crosses a date boundary
(i.e. computes "today", "this month", "days remaining") and classifies it as either
**TZ-sensitive** (the correct answer changes depending on the user's local clock) or
**TZ-neutral** (wall-clock timezone is irrelevant).

## Definitions

| Class | Meaning |
|---|---|
| **TZ-sensitive** | "Today" or "this month" must reflect the user's local time, not the server's UTC clock. A user in Asia/Kuwait at 23:00 UTC is already in the next calendar day locally. |
| **TZ-neutral** | The computation is relative (e.g. "30 days ago"), uses already-stored dates, or is for system/admin purposes where UTC is appropriate. |

---

## TZ-Sensitive Sites

These sites compute a "current" date or month boundary that should reflect the
user's configured timezone (`UserProfile.timezone`, defaulting to `Asia/Kuwait`).

### Analytics routes — already correct

All analytics request handlers in `backend/routes/analytics/__init__.py` call
`_user_timezone(current_user.id)` before any date boundary computation. The helpers
in `backend/routes/analytics/shared.py` wire this through:

| Helper | Location | Purpose |
|---|---|---|
| `_user_timezone(user_id)` | `shared.py:135` | Loads user's `ZoneInfo` from `UserProfile.timezone`; defaults to `Asia/Kuwait`. |
| `_current_local_date(tz)` | `shared.py:147` | Converts `datetime.now(UTC)` to the user's local date. |
| `_current_month_key(tz)` | `shared.py:151` | Returns `"YYYY-MM"` in the user's local month. |
| `_current_local_datetime(tz)` | `shared.py:140` | Full local datetime for the user's zone. |

**Analytics endpoints verified as TZ-aware** (via `_user_timezone` + the helpers):

- `GET /api/analytics/dashboard` (`__init__.py:449`)
- `GET /api/analytics/spending` (`__init__.py:476`)
- `GET /api/analytics/income` (`__init__.py:525`)
- `GET /api/analytics/safe-to-spend` (`__init__.py:566`)
- `GET /api/analytics/digest` (`__init__.py:628`)
- `GET /api/analytics/overview` (`__init__.py:652`)

The inner computation functions (`income.py:34`, `spending.py:222`, `digest.py:118`)
accept an explicit `tz` argument and a `today_date` override for testability.

### `backend/routes/analytics/digest.py:124`

`_build_safe_to_spend_payload` receives `tz` from the outer request handler.
When called from Celery background jobs, `tz=None` falls back to UTC — see
[TZ-neutral (acceptable)](#tz-neutral-acceptable) below.

---

## TZ-Neutral (acceptable)

The following sites use UTC or a fixed date, which is correct for their context.

| Location | Call | Rationale |
|---|---|---|
| `backend/debt_calculator.py:27` | `datetime.now(timezone.utc).date()` | Debt minimum deadlines are calendar-date-agnostic; UTC is conservative. |
| `backend/lib/savings_goals.py:91` | `datetime.now(timezone.utc).date()` | Goal progress is computed relative to stored target dates, not "today"; UTC is safe. |
| `backend/lib/demo_data.py:227` | `datetime.now(timezone.utc).date()` | Demo data generation; not user-facing date boundary. |
| `backend/activation_reporting.py` (all) | Operates on UTC timestamps stored by the system; reporting is admin-facing. | UTC is correct. |
| `backend/routes/transactions.py:558` | `datetime.now(timezone.utc).date() - timedelta(days=N)` | "Last N days" filter: relative range, off-by-one risk is one day at a boundary, acceptable for a filter. |
| `backend/tasks.py:605` | `expires_at.date() - now.date()` | Consent expiry is compared against absolute stored timestamps; UTC is consistent. |
| `backend/routes/messages.py:223` | `datetime.fromtimestamp(float(uts))` | Converts macOS iMessage Unix timestamp; local system time matches message origin. |
| `backend/lib/importer.py` | `datetime.strptime(...).date()` | Parses user-supplied date strings from CSV; date is explicit in the source data. |

---

## TZ-Neutral (needs attention)

| Location | Call | Issue |
|---|---|---|
| `backend/routes/goals.py:100` | `date.today()` | Goal target-date validation uses `date.today()` (server local time, not UTC-aware). A server deployed in UTC is correct, but the call should be `datetime.now(timezone.utc).date()` for explicitness. Low risk: Kuwait is UTC+3, so the window of divergence is small and this only affects the "past date" guard. |
| `backend/lib/payday.py:52` | `datetime.now(timezone.utc).date()` used when user has no timezone set | Payday boundary computation falls back to UTC when no user tz is configured. The pay-period window shifts by 3 hours for Kuwait users — minor but fixable by passing the user tz. |

---

## Redis cache keys and TZ

`backend/routes/analytics/shared.py` (and callers) build Redis keys from the
month string (e.g. `"2026-04"`). Because the month string is derived from the
**user's local month**, two users in different timezones near a month boundary
correctly receive different cache entries. This is the intended behaviour.

Cache TTLs are 5 minutes (`SAFE_TO_SPEND_CACHE_TTL_SECONDS = 300`), so even a
stale cache entry is at most 5 minutes old — negligible for a timezone boundary error.

---

## Summary table

| Priority | Count | Action |
|---|---|---|
| Already correct | ~20 sites | No change needed |
| Needs minor fix | 2 sites (`goals.py:100`, `payday.py:52`) | Use `datetime.now(timezone.utc).date()` and thread user tz |
| Acceptable UTC | ~8 sites | Document rationale (done above) |
