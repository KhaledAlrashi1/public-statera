# Retention-Window Audit

**Date:** 2026-04-24
**Scope:** All `timedelta(days=…)` cutoffs and date-comparison operators in
`backend/tasks.py`, `backend/lib/`, and `backend/routes/` that govern data deletion or
expiry. No fixes are made in this document.

---

## 1. Memorized transactions — `backend/lib/suggestions.py`

### 1a. Per-user prune (`prune_stale_memorized_transactions`, line 106)

Called from the manual-create endpoint. **Not** called by the Celery beat task.

| Arm | Condition | Threshold | Effect |
|---|---|---|---|
| ALL rows | `last_seen < cutoff_all` | `MEMORIZED_PRUNE_ALL_DAYS` = 180 days | Deletes every row for the user regardless of count or is_pinned |
| Single rows | `count <= 1 AND last_seen < cutoff_single` | `MEMORIZED_PRUNE_SINGLE_DAYS` = 90 days | Deletes count-1 rows not seen in 90 days |

**Note:** This function still contains the 180-day unconditional arm and does not respect
`is_pinned`. It was not modified in the prune fix (Section 2) because it is only called from
the create endpoint, not the beat task. A follow-up should align it with the spec.

### 1b. Global prune (`prune_all_stale_memorized_transactions`, line 128)

Called by the Celery beat task (currently disabled — Section 1 stop-gap).
**Fixed in Section 2** to implement the spec exactly:

| Condition | Value | Description |
|---|---|---|
| `is_pinned = FALSE` | required | Pinned rows are never deleted |
| `count <= 2` | required | Rows seen ≥ 3 times are kept indefinitely |
| `last_seen < cutoff` | `MEMORIZED_PRUNE_SINGLE_DAYS` = 90 days | Only rows not seen in 90 days |

All three conditions must hold simultaneously (AND, not OR). There is no longer an
unconditional 180-day sweep.

**Constants** (`backend/constants.py`):
- `MEMORIZED_PRUNE_SINGLE_DAYS = 90` — threshold for both functions (not env-overridable)
- `MEMORIZED_PRUNE_ALL_DAYS = 180` — used only by the per-user prune, no longer used in global prune

---

## 2. Account action tokens — `backend/routes/auth.py:228`

Function: `cleanup_account_action_tokens(expired_grace_hours=24, used_grace_days=7)`
Beat schedule: every 15 minutes (`MAINT_ACCOUNT_TOKENS_CLEANUP_SECONDS`, default 900s)

| Arm | Condition | Threshold | Effect |
|---|---|---|---|
| Expired | `expires_at < now - 24h` | 24 hours (hardcoded default) | Deletes tokens past their expiry |
| Used | `used_at IS NOT NULL AND used_at < now - 7d` | 7 days (hardcoded default) | Deletes consumed tokens after a grace window |

**No env override for thresholds.** The beat task passes no arguments, so defaults always apply.

---

## 3. Security events and ingested messages — `backend/security_ops.py:293`

Function: `cleanup_security_data(security_events_days, ingested_messages_days)`
Beat schedule: every 60 minutes (`MAINT_SECURITY_DATA_CLEANUP_SECONDS`, default 3600s)

| Table | Cutoff | Default | Env override |
|---|---|---|---|
| `security_events` | `event_at < now - N days` | 365 days | `SECURITY_EVENTS_RETENTION_DAYS` |
| `ingested_messages` | `uts < epoch(now - N days)` | 180 days | `INGESTED_MESSAGES_RETENTION_DAYS` |

**Comparison type mismatch to verify:** `ingested_messages.uts` is an integer Unix timestamp;
the cutoff is converted with `.timestamp()`. Verify that timezone handling is consistent if
the server ever runs in a non-UTC zone.

---

## 4. Product events — `backend/security_ops.py:320`

Function: `cleanup_product_events(product_events_days=90)`
Beat schedule: every 60 minutes (`MAINT_PRODUCT_EVENTS_CLEANUP_SECONDS`, default 3600s)

| Condition | Default | Env override |
|---|---|---|
| `event_ts < now - N days` | 90 days | `PRODUCT_EVENTS_RETENTION_DAYS` |

---

## 5. Rate limiter in-memory state — `backend/security_ops.py:237`

