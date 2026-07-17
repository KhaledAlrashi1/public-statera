import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import { env } from "./lib/env"
import { Sentry } from "./lib/sentry"
import { healthRouter } from "./routes/health"
import { authRouter } from "./routes/auth"
import { categoriesRouter } from "./routes/categories"
import { merchantsRouter } from "./routes/merchants"
import { transactionsRouter } from "./routes/transactions"
import { uploadRouter } from "./routes/upload"
import { memorizedRouter } from "./routes/memorized"
import { budgetsRouter } from "./routes/budgets"
import { suggestionsRouter } from "./routes/suggestions"
import { aggregationRouter } from "./routes/aggregation"
import { intelligenceRouter } from "./routes/intelligence"
import { notificationsRouter } from "./routes/notifications"
import { accountRouter } from "./routes/account"

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

  // Domain routes
  app.route("/api/categories", categoriesRouter)
  app.route("/api/merchants", merchantsRouter)
  app.route("/api/transactions", transactionsRouter)
  app.route("/api/transactions", uploadRouter)
  app.route("/api/memorized-transactions", memorizedRouter)
  app.route("/api/budgets", budgetsRouter)
  app.route("/api/transaction-suggestions", suggestionsRouter)
  app.route("/api/analytics", aggregationRouter)
  app.route("/api/analytics", intelligenceRouter)
  app.route("/api/notifications", notificationsRouter)
  app.route("/api/account", accountRouter)

  // 404 fallback for unmatched /api/* routes
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ ok: false, error: "API endpoint not found." }, 404)
    }
    return c.notFound()
  })

  app.onError((err, c) => {
    // Report unexpected errors to Sentry. HTTPExceptions (4xx) are operational
    // errors, not bugs — only report 5xx.
    const status = err instanceof HTTPException ? err.status : 500
    if (status >= 500) {
      Sentry.captureException(err, {
        tags: { url: c.req.url, method: c.req.method },
      })
    }

    const message =
      err instanceof HTTPException ? err.message : (err.message || "Internal server error.")
    return c.json({ ok: false, error: message }, status as 500)
  })

  return app
}
