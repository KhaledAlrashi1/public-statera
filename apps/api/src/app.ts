import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { env } from "./lib/env.js"
import { healthRouter } from "./routes/health.js"
import { authRouter } from "./routes/auth.js"

export function createApp() {
  const app = new Hono()

  app.use("*", logger())

  app.use(
    "/api/*",
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )

  // Health — no /api prefix (matches Docker healthcheck paths)
  app.route("/", healthRouter)

  // Auth routes
  app.route("/api/auth", authRouter)

  // 404 fallback for unmatched /api/* routes
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ ok: false, error: "API endpoint not found." }, 404)
    }
    return c.notFound()
  })

  app.onError((err, c) => {
    console.error(err)
    const status = "status" in err ? (err as { status: number }).status : 500
    const message = err.message || "Internal server error."
    return c.json({ ok: false, error: message }, status as 500)
  })

  return app
}
