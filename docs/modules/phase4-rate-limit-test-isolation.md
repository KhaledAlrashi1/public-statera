# TODO(integration-rate-limit-test-isolation) — 10d

Test-only isolation of the rate-limit / zod-ordering unit tests that fail under
`INTEGRATION=true`. Goal: `INTEGRATION=true` runs exit 0 again — green-means-exit-0
restored, no attribution step. **Production code (`lib/rate-limit.ts`) is NOT touched.**

Baselines to preserve: hermetic API **675 passed / 18 skipped / 50 files, exit 0**;
frontend 166/35; `tsc` 0/0. The hermetic run must be proven UNAFFECTED.

---

## Phase A proposal (approved 2026-07-19, RL-A1)

### Diagnosis (evidenced — from an `INTEGRATION=true` run of the 3 files against live dev Redis, `rl:*` flushed first: 4 failed | 59 passed (63), exit 1)

**Key shape (`lib/rate-limit.ts`):** the Redis key is the `RedisStore` prefix **plus**
the keyGenerator output:
- `rate-limit.ts:80` → `new RedisStore({ …, prefix: "rl:", … })`
- `rate-limit.ts:66-69` → `` return `rl:${session?.userId ?? "anon"}:${c.req.path}` ``

⇒ real key **`rl:rl:1:/api/budgets`** (double `rl:`). All tests use `authHeader()` →
`userId = 1` (`budgets.test.ts:52`), so requests collide on one key. Live dump after the run:

```
rl:rl:1:/api/budgets   = 21 (ttl 22)
rl:rl:1:/api/categories =  7 (ttl 22)
rl:rl:1:/api/merchants  =  8 (ttl 22)
```

- **GET and POST share one bucket.** `GET /api/budgets` (readRateLimit 60/min) and
  `POST /api/budgets` (heavyWriteRateLimit 20/min) resolve to the same `c.req.path` →
  same key; `RedisStore` increments that one key for every limiter instance, so the POST
  limiter (limit 20) sees a count inflated by every GET → reached **21**.
- **The mock spy is inert under INTEGRATION.** `vitest.config.ts:12` sets `setupFiles: []`
  when `INTEGRATION === "true"`, so `redis-mock.setup.ts:133` (`vi.mock("ioredis")`) never
  runs. `RedisMock` is then a class nothing instantiates — production `rate-limit.ts:12`
  does `new Redis(...)` on the real ioredis. `vi.spyOn(RedisMock.prototype, "evalsha")`
  targets dead code.

**M1 — mock-spy dependency (3 tests): expect 429, real limiter never trips → handler runs.**
`categories.test.ts:311-330` / `merchants.test.ts:326-…` force 429 via
`vi.spyOn(RedisMock.prototype, "evalsha").mockResolvedValue([9999, 60000])` (categories:317).
Inert under INTEGRATION; keys at 7 / 8 (< 30 write-limit) → not limited → handler (mock-DB
throws → 500). Budgets rate-limit test (`budgets.test.ts:457-476`) POSTs `{month, budgets:[]}`
(note `budgets`, not `items`) → past inert limiter → fails zod → 400.
```
FAIL budgets.test.ts:471    expected 400 to be 429
FAIL categories.test.ts:325 expected 500 to be 429
FAIL merchants.test.ts:340  expected 500 to be 429
```

**M2 — shared-key pollution (1 test): expect 400, real limiter DOES trip → 429 short-circuits
before zod.** The `budgets — B1 zod shape …` describe (`budgets.test.ts:483`) runs last; by
then `rl:rl:1:/api/budgets` = 21 > 20 → POST rejected before the zod handler.
```
FAIL budgets.test.ts:529 > … (D1 ordering)   expected 429 to be 400
```
Sibling presence cases (503, 513) passed — they ran before the counter crossed 20 (the
ordering-dependent non-determinism).

**Why exactly these 4:** `lib/rate-limit.test.ts` also spies `RedisMock.evalsha` but survives
INTEGRATION — it mounts a bespoke anon route `rl:rl:anon:/limited` at `limit=2` and fires 3
requests, so real Redis returns 200/200/429 regardless of the inert spy (the model for a
robust rate-limit test). notifications' backfilled limiters have no "expect 429" unit test.

