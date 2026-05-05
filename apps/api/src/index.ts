import { serve } from "@hono/node-server"
import { env } from "./lib/env.js"
import { createApp } from "./app.js"

const app = createApp()

serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`Statera API listening on http://${info.address}:${info.port}`)
})
