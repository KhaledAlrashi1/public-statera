# Runbook: Incident Response

**Service:** Statera / `personal-finance`
**Last reviewed:** 2026-03-05

---

## Overview

This runbook covers security incident detection, containment, and recovery
procedures. Statera stores sensitive personal financial data; treat all
suspected incidents with high urgency.

**Severity levels:**

| Level | Definition | Target response |
|-------|-----------|----------------|
| P0 | Confirmed data breach / active compromise | Immediate (< 15 min) |
| P1 | Suspected compromise / mass account anomaly | < 1 hour |
| P2 | Single account anomaly / suspicious activity | < 4 hours |
| P3 | Policy violation / non-urgent audit finding | Next business day |

---

## 1. Detection Sources

- **Audit log endpoint:** `GET /internal/audit-log` — returns SecurityEvent rows
  for the current user (supports `event_type`, `since`, `limit` params)
- **Sentry:** runtime exceptions + performance anomalies (`SENTRY_DSN` in config)
- **Application logs:** `docker compose logs backend worker`
- **Rate-limit counters:** unusual 429 spikes in Redis
- **PostgreSQL `security_events` table:** direct query for cross-user analysis
  (admin access required)

---

## 2. Immediate Containment Checklist

For P0/P1 incidents, execute these steps in order before investigating:

```bash
# 1. Capture a timestamped snapshot of current logs
docker compose -f docker-compose.prod.yml logs --no-color --timestamps \
  backend worker beat > /tmp/incident_$(date -u +%Y%m%dT%H%M%SZ).log

# 2. Take a database backup before any changes
ENV_FILE=.env.prod bash scripts/pg-backup.sh

# 3. Block external traffic (nginx level) if breach is active
docker compose -f docker-compose.prod.yml stop nginx

# 4. Revoke all active sessions (rotate SECRET_KEY in .env.prod → forces re-login)
# WARNING: This logs out ALL users. Confirm before executing.
# Edit .env.prod → generate new SECRET_KEY → redeploy backend
python -c "import secrets; print(secrets.token_hex(32))"

# 5. Restart services after containment
docker compose -f docker-compose.prod.yml up -d
```

---

## 3. Scenario: Suspected Account Compromise

**Indicators:** login from new location, failed 2FA attempts, suspicious
transactions created via API, SecurityEvent rows with `event_type=login.failed`
spike.

**Steps:**

1. Query the audit log for the affected user:
   ```sql
   SELECT event_type, created_at, details_json
   FROM security_events
   WHERE user_id = <uid>
   ORDER BY created_at DESC
   LIMIT 50;
   ```

2. Force-expire the user's session by bumping their session version (Flask-Login
   checks `session["sv"]` against `users.session_version` on every request):
   ```sql
   -- Invalidate all login sessions for the user
   UPDATE users SET session_version = session_version + 1 WHERE id = <uid>;
   ```

3. Lock the account temporarily:
   ```sql
   UPDATE users SET is_active = false WHERE id = <uid>;
   ```

4. Send a security notification email to the user via the admin tooling or
   directly through Postmark with details of the suspicious activity.

5. Review any bank connections and consents linked to the account:
   ```sql
   SELECT bc.id, bc.institution_name, bc.status, bc.created_at, bc.revoked_at
   FROM bank_connections bc
   WHERE bc.user_id = <uid>;

   SELECT bco.id, bco.scopes, bco.status, bco.created_at
   FROM bank_consents bco
   WHERE bco.user_id = <uid>;
   ```
   If consent was granted during the suspicious window, revoke via
   `POST /api/bank/connections/<id>/revoke` (or directly in DB) and purge raw data.

6. Unlock the account once the user has verified identity and rotated
   credentials:
   ```sql
   UPDATE users SET is_active = true WHERE id = <uid>;
   ```

---

## 4. Scenario: Data Breach (Unauthorized DB Access)

**Indicators:** unexpected queries in pg_stat_activity, data exfiltration alerts,
presence of unknown processes with DB connections.

