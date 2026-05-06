import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import * as jose from "jose"
import { env } from "../lib/env"

export interface SessionData {
  userId: number
  externalId: string
  authProvider: string
}

declare module "hono" {
  interface ContextVariableMap {
    session: SessionData
  }
}

const SESSION_COOKIE = "statera_session"

function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret)
}

export async function createSessionToken(session: SessionData): Promise<string> {
  return new jose.SignJWT({
    userId: session.userId,
    externalId: session.externalId,
    authProvider: session.authProvider,
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

  try {
    const { payload } = await jose.jwtVerify(token, sessionSecret())
    c.set("session", {
      userId: payload["userId"] as number,
      externalId: payload["externalId"] as string,
      authProvider: payload["authProvider"] as string,
    } satisfies SessionData)
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired session." })
  }

  return next()
}
