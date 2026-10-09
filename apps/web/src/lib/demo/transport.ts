// MOB-R95 C2 — the one demo transport. While the URL is under /demo, apiFetch hands every call here instead of
// to fetch (api.ts). The state lives in this module's memory: /log's saves, edits and deletes change it, and a
// page reload (or any way out of the demo, all full page loads) starts it again from the sample.
//
// It never touches the network: a known call is answered from the state, a write the demo does not keep is
// refused, and an unknown call throws (C3b).

import sampleText from "./sample.json?raw"
import { createDemoState, demoAnswer, DemoUnknownCallError, type DemoSample, type DemoState } from "./engine"

let state: DemoState | null = null

function demoState(): DemoState {
  if (state === null) state = createDemoState(JSON.parse(sampleText) as DemoSample, new Date())
  return state
}

/** Tests only: start again from the sample, as a page reload does. */
export function resetDemoState(): void {
  state = null
}

export type DemoTransportResult = { status: number; body: unknown }

/**
 * Every call the demo answers (and every one it refuses to know) is announced on window, so a test can observe
 * the whole demo whichever module path a call took. Nothing in the app listens.
 */
export const DEMO_CALL_EVENT = "statera:demo-call"
export type DemoCallDetail = { method: string; path: string; url: string; unknown: boolean }

function announce(method: string, url: string, unknown: boolean) {
  if (typeof window === "undefined") return
  const detail: DemoCallDetail = { method, path: url.split("?")[0], url, unknown }
  window.dispatchEvent(new CustomEvent(DEMO_CALL_EVENT, { detail }))
}

export function demoRequest(url: string, options: { method?: string; body?: unknown } = {}): DemoTransportResult {
  const method = (options.method || "GET").toUpperCase()
  let body: unknown = undefined
  if (typeof options.body === "string" && options.body) {
    try {
      body = JSON.parse(options.body)
    } catch {
      body = undefined
    }
  }
  try {
    const result = demoAnswer(demoState(), method, url, body)
    announce(method, url, false)
    return result
  } catch (err) {
    announce(method, url, err instanceof DemoUnknownCallError)
    throw err
  }
}

export { DemoUnknownCallError }
