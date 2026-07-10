// Phase 4 / Module 10f — hermetic-unit-test Redis stub.
//
// The api unit suite mocks the DB (Drizzle proxy), rate-limit, and sentry, but
// three modules still construct a real ioredis client at call time:
//   1. middleware/auth.ts   getAuthRedis()   — requireAuth sv deny-list GET
//   2. lib/analytics-cache  getRedisClient() — cache read + cache-bust on writes
//   3. lib/rate-limit.ts    getRedis()       — (route tests already mock this lib)
// With no Redis reachable in CI, ioredis's offline queue + retry strategy leaves
// each queued command pending until the 5s test timeout — the 169 timeouts 10f
// exists to kill. Mocking ioredis module-wide makes every unit test dial a fake
// client whose commands resolve immediately, so no route test touches the network.
//
// This file is wired via setupFiles in vitest.config.ts ONLY when INTEGRATION is
// not "true" — the integration suite (worker.integration.test.ts uses real BullMQ
// Queue/Worker over getRedisConnection()) needs the real ioredis, so the mock is
// deliberately absent in that mode.
//
// SAFETY: no unit test asserts sv-revocation / rate-limit behavior through a real
// Redis (grep confirms zero `session_invalidated` / `sv_revoked` assertions in
// *.test.ts; every sv-revocation test mocks middleware/auth at the spy level, and
// every cache hit/miss test mocks lib/analytics-cache at the function level). So a
// stub that returns "nothing revoked / cache empty" cannot defang an assertion —
// it only unblocks the fail-open / cache-miss paths those tests already expect.
//
// INTENTIONAL FAIL-FAST (do not convert to a Proxy catch-all): this stub is a
// concrete class, so a command it does NOT model is `undefined` and throws
// `TypeError: <cmd> is not a function` loudly. That is a feature, not a gap — it
// forces the stub to explicitly model every command production code legitimately
// issues, and surfaces a real omission as a red run instead of silently returning
// undefined into the caller's logic. It is exactly what caught 10f-fix: health.test.ts
// builds the full app with the REAL rate-limiter, whose RedisStore calls
// script("LOAD", ...) at construction — a command the original 10f stub did not
// implement, producing 24 unhandled rejections. The three rate-limit commands below
// (script / evalsha / decr) were added deliberately, per hono-rate-limiter's dist
// protocol; a Proxy that no-oped everything would have hidden the omission and let
// the rate limiter compute on garbage. Add a method here only when real code calls
// it; never make unknown commands silently succeed.

import { vi } from "vitest"

// IMPORTANT: these are PLAIN methods, not vi.fn(). Six route test files call
// vi.resetAllMocks() in beforeEach; if the stub used vi.fn(), reset would strip
// the implementation and get() would return undefined. requireAuth checks
// `revoked !== null`, and `undefined !== null` is true — every authed request
// would 401 with "Session invalidated". Plain functions are not mocks, so reset
// cannot touch them and get() reliably returns null (== "sv not revoked").

// A pipeline/multi chain: every command is chainable and exec() resolves empty.
// Covers auth.ts's `redis.multi().incr(k).expire(k, 300).exec()`.
function makePipeline() {
  const pipeline: Record<string, unknown> = {}
  const chain = () => pipeline
  for (const m of ["incr", "expire", "pexpire", "set", "setex", "get", "del", "ttl"]) {
    pipeline[m] = chain
  }
  pipeline["exec"] = async () => [] as unknown[]
  return pipeline
}

// Exported so route/lib tests can spy on a single command (e.g. evalsha) to
// exercise the rate-limiter's limit-exceeded path — the base stub's evalsha
// returns [1, 60000] ("first hit"), which never trips a limit.
export class RedisMock {
  // Accept any constructor args (url, options, or connection object).
  constructor(..._args: unknown[]) {}
  async get(): Promise<string | null> {
    return null
  }
  async set(): Promise<string> {
    return "OK"
  }
  async setex(): Promise<string> {
    return "OK"
  }
  async del(): Promise<number> {
    return 0
  }
  async incr(): Promise<number> {
    return 1
  }
  async expire(): Promise<number> {
    return 1
  }
  async pexpire(): Promise<number> {
    return 1
  }
  async ttl(): Promise<number> {
    return -1
  }
  async scan(): Promise<[string, string[]]> {
    return ["0", []]
  }
  async eval(): Promise<unknown> {
    return null
  }
  // ── Rate-limit path (hono-rate-limiter RedisStore via lib/rate-limit.ts) ──────
  // makeRedisClient() maps scriptLoad → script("LOAD", src); RedisStore's
  // constructor eagerly loads its increment + get Lua scripts, so script() must
  // resolve to a string sha or loadIncrementScript throws "unexpected reply from
  // redis client". evalsha runs the loaded script per request; parseScriptResponse
  // requires a 2-element [totalHits, timeToExpire] reply — [1, 60000] means "first
  // hit this window", always under any limit, so the stub never rate-limits a test.
  async script(): Promise<string> {
    return "mock-sha"
  }
  async evalsha(): Promise<[number, number]> {
    return [1, 60000]
  }
  async decr(): Promise<number> {
    return 0
  }
  async quit(): Promise<string> {
    return "OK"
  }
  disconnect(): void {}
  duplicate(): RedisMock {
    return new RedisMock()
  }
  multi() {
    return makePipeline()
  }
  pipeline() {
    return makePipeline()
  }
  // .on("error", ...) is registered by both auth-redis and the cache client;
  // return this so any chained registration is a no-op.
  on(): this {
    return this
  }
}

// ioredis exposes the client as both the default export and a named `Redis`.
vi.mock("ioredis", () => ({ default: RedisMock, Redis: RedisMock }))
