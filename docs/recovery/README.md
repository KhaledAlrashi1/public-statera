# docs/recovery

Handoff documents for unplanned operational work that touched production state — recovery sessions, incident response, key rotations, etc. Files in this directory are not part of the module-migration workflow; they exist to provide continuity across Claude conversations when an unscheduled event interrupts planned work.

## Convention

One file per incident, named `YYYY-MM-DD-<short-slug>.md`. The slug should be brief and describe the event (e.g. `operator-key-rotation`, `db-restore`, `cert-renewal-failure`), not the resolution.

Each file should capture: what triggered the incident, what was done (on the server, on the operator's machine, in any third-party service), what was deliberately *not* done, session-specific lessons worth carrying forward, and open decisions for the next session. The fix-forward entry in CLAUDE.md is the canonical durable record of the lesson; the file here is the operational continuity document — different reader, different time horizon.

Adding a file here is not a substitute for updating CLAUDE.md. Both should happen.
