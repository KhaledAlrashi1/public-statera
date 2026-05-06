import { serve } from "@hono/node-server"
import { env } from "./lib/env"
import { createApp } from "./app"

const app = createApp()

serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`Statera API listening on http://${info.address}:${info.port}`)
})
