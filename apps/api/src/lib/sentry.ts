import * as Sentry from "@sentry/node"
import type { ErrorEvent, EventHint } from "@sentry/node"
import { env } from "./env"

// ── Sensitive-key scrubbing ───────────────────────────────────────────────────
//
// Ported from backend/lib/log_scrubber.py with one intentional deviation:
// the original Python set included the bare key "name", which indiscriminately
// redacted merchant names, category names, budget labels, and other legitimate
// debugging context. Replaced here with the four user-PII-specific variants
// (first_name, last_name, display_name, full_name) that carry the same intent
// without nuking domain field names.
//
// TODO: structured-log scrubbing (_LogScrubFilter equivalent) is NOT implemented.
// The beforeSend hook below covers all Sentry events, but console/process output
// is unscrubbed. Future work: introduce Pino with a `redact` config covering
// enc1: ciphertext, IBAN patterns, and the _SENSITIVE_KEYS set. Decide in Phase 4
// whether this becomes a hardening item or a separate ticket.

const _SENSITIVE_KEYS = new Set([
  "email",
  "first_name",
  "last_name",
  "display_name",
  "full_name",
  "phone",
  "phone_number",
  "mobile",
  "iban",
  "password",
  "password_hash",
  "current_password",
  "new_password",
  "totp_secret",
  "totp_code",
  "backup_code",
  "access_token",
  "refresh_token",
  "authorization",
  "x-csrftoken",
  "x-csrf-token",
  "csrf_token",
  "secret_key",
  "encryption_key",
  "encryption_key_previous",
  "postmark_api_key",
  "api_key",
  "token",
  "token_hash",
  "confirmation_token",
  "session_secret",
])

const _REDACTED = "[REDACTED]"

const _ENC_PATTERN = /enc1:[A-Za-z0-9_=\-]{20,}/g
const _EMAIL_PATTERN = /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/gi
const _IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi
const _KEY_VALUE_PATTERN =
  /\b(email|first_name|last_name|display_name|full_name|phone|phone_number|mobile|iban)=([^,\n]*?)(?=\s+\w+=|,|$)/gi

function _scrubString(value: string): string {
  return value
    .replace(_ENC_PATTERN, _REDACTED)
    .replace(_EMAIL_PATTERN, _REDACTED)
    .replace(_IBAN_PATTERN, _REDACTED)
    .replace(_KEY_VALUE_PATTERN, (_, key) => `${key}=${_REDACTED}`)
}

function _scrubDict(d: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 8) return d
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(d)) {
    if (_SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = _REDACTED
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = _scrubDict(value as Record<string, unknown>, depth + 1)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object"
          ? _scrubDict(item as Record<string, unknown>, depth + 1)
          : typeof item === "string"
            ? _scrubString(item)
            : item,
      )
    } else if (typeof value === "string") {
      result[key] = _scrubString(value)
    } else {
      result[key] = value
    }
  }
  return result
}

export function sentryBeforeSend(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent | null {
  try {
    const requestData = event.request ?? {}

    if ("data" in requestData && requestData.data !== undefined) {
      if (typeof requestData.data === "object" && requestData.data !== null) {
        requestData.data = _scrubDict(requestData.data as Record<string, unknown>)
      } else if (typeof requestData.data === "string") {
        requestData.data = _scrubString(requestData.data)
      }
    }

    if (requestData.headers && typeof requestData.headers === "object") {
      requestData.headers = _scrubDict(
        requestData.headers as Record<string, unknown>,
      ) as Record<string, string>
    }

    if (Object.keys(requestData).length > 0) {
      event.request = requestData
    }

    if (event.extra && typeof event.extra === "object") {
      event.extra = _scrubDict(event.extra as Record<string, unknown>)
    }

    const breadcrumbs = event.breadcrumbs
    if (Array.isArray(breadcrumbs)) {
      for (const crumb of breadcrumbs) {
        if (crumb.data && typeof crumb.data === "object") {
          crumb.data = _scrubDict(crumb.data as Record<string, unknown>)
        }
      }
    }
  } catch {
    // Never let scrubbing break event delivery.
  }

  return event
}

export function initSentry(): void {
  if (!env.sentryDsn) return

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    release: env.sentryRelease || undefined,
    sendDefaultPii: false,
    beforeSend: sentryBeforeSend,
  })
}

// Re-export the parts other modules need so they don't import @sentry/node directly.
export { Sentry }
