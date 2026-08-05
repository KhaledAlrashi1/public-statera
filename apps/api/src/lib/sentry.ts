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

// ── Free-text money/finance patterns (Task B / B2) ─────────────────────────────
// Promoted here from routes/client-errors.ts so the beforeSend hook and the
// client-error forwarder share ONE scrubber (scrubEventText below). Applied to
// FREE-TEXT fields only (event.message, event.exception.values[].value, and the
// client reporter's message/name/stack) — NOT to structured request/extra data,
// where a bare `amount_kd` field is legitimate debugging context (that path keeps
// using _scrubString). KWD amounts are DECIMAL(_,3): digits then EXACTLY three
// decimals — this does NOT match `file:line:col` (int:int), a 2-decimal number, or
// a semver. Finance key=value redacts the VALUE only, keying on finance field names.
//
// OVER-REDACTION BY DESIGN (Task B / B2-F5): this pattern is amount-SHAPED, not
// amount-AWARE — ANY 3-decimal float at a word boundary is redacted, including
// non-money numbers (a `0.001` ratio, a `1.234 ` latency, a computed metric). This
// is an accepted cost: over-redacting a number is cheaper than leaking a KWD amount,
// and context-narrowing would be fragile. If you see `[REDACTED]` where a duration or
// ratio should be in an error message, that is intended, not a bug. (A 3-decimal
// number immediately followed by a letter — `1.234s` — is NOT matched: the `\b`
// requires a word boundary.) Pinned in sentry.test.ts.
const _KWD_AMOUNT_PATTERN = /\b\d{1,3}(?:,\d{3})*\.\d{3}\b/g
const _FINANCE_KV_PATTERN =
  /\b(merchant|merchant_name|category|category_name|amount|amount_kd|payee|note|memo)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi

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

// Exported building block: _scrubString only (email / IBAN / enc1: / PII key=value).
// The installed `beforeSend` (below) now scrubs event.message and
// event.exception.values[].value too (Task B / B2), so a hand-built event's free
// text is covered by the hook — but callers who want to scrub BEFORE handing text
// to some other sink should prefer scrubEventText (the fuller free-text scrubber).
// scrubText is kept as the audited base primitive. (phase4-frontend-error-tracking T1-1)
export function scrubText(value: string): string {
  return _scrubString(value)
}

// Comprehensive FREE-TEXT scrubber (Task B / B2 — promote+unify, TB-R2). Layers
// KWD-amount and finance key=value redaction on top of _scrubString
// (email/IBAN/enc1:/PII key=value). Used by the beforeSend hook for event.message
// + event.exception values AND by routes/client-errors.ts for the client reporter's
// message/name/stack — ONE scrubber, ONE test suite, no drift. Idempotent: every
// replacement lands on the constant [REDACTED], which carries no digits and
// re-matches the PII key=value pattern to itself, so scrubEventText(scrubEventText(x))
// === scrubEventText(x) (asserted in sentry.test.ts).
export function scrubEventText(value: string): string {
  return _scrubString(value)
    .replace(_KWD_AMOUNT_PATTERN, _REDACTED)
    .replace(_FINANCE_KV_PATTERN, (_m, key: string) => `${key}=${_REDACTED}`)
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

    // Task B / B2 (FIND-S1): the top-level message and each exception value are
    // FREE TEXT the app/handlers can populate with user data (e.g. a mysql2
    // duplicate-entry error echoing an email, or a KWD amount interpolated into a
    // thrown message). The hook historically covered request/extra/breadcrumbs but
    // NOT these — the gap FIND-S1 records. Scrub both as free text (scrubEventText:
    // email/IBAN/enc1:/PII key=value + KWD amount + finance key=value). Stack FRAMES
    // are deliberately NOT scrubbed: includeLocalVariables is off (initSentry does
    // not enable it), so frames carry only filename/function/line — code locations,
    // not user data — and over-scrubbing them would eat the diagnostics a real crash
    // is read from (the 2026-08-01 dashboard crash was diagnosed from a stack).
    if (typeof event.message === "string") {
      event.message = scrubEventText(event.message)
    }
    const exceptionValues = event.exception?.values
    if (Array.isArray(exceptionValues)) {
      for (const ex of exceptionValues) {
        if (typeof ex.value === "string") ex.value = scrubEventText(ex.value)
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
