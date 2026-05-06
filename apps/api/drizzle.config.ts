import "dotenv/config"
import type { Config } from "drizzle-kit"

const url =
  process.env.DATABASE_URL ??
  "mysql://statera:statera@127.0.0.1:3306/statera"

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "mysql",
  dbCredentials: { url },
} satisfies Config
