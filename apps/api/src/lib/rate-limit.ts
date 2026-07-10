import { rateLimiter, RedisStore } from "hono-rate-limiter"
import Redis from "ioredis"
import type { MiddlewareHandler, Context } from "hono"
import { getRedisConnection } from "../worker/connection"

// Lazy singleton — created on first use so tests that don't touch rate-limited
// routes don't pay the Redis connection cost.
let _redis: Redis | null = null

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(getRedisConnection())
    _redis.on("error", (err) => {
      console.error("[rate-limit] Redis error:", err)
    })
  }
  return _redis
}

// IORedis uses script('LOAD', ...) not scriptLoad(); adapter maps to the
// interface hono-rate-limiter's RedisStore expects.
function makeRedisClient(redis: Redis) {
  return {
    scriptLoad: (script: string) =>
      (redis as unknown as { script: (...a: string[]) => Promise<string> }).script("LOAD", script),
    evalsha: <TArgs extends unknown[], TData = unknown>(
      sha1: string,
      keys: string[],
      args: TArgs,
    ): Promise<TData> =>
      redis.evalsha(
        sha1,
        keys.length,
        ...keys,
        ...(args as unknown[]).map(String),
      ) as Promise<TData>,
    decr: (key: string) => redis.decr(key),
    del: (key: string) => redis.del(key),
  }
}

// Deliberate deviations from Flask / design notes for the 10d rate-limit backfill
// (budgets, categories, merchants, notifications):
//   - 429 body: Flask's rate_limit helper returned the standard envelope with
//     code="rate_limit_exceeded" and extra={retry_after}. hono-rate-limiter's
//     default handler returns a plain-text 429 unless `message` is set, so every
//     limiter here now carries the JSON envelope below (see createRateLimiter).
//     This changes the 429 *body* of the pre-existing limiters (transactions/auth)
//     from text → JSON envelope — a strict improvement; no contract or frontend
//     branch depended on the text body.
//   - Keying is per-(userId, concrete request path). For FIXED-path routes this is
//     truly per-user-per-route (incl. the heaviest write, POST /api/budgets). For
//     `:id` routes (categories/merchants DELETE, PATCH, remap) c.req.path includes
//     the id, so the bucket is per-(user, resource-id): retrying the SAME mutation
//     is capped, but enumerating many ids is not. Accepted per the 2026-07-10
//     ruling — the realistic runaway (retry one resource) is covered, and an authed
//     user enumerating their own rows is low-value abuse. FOLLOW-UP OPTION (not
//     built — would be a new mechanism): key on the route pattern instead of the
//     concrete path for strict per-route buckets. Rejected now because mounted
//     sub-routers share pattern `/:id`, so a routePath-only key would collide
//     categories- and merchants-delete buckets; fixing that needs a bespoke
//     keyGenerator, out of scope for "reuse createRateLimiter, no new mechanism".

// Key: userId from session. All rate-limited routes already require auth, so
// userId is always present — stronger than per-IP (which can be shared/rotated).
function keyGenerator(c: Context): string {
  const session = c.get("session") as { userId?: number } | undefined
  return `rl:${session?.userId ?? "anon"}:${c.req.path}`
}

/**
 * createRateLimiter(max, windowSec) — fixed-window Hono middleware backed by Redis.
 * Matches Flask's INCR+EXPIRE approach (per-user key, 60s window by default).
 */
export function createRateLimiter(max: number, windowSec = 60): MiddlewareHandler {
  return rateLimiter({
    windowMs: windowSec * 1000,
    limit: max,
    keyGenerator,
    store: new RedisStore({ client: makeRedisClient(getRedis()), prefix: "rl:", resetExpiryOnChange: false }),
    standardHeaders: "draft-6",
    // Standard error envelope on 429 (matches Flask's code + retry_after). The
    // library's default handler serializes an object `message` via c.json(...) at
    // statusCode 429, so no custom handler is needed.
    message: {
      ok: false,
      data: null,
      error: "Too many requests. Please try again later.",
      code: "rate_limit_exceeded",
      meta: { retry_after: windowSec },
    },
  }) as MiddlewareHandler
}

// Named instances matching Flask rate-limit constants.
export const searchRateLimit = createRateLimiter(60)
export const importRateLimit = createRateLimiter(10)
export const exportRateLimit = createRateLimiter(5)

// 10d rate-limit backfill tiers (deviation-by-addition — Flask left these routes
// unlimited; sized by analogy to the constants above). read=60, write=30,
// heavyWrite=20 (POST /api/budgets full-month replace + categories/merchants remap).
export const readRateLimit = createRateLimiter(60)
export const writeRateLimit = createRateLimiter(30)
export const heavyWriteRateLimit = createRateLimiter(20)
