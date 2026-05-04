# ADR 003: Single-Replica Celery Beat with Idempotency Locks

- Status: Accepted
- Date: 2026-03-06

## Context

The project runs periodic maintenance and notification work through Celery.
`backend/worker.py` defines a beat schedule for cleanup, budget alerts, and
consent maintenance tasks. `docker-compose.yml` and `docker-compose.prod.yml`
both pin the `beat` service to `replicas: 1`, and the compose file comments
explicitly warn that multiple beat instances would enqueue the same scheduled
tasks multiple times.

At the same time, `backend/tasks.py` adds Redis-backed interval locks around
beat-triggered tasks because duplicate scheduling can still happen during
restarts, race conditions, or operational mistakes.

## Decision

We run exactly one Celery beat replica in each environment and treat Redis task
locks as a safety net, not as the primary scheduler topology.

Specifically:

- the scheduler remains single-replica
- worker processes may scale independently
- beat-scheduled tasks must remain idempotent or protected by Redis locks
- accidental duplicate task dispatch is mitigated in code, but not normalized as
  an expected operating mode

## Consequences

Positive:

- scheduling behavior stays simple and predictable
- recurring jobs do not depend on distributed leader election
- Redis locks reduce damage from restarts or duplicate enqueue edge cases
- operational guidance is clear: scale workers, not beat

Tradeoffs:

- beat is not active-active; availability depends on container restart/recovery
- every new scheduled task must be reviewed for duplicate-execution risk
- Redis lock failures can still degrade protection and should be monitored

This choice intentionally favors operational clarity over multi-scheduler
complexity. If the project later needs highly available scheduling, it should
adopt an explicit leader-election or external scheduler design rather than
quietly scaling beat replicas.
