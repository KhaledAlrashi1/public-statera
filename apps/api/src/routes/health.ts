import { Hono } from "hono"

const health = new Hono()

health.get("/health", (c) => c.json({ ok: true, status: "healthy" }))
health.get("/healthz", (c) => c.json({ ok: true, status: "healthy" }))
health.get("/readyz", (c) => c.json({ ok: true, status: "ready" }))

export { health as healthRouter }
