import { describe, it, expect } from "vitest"
import { sentryBeforeSend } from "./sentry"
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
})
