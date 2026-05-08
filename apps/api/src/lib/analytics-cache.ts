/**
 * Redis-backed analytics cache helpers: circuit breaker, key builders,
 * cache bust, MySQL statement timeout guard, and 3-tier dashboard cache
 * orchestration.
 *
 * Deliberate deviations from Flask (lib/cache.py):
 * - No threading.Lock: Node.js is single-threaded; module-level variables are
 *   safe without a mutex (no concurrent mutation within a JS microtask).
 * - Separate ioredis client: Flask reuses _rate_limiter._get_redis_client().
 *   TS uses a dedicated instance — BullMQ's connection is reserved for blocking
 *   job-polling commands and must not be shared with general-purpose cache ops.
 * - hardFail parameter replaces Flask's g context manager: Flask's
 *   analytics_cache_circuit_breaker() sets a request-scoped flag on Flask.g to
 *   opt routes into hard-fail (503) behavior. TS uses an explicit boolean
 *   parameter — simpler and avoids AsyncLocalStorage complexity.
 * - SET SESSION max_execution_time replaces SET LOCAL statement_timeout:
 *   Flask's timeout guard is PostgreSQL-only (SET LOCAL; SQLSTATE 57014). MySQL
 *   has no statement-scoped equivalent; SET SESSION applies for the session
 *   lifetime and is reset in finally. MySQL errno 3024 = ER_QUERY_TIMEOUT.
 * - Snapshot cache uses a 900s TTL as a safety net in addition to explicit
 *   bust-on-mutation. Flask is bust-only; the TTL guards against bust failures.
 */

import Redis from "ioredis"
import { eq, sql } from "drizzle-orm"
import type { getDb } from "../db/connection"
import { dashboardSnapshots } from "../db/schema/dashboard-snapshots"
import { env } from "./env"
import { Sentry } from "./sentry"
import {
  computeDashboardMetricsPayload,
  currentMonthKeyUtc,
  isSnapshotEligible,
  loadDashboardSnapshot,
  persistDashboardSnapshot,
  type DashboardMetricsPayload,
} from "./dashboard-snapshot-lib"

// ── Error types ───────────────────────────────────────────────────────────────

export class CacheBackendUnavailableError extends Error {
  constructor(message = "Cache backend unavailable.") {
    super(message)
    this.name = "CacheBackendUnavailableError"
  }
}

export class AnalyticsComputationTimeoutError extends Error {
  constructor(message = "Analytics computation timed out.") {
    super(message)
    this.name = "AnalyticsComputationTimeoutError"
  }
}

// ── Circuit breaker state (process-local) ─────────────────────────────────────
// Mirrors Flask's module-level globals in lib/cache.py.
// Node.js is single-threaded; no mutex needed.
//
// Two independent circuits:
// 1. General Redis availability (_cacheCircuit*): counts failures; on threshold,
//    blocks all Redis calls for the reset window. Fail-open: requests proceed
//    without cache when the circuit is open.
// 2. Analytics hard-fail (_analyticsBreaker*): opt-in via hardFail:true. When
//    tripped, throws CacheBackendUnavailableError (→ 503) instead of null.
//    This is what prevents MySQL DoS during long Redis outages.

let _cacheCircuitFailures = 0
let _cacheCircuitOpenUntil = 0 // Date.now() ms; 0 = closed
let _analyticsBreakerOpenUntil = 0 // Date.now() ms; 0 = closed

export const CACHE_CIRCUIT_THRESHOLD = 3
export const CACHE_CIRCUIT_RESET_MS = 30_000

function cacheCircuitIsOpen(): boolean {
  if (_cacheCircuitFailures < CACHE_CIRCUIT_THRESHOLD) return false
  if (Date.now() >= _cacheCircuitOpenUntil) {
    // Time window elapsed — reset and allow next request through as a half-open probe.
    _cacheCircuitFailures = 0
    _cacheCircuitOpenUntil = 0
    return false
  }
  return true
}