**Steps:**

1. **Take the service offline immediately** — stop nginx to block user traffic:
   ```bash
   docker compose -f docker-compose.prod.yml stop nginx backend worker beat
   ```

2. **Preserve evidence** — snapshot DB and logs before any cleanup:
   ```bash
   ENV_FILE=.env.prod bash scripts/pg-backup.sh
   pg_dumpall -U postgres > /tmp/pg_forensic_$(date -u +%Y%m%dT%H%M%SZ).sql
   ```

3. **Rotate ALL secrets** in `.env.prod`:
   - `SECRET_KEY` — new random 32-byte hex
   - `ENCRYPTION_KEY` — see [key-rotation runbook](key-rotation.md)
   - `POSTGRES_PASSWORD` — change in DB and `.env.prod`
   - `POSTMARK_API_KEY`, `AWS_SECRET_ACCESS_KEY`, etc.

4. **Revoke all active bank consents** in bulk:
   ```sql
   UPDATE bank_consents SET status = 'revoked', revoked_at = NOW()
   WHERE status = 'active';
   ```

5. **Purge raw bank transaction rows** immediately:
   ```sql
   DELETE FROM raw_bank_transactions;
   ```

6. **Notify affected users** per your data breach notification obligations.
   In Kuwait/Gulf jurisdictions, consult local data protection regulation
   timelines (typically 72 hours for regulated entities).

7. **Re-deploy from a clean state** after rotating all secrets and patching
   the exploited vector.

---

## 5. Scenario: Brute Force / Credential Stuffing

**Indicators:** High rate of 429 responses, mass `login.failed` security events,
Redis rate-limit keys at maximum.

**Steps:**

1. Check Redis rate-limit counters:
   ```bash
   docker compose -f docker-compose.prod.yml exec redis \
     redis-cli KEYS "rl:auth:*" | head -20
   ```

2. If a specific IP is the source, block at the nginx/firewall level:
   ```nginx
   # In nginx.conf or a server block
   deny 1.2.3.4;
   ```

3. Increase rate-limit thresholds temporarily if legitimate users are being
   blocked (via `RATE_LIMIT_AUTH` config or environment override).

4. Inspect for accounts with multiple failed logins and consider requiring
   2FA re-enrollment:
   ```sql
   SELECT user_id, COUNT(*) as failures
   FROM security_events
   WHERE event_type = 'login.failed'
     AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY user_id
   ORDER BY failures DESC
   LIMIT 20;
   ```

---

## 6. Scenario: Celery / Worker Compromise

**Indicators:** Unexpected tasks in the queue, Redis KEYS with unknown patterns,
worker processes executing unusual commands.

**Steps:**

1. Stop all workers immediately:
   ```bash
   docker compose -f docker-compose.prod.yml stop worker beat
   ```

2. Flush the Celery queues (drops all pending tasks):
   ```bash
   docker compose -f docker-compose.prod.yml exec redis \
     redis-cli FLUSHDB
   ```

3. Review worker logs for executed tasks:
   ```bash
   docker compose -f docker-compose.prod.yml logs worker | grep -i error
   ```

4. Rebuild worker image from scratch before restarting:
   ```bash
   docker compose -f docker-compose.prod.yml build --no-cache worker beat
   docker compose -f docker-compose.prod.yml up -d worker beat
   ```

---

## 7. Post-Incident

After any P0/P1 incident:

- [ ] Write an incident timeline with root cause, impact, and resolution
- [ ] File a post-mortem in your incident tracker or team documentation system
- [ ] Update this runbook if the incident revealed gaps
- [ ] Review and tighten relevant rate limits and validation
- [ ] Verify all secrets have been rotated
- [ ] Confirm backup integrity with a test restore
- [ ] Notify affected users with clear, honest communication

---

## 8. Contacts & Escalation

Define these for your deployment before going live:

| Role | Contact |
|------|---------|
| On-call engineer | — |
| Database admin | — |
| Legal / compliance | — |
| Data protection officer | — |
