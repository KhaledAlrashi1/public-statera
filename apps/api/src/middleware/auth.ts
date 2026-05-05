/**
 * Manus OAuth session middleware.
 *
 * Validates the session JWT set by the /api/auth/callback route.
 * Attaches { userId, manusUserId } to c.var.session on success.
 *
 * TODO (Phase 3): replace stub with full Manus OAuth token verification
 * once MANUS_CLIENT_ID / MANUS_CLIENT_SECRET are configured.
 */
import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import * as jose from "jose"
import { env } from "../lib/env.js"

export interface Session {
  userId: number
  manusUserId: string
}

const SESSION_COOKIE = "statera_session"

async function getSessionSecret(): Promise<Uint8Array> {
  return new TextEncoder().encode(env.sessionSecret)
}

export async function createSessionToken(session: Session): Promise<string> {
  const secret = await getSessionSecret()
  return new jose.SignJWT({ userId: session.userId, manusUserId: session.manusUserId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret)
}

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, SESSION_COOKIE) ?? c.req.header("Authorization")?.replace(/^Bearer\s+/, "")

  if (!token) {
    throw new HTTPException(401, { message: "Authentication required." })
  }

  try {
    const secret = await getSessionSecret()
    const { payload } = await jose.jwtVerify(token, secret)
    c.set("session", { userId: payload["userId"] as number, manusUserId: payload["manusUserId"] as string })
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired session." })
  }

  return next()
}