function cacheCircuitFail(): number {
  _cacheCircuitFailures++
  if (_cacheCircuitFailures >= CACHE_CIRCUIT_THRESHOLD) {
    _cacheCircuitOpenUntil = Date.now() + CACHE_CIRCUIT_RESET_MS
  }
  return _cacheCircuitFailures
}

function cacheCircuitSucceed(): void {
  _cacheCircuitFailures = 0
  _cacheCircuitOpenUntil = 0
}

export function resetAnalyticsCacheCircuitBreaker(): void {
  _cacheCircuitFailures = 0
  _cacheCircuitOpenUntil = 0
  _analyticsBreakerOpenUntil = 0
}

/** @internal For test inspection only. */
export function _testGetCircuitState(): { failures: number; openUntil: number } {
  return { failures: _cacheCircuitFailures, openUntil: _cacheCircuitOpenUntil }
}

// ── Redis client ──────────────────────────────────────────────────────────────

let _redisClient: Redis | null = null
let _redisFactory: (() => Redis | null) | null = null

/** @internal For test injection only. */
export function _setRedisFactoryForTest(f: (() => Redis | null) | null): void {
  _redisFactory = f
}

function getRedisClient(): Redis | null {
  if (_redisFactory !== null) return _redisFactory()
  if (!env.redisUrl) return null
  if (!_redisClient) {
    _redisClient = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    })
  }
  return _redisClient
}

// ── Core cache operations ─────────────────────────────────────────────────────
//
// hardFail (default false): when true, throws CacheBackendUnavailableError
// instead of returning null on circuit-open or Redis error. Routes that can
// serve a degraded experience pass false; analytics routes that should 503
// rather than hammer MySQL pass true.

function buildUnavailableError(): CacheBackendUnavailableError {
  return new CacheBackendUnavailableError(
    "Redis is unavailable. Dashboard analytics are temporarily unavailable while the cache recovers.",
  )
}

function tripAnalyticsBreakerAndThrow(): never {
  const timeoutSeconds = env.analyticsCacheCircuitBreakerTimeoutSeconds
  const until = Date.now() + timeoutSeconds * 1000
  if (until > _analyticsBreakerOpenUntil) {
    _analyticsBreakerOpenUntil = until
  }
  throw buildUnavailableError()
}

export async function cacheGet(
  key: string,
  opts?: { hardFail?: boolean },
): Promise<string | null> {
  const hardFail = opts?.hardFail ?? false

  // Check analytics breaker first (hard-fail specific)
  if (hardFail && _analyticsBreakerOpenUntil > Date.now()) {
    throw buildUnavailableError()
  }

  if (cacheCircuitIsOpen()) {
    if (hardFail) throw buildUnavailableError()
    return null
  }

  let client: Redis | null
  try {
    client = getRedisClient()
  } catch (err) {
    const failures = cacheCircuitFail()
    Sentry.captureException(err, { tags: { handler: "cacheGet", key } })
    console.warn(`[analytics-cache] Redis client unavailable (${failures} failures)`)
    if (hardFail) tripAnalyticsBreakerAndThrow()
    return null
  }

  if (!client) return null

  try {
    const value = await client.get(key)
    cacheCircuitSucceed()
    return value ?? null
  } catch (err) {
    const failures = cacheCircuitFail()
    Sentry.captureException(err, { tags: { handler: "cacheGet", key } })
    console.warn(`[analytics-cache] Redis GET failed key=${key} (${failures} failures)`)
    if (hardFail) tripAnalyticsBreakerAndThrow()
    return null
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number,
  opts?: { hardFail?: boolean },
): Promise<boolean> {
  const hardFail = opts?.hardFail ?? false

  if (cacheCircuitIsOpen()) {
    if (hardFail) throw buildUnavailableError()
    return false
  }

  let client: Redis | null
  try {
    client = getRedisClient()
  } catch (err) {
    cacheCircuitFail()
    if (hardFail) throw buildUnavailableError()
    return false
  }

  if (!client) return false

  try {
    const ttl = Math.max(1, Math.floor(ttlSeconds))
    await client.set(key, value, "EX", ttl)
    cacheCircuitSucceed()
    return true
  } catch (err) {
    const failures = cacheCircuitFail()
    Sentry.captureException(err, { tags: { handler: "cacheSet", key } })
    console.warn(`[analytics-cache] Redis SET failed key=${key} (${failures} failures)`)
    if (hardFail) throw buildUnavailableError()
    return false
  }
}

// Uses SCAN+DEL (not KEYS) to avoid blocking Redis on large keyspaces.
export async function cacheDeletePattern(pattern: string, count = 500): Promise<number> {
  if (cacheCircuitIsOpen()) return 0

  let client: Redis | null
  try {
    client = getRedisClient()
  } catch {
    return 0
  }

  if (!client) return 0

  let deleted = 0
  let cursor = "0"
  try {
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        String(Math.max(1, count)),
      )
      cursor = nextCursor
      if (keys.length > 0) {
        deleted += await client.del(...(keys as [string, ...string[]]))
      }
    } while (cursor !== "0")
    cacheCircuitSucceed()
  } catch (err) {
    cacheCircuitFail()
    Sentry.captureException(err, { tags: { handler: "cacheDeletePattern", pattern } })
  }
  return deleted
}

