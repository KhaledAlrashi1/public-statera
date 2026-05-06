import { env } from "../lib/env"

export function getRedisConnection() {
  const url = new URL(env.redisUrl)
  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port) || 6379,
    db: parseInt(url.pathname.replace(/^\//, "") || "0", 10),
    password: url.password || undefined,
    // Required by BullMQ — disabling these allows blocking commands and avoids
    // the "BLPOP not allowed in pipeline" error that fires when BullMQ uses the
    // connection for job polling.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
}
