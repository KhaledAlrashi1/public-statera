# Phase 4 · 10d — Docker log retention cap

Persist-first record (standing rule, earned SC-1/2/3). Phase A proposal +
approval lineage saved before implementation.

## DL-C1 owed item (paste verbatim, crossed the channel with the impl report)

> **Client-observable behavior change (by operator ruling, Option A, 2026-07-18):**
> the batch job NO LONGER deletes non-pinned memorized rows with `count ≥ 3`
> idle > 180 days — those now survive indefinitely (matching the inline rule and
> personal_statera's "count >= 3 → never auto-pruned" design).

The MP-C3 sentence was owed since MP-CO-COND-1. **Standing fix (DL-C1):** an
inline-cure obligation converts automatically into a named blocking precondition
of the next gate; it does not ride as a courtesy line.

## Problem

`docker-compose.prod.yml` sets no `logging:` on any service and bootstrap.sh
writes no daemon `log-opts`, so every prod container inherits the daemon default
`json-file` with **no `max-size`/`max-file` → unbounded**. On `restart:
unless-stopped` services the `*-json.log` grows until the host disk fills.
Prod runs `-f docker-compose.prod.yml` standalone (deploy.sh:24); the base/dev
files are never merged into a prod deploy.

## Ruling — 2026-07-18: Docker log cap Phase A — APPROVED WITH CONDITIONS

**DL-A1 (approval):** `json-file` retained + explicit caps per the proposed table
(api/worker/web `10m`×`5`; mysql `10m`×`3`; redis `5m`×`3`; migrate `5m`×`2` for
uniformity); D1/D2/D4 accepted; **D3 ruled: `x-logging-app` ANCHOR for
api/worker/web, mysql/redis inline.** Prod-only scope affirmed (§4).

**DL-C1 (BLOCKING precondition — owed item):** the MP-C3 CLAUDE.md behavior-change
sentence, owed since MP-CO-COND-1, is pasted verbatim BEFORE or WITH the
implementation report. Implementation may not begin until it has crossed the
channel. STANDING FIX (recorded above): inline-cure → named blocking precondition
of the next gate.

**DL-C2 (pre-change evidence):** the operator's measurement paste-back (commands
#1–#4) is part of the record — command #4's all-empty-Config output is the
required BEFORE half of the activation proof. Implementation may be written in
parallel, but the close-out must contain both halves (pre-change `{}` +
post-deploy caps on all five always-on services).

**DL-C3 (mysql bounce):** OPERATOR GO PENDING — the deploy carrying this commit
restarts MySQL once (~30–60s, dependents hold on healthchecks, data on persistent
volume). Channel recommendation: accept on a normal deploy. The go/no-go is
recorded when the operator replies; the deploy does not run without it.

**DL-C4 (close-out shape):** both suites' tails + exits shown unchanged
(675/18/50 API, 166/35 frontend, tsc 0/0), no-baseline-change statement, and the
activation proof as the load-bearing section. Ride-along enumeration per the
standing deploy discipline applies to whichever deploy carries it.

## Approved caps

| Service class | Service(s) | driver | max-size | max-file | mechanism |
|---|---|---|---|---|---|
| App / edge | api, worker, web | json-file | 10m | 5 | `*logging_app` anchor |
| Datastore (moderate) | mysql | json-file | 10m | 3 | inline |
| Datastore (quiet) | redis | json-file | 5m | 3 | inline |
| One-shot | migrate | json-file | 5m | 2 | inline (uniformity) |

## Activation semantics

LogConfig is create-time (`HostConfig.LogConfig`), applied on **recreate**, not
on the fly. `deploy.sh:159` §5 `compose up -d` recreates the five always-on
services (their config hash changed); `migrate` picks it up on its next
`run --rm`. Recreate also discards the old container's accumulated json.log.

**Activation proof (load-bearing close-out section):**
```
ssh statera-prod 'sudo sh -c "for c in \$(docker ps --format {{.Names}}); do \
  echo -n \"\$c: \"; docker inspect -f \"{{json .HostConfig.LogConfig}}\" \$c; echo; done"'
# PASS = redis/mysql/api/worker/web each show Type:json-file with the
#        approved max-size/max-file (NOT empty {}).
```

## Deviations

- **D1** — deviation-by-addition (infra); ops-only, not client-observable.
- **D2** — prod-only scope (not base/dev).
- **D3** — `x-logging-app` anchor for api/worker/web; mysql/redis inline (ruled).
- **D4** — driver retained (`json-file`), not swapped to `local`.

## Baseline delta

None. Infra-only; no `apps/api` / `apps/web` source touched. API 675/18/50,
frontend 166/35, tsc 0/0 — shown unchanged in the close-out.

## DL-C2-BEFORE (pre-change evidence — recorded 2026-07-18)

Operator ran the Phase A §1 measurement commands #1–#4 on-box. The load-bearing
BEFORE half is command #4 (the LogConfig sweep): per the DL-C3 GO ruling, command
#4 returned **`{"Type":"json-file","Config":{}}` on all five always-on containers**
(redis/mysql/api/worker/web) — empty `Config` = unbounded, confirming the §1
"unset = json-file unbounded" finding at runtime. This `{}` baseline is the
BEFORE that the post-deploy activation proof (inspect showing the caps) is
compared against. (Commands #1–#3 quantify the accumulated backlog; the #4
LogConfig baseline is the one the module close turns on.)

## DL-ORPHAN (2026-07-18)

`deploy.sh` §5 `compose up -d` → `compose up -d --remove-orphans`. Reaps the
leftover `statera-nginx-1` container orphaned by the 8e nginx→Caddy cutover (the
nginx service was deleted from compose in 829f8ef but its container was never
removed). Activation proof includes `docker ps -a` showing `statera-nginx-1`
GONE (removed, not merely stopped).

## DL-C3 (resolved — 2026-07-18)

Operator GO recorded ("OK"): the one-time MySQL restart rides a normal deploy.
All Docker-log-cap gates satisfied (DL-C1 discharged, DL-C2 BEFORE-half recorded,
DL-C3 go). Module closes on the post-deploy activation proof, NOT on the green
run — "deployed" ≠ "capped".