// ── Cache key builders ────────────────────────────────────────────────────────

export function dashboardMetricsCacheKey(
  userId: number,
  months: number,
  until?: string | null,
): string {
  return `dashboard_metrics:${userId}:${months}:${until ?? ""}`
}

export function safeToSpendCacheKey(userId: number, month: string): string {
  return `safe_to_spend:${userId}:${month}`
}

// ── Cache bust helpers ────────────────────────────────────────────────────────

// includeSnapshots defaults true — use when a transaction mutation makes the
// snapshot stale. The rebuild job MUST pass { includeSnapshots: false } since
// it just wrote a fresh snapshot and deleting it would be counterproductive.
export async function cacheBustDashboardMetrics(
  userId: number,
  db: ReturnType<typeof getDb>,
  opts?: { includeSnapshots?: boolean },
): Promise<number> {
  const includeSnapshots = opts?.includeSnapshots ?? true
  let deleted = await cacheDeletePattern(`dashboard_metrics:${userId}:*`)
  if (includeSnapshots) {
    try {
      const [result] = await db
        .delete(dashboardSnapshots)
        .where(eq(dashboardSnapshots.userId, userId))
      deleted += result.affectedRows ?? 0
    } catch (err) {
      Sentry.captureException(err, { tags: { handler: "cacheBustDashboardMetrics", userId } })
    }
  }
  return deleted
}

export async function cacheBustSafeToSpend(userId: number): Promise<number> {
  return cacheDeletePattern(`safe_to_spend:${userId}:*`)
}

// ── Statement timeout guard (MySQL) ──────────────────────────────────────────

function isMySQLTimeoutError(err: unknown): boolean {
  if (err && typeof err === "object") {
    if ((err as { errno?: number }).errno === 3024) return true
    const msg = String((err as { message?: string }).message ?? "")
    if (msg.includes("Query execution was interrupted")) return true
  }
  return false
}

// MySQL equivalent of Flask's _analytics_timeout_guard (PostgreSQL SET LOCAL).
// MySQL has no statement-scoped timeout; SET SESSION applies for the session
// lifetime. The finally block resets to 0 (no limit) so the pooled connection
// is returned clean. Reset failure is swallowed — a broken session will be
// discarded by the connection pool.
export async function withAnalyticsTimeout<T>(
  db: ReturnType<typeof getDb>,
  seconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const ms = Math.max(1, seconds) * 1000
  await db.execute(sql`SET SESSION max_execution_time = ${ms}`)
  try {
    return await fn()
  } catch (err) {
    if (isMySQLTimeoutError(err)) {
      throw new AnalyticsComputationTimeoutError("Analytics computation timed out.")
    }
    throw err
  } finally {
    try {
      await db.execute(sql`SET SESSION max_execution_time = 0`)
    } catch {
      // Swallowed — broken sessions are discarded by the pool.
    }
  }
}

