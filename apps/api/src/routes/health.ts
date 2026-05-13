import { Hono } from "hono"

const health = new Hono()

// GIT_SHA is stamped into the image at build time (ARG → ENV in Dockerfile).
// Lets you confirm the deployed commit without SSH access.
const version = process.env.GIT_SHA ?? "unknown"

health.get("/health", (c) => c.json({ ok: true, status: "healthy", version }))
health.get("/healthz", (c) => c.json({ ok: true, status: "healthy", version }))
health.get("/readyz", (c) => c.json({ ok: true, status: "ready", version }))

export { health as healthRouter }
