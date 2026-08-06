// phase4-frontend-error-tracking — T1-2 frontend reporter (Option (c), SEQ-3).
//
// Hand-rolled (no @sentry/* dep, by ruling). Installs global error +
// unhandledrejection handlers and receives ErrorBoundary.componentDidCatch, then
// POSTs a CLOSED-ALLOWLIST payload to the same-origin /api/client-errors endpoint,
// which forwards into the server-side Sentry. No new external origin (connect-src
// 'self' covers it).
//
// CAPTURE LIMIT (structural, stated not implied): errors thrown BEFORE this
// module's install line runs — i.e. during main.tsx's own import-graph evaluation
// (App and its transitive imports, the @fontsource CSS) — occur before
// initErrorReporter() executes and are uncapturable by these handlers. Everything
// from mount onward (render errors via the boundary, event-handler + async errors
// via the global handlers) is covered.
//
// PII posture (CONDITION ii, client half): the payload is built field-by-field
// from a fixed allowlist; the raw Error object is never spread or serialized
// wholesale. NEVER included: location.search, location.hash, React props/state,
// DOM text, form values, localStorage, sessionStorage, cookies, or any
// amount/merchant/category value. `route` is location.pathname only, id-normalized.
// componentStack (folded into `stack` for boundary reports) carries React
// component NAMES + source positions only — no props/user data (verified).

const ENDPOINT = "/api/client-errors"
const MAX_STACK_CHARS = 4000 // client cap, strictly below the server's 16KB body cap
// B3b dual budget: reserve this many chars of the cap for the componentStack's TOP
// (React lists the FAILING component first), so a long error stack cannot cut it.
// Split (all counted against MAX_STACK_CHARS = 4000): componentStack reserve 1500 +
// error-stack budget 2477 (= 4000 − 1500 − separator) + separator 23 = 4000.
// ASSUMPTION (B3-F2), NOT a measurement: 1500 is sized from a ~50–90 char/frame
// ESTIMATE (≈ 17–30 componentStack frames from the top). The real NODE-EXPRESS-9
// capture was not retrievable when this was chosen. If the per-frame estimate is off
// by 2×, this reserve holds ~8 frames, not 17–30. Revisit trigger: the first
// production boundary report whose componentStack is truncated AT this reserve.
const COMPONENT_STACK_RESERVE = 1500
const COMPONENT_STACK_SEP = "\n--- componentStack ---"
const TRUNC_MARKER = "\n…[truncated]"
const MESSAGE_MAX = 2000
const NAME_MAX = 200
const SESSION_SEND_CAP = 20
const DEDUPE_TTL_MS = 60_000
const HEAL_CLEAR_DELAY_MS = 10_000
const LAZY_RELOAD_PREFIX = "lazy-reload-once:"

export type ReportKind =
  | "boundary"
  | "onerror"
  | "unhandledrejection"
  | "chunk-reload-failed"
  | "chunk-self-healed"

// ── Module state (one reporter per page session) ───────────────────────────────
let installed = false
let reentrant = false // true only during the SYNCHRONOUS body of reportError
let sentCount = 0
const suppressed = { reentrancy: 0, cap: 0, dedupe: 0, noise: 0 }
const recent = new Map<string, { count: number; ts: number }>()

// Test-only enable override (production gate is import.meta.env.PROD).
let forceEnabledForTest: boolean | null = null

function reportingEnabled(): boolean {
  if (forceEnabledForTest !== null) return forceEnabledForTest
  // Report in production builds only — never in `vite dev` (DEV) or under vitest
  // (PROD is false in both).
  return import.meta.env.PROD === true
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const NUMERIC_SEG = /^\d+$/
const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => (NUMERIC_SEG.test(seg) || UUID_SEG.test(seg) ? ":id" : seg))
    .join("/")
}

function currentRoutePathname(): string {
  try {
    return sanitizeRoute(window.location.pathname)
  } catch {
    return "/"
  }
}

function truncateStack(stack: string, max = MAX_STACK_CHARS): string {
  // Keep the TOP frames — the fault site is at the top of a stack. The marker is
  // counted WITHIN max so the result never exceeds max (the old form sliced to max
  // then appended the marker, overshooting the cap by the marker length).
  return stack.length <= max ? stack : `${stack.slice(0, max - TRUNC_MARKER.length)}${TRUNC_MARKER}`
}

function topFrame(stack: string | undefined): string {
  if (!stack) return ""
  return stack.split("\n").find((l) => /\bat\b|@/.test(l))?.trim() ?? ""
}

function fingerprint(name: string | undefined, message: string, stack: string | undefined): string {
  return `${name ?? ""}|${message}|${topFrame(stack)}`
}