// ── 3-tier dashboard cache orchestration ─────────────────────────────────────

export type DashboardCacheStatus = "hit" | "snapshot" | "miss"

export type GetDashboardMetricsOpts = {
  months: number
  endYear: number
  endMonth: number
  cycleEnabled: boolean
  cycleStart?: string | null
  cycleEnd?: string | null
  currentMonthKey?: string // defaults to currentMonthKeyUtc()
  snapshotMonthsCount?: number // defaults to env.dashboardSnapshotMonths
  until?: string | null // cache key suffix (matches Flask's cache_until)
  hardFail?: boolean // propagated to cacheGet (true → 503 on cache miss)
}

// Implements the 3-tier cache stack from Flask's api_dashboard_metrics handler:
//   Tier 1: Redis GET → hit: return cached payload
//   Tier 2: Snapshot table → hit: warm Redis, return snapshot payload
//   Tier 3: Recompute → persist snapshot (if eligible) + warm Redis, return
// Returns cacheStatus so the route can set X-Cache-Status response headers.
export async function getDashboardMetricsWithCache(
  userId: number,
  db: ReturnType<typeof getDb>,
  opts: GetDashboardMetricsOpts,
): Promise<{ payload: DashboardMetricsPayload; cacheStatus: DashboardCacheStatus }> {
  const {
    months,
    endYear,
    endMonth,
    cycleEnabled,
    cycleStart,
    cycleEnd,
    currentMonthKey = currentMonthKeyUtc(),
    snapshotMonthsCount = env.dashboardSnapshotMonths,
    until,
    hardFail = false,
  } = opts

  const cacheKey = dashboardMetricsCacheKey(userId, months, until)

  // Tier 1 — Redis
  const cached = await cacheGet(cacheKey, { hardFail })
  if (cached) {
    try {
      const payload = JSON.parse(cached) as DashboardMetricsPayload
      if (payload && typeof payload === "object") {
        return { payload, cacheStatus: "hit" }
      }
    } catch {
      // Corrupt cache entry — fall through to tier 2
    }
  }

  const windowEndMonth = `${endYear}-${String(endMonth).padStart(2, "0")}`
  const snapshotEligible = isSnapshotEligible(
    months,
    endYear,
    endMonth,
    cycleEnabled,
    currentMonthKey,
    snapshotMonthsCount,
  )

  // Tier 2 — Snapshot table
  if (snapshotEligible) {
    const snapshot = await loadDashboardSnapshot(userId, db, months, windowEndMonth)
    if (snapshot) {
      // 900s TTL safety net. Dashboard metrics cache is bust-based on transaction
      // mutation; TTL prevents stale data if a bust somehow fails.
      await cacheSet(cacheKey, JSON.stringify(snapshot), 900)
      return { payload: snapshot, cacheStatus: "snapshot" }
    }
  }

  // Tier 3 — On-demand recompute
  const payload = await computeDashboardMetricsPayload(userId, db, {
    months,
    endYear,
    endMonth,
    cycleEnabled,
    cycleStart,
    cycleEnd,
  })

  if (snapshotEligible) {
    try {
      await persistDashboardSnapshot(userId, db, months, windowEndMonth, payload)
    } catch (err) {
      Sentry.captureException(err, {
        tags: { handler: "getDashboardMetricsWithCache.persist", userId },
      })
    }
  }
  await cacheSet(cacheKey, JSON.stringify(payload), 900)

  return { payload, cacheStatus: "miss" }
}