### Recommendation — (a) for M1 + (c) for M2, purely test-only

- **M1 (3 tests):** `describe.skipIf(process.env.INTEGRATION === "true")` on the three
  `… — rate limit` describes (budgets:457, categories:311, merchants:326). They assert
  mock-forced *wiring*; the real 429 envelope/counting is covered by `lib/rate-limit.test.ts`.
  Hermetic gate unchanged (they still run + pass there).
- **M2 (1 test):** unique userId in the `budgets — B1 zod shape …` describe's `authHeader()`
  calls → isolated fresh bucket → 400 in both modes, keeping the D1-ordering assertion live
  under INTEGRATION (chosen over skipping it — coverage retention wins).

Both levers kept deliberately; not relying on skipIf reducing budgets 21→20 (boundary luck
is the fragility this ticket exists to kill).

### Projected counts
| | current | after |
|---|---|---|
| Hermetic (CI gate) | 675 / 18 / 50, exit 0 | **unchanged 675 / 18 / 50, exit 0** |
| INTEGRATION 3-file | 4 failed / 59 passed (63), exit 1 | 0 failed / 60 passed / 3 skipped, exit 0 |
| INTEGRATION full | 3 failed files / 4 failed / 689 passed, exit 1 | 0 failed / 690 passed / +3 skipped, exit 0 |

### Deviations
- **D1 — TEST-ONLY, no production touch.** `lib/rate-limit.ts` NOT modified. Any need to
  touch it during implementation is a loud STOP requiring its own justification/re-approval.
- **D2 — `skipIf` is a hermetic-only guard**, the mirror image of the dedicated
  `*.integration.test.ts` rule (these are hermetic-only tests excluded under INTEGRATION).
- **D3 — the 3 skips are INTEGRATION-only.** Real 429 coverage retained hermetically + by
  `lib/rate-limit.test.ts` in both modes.
- **D4 — no shared-Redis flush in test code.** M2 fixed by bucket isolation (unique userId),
  not a `beforeEach` flush.

---

## Ruling — APPROVED (2026-07-19)

- **RL-A1 (approval):** hybrid ships as recommended — (a) `describe.skipIf(INTEGRATION)` on
  the three mock-spy rate-limit describes (M1); (c) unique-userId bucket isolation for the
  budgets B1 zod D1-ordering describe (M2). Open choice ruled: **unique-userId, NOT skip** —
  coverage retention wins. D1–D4 accepted; D1's loud-stop on any `lib/rate-limit.ts` touch
  affirmed. Boundary-luck rejection (not relying on 21→20) endorsed.
- **RL-C1 (observations recorded, no code):** two production-side findings recorded in
  CLAUDE.md's rate-limit deviations note in the same docs touch as persist-first —
  (i) true key shape is double-prefixed `rl:rl:{userId}:{path}` (RedisStore prefix +
  keyGenerator prefix; cosmetic, affects key greps/runbooks); (ii) GET and POST on the same
  path share one counter while carrying different limits, so reads inflate the count writes
  are judged against — an undocumented consequence of path-keying, recorded as an OBSERVATION
  for a future product/ops disposition, not fixed here. Production code untouched per D1.
- **RL-C2 (unique-userId hygiene):** the isolated userId must be documented in-code as a
  rate-limit-bucket isolation token and must not collide with any seeded/demo fixture user;
  the chosen value is stated in the close-out. **Chosen value: `9_000_001`.**
- **RL-C3 (INTEGRATION pre-flush):** pre-run flush scoped to `rl:*` keys only (never
  FLUSHALL); close-out states the exact flush command.
- **RL-C4 (acceptance):** `INTEGRATION=true` full-suite exit 0 with 0 failed is the module's
  acceptance criterion; hermetic invariant 675/18/50 proven unchanged; both runs + tsc
  verbatim with exit codes; baseline hunk shown. Hermetic skip count stays 18 (the 3 skips
  are INTEGRATION-only) — any movement of the hermetic 18 is a finding.

**SEQUENCE:** persist-first (this doc) → implement (test-only) → close-out per RL-C4.