Function: `RateLimiter.cleanup(max_age_seconds=300)`
Beat schedule: every 120 seconds (`MAINT_RATE_LIMIT_CLEANUP_SECONDS`, default 120s)

Purges in-memory `_requests` entries older than 300 seconds (5 minutes). Only applies when
`RATE_LIMIT_BACKEND=memory`; Redis-backed mode needs no cleanup because Redis handles TTL
natively.

---

## 6. Bank sync previews (abandoned) — `backend/bank_ops.py:12`

Function: `cleanup_abandoned_bank_previews(preview_days=7)`
Beat schedule: every 6 hours (`MAINT_BANK_PREVIEW_CLEANUP_SECONDS`, default 21600s)

| Condition | Default | Config key |
|---|---|---|
| `BankSyncRun.created_at < now - N days` AND `status IN (staged, importing)` | 7 days | `BANK_PREVIEW_RETENTION_DAYS` |

Marks the run as `abandoned` and deletes its associated raw rows.

---

## 7. Bank raw rows (committed) — `backend/bank_ops.py:41`

Function: `cleanup_committed_bank_raw_rows(committed_days=7)`
Beat schedule: every 24 hours (`MAINT_BANK_RAW_CLEANUP_SECONDS`, default 86400s)

| Condition | Default | Config key |
|---|---|---|
| `RawBankTransaction.created_at < now - N days` AND `status IN (committed, skipped)` | 7 days | `BANK_RAW_RETENTION_DAYS` |

Normalized transactions (in `transactions` table) are not affected — only the raw payload rows.

---

## 8. Revoked-consent normalized transactions — `backend/bank_ops.py:77`

Function: `purge_stale_revoked_consent_transactions(revoked_grace_days=30)`
Beat schedule: daily at 03:00 UTC (`crontab(hour=3, minute=0)`)

| Condition | Default | Config key |
|---|---|---|
| All consents for a connection revoked AND `MAX(revoked_at) < now - N days` | 30 days | `BANK_REVOKED_NORMALIZED_RETENTION_DAYS` |

Purges transaction rows that belong to a bank connection where all open-banking consent has
been revoked for more than the grace period. This is a GDPR-style right-to-erasure window.

---

## 9. Bank consent expiry alerts — `backend/tasks.py:570`

Function: `check_expiring_consents()`
Beat schedule: daily at 09:15 UTC (`crontab(hour=9, minute=15)`)

| Condition | Default | Description |
|---|---|---|
| `expires_at > now AND expires_at <= now + window_days` | 7 days (`CONSENT_EXPIRY_ALERT_WINDOW_DAYS`) | Sends email alert for consents expiring within the window |

This is a forward-looking window (future expiry), not a deletion cutoff.

---

## 10. Analytics date-range cutoffs — `backend/routes/analytics/`

These are user-facing filter windows, not deletion policies. Listed for completeness.

| Location | Cutoff | Default |
|---|---|---|
| `income.py:47` | `Transaction.date >= today - 90d` | 90 days (income pattern detection) |
| `income.py:163` | `Transaction.date >= today - N days` | Caller-supplied `days` param |
| `overview.py:356,367,497` | `Transaction.date >= today - 90d` | 90 days (recent spending overview) |
| `transactions.py:558` | `Transaction.date >= today - N days` | Caller-supplied `range_key` from query string |
| `spending.py:231` | `Transaction.date >= today - N days` | Caller-supplied `range_key` |

These do not delete data; they filter query results.

---

## 11. Potential issues noted (no fixes in this PR)

| Issue | Location | Severity |
|---|---|---|
| `prune_stale_memorized_transactions()` still has the 180-day unconditional arm and ignores `is_pinned` | `backend/lib/suggestions.py:106–125` | Medium — only called from create endpoint, not beat, so impact is limited |
| `MEMORIZED_PRUNE_ALL_DAYS` constant is now unused in the global prune but still imported | `backend/lib/suggestions.py:14` | Low — dead constant, no functional impact |
| No env override for `MEMORIZED_PRUNE_SINGLE_DAYS` — changing the threshold requires a code deploy | `backend/constants.py:45` | Low |
| `ingested_messages.uts` integer comparison — verify DST safety | `backend/security_ops.py:302` | Low |