// ── Feedback-loop protection (B3a) ─────────────────────────────────────────────
// The old stack-text self-origin filter was DELETED: it matched a literal
// "error-reporter" frame, which Vite INLINES into index-<hash>.js in production, so
// it only ever fired in dev (confirmed: a production-shaped stack was not suppressed).
// "A failed report must not generate a report" is actually enforced — verified against
// the reset semantics, NOT assumed — by THREE guards:
//   (1) reportError's own try/catch (below) SWALLOWS any SYNCHRONOUS throw in its body,
//       so a build/transmit error never propagates to the window error /
//       unhandledrejection handler that called reportError. NB: the `reentrant` flag
//       resets in a `finally`, so a thrown error leaves reportError with the flag
//       already cleared — the flag does NOT cover that escaped-throw path; the catch
//       does (nothing actually escapes, so there is no gap).
//   (2) transmit()'s fetch(...).catch(() => {}) swallows the ASYNC send rejection, so a
//       failed send never becomes an unhandledrejection that re-enters via the handler.
//   (3) SESSION_SEND_CAP hard-bounds total sends, terminating any residual loop.
// The `reentrant` flag's remaining, narrow job: suppress a SYNCHRONOUS nested
// reportError generated DURING a send (CONDITION iii; test-exercised — in production
// the fetch is async and does not synchronously re-enter). It is not, by itself, the
// feedback-loop guard.

// Noise filters (E): cross-origin "Script error." with no usable stack is
// browser-extension / third-party-script noise, not our code; ResizeObserver loop
// notices are benign layout-timing warnings the browser surfaces as errors.
function isNoise(message: string, stack: string | undefined): boolean {
  if (/^Script error\.?$/.test(message) && !stack) return true
  if (/ResizeObserver loop/.test(message)) return true
  return false
}

function extractName(input: unknown): string | undefined {
  return input instanceof Error ? input.name : undefined
}
function extractMessage(input: unknown): string {
  if (input instanceof Error) return input.message
  if (typeof input === "string") return input
  const maybe = (input as { message?: unknown } | null)?.message
  return typeof maybe === "string" ? maybe : "Unknown error"
}
function extractStack(input: unknown): string | undefined {
  return input instanceof Error ? input.stack : undefined
}

// ── Closed-allowlist payload (CONDITION ii + iv, client halves) ────────────────
function buildBody(fields: {
  name?: string
  message: string
  stack?: string
  route: string
  kind: ReportKind
  occurrences: number
}): string {
  const payload: Record<string, unknown> = {
    message: fields.message.slice(0, MESSAGE_MAX),
    route: fields.route, // location.pathname only, id-normalized (CONDITION iv)
    kind: fields.kind,
    occurrences: fields.occurrences,
  }
  if (fields.name) payload.name = fields.name.slice(0, NAME_MAX)
  if (fields.stack) payload.stack = truncateStack(fields.stack)
  // release is undefined until T1-3 lands VITE_GIT_SHA — omit gracefully then.
  const release = import.meta.env.VITE_GIT_SHA
  if (typeof release === "string" && release) payload.release = release
  // Coarse UA: browser-family crashes (e.g. Safari-only) are worth grouping; the
  // server already sees the User-Agent header, so this is redundant-but-harmless
  // and is server-capped + scrubbed.
  if (typeof navigator !== "undefined" && navigator.userAgent) payload.ua = navigator.userAgent
  return JSON.stringify(payload)
}

function transmit(body: string): void {
  try {
    if (typeof fetch === "function") {
      // keepalive so the request survives an unload and the status is observable;
      // fire-and-forget, NEVER retry; swallow rejection so a failed report can't
      // generate a report.
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {})
    } else if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // Fallback only where fetch cannot run. sendBeacon makes a 429 invisible to
      // the client — acceptable because the client abandons either way.
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))
    }
  } catch {
    // never let transport throw into a global handler
  }
}