---

## Implementation & verification (2026-07-19)

**Changes (test-only; `lib/rate-limit.ts` untouched per D1):**
- M1 — `describe.skipIf(process.env.INTEGRATION === "true")` on the three rate-limit
  describes: `budgets.test.ts`, `categories.test.ts`, `merchants.test.ts` (each with a
  HERMETIC-ONLY comment explaining the inert-spy mechanism + the mirror-of-integration-rule note).
- M2 — the `budgets — B1 zod shape …` describe now authenticates as `RL_ISO_USER = 9_000_001`
  (documented in-code as the rate-limit-bucket isolation token per RL-C2; well outside any
  seeded/demo fixture user range) → fresh, uncontended `rl:rl:9000001:/api/budgets` bucket.
- RL-C1 observations recorded in CLAUDE.md's "Rate-limit 429 body" note (double-prefix key
  shape + GET/POST shared-counter), same docs touch. Production code untouched.

**Hermetic — GREEN (invariant held):**
- `pnpm --filter statera-api exec tsc --noEmit` → `TSC_EXIT=0`.
- `pnpm --filter statera-api test` → exit 0, no Errors/Unhandled section:
  `Test Files  43 passed | 7 skipped (50)` / `Tests  675 passed | 18 skipped (693)`.
  **675 / 18 / 50 unchanged; hermetic skip count still 18 (RL-C4).** No baseline movement.

**INTEGRATION — fix PROVEN; full-suite exit-0 acceptance deferred to operator env (RL-C4).**
Two `INTEGRATION=true` runs from the sandbox (pre-flushed `rl:*` on db0+db1, scoped —
`redis-cli -n <db> --scan --pattern 'rl:*' | xargs -r redis-cli -n <db> DEL`, never FLUSHALL, RL-C3):
- The 4 known-noise tests are ABSENT from the failure set in both runs. The 3 unit files now
  report `budgets.test.ts (26 tests | 1 skipped)`, `categories.test.ts (17 | 1 skipped)`,
  `merchants.test.ts (20 | 1 skipped)` — rate-limit describes skipped, budgets D1 case PASSES.
- The sandbox could NOT reach the integration DB: no `apps/api/.env` → dotenv default
  `statera:statera` → MySQL "Access denied"; loading root `.env` via `DOTENV_CONFIG_PATH` →
  in-container hostname `mysql` → `getaddrinfo ENOTFOUND mysql` from the host. All 15 failures
  are the 6 `*.integration.test.ts` files on the unreachable DB — environmental, orthogonal to
  this ticket. macOS has no per-process hosts override; /etc/hosts needs sudo.
**INTEGRATION — RL-C4 ACCEPTANCE MET (2026-07-19, RL-CO-2 retry).** The earlier "no
host-pointed DATABASE_URL" claim was wrong (RL-CO-2): the host-pointed URL is derivable by
sourcing the root `.env` in-shell and rewriting the DB host `mysql`→`127.0.0.1` (REDIS_URL is
already `redis://127.0.0.1:6379/1`) — the password never enters the transcript. Executed as
the memorized-prune invocation shape, dev DB migrated host-pointed first, `rl:*` scoped-flushed
(db0+db1) per RL-C3:
```
( set -a; . ./.env; set +a
  DB=$(printf '%s' "$DATABASE_URL" | sed 's#@mysql:#@127.0.0.1:#')
  DATABASE_URL="$DB" REDIS_URL="$REDIS_URL" INTEGRATION=true pnpm --filter statera-api test )
```
Result — `INTEGRATION_EXIT=0`, no FAIL/Unhandled/Access-denied/ENOTFOUND:
```
 Test Files  50 passed (50)
      Tests  690 passed | 3 skipped (693)
```
**690 passed / 3 skipped / 0 failed, exit 0** (was 689/4). The 3 rate-limit files each report
`(N tests | 1 skipped)`; the budgets D1 case passes. RL-C4 satisfied with no operator step.

**Status: COMPLETE — RL-C4 acceptance MET.** CLAUDE.md `TODO(integration-rate-limit-test-isolation)`
known-noise line flipped 4 → 0.
