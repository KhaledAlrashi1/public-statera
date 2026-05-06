import { describe, it, expect } from "vitest"
import { createApp } from "../app"

const app = createApp()

describe("health routes", () => {
  it("GET /health returns 200 with ok:true", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.status).toBe("healthy")
  })

  it("GET /healthz returns 200", async () => {
    const res = await app.request("/healthz")
    expect(res.status).toBe(200)
  })

  it("GET /readyz returns 200", async () => {
    const res = await app.request("/readyz")
    expect(res.status).toBe(200)
  })

  it("unknown /api/ route returns 404 JSON", async () => {
    const res = await app.request("/api/does-not-exist")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
