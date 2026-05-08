import "dotenv/config"

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key]
  if (!val) return fallback
  const n = parseInt(val, 10)
  if (isNaN(n)) throw new Error(`Environment variable ${key} must be an integer, got: "${val}"`)
  return n
}

// Accepts: "true"|"1"|"yes"|"on" → true; "false"|"0"|"no"|"off"|"" → false.
// Throws on startup for any other value so misconfiguration surfaces immediately.
function optionalBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (raw === undefined) return fallback
  const val = raw.trim().toLowerCase()
  if (val === "") return fallback
  if (["true", "1", "yes", "on"].includes(val)) return true
  if (["false", "0", "no", "off"].includes(val)) return false
  throw new Error(
    `Environment variable ${key} must be a boolean (true/false/1/0/yes/no/on/off), got: "${raw}"`,
  )
}

const isDev =
  optional("NODE_ENV", "development") === "development" ||
  optional("STATERA_DEV_MODE").toLowerCase() === "true"

export const env = {
  isDev,
  port: optionalInt("API_PORT", 3000),
  host: optional("API_HOST", "127.0.0.1"),

  databaseUrl: isDev
    ? optional("DATABASE_URL", "mysql://statera:statera@127.0.0.1:3306/statera")
    : required("DATABASE_URL"),

  encryptionKey: isDev ? optional("ENCRYPTION_KEY", "0".repeat(64)) : required("ENCRYPTION_KEY"),
  encryptionKeyPrevious: optional("ENCRYPTION_KEY_PREVIOUS"),

  sessionSecret: isDev
    ? optional("SESSION_SECRET", "dev-session-secret-do-not-use-in-production")
    : required("SESSION_SECRET"),

  oauthClientId: isDev ? optional("OAUTH_CLIENT_ID") : required("OAUTH_CLIENT_ID"),
  oauthClientSecret: isDev ? optional("OAUTH_CLIENT_SECRET") : required("OAUTH_CLIENT_SECRET"),
  oauthIssuerUrl: optional("OAUTH_ISSUER_URL", "https://accounts.google.com"),
  oauthProvider: optional("OAUTH_PROVIDER", "google"),
  oauthRedirectUri: optional(
    "OAUTH_REDIRECT_URI",
    "http://127.0.0.1:3000/api/auth/callback",
  ),

  corsOrigins: optional("CORS_ORIGINS", "http://127.0.0.1:3002")
    .split(",")
    .map((s) => s.trim()),

  redisUrl: optional("REDIS_URL", "redis://127.0.0.1:6379/1"),

  sentryDsn: optional("SENTRY_DSN"),
  sentryEnvironment: optional("SENTRY_ENVIRONMENT", isDev ? "development" : "production"),
  sentryRelease: optional("SENTRY_RELEASE"),

  postmarkApiKey: optional("POSTMARK_API_KEY"),
  mailFromAddress: optional("MAIL_FROM_ADDRESS", "noreply@example.com"),

  enableOpenBanking: optionalBool("ENABLE_OPEN_BANKING", false),
  enableTemplateSuggestions: optionalBool("ENABLE_TEMPLATE_SUGGESTIONS", false),
  enableRecurringPatterns: optionalBool("ENABLE_RECURRING_PATTERNS", true),

  // Analytics cache and snapshot configuration
  analyticsComputeTimeoutSeconds: optionalInt("ANALYTICS_COMPUTE_TIMEOUT_SECONDS", 10),
  analyticsCacheCircuitBreakerTimeoutSeconds: optionalInt(
    "ANALYTICS_CACHE_CIRCUIT_BREAKER_TIMEOUT_SECONDS",
    10,
  ),
  // Default true: fast-fail with 503 on Redis outage is safer than silent
  // degrade, which can cascade into MySQL DoS during long outages.
  analyticsCacheCircuitBreakerEnabled: optionalBool(
    "ANALYTICS_CACHE_CIRCUIT_BREAKER_ENABLED",
    true,
  ),
  dashboardSnapshotMonths: optionalInt("DASHBOARD_SNAPSHOT_MONTHS", 24),
  snapshotRebuildWindowDays: optionalInt("SNAPSHOT_REBUILD_WINDOW_DAYS", 14),
  snapshotRebuildConcurrency: optionalInt("SNAPSHOT_REBUILD_CONCURRENCY", 5),
}
