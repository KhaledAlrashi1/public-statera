// Phase 4 / Module 10f — typed JSON reader for route tests.
//
// app.request(...) / router.request(...) return a Response whose .json() infers
// `unknown`, so `const body = await res.json()` and then `body.ok` fails tsc with
// TS18046 ("'body' is of type 'unknown'"). This helper returns the standard API
// envelope so route tests read body.ok / .data / .code / .error / .meta directly.
//
// `data` is typed `any` (matching the existing test-helper convention, e.g.
// income-lib.test.ts makeDbReturning) so assertions on nested fields
// (body.data.items[0].alert_key) don't require a cast at every access site. Route
// tests only read values off the envelope; they don't depend on data's static type.

export type ApiEnvelope = {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  error: string | null
  code?: string
  // Present on success envelopes ({ ok, data, error, meta }); required here so
  // tests can read body.meta.count without an optional-chain. Error envelopes
  // carry `code` instead, and no test reads meta off an error response.
  meta: Record<string, unknown>
}

export async function readJson(res: { json(): Promise<unknown> }): Promise<ApiEnvelope> {
  return (await res.json()) as ApiEnvelope
}
