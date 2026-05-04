# ADR 006: ENABLE_TEMPLATE_SUGGESTIONS Feature Flag

- Status: Accepted
- Date: 2026-04-24

## Context

The transaction import flow includes a "template suggestions" system that
detects recurring transaction patterns from a user's history and offers
pre-filled import rows. The system is fully implemented in
`backend/lib/suggestions.py` and wired into the CSV/SMS import pipeline.

During initial deployment the feature was disabled by default because:
1. The suggestion engine triggers an extra per-import database query that
   adds measurable latency on large transaction sets.
2. The similarity threshold and ranking algorithm were not yet tuned
   against real-world Kuwait-bank SMS message patterns.
3. It requires the `MemorizedTransaction` table to be populated, which
   takes several weeks of usage.

The flag is read in `backend/__init__.py` and stored as
`app.config["ENABLE_TEMPLATE_SUGGESTIONS"]`. All call sites in the
import routes guard on this config value before invoking the suggestion
engine.

## Decision

Keep `ENABLE_TEMPLATE_SUGGESTIONS` as an environment-variable flag
controlled at deployment time (default: `false`).

To enable:

```
ENABLE_TEMPLATE_SUGGESTIONS=true
```

Enable on a per-deployment basis once the `MemorizedTransaction` table
has at least one month of data and the suggestion quality has been
manually validated against local transaction patterns.

## Consequences

- The import UX is slightly simpler when disabled (no suggestion row pre-fill).
- Enabling the flag requires no code change or migration.
- The flag may be removed (and the feature always-on) after a production
  validation period; remove the guards in `routes/` and the config key
  at that point.
