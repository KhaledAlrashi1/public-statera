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
  }) as MiddlewareHandler
}

// Named instances matching Flask rate-limit constants.
export const searchRateLimit = createRateLimiter(60)
export const importRateLimit = createRateLimiter(10)
export const exportRateLimit = createRateLimiter(5)
