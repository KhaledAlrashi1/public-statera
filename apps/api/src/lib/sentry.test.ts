import { describe, it, expect } from "vitest"
import { sentryBeforeSend, scrubEventText } from "./sentry"
import type { ErrorEvent, EventHint } from "@sentry/node"

const hint = {} as EventHint

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { event_id: "test", ...overrides } as unknown as ErrorEvent
}

describe("sentryBeforeSend", () => {
  it("redacts email in request body", () => {
    const event = makeEvent({
      request: { data: { email: "user@example.com", amount: 10 } },
    })
    const result = sentryBeforeSend(event, hint)
    expect((result!.request!.data as Record<string, unknown>)["email"]).toBe("[REDACTED]")
    expect((result!.request!.data as Record<string, unknown>)["amount"]).toBe(10)
  })

  it("redacts enc1: ciphertext blob in a header value", () => {
    const event = makeEvent({
      request: {
        headers: {
          "x-some-header": "enc1:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk",
          "content-type": "application/json",
        },
      },
    })
    const result = sentryBeforeSend(event, hint)
    const headers = result!.request!.headers as Record<string, string>
    expect(headers["x-some-header"]).toBe("[REDACTED]")
    expect(headers["content-type"]).toBe("application/json")
  })

  it("redacts access_token and totp_secret in request body", () => {
    const event = makeEvent({
      request: { data: { access_token: "secret123", totp_secret: "BASE32SECRET" } },
    })
    const result = sentryBeforeSend(event, hint)
    const data = result!.request!.data as Record<string, unknown>
    expect(data["access_token"]).toBe("[REDACTED]")
    expect(data["totp_secret"]).toBe("[REDACTED]")
  })

  it("does NOT redact bare 'name' field (merchant/category/domain names)", () => {
    const event = makeEvent({
      request: { data: { name: "Groceries", category_id: 5 } },
    })
    const result = sentryBeforeSend(event, hint)
    const data = result!.request!.data as Record<string, unknown>
    expect(data["name"]).toBe("Groceries")
  })

  it("redacts display_name but leaves unrelated fields intact", () => {
    const event = makeEvent({
      request: { data: { display_name: "Alice", amount_kd: "10.500" } },
    })
    const result = sentryBeforeSend(event, hint)
    const data = result!.request!.data as Record<string, unknown>
    expect(data["display_name"]).toBe("[REDACTED]")
    expect(data["amount_kd"]).toBe("10.500")
  })

  it("redacts email addresses embedded in string values", () => {
    const event = makeEvent({
      extra: { debug_info: "failed for user alice@example.com in request" },
    })
    const result = sentryBeforeSend(event, hint)
    expect(result!.extra!["debug_info"]).toBe("failed for user [REDACTED] in request")
  })

  it("scrubs breadcrumb data", () => {
    const event = makeEvent({
      breadcrumbs: [{ data: { email: "bob@example.com", action: "login" } }],
    })
    const result = sentryBeforeSend(event, hint)
    const crumb = (result!.breadcrumbs as Array<{ data: Record<string, unknown> }>)[0]
    expect(crumb.data["email"]).toBe("[REDACTED]")
    expect(crumb.data["action"]).toBe("login")
  })

  it("never throws on malformed input", () => {
    // Passing null-ish junk — scrubbing must swallow errors and return the event.
    const event = makeEvent({ request: { data: null as unknown as string } })
    expect(() => sentryBeforeSend(event, hint)).not.toThrow()
    expect(sentryBeforeSend(event, hint)).not.toBeNull()
  })

  it("returns the event unchanged when there is nothing sensitive", () => {
    const event = makeEvent({
      request: { data: { category: "Food", amount_kd: "5.250" } },
    })
    const result = sentryBeforeSend(event, hint)
    const data = result!.request!.data as Record<string, unknown>
    expect(data["category"]).toBe("Food")
    expect(data["amount_kd"]).toBe("5.250")
  })

  // ── Task B / B2 (FIND-S1): message + exception values are now scrubbed ──────────
  it("scrubs a KWD amount AND a finance key=value in event.message", () => {
    const event = makeEvent({ message: "charge failed for merchant=Lulu amount 12.500 KWD" })
    const result = sentryBeforeSend(event, hint)
    expect(result!.message).not.toContain("Lulu")
    expect(result!.message).not.toContain("12.500")
    expect(result!.message).toBe("charge failed for merchant=[REDACTED] amount [REDACTED] KWD")
  })

  it("scrubs email + KWD amount + finance key=value in an exception value", () => {
    const event = makeEvent({
      exception: {
        values: [
          { type: "QueryError", value: "Duplicate entry user@example.com; category=Groceries 1,234.500" },
        ],
      },
    })
    const result = sentryBeforeSend(event, hint)
    const v = (result!.exception!.values as Array<{ type: string; value: string }>)[0]
    expect(v.value).not.toContain("user@example.com")
    expect(v.value).not.toContain("1,234.500")
    expect(v.value).not.toContain("Groceries")
    expect(v.value).toBe("Duplicate entry [REDACTED]; category=[REDACTED] [REDACTED]")
    // exception TYPE (code identifier) is left intact — grouping key, not user data.
    expect(v.type).toBe("QueryError")
  })
})