// ── Public entry ───────────────────────────────────────────────────────────────
export function reportError(input: unknown, kind: ReportKind, extra?: { componentStack?: string }): void {
  if (!reportingEnabled()) return
  // CONDITION (iii): suppress only reports GENERATED DURING the synchronous body of
  // another send — NOT a global mutex over the async fetch, so two genuinely
  // distinct errors firing close together both send. Count what we drop.
  if (reentrant) {
    suppressed.reentrancy++
    return
  }
  reentrant = true
  try {
    const name = extractName(input)
    const message = extractMessage(input)
    let stack = extractStack(input)

    if (isNoise(message, stack)) {
      suppressed.noise++
      return
    }

    // Fold componentStack (component NAMES only — no props/user data) into the single
    // `stack` field (B3b DUAL BUDGET). React lists the FAILING component FIRST in the
    // componentStack, appended AFTER the error stack — so a single combined truncate
    // would let a long error stack consume the whole budget and cut the componentStack,
    // losing WHICH component failed. Give the error stack the cap minus the
    // componentStack reserve minus the separator, and the componentStack its own
    // reserve; truncateStack keeps the TOP of each. The combined is <= MAX_STACK_CHARS
    // by construction, so buildBody's final truncateStack is a no-op safety net.
    if (extra?.componentStack) {
      const errBudget = MAX_STACK_CHARS - COMPONENT_STACK_RESERVE - COMPONENT_STACK_SEP.length
      const errPart = truncateStack(stack ?? message, errBudget)
      const compPart = truncateStack(extra.componentStack, COMPONENT_STACK_RESERVE)
      stack = `${errPart}${COMPONENT_STACK_SEP}${compPart}`
    }

    // Dedupe + occurrences (D). Within the TTL, count and suppress; the next send
    // after the window carries the accumulated count.
    const fp = fingerprint(name, message, stack)
    const now = Date.now()
    const prev = recent.get(fp)
    if (prev && now - prev.ts < DEDUPE_TTL_MS) {
      prev.count++
      suppressed.dedupe++
      return
    }
    const occurrences = (prev?.count ?? 0) + 1
    recent.set(fp, { count: 0, ts: now })

    // Session cap (D): a render loop firing the same error hundreds of times yields
    // ~1 send per TTL window per fingerprint, hard-stopped at SESSION_SEND_CAP total.
    if (sentCount >= SESSION_SEND_CAP) {
      suppressed.cap++
      return
    }
    sentCount++

    transmit(buildBody({ name, message, stack, route: currentRoutePathname(), kind, occurrences }))
  } catch {
    // A throw while building/sending a report is itself a report-during-send: count
    // and swallow (never rethrow into the global handler that called us).
    suppressed.reentrancy++
  } finally {
    reentrant = false
  }
}

function onWindowError(event: ErrorEvent): void {
  reportError(event.error ?? event.message, "onerror")
}
function onUnhandledRejection(event: PromiseRejectionEvent): void {
  reportError(event.reason, "unhandledrejection")
}

// Self-heal signal (M): a surviving `lazy-reload-once:*` sessionStorage key on boot
// means lazyWithRetry's one-shot reload fixed a stale-chunk miss. Emit ONE
// low-severity (kind-tagged) event per key, then clear it — but on a DELAY.
//
// LOOP-SAFETY (verified, not assumed): clearing synchronously at init is unsafe —
// init runs before React re-attempts the lazy import, so if that chunk is STILL
// broken, hardReloadOnce would find no key, treat it as a first attempt, and
// reload again → infinite loop. Deferring the clear past HEAL_CLEAR_DELAY_MS means:
// (a) if the route re-loads fine, we clear and the one-shot re-arms cleanly for a
// future miss; (b) if it re-fails, hardReloadOnce sees the key still set and takes
// its second-attempt (remove + rethrow → chunk-reload-failed) path itself, so by
// the time our timer fires the key is already gone. No reload loop either way.
function processSelfHeal(): void {
  let store: Storage
  try {
    store = window.sessionStorage
  } catch {
    return
  }
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(LAZY_RELOAD_PREFIX)) keys.push(k)
  }
  for (const k of keys) {
    reportError(new Error(`chunk self-healed: ${k.slice(LAZY_RELOAD_PREFIX.length)}`), "chunk-self-healed")
    window.setTimeout(() => {
      try {
        store.removeItem(k)
      } catch {
        /* ignore */
      }
    }, HEAL_CLEAR_DELAY_MS)
  }
}

export function initErrorReporter(): void {
  if (installed) return
  installed = true
  if (typeof window === "undefined") return
  window.addEventListener("error", onWindowError)
  window.addEventListener("unhandledrejection", onUnhandledRejection)
  processSelfHeal()
}

// ── Test hooks (never called in production) ────────────────────────────────────
export function __setEnabledForTest(v: boolean | null): void {
  forceEnabledForTest = v
}
export function __getSuppressedForTest(): Readonly<typeof suppressed> {
  return { ...suppressed }
}
export function __getSentCountForTest(): number {
  return sentCount
}
export function __resetReporterForTest(): void {
  installed = false
  reentrant = false
  sentCount = 0
  recent.clear()
  suppressed.reentrancy = 0
  suppressed.cap = 0
  suppressed.dedupe = 0
  suppressed.noise = 0
}
