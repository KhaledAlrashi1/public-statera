import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { env } from "../lib/env"
import * as schema from "./schema/index"

let _pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      uri: env.databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    })
  }
  return _pool
}

export function getDb() {
  return drizzle(getPool(), { schema, mode: "default" })
}

export type Db = ReturnType<typeof getDb>