// ── scrubEventText — the shared free-text scrubber (Task B / B2) ─────────────────
describe("scrubEventText — positive redaction", () => {
  it("redacts email / IBAN / enc1: / PII key=value / KWD amount / finance key=value", () => {
    expect(scrubEventText("mail alice@example.com")).toBe("mail [REDACTED]")
    expect(scrubEventText("iban GB29NWBK60161331926819 x")).toBe("iban [REDACTED] x")
    expect(scrubEventText("blob enc1:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk")).toBe("blob [REDACTED]")
    expect(scrubEventText("email=bob@x.com uid=5")).toBe("email=[REDACTED] uid=5")
    expect(scrubEventText("paid 12.500")).toBe("paid [REDACTED]")
    expect(scrubEventText("merchant=Lulu")).toBe("merchant=[REDACTED]")
  })
})

// BLOCKING negative controls (TB-R2): over-redaction that eats diagnostics is a real
// cost — the 2026-08-01 dashboard crash was diagnosed FROM a stack. Prove the scrubber
// leaves these untouched.
describe("scrubEventText — negative controls (no over-redaction)", () => {
  it("does NOT touch a production stack frame (the exact 2026-08-01 observed shape)", () => {
    const frame = "    at ke (https://staterafinance.app/assets/index-BG3YW6B5.js:80:750)"
    expect(scrubEventText(frame)).toBe(frame)
  })
  it("does NOT redact a bare integer", () => {
    expect(scrubEventText("processed 42 rows")).toBe("processed 42 rows")
  })
  it("does NOT redact a 2-decimal number", () => {
    expect(scrubEventText("ratio 12.50 over threshold")).toBe("ratio 12.50 over threshold")
  })
  it("does NOT redact a semver-shaped string", () => {
    expect(scrubEventText("node 1.2.3 / drizzle 20.11.0")).toBe("node 1.2.3 / drizzle 20.11.0")
  })

  // B2-F5: the counterpoint — over-redaction of a NON-money 3-decimal float is BY
  // DESIGN (the pattern is amount-shaped, not amount-aware). Pinned so a future reader
  // knows [REDACTED] where a ratio/duration should be is intended, not a regression.
  it("DOES redact a 3-decimal NON-money float by design (amount-shaped, not amount-aware)", () => {
    expect(scrubEventText("ratio 0.001 over threshold")).toBe("ratio [REDACTED] over threshold")
  })
})

describe("scrubEventText — idempotency (double pass is safe; client-errors + hook)", () => {
  it.each([
    "contact user@example.com now",
    "iban GB29NWBK60161331926819 flagged",
    "blob enc1:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk",
    "email=user@example.com uid=5",
    "amount 12.500 for merchant=Lulu",
    "spent 1,234.500 on category=Food",
  ])("scrubEventText(scrubEventText(x)) === scrubEventText(x): %s", (input) => {
    const once = scrubEventText(input)
    expect(scrubEventText(once)).toBe(once)
  })

  it("email=[REDACTED] is a fixed point", () => {
    expect(scrubEventText("email=[REDACTED]")).toBe("email=[REDACTED]")
  })
})
