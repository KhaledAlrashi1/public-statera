// MOB-R95 C2 — the demo is on while the URL is under /demo. The app is mounted once per page load, and every
// way out of the demo (Sign up, Go Home) is a full page load, so what this reads at any moment is the mode
// the page was opened in.

export const DEMO_BASE = "/demo"

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false
  const path = window.location.pathname
  return path === DEMO_BASE || path.startsWith(`${DEMO_BASE}/`)
}

// C3d — in the demo, every browser-storage key the screens use gets this prefix, so nothing the demo
// stores is read by the real app (and nothing she stored is overwritten by the demo).
export const DEMO_STORAGE_PREFIX = "statera.demo."

export function storageKey(key: string): string {
  return isDemoMode() ? `${DEMO_STORAGE_PREFIX}${key}` : key
}

/** The sign-up screen, reached by a full page load so the demo's memory and cache are dropped. */
export const DEMO_SIGN_UP_HREF = "/login"
