/*
 * Deliberate deviations from Flask (backend/dependencies.py):
 * - sv validation via Redis deny-list (not per-request DB lookup):
 *   Flask's server-side session holds sv and validates it for free (session
 *   already loaded). Hono JWTs are stateless — validating sv against the DB
 *   on every request would add one indexed PK query per authenticated route.
 *   Instead: at revocation time (revoke-all, 2FA disable), write a
 *   sv_revoked:{userId}:{oldSv} key to Redis with a 30-day TTL (matching JWT
 *   expiry). requireAuth checks only for this key — zero DB cost normally,
 *   sub-millisecond Redis GET on every request. Redis outage → fail open (don't
 *   lock out users), consistent with Flask's rate-limiter fallback behaviour.
 * - Revocation lag during Redis outage: old tokens remain valid until Redis
 *   recovers (bounded by the Redis TTL after that). Flask would also have
 *   degraded revocation during a Redis outage.
 * - Old JWTs without sv claim (issued before 7a): skip sv check — they expire
 *   naturally in 30 days. Deploy does not log everyone out.
 */

import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import * as jose from "jose"
import Redis from "ioredis"
import { env } from "../lib/env"

export interface SessionData {
  userId: number
  externalId: string
  authProvider: string
  sv: number
}

declare module "hono" {
  interface ContextVariableMap {
    session: SessionData
  }
}

const SESSION_COOKIE = "statera_session"
// 30 days — matches JWT expiry so revoked-sv keys expire when the token would anyway.
const SV_REVOKE_TTL_SECONDS = 60 * 60 * 24 * 30

function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}

// Lazy Redis singleton for auth operations (sv revocation, pending-2fa counters).
// Separate from BullMQ connection (maxRetriesPerRequest: null) and rate-limiter.
let _authRedis: Redis | null = null

export function getAuthRedis(): Redis {
  if (!_authRedis) {
    const url = new URL(env.redisUrl)
    _authRedis = new Redis({
      host: url.hostname || "127.0.0.1",
      port: Number(url.port) || 6379,
      db: parseInt(url.pathname.replace(/^\//, "") || "0", 10),
      password: url.password || undefined,
    })
    _authRedis.on("error", (err) => console.error("[auth-redis] Redis error:", err))
  }
  return _authRedis
}

function svRevokedKey(userId: number, sv: number): string {
  return `sv_revoked:${userId}:${sv}`
}

// Mark a specific session version as revoked. Call after bumping sessionVersion in DB.
// The old sv value must be passed so the correct deny-list key is written.
// TTL matches JWT expiry — keys clean themselves up when the tokens would expire.
export async function revokeSessionVersion(userId: number, oldSv: number): Promise<void> {
  try {
    await getAuthRedis().set(svRevokedKey(userId, oldSv), "1", "EX", SV_REVOKE_TTL_SECONDS)
  } catch {
    // Non-fatal. The old token expires in ≤30 days regardless.
  }
}

export async function createSessionToken(session: SessionData): Promise<string> {
  return new jose.SignJWT({
    userId: session.userId,
    externalId: session.externalId,
    authProvider: session.authProvider,
    sv: session.sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret())
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const token =
    getCookie(c, SESSION_COOKIE) ??
    c.req.header("Authorization")?.replace(/^Bearer\s+/, "")

  if (!token) {
    throw new HTTPException(401, { message: "Authentication required." })
  }

  let payload: jose.JWTPayload
  try {
    ;({ payload } = await jose.jwtVerify(token, sessionSecret()))
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired session." })
  }

  const userId = payload["userId"] as number
  const jwtSv = payload["sv"] as number | undefined

  // Deny-list check: only runs if the JWT carries an sv claim (post-7a tokens).
  // Old tokens (no sv) pass through — they expire within 30 days.
  if (jwtSv !== undefined) {
    try {
      const revoked = await getAuthRedis().get(svRevokedKey(userId, jwtSv))
      if (revoked !== null) {
        throw new HTTPException(401, {
          message: "Session invalidated. Please sign in again.",
          cause: "session_invalidated",
        })
      }
    } catch (err) {
      if (err instanceof HTTPException) throw err
      // Redis error: fail open — don't lock out users during a Redis outage.
    }
  }

  c.set("session", {
    userId,
    externalId: payload["externalId"] as string,
    authProvider: payload["authProvider"] as string,
    sv: jwtSv ?? 1,
  } satisfies SessionData)

  return next()
}
