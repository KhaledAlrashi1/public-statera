// Shared route utility helpers. Consolidated from aggregation.ts and intelligence.ts in 5c-3.

import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { ZodError } from "zod"

export function parseIntParam(v: string | undefined, defaultVal: number): number {
  if (!v) return defaultVal
  const n = parseInt(v, 10)
  return isNaN(n) ? defaultVal : n
}

// Converts a zod safeParse failure into the project's standard error envelope
// (phase-4 10d, TODO(phase4-zod-adoption)). Emits ONLY the first issue
// (issues[0]) — byte-identical to the pre-existing hand-written
// `parsed.error.issues[0]?.message ?? "Validation error."` sites it replaces.
// `.errors` and `.issues` are the same array in zod 3 (.errors is a getter for
// .issues), so sites using either accessor converge here with no output change.
// Callers that need a fixed override message (e.g. the categories/merchants
// remap "target_id is required.") intentionally do NOT route through this helper.
export function zodErrorToEnvelope(
  c: Context,
  error: ZodError,
  opts: { code?: string; status?: ContentfulStatusCode; fallback?: string } = {},
) {
  const message = error.issues[0]?.message ?? opts.fallback ?? "Validation error."
  return c.json(
    { ok: false, data: null, error: message, code: opts.code ?? "validation_error" },
    opts.status ?? 400,
  )
}
