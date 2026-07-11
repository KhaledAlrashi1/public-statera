import { describe, it, expect } from "vitest"
import { Hono, type Context } from "hono"
import { z } from "zod"
import { zodErrorToEnvelope, parseIntParam } from "./route-helpers"

// Builds a real ZodError from a failing safeParse so the helper is exercised
// against genuine zod output (not a hand-forged issues array).
function zodErrorFor(schema: z.ZodTypeAny, input: unknown): z.ZodError {
  const parsed = schema.safeParse(input)
  if (parsed.success) throw new Error("expected schema to fail")
  return parsed.error
}

describe("zodErrorToEnvelope", () => {
  const Multi = z.object({
    name: z.string().min(1, "Name is required."),
    count: z.number(),
  })

  function appWith(handler: (c: Context) => Response) {
    const app = new Hono()
    app.get("/t", handler)
    return app
  }

  it("emits the first issue's message and the standard 400 envelope", async () => {
    const err = zodErrorFor(Multi, { name: "", count: "x" })
    const app = appWith((c) => zodErrorToEnvelope(c, err))
    const res = await app.request("/t")
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      ok: false,
      data: null,
      error: "Name is required.",
      code: "validation_error",
    })
  })

  it("falls back to 'Validation error.' when there are no issues", async () => {
    const emptyError = new z.ZodError([])
    const app = appWith((c) => zodErrorToEnvelope(c, emptyError))
    const res = await app.request("/t")
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe("Validation error.")
  })

  it(".errors and .issues resolve to the same first message (zod 3 alias)", () => {
    const err = zodErrorFor(Multi, { name: "", count: "x" })
    expect(err.errors).toBe(err.issues)
    expect(err.errors[0]?.message).toBe(err.issues[0]?.message)
  })

  it("honours custom code, status, and fallback", async () => {
    const app = appWith((c) =>
      zodErrorToEnvelope(c, new z.ZodError([]), {
        code: "custom_code",
        status: 422,
        fallback: "Nope.",
      }),
    )
    const res = await app.request("/t")
    expect(res.status).toBe(422)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.code).toBe("custom_code")
    expect(body.error).toBe("Nope.")
  })
})

describe("parseIntParam", () => {
  it("returns the default for undefined and non-numeric input", () => {
    expect(parseIntParam(undefined, 7)).toBe(7)
    expect(parseIntParam("abc", 7)).toBe(7)
  })
  it("parses a valid integer", () => {
    expect(parseIntParam("42", 7)).toBe(42)
  })
})
